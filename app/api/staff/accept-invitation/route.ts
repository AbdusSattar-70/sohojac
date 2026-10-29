import {env} from "cloudflare:workers";
import {hashPassword} from "better-auth/crypto";
import {privateJson,sameOrigin} from "@/lib/staff-access";
import {isStaffOrigin} from "@/lib/auth";
import {z} from "zod";
export const dynamic="force-dynamic";

const schema=z.object({
  token:z.string().regex(/^[0-9a-f]{64}$/i),
  password:z.string().min(8).max(128),
}).strict();

function hex(bytes:Uint8Array){
  return [...bytes].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}

type Candidate={request_id:string;email:string;assigned_role:string};

export async function POST(request:Request) {
  if(!isStaffOrigin(request.url))return privateJson({error:"Not found"},404);
  if(!sameOrigin(request))return privateJson({error:"Invalid request origin"},403);
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")){
    return privateJson({error:"JSON required"},415);
  }
  let body:unknown;
  try{
    const raw=await request.text();
    if(raw.length>600)return privateJson({error:"Request too large"},413);
    body=JSON.parse(raw);
  }catch{return privateJson({error:"Invalid JSON"},400);}
  const parsed=schema.safeParse(body);
  if(!parsed.success)return privateJson({error:"Invalid invitation or password"},400);
  const tokenHash=hex(new Uint8Array(await crypto.subtle.digest(
    "SHA-256",new TextEncoder().encode(parsed.data.token.toLowerCase()))));

  try{
    const candidate=await env.DB.prepare(`SELECT t.request_id,r.email,r.assigned_role
      FROM staff_invitation_tokens t
      JOIN staff_access_requests r ON r.id=t.request_id
      WHERE t.token_hash=? AND t.consumed_at IS NULL
        AND t.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
        AND r.status='INVITED'
        AND r.assigned_role IN ('ADMIN','OPERATOR','TEACHER')
        AND NOT EXISTS(SELECT 1 FROM "user" u WHERE u.email=r.email)`)
      .bind(tokenHash).first<Candidate>();
    if(!candidate)return privateJson({error:"Invitation expired or already used"},403);
    const passwordHash=await hashPassword(parsed.data.password);
    const userId=crypto.randomUUID();
    const accountId=crypto.randomUUID();
    const claimId=crypto.randomUUID();
    const now=new Date().toISOString();
    const time=Date.now();

    const actions=await env.DB.batch([
      env.DB.prepare(`UPDATE staff_invitation_tokens
        SET consumed_at=?,claim_id=?
        WHERE token_hash=? AND consumed_at IS NULL
          AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
          AND EXISTS(SELECT 1 FROM staff_access_requests r
            WHERE r.id=request_id AND r.status='INVITED'
              AND r.assigned_role IN ('ADMIN','OPERATOR','TEACHER')
              AND NOT EXISTS(SELECT 1 FROM "user" u WHERE u.email=r.email))`)
        .bind(now,claimId,tokenHash),
      env.DB.prepare(`INSERT INTO "user" ("id","name","email","emailVerified","createdAt","updatedAt")
        SELECT ?,r.full_name,r.email,1,?,? FROM staff_invitation_tokens t
        JOIN staff_access_requests r ON r.id=t.request_id
        WHERE t.claim_id=? AND t.consumed_at=?`)
        .bind(userId,time,time,claimId,now),
      env.DB.prepare(`INSERT INTO "account"
        ("id","accountId","providerId","userId","password","createdAt","updatedAt")
        SELECT ?,?,'credential',?,?,?,? FROM staff_invitation_tokens t
        WHERE t.claim_id=? AND t.consumed_at=?`)
        .bind(accountId,userId,userId,passwordHash,time,time,claimId,now),
      env.DB.prepare(`INSERT INTO staff_memberships (user_id,role,active)
        SELECT ?,r.assigned_role,1 FROM staff_invitation_tokens t
        JOIN staff_access_requests r ON r.id=t.request_id
        WHERE t.claim_id=? AND t.consumed_at=?`)
        .bind(userId,claimId,now),
      env.DB.prepare(`UPDATE staff_access_requests SET status='ACTIVE',updated_at=?
        WHERE id=? AND status='INVITED' AND EXISTS(
          SELECT 1 FROM staff_invitation_tokens t WHERE t.request_id=?
            AND t.claim_id=? AND t.consumed_at=?)`)
        .bind(now,candidate.request_id,candidate.request_id,claimId,now),
      env.DB.prepare(`INSERT INTO erp_audit_events
        (id,entity_type,entity_id,action,actor_id,reason)
        SELECT ?,'staff_access_request',?,'ACCOUNT_ACTIVATED',?,
          'Verified applicant accepted invitation' FROM staff_invitation_tokens t
        WHERE t.claim_id=? AND t.consumed_at=?`)
        .bind(crypto.randomUUID(),candidate.request_id,userId,claimId,now),
    ]);
    // A staff-directory trigger contributes an additional affected row to\n    // activation metadata; all six original writes must still succeed.\n    if(actions.length!==6 || actions.some(result=>(result.meta?.changes??0)<1)){
      return privateJson({error:"Invitation was already accepted. Sign in or contact the administrator."},409);
    }
    return privateJson({ok:true,message:"Account created. You can sign in."},201);
  }catch{
    return privateJson({error:"Invitation cannot be activated. Please contact your administrator."},503);
  }
}
