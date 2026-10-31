import type {ErpRouteDefinition} from "./erp-route-registry";
/** Supplemental Cloudflare operational screens are kept separate so the pinned
 * original sohoj-academy route and permission architecture stays unchanged. */
export const operationalErpRoutes:ErpRouteDefinition[]=[
 {id:"collections",title:"Payment collections",eyebrow:"Finance",href:"/dashboard/finance/collections",navGroup:"Finance",permission:"finance.view",icon:"accounting"},
 {id:"finance-expenses",title:"Operating expenses",eyebrow:"Finance",href:"/dashboard/finance/expenses",navGroup:"Finance",permission:"accounting.view",icon:"accounting"},
 {id:"management-reports",title:"Management reports",eyebrow:"Finance",href:"/dashboard/finance/reports",navGroup:"Finance",permission:"accounting.view",icon:"accounting"},
 {id:"teacher-assignments",title:"Teacher assignments",eyebrow:"People",href:"/dashboard/staff/teachers",navGroup:"People",permission:"staff.view",icon:"teacher"},
];
