"use client";
import * as React from "react";
import {usePathname} from "next/navigation";
import {Menu,PanelLeftClose,PanelLeftOpen,X} from "lucide-react";
import {cn} from "@/lib/utils";

const STORAGE_KEY="sohojac:erp-sidebar-collapsed";
type SidebarState={
 collapsed:boolean;toggle:()=>void;setCollapsed:(value:boolean)=>void;
 mobileOpen:boolean;setOpenMobile:(value:boolean)=>void;isMobile:boolean;
};
const Context=React.createContext<SidebarState|null>(null);
export function useSidebar():SidebarState{
 const state=React.useContext(Context);
 if(!state)throw new Error("Sidebar requires SidebarProvider");
 return state;
}
export function SidebarProvider({children}:{children:React.ReactNode}){
 const pathname=usePathname();
 const [collapsed,setCollapsed]=React.useState(false);
 const [mobileOpen,setOpenMobile]=React.useState(false);
 const [isMobile,setIsMobile]=React.useState(false);
 const lastFocus=React.useRef<HTMLElement|null>(null);
 React.useEffect(()=>{
  try{setCollapsed(window.localStorage.getItem(STORAGE_KEY)==="true");}catch{}
 },[]);
 React.useEffect(()=>{
  try{window.localStorage.setItem(STORAGE_KEY,String(collapsed));}catch{}
 },[collapsed]);
 React.useEffect(()=>{
  const media=window.matchMedia("(max-width: 767px)");
  const update=()=>{setIsMobile(media.matches);if(!media.matches)setOpenMobile(false);};
  update();media.addEventListener("change",update);
  return()=>media.removeEventListener("change",update);
 },[]);
 React.useEffect(()=>{setOpenMobile(false);},[pathname]);
 React.useEffect(()=>{
  if(!mobileOpen||!isMobile)return;
  lastFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const previous=document.body.style.overflow;
  document.body.style.overflow="hidden";
  const key=(event:KeyboardEvent)=>{
   if(event.key==="Escape"){event.preventDefault();setOpenMobile(false);}
   if(event.key!=="Tab")return;
   const aside=document.querySelector<HTMLElement>('[data-slot="sidebar"]');
   if(!aside)return;
   const links=Array.from(aside.querySelectorAll<HTMLElement>('a[href],button:not([disabled])'))
    .filter(el=>el.getClientRects().length>0);
   const first=links[0],last=links[links.length-1];
   if(!first||!last)return;
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  };
  window.addEventListener("keydown",key);
  const close=document.querySelector<HTMLButtonElement>('[data-slot="sidebar-mobile-close"]');
  close?.focus();
  return()=>{document.body.style.overflow=previous;window.removeEventListener("keydown",key);lastFocus.current?.focus();};
 },[mobileOpen,isMobile]);
 React.useEffect(()=>{
  const key=(event:KeyboardEvent)=>{
   if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="b"&&!event.altKey){
    const target=event.target as HTMLElement|null;
    if(target?.closest("input, textarea, select, [contenteditable=true]"))return;
    event.preventDefault();
    if(isMobile)setOpenMobile(v=>!v);else setCollapsed(v=>!v);
   }
  };
  window.addEventListener("keydown",key);
  return()=>window.removeEventListener("keydown",key);
 },[isMobile]);
 const value=React.useMemo<SidebarState>(()=>({
  collapsed,toggle:()=>isMobile?setOpenMobile(v=>!v):setCollapsed(v=>!v),
  setCollapsed,mobileOpen,setOpenMobile,isMobile
 }),[collapsed,mobileOpen,isMobile]);
 return <Context.Provider value={value}>
  <div data-slot="sidebar-wrapper" data-sidebar-state={collapsed?"collapsed":"expanded"}
   className="flex min-h-dvh w-full min-w-0 items-stretch bg-background text-foreground">
   {children}
  </div>
 </Context.Provider>;
}
export function Sidebar({children,className,collapsible:_,variant:__,...props}:React.HTMLAttributes<HTMLElement>&{collapsible?:string;variant?:string}){
 const {collapsed,mobileOpen,isMobile,setOpenMobile}=useSidebar();
 return <>
  {mobileOpen&&<button type="button" aria-label="Close sidebar overlay"
   onClick={()=>setOpenMobile(false)} className="fixed inset-0 z-40 bg-black/70 backdrop-blur-[2px] md:hidden"/>}
  <aside data-slot="sidebar" data-state={collapsed?"collapsed":"expanded"}
   data-collapsible={collapsed?"icon":""}
   data-mobile={isMobile?"true":"false"}
   aria-label="Primary ERP navigation"
   aria-modal={isMobile&&mobileOpen?"true":undefined}
   role={isMobile&&mobileOpen?"dialog":undefined}
   className={cn(
    "group/sidebar fixed inset-y-0 left-0 z-50 flex h-dvh min-h-0 w-[min(19rem,88vw)] shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl",
    "transition-[width,transform] duration-200 ease-out motion-reduce:transition-none",
    "md:sticky md:top-0 md:z-20 md:h-dvh md:translate-x-0 md:shadow-none",
    collapsed?"md:w-[76px]":"md:w-[276px]",
    mobileOpen?"translate-x-0":"-translate-x-full pointer-events-none md:pointer-events-auto",
    className
   )}
   {...props}>
   <div className="absolute right-3 top-3 z-10 md:hidden">
    <button type="button" data-slot="sidebar-mobile-close" aria-label="Close navigation"
     onClick={()=>setOpenMobile(false)}
     className="inline-flex size-10 items-center justify-center rounded-lg border border-sidebar-border bg-sidebar-accent/60 hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-sidebar-ring">
     <X className="size-5" aria-hidden="true"/>
    </button>
   </div>
   {children}
  </aside>
 </>;
}
export function SidebarInset({children,className,...props}:React.HTMLAttributes<HTMLDivElement>){
 return <div data-slot="sidebar-inset"
  className={cn("flex min-h-dvh min-w-0 flex-1 flex-col overflow-x-clip",className)} {...props}>{children}</div>;
}
export function SidebarTrigger({className,onClick,...props}:React.ButtonHTMLAttributes<HTMLButtonElement>){
 const {toggle,collapsed,isMobile,mobileOpen}=useSidebar();
 const label=isMobile?(mobileOpen?"Close navigation":"Open navigation"):(collapsed?"Expand navigation":"Collapse navigation");
 const Icon=isMobile?Menu:collapsed?PanelLeftOpen:PanelLeftClose;
 return <button type="button" data-slot="sidebar-trigger" aria-label={label} title={label}
  aria-expanded={isMobile?mobileOpen:!collapsed} aria-controls="erp-navigation"
  className={cn("inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-sidebar-border bg-sidebar/60 text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-sidebar-ring",className)}
  {...props} onClick={event=>{toggle();onClick?.(event);}}>
  <Icon className="size-[18px]" aria-hidden="true"/>
 </button>;
}
export function SidebarHeader({className,...props}:React.HTMLAttributes<HTMLDivElement>){
 return <div data-slot="sidebar-header" className={cn("shrink-0 p-3",className)} {...props}/>;
}
export function SidebarFooter({className,...props}:React.HTMLAttributes<HTMLDivElement>){
 return <div data-slot="sidebar-footer" className={cn("mt-auto shrink-0 p-2",className)} {...props}/>;
}
export function SidebarContent({className,...props}:React.HTMLAttributes<HTMLDivElement>){
 return <div id="erp-navigation" data-slot="sidebar-content"
  className={cn("min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-2 [scrollbar-width:thin]",className)}
  {...props}/>;
}
export function SidebarGroup({className,...props}:React.HTMLAttributes<HTMLDivElement>){
 return <section data-slot="sidebar-group" className={cn("mb-2 space-y-1",className)} {...props}/>;
}
export function SidebarGroupLabel({asChild,children,className,...props}:React.HTMLAttributes<HTMLElement>&{asChild?:boolean}){
 const cls=cn("flex min-h-8 w-full items-center rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-sidebar-foreground/55 group-data-[collapsible=icon]/sidebar:sr-only",className);
 if(asChild&&React.isValidElement<{className?:string}>(children))
  return React.cloneElement(children,{className:cn(cls,children.props.className)});
 return <div className={cls} {...(props as React.HTMLAttributes<HTMLDivElement>)}>{children}</div>;
}
export function SidebarMenu({className,...props}:React.HTMLAttributes<HTMLUListElement>){
 return <ul data-slot="sidebar-menu" className={cn("space-y-1",className)} {...props}/>;
}
export function SidebarMenuItem({className,...props}:React.HTMLAttributes<HTMLLIElement>){
 return <li data-slot="sidebar-menu-item" className={cn("list-none",className)} {...props}/>;
}
type MenuButtonProps=React.ButtonHTMLAttributes<HTMLButtonElement>&{asChild?:boolean;isActive?:boolean;tooltip?:string};
export function SidebarMenuButton({asChild,isActive,tooltip,className,children,...props}:MenuButtonProps){
 const cls=cn(
  "group/menu-item relative flex min-h-11 w-full min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium text-sidebar-foreground/75",
  "transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-2 focus-visible:outline-sidebar-ring",
  "[&_svg]:size-[19px] [&_svg]:shrink-0 group-data-[collapsible=icon]/sidebar:justify-center group-data-[collapsible=icon]/sidebar:gap-0 group-data-[collapsible=icon]/sidebar:px-0",
  isActive?"bg-sidebar-primary/15 text-sidebar-foreground shadow-[inset_3px_0_0_var(--sidebar-primary)] ring-1 ring-sidebar-border/50":"",
  className
 );
 if(asChild&&React.isValidElement<{className?:string;title?:string}>(children))
  return React.cloneElement(children,{className:cn(cls,children.props.className),title:tooltip||children.props.title});
 return <button type="button" title={tooltip} className={cls} {...props}>{children}</button>;
}
