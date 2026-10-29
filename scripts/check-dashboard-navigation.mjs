import fs from "node:fs";
import path from "node:path";

const read=(name)=>fs.readFileSync(path.join(process.cwd(),name),"utf8");
const registry=read("modules/platform/navigation/erp-route-registry.ts");
const start=registry.indexOf("export const implementedErpRoutes = [");
const end=registry.indexOf("] as const;",start);
if(start<0||end<0)throw Error("Missing authoritative implemented ERP route list");
const available=[...registry.slice(start,end).matchAll(/"(\/dashboard(?:\/[a-z0-9-]+)*)"/g)].map(x=>x[1]);
if(new Set(available).size!==available.length)throw Error("Duplicate canonical sidebar routes");
if(available.length<20)throw Error("Original ERP pages have disappeared from available navigation");
const missing=available.filter(href=>!fs.existsSync(path.join(process.cwd(),"app",href,"page.tsx")));
if(missing.length)throw Error("Sidebar contains missing /dashboard pages: "+missing.join(", "));
if(!registry.includes("isAvailableErpRoute(href:string)"))throw Error("Route availability predicate missing");
const shell=read("components/erp/erp-shell.tsx");
if(shell.includes("['/dashboard','/dashboard/academics/settings'"))throw Error("Old six-page navigation filter is still present");
if(!read("modules/platform/navigation/erp-navigation.ts").includes("isAvailableErpRoute(route.href)"))
 throw Error("Sidebar navigation lacks route availability guard");
if(!read("components/erp/central-search.tsx").includes("isAvailableErpRoute(r.href)"))
 throw Error("Global search lists placeholder routes");
const primitive=read("components/ui/sidebar.tsx");
for(const feature of ["setOpenMobile","localStorage","aria-modal","Escape","collapsed","matchMedia","sidebar-trigger","scroll","toggle"])
 if(!primitive.includes(feature))throw Error("Mobile/collapsible sidebar regression: "+feature);
const side=read("components/erp/erp-sidebar.tsx");
for(const feature of ["SidebarTrigger","SidebarMenuButton","aria-current","setOpenMobile(false)","collapsed"])
 if(!side.includes(feature))throw Error("Responsive nav implementation missing "+feature);
if(!read("app/sign-in/page.tsx").includes('router.replace("/dashboard")'))
 throw Error("Sign-in routes users to the duplicate staff app");
const legacy=fs.readdirSync("app/app",{withFileTypes:true}).filter(x=>x.isDirectory()&&x.name!=="[...slug]");
if(legacy.some(x=>fs.readdirSync(path.join("app/app",x.name),{recursive:true}).some(y=>String(y).endsWith("page.tsx"))))
 throw Error("Duplicate /app UI page survived the canonical ERP migration");
if(!read("app/app/[...slug]/page.tsx").includes('redirect(dest+'))
 throw Error("Legacy bookmarks are not forwarded to original ERP");
if(fs.existsSync("components/staff/staff-shell.tsx"))
 throw Error("Second redundant ERP sidebar was not removed");
const sidePaths=new Set(available);
for(const page of ["app/dashboard/admissions/page.tsx","app/dashboard/staff/page.tsx","app/dashboard/academics/settings/page.tsx"]){
 if(!fs.existsSync(page))throw Error("Original ERP page missing: "+page);
}
console.log("Canonical /dashboard navigation:",sidePaths.size,"verified pages; shadcn-style responsive sidebar, single shell, search filters and legacy redirects confirmed.");
