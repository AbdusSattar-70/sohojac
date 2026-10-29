import {env} from "cloudflare:workers";
import {requirePermission} from "@/modules/platform/auth/erp-context";

type Base={id:string;name:string;is_active:number|boolean;created_at?:string};
type Years=Base & {starts_on:string|null;ends_on:string|null;created_at:string};
type Classes=Base & {code:string;sort_order:number;created_at:string};
type Group=Base & {code:string};
type Program=Base & {code:string;description:string|null;created_at:string};
type School=Base & {area_id:string|null;is_verified:number|boolean;created_at:string;updated_at:string};
type Area={id:string;name:string;is_active:number|boolean};
type Source=Base & {code:string;created_at:string};

function active<T extends Base>(rows:T[]):(Omit<T,"is_active">&{is_active:boolean})[]{
 return rows.map(r=>({...r,is_active:Boolean(r.is_active)}));
}
export async function getManageCrmOverview(){
 await requirePermission("system.master_data.manage");
 const [years,classes,groups,subjects,programs,schools,areas,sources,relationships]=await Promise.all([
  env.DB.prepare("SELECT id,title AS name,starts_on,ends_on,(status='ACTIVE') AS is_active,created_at FROM academic_years ORDER BY starts_on DESC").all<Years>(),
  env.DB.prepare("SELECT id,code,name,sort_order,is_active,created_at FROM academy_classes ORDER BY sort_order,name").all<Classes>(),
  env.DB.prepare("SELECT id,code,name,is_active FROM academic_groups ORDER BY name").all<Group>(),
  env.DB.prepare("SELECT id,code,title AS name,active AS is_active,'' AS created_at FROM academic_subjects ORDER BY title").all<Source>(),
  env.DB.prepare("SELECT id,code,name,description,active AS is_active,'' AS created_at FROM academy_programmes ORDER BY name").all<Program>(),
  env.DB.prepare("SELECT id,name,area_id,is_verified,is_active,created_at,updated_at FROM academy_schools ORDER BY name").all<School>(),
  env.DB.prepare("SELECT id,name,is_active FROM academy_areas WHERE is_active=1 ORDER BY name").all<Area>(),
  env.DB.prepare("SELECT id,code,name,is_active,created_at FROM academy_lead_sources ORDER BY name").all<Source>(),
  env.DB.prepare("SELECT id,code,name,is_active,created_at FROM academy_guardian_relationships ORDER BY name").all<Source>(),
 ]);
 return {
  years:active(years.results??[]),
  classes:active(classes.results??[]),
  groups:active(groups.results??[]),
  subjects:active(subjects.results??[]),
  programs:active(programs.results??[]),
  schools:(schools.results??[]).map(r=>({...r,is_active:Boolean(r.is_active),is_verified:Boolean(r.is_verified)})),
  areas:(areas.results??[]).map(r=>({...r,is_active:Boolean(r.is_active)})),
  leadSources:active(sources.results??[]),
  relationships:active(relationships.results??[]),
 };
}
export type ManageCrmOverview=Awaited<ReturnType<typeof getManageCrmOverview>>;
