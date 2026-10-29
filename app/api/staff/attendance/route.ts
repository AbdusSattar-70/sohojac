import {env} from "cloudflare:workers";
import {getStaffAccess,privateJson,sameOrigin} from "@/lib/staff-access";
import {attendanceInput,type AttendanceRow} from "@/lib/erp-attendance";

export const dynamic="force-dynamic";
const permitted=(role:string)=>["OWNER","ADMIN","OPERATOR"].includes(role);
const validDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&
  !Number.isNaN(new Date(v+"T00:00:00Z").valueOf())&&
  new Date(v+"T00:00:00Z").toISOString().slice(0,10)===v;
export async function GET(request:Request){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!permitted(staff.role))return privateJson({error:"Access denied"},403);
  const params=new URL(request.url).searchParams;
  const batchId=params.get("batchId")||"",classOn=params.get("date")||"";
  if(batchId&&(!/^[0-9a-f-]{36}$/i.test(batchId)||!validDate(classOn))){
    return privateJson({error:"Choose a valid batch and date"},400);
  }
  try{
    const batches=await env.DB.prepare([
      "SELECT id,name,status FROM academy_batches",
      "WHERE status='ACTIVE' ORDER BY name LIMIT 150"
    ].join(" ")).all<{id:string;name:string;status:string}>();
    let students:AttendanceRow[]=[];
    if(batchId){
      const rows=await env.DB.prepare([
        "SELECT e.id AS enrollment_id,s.student_no,s.full_name AS student_name,",
        "a.id AS attendance_id,a.state,a.version",
        "FROM academy_enrollments e JOIN academy_students s ON s.id=e.student_id",
        "JOIN academy_batches b ON b.id=e.batch_id AND b.status='ACTIVE'",
        "LEFT JOIN academy_attendance a ON a.enrollment_id=e.id AND a.class_on=?",
        "WHERE e.batch_id=? AND e.status='ACTIVE' ORDER BY s.student_no LIMIT 100"
      ].join(" ")).bind(classOn,batchId).all<AttendanceRow>();
      students=rows.results??[];
    }
    return privateJson({batches:batches.results??[],items:students});
  }catch{return privateJson({error:"Attendance register unavailable"},503);}
}
export async function POST(request:Request){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!permitted(staff.role))return privateJson({error:"Access denied"},403);
  if(!sameOrigin(request))return privateJson({error:"Invalid request origin"},403);
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")){
    return privateJson({error:"JSON required"},415);
  }
  let body:unknown;
  try{
    const raw=await request.text();
    if(raw.length>2000)return privateJson({error:"Request too large"},413);
    body=JSON.parse(raw);
  }catch{return privateJson({error:"Invalid JSON"},400);}
  const parsed=attendanceInput.safeParse(body);
  if(!parsed.success)return privateJson({error:"Check attendance state, date and reason"},400);
  const data=parsed.data,id=crypto.randomUUID();
  try{
    const tx=await env.DB.batch([
      env.DB.prepare([
        "INSERT INTO academy_attendance",
        "(id,enrollment_id,class_on,state,recorded_by,version)",
        "SELECT ?,e.id,?,?,?,? FROM academy_enrollments e",
        "JOIN academy_batches b ON b.id=e.batch_id",
        "WHERE e.id=? AND e.status='ACTIVE' AND b.status='ACTIVE'",
        "AND date(e.enrolled_at)<=? AND ?<=date('now')",
        "ON CONFLICT(enrollment_id,class_on) DO UPDATE SET",
        "state=excluded.state,recorded_by=excluded.recorded_by,",
        "recorded_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),",
        "version=excluded.version",
        "WHERE academy_attendance.version=excluded.version-1",
        "RETURNING id"
      ].join(" ")).bind(id,data.classOn,data.state,staff.userId,
        data.expectedVersion+1,data.enrollmentId,data.classOn,data.classOn),
      env.DB.prepare([
        "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json)",
        "SELECT ?,'academy_attendance',?, 'UPSERTED',?,?,? WHERE changes()=1 RETURNING id"
      ].join(" ")).bind(crypto.randomUUID(),data.enrollmentId+":"+data.classOn,
        staff.userId,data.reason,JSON.stringify({state:data.state,version:data.expectedVersion+1})),
    ]);
    if(tx.some(x=>(x.results?.length??0)!==1)){
      return privateJson({error:"Attendance was changed or the student is not active; refresh"},409);
    }
    return privateJson({ok:true,version:data.expectedVersion+1});
  }catch{return privateJson({error:"Unable to save attendance; refresh and retry"},409);}
}
