import type {ErpRouteDefinition} from "./erp-route-registry";
/** Supplemental Cloudflare operational screens are kept separate so the pinned
 * original sohoj-academy route and permission architecture stays unchanged. */
export const operationalErpRoutes:ErpRouteDefinition[]=[
 {id:"academic-years",title:"Academic years",eyebrow:"Academic setup",href:"/dashboard/academics/academic-years",navGroup:"Academic setup",permission:"academics.view",icon:"offerings"},
 {id:"subjects",title:"Subjects",eyebrow:"Academics",href:"/dashboard/academics/subjects",navGroup:"Teaching & Academics",permission:"academics.view",icon:"offerings"},
 {id:"collections",title:"Payment collections",eyebrow:"Finance",href:"/dashboard/finance/collections",navGroup:"Finance",permission:"finance.view",icon:"accounting"},
 {id:"finance-expenses",title:"Operating expenses",eyebrow:"Finance",href:"/dashboard/finance/expenses",navGroup:"Finance",permission:"accounting.view",icon:"accounting"},
 {id:"management-reports",title:"Management reports",eyebrow:"Finance",href:"/dashboard/finance/reports",navGroup:"Finance",permission:"accounting.view",icon:"accounting"},
 {id:"staff-directory",title:"Staff directory",eyebrow:"People",href:"/dashboard/staff/directory",navGroup:"People",permission:"staff.view",icon:"staff"},
 {id:"staff-access",title:"Staff access",eyebrow:"Administration",href:"/dashboard/staff/access",navGroup:"Administration",permission:"system.users.manage",icon:"settings"},
 {id:"teacher-assignments",title:"Teacher assignments",eyebrow:"People",href:"/dashboard/staff/teachers",navGroup:"People",permission:"staff.view",icon:"teacher"},
];
