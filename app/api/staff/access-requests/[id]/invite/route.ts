import { env } from "cloudflare:workers";
import { getStaffAccess, privateJson, sameOrigin } from "@/lib/staff-access";
import { sendStaffEmail, staffMailConfigured } from "@/lib/staff-mail";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{id: string}> };
type VerifiedRequest = {
  full_name:string; email:string; status:string; assigned_role:string;
  latest_invite_at:string|null;
};

function hex(bytes:Uint8Array) {
  return [...bytes].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}

export async function POST(request:Request,context:Context) {
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(staff.role!=="OWNER" && staff.role!=="ADMIN")return privateJson({error:"Access denied"},403);
  if(!sameOrigin(request))return privateJson({error:"Invalid origin"},403);
  const {id}=await context.params;
  if(!/^[0-9a-f-]{36}$/i.test(id))return privateJson({error:"Invalid request"},400);
  if(!staffMailConfigured())return privateJson({error:"Staff invitation email is not configured"},503);

  try {
    const candidate=await env.DB.prepare(`SELECT r.full_name,r.email,r.status,r.assigned_role,
      (SELECT MAX(t.created_at) FROM staff_invitation_tokens t WHERE t.request_id=r.id) AS latest_invite_at
      FROM staff_access_requests r WHERE r.id=?`)
      .bind(id).first<VerifiedRequest>();
    if(!candidate)return privateJson({error:"Request not found"},404);
    if(!["VERIFIED","INVITED"].includes(candidate.status) ||
       !["ADMIN","OPERATOR","TEACHER"].includes(candidate.assigned_role)){
      return privateJson({error:"Request must be verified for a supported role"},409);
    }
    if(candidate.assigned_role==="ADMIN" && staff.role!=="OWNER"){
      return privateJson({error:"Only the owner may invite an administrator"},403);
    }
    if(candidate.latest_invite_at && Date.now()-Date.parse(candidate.latest_invite_at)<60_000) {
      return privateJson({error:"An invitation was just issued. Retry after a minute."},429);
    }
    const existing=await env.DB.prepare('SELECT id FROM "user" WHERE email=?')
      .bind(candidate.email).first();
    if(existing)return privateJson({error:"An account already exists for this email"},409);

    const token=hex(crypto.getRandomValues(new Uint8Array(32)));
    const tokenHash=hex(new Uint8Array(await crypto.subtle.digest(
      "SHA-256",new TextEncoder().encode(token))));
    const inviteId=crypto.randomUUID();
    const now=new Date().toISOString();
    const expires=new Date(Date.now()+24*3600_000).toISOString();

    // Deactivate older codes before creating a new invitation. The batch is
    // atomic, so a failed write cannot invalidate the previous invitation.
    const result=await env.DB.batch([
      env.DB.prepare("UPDATE staff_invitation_tokens SET consumed_at=? WHERE request_id=? AND consumed_at IS NULL")
        .bind(now,id),
      env.DB.prepare(`INSERT INTO staff_invitation_tokens
        (id,request_id,token_hash,expires_at,created_by) VALUES (?,?,?,?,?)`)
        .bind(inviteId,id,tokenHash,expires,staff.userId),
      env.DB.prepare(`UPDATE staff_access_requests SET status='INVITED',updated_at=?
        WHERE id=? AND status IN ('VERIFIED','INVITED')`).bind(now,id),
      env.DB.prepare(`INSERT INTO erp_audit_events
        (id,entity_type,entity_id,action,actor_id,reason)
        SELECT ?,'staff_access_request',?,'INVITATION_ISSUED',?,'Invitation generated for verified applicant'
        WHERE changes()=1`).bind(crypto.randomUUID(),id,staff.userId),
    ]);
    if(result[1].meta.changes!==1||result[2].meta.changes!==1||
       result[3].meta.changes!==1) {
      return privateJson({error:"Invitation changed; refresh and retry"},409);
    }

    const base=new URL(request.url).origin;
    const link=base+"/accept-invitation?token="+encodeURIComponent(token);
    try {
      await sendStaffEmail({
        recipient:candidate.email,
        subject:"Sohoj Academy — your staff access invitation",
        text:`Your staff access request has been verified.\n\nSet a password using this single-use link within 24 hours:\n${link}\n\nIf you did not request access, ignore this email and notify the academy.`,
        idempotencyKey:"staff-invite-"+inviteId,
      });
    } catch {
      // No token is exposed to the reviewer. Retrying after the cooldown
      // invalidates the old token and sends a fresh invitation.
      return privateJson({error:"Invitation stored but email delivery failed. You can retry after one minute."},503);
    }
    return privateJson({ok:true,message:"Invitation sent to the verified applicant's email."});
  } catch {
    return privateJson({error:"Could not issue invitation"},503);
  }
}
