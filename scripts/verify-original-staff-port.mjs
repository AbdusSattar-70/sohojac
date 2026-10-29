import fs from "node:fs";
import crypto from "node:crypto";
const file=p=>fs.readFileSync(p);
const hash=p=>{
 const buf=file(p);
 return crypto.createHash("sha1").update("blob "+buf.length+"\0").update(buf).digest("hex");
};
const originals={
 "components/erp/record-state-button.tsx":"f5c81918c822504a4ab76c4af72424986211e536",
 "components/erp/staff-edit-button.tsx":"8d15c4bc05af9e48414eb31300d75479972ca95c",
 "components/erp/action-panel.tsx":"5ebceeb0a1e7f632b245907241d6eafdecf7046f",
 "components/erp/empty-state.tsx":"51406a5d276964cb0f160a839e1f3636e08e2640"
};
for(const [p,sha] of Object.entries(originals)){
 if(hash(p)!==sha)throw new Error("Original ERP component changed: "+p);
}
const register=file("modules/staff/components/staff-register.tsx").toString();
for(const text of ["Permanent Staff ID","Staff ID / name","Edit details","Correction reason","expectedVersion"]){
 if(!register.includes(text))throw new Error("Original staff form is incomplete: "+text);
}
const page=file("app/dashboard/staff/page.tsx").toString();
for(const text of ["<StaffRegister","<AccessRequestRegister","getStaffAccessRequestPage","requirePermission(\"staff.view\")"]){
 if(!page.includes(text))throw new Error("Original staff page is incomplete: "+text);
}
for(const p of ["modules/staff/queries.ts","modules/staff/edit-actions.ts","modules/platform/access/actions.ts","modules/platform/lifecycle-actions.ts"]){
 const v=file(p).toString();
 if(v.includes("@/lib/supabase")||v.includes("@/modules/platform/rpc-client"))
  throw new Error("Supabase implementation remains in migrated staff module: "+p);
}
const actions=file("modules/platform/lifecycle-actions.ts").toString();
if(!actions.includes('value.entity!=="staff"')||!actions.includes('row.linked_user_id===context.profileId'))
 throw new Error("Original lifecycle port must deny unported actions and self-archive");
const edit=file("modules/staff/edit-actions.ts").toString();
if(!edit.includes("expectedVersion")||!edit.includes("erp_audit_events")||
 !edit.includes('permissions.includes("staff.manage")'))
 throw new Error("Staff edit must preserve audit, ACL and concurrency");
console.log("Source Staff Register UI preserved and D1 staff actions security-gated.");
