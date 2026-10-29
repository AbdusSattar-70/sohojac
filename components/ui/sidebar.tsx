"use client";
import React, {createContext,useContext,useEffect,useState,type ReactNode} from "react";
import {PanelLeft} from "lucide-react";
import {cn} from "@/lib/utils";

type State={collapsed:boolean;toggle:()=>void;mobileOpen:boolean;setOpenMobile:(open:boolean)=>void};
const Context=createContext<State|null>(null);
export function useSidebar():State{
 const state=useContext(Context);
 if(!state)throw new Error("Sidebar must be inside SidebarProvider");
 return state;
}
export function SidebarProvider({children}:{children:ReactNode}){
 const [collapsed,setCollapsed]=useState(false);
 const [mobileOpen,setOpenMobile]=useState(false);
 return <Context.Provider value={{collapsed,toggle:()=>setCollapsed(v=>!v),mobileOpen,setOpenMobile}}>
   <div data-slot="sidebar-wrapper" className="flex min-h-screen w-full items-stretch bg-background text-foreground">{children}</div>
 </Context.Provider>;
}
export function Sidebar({children,className,collapsible:_,variant:__,...props}:React.HTMLAttributes<HTMLElement> & {collapsible?:string;variant?:string}){
 const {collapsed,mobileOpen,setOpenMobile}=useSidebar();
 return <>
 {mobileOpen&&<button type="button" aria-label="Close navigation overlay" onClick={()=>setOpenMobile(false)} className="fixed inset-0 z-40 bg-black/70 md:hidden"/>}
 <aside data-slot="sidebar" data-collapsible={collapsed?"icon":""}
  className={cn("group fixed inset-y-0 left-0 z-50 flex min-h-screen w-[min(18rem,88vw)] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl transition-transform md:sticky md:top-0 md:z-20 md:h-screen md:translate-x-0 md:shadow-none",collapsed?"md:w-[72px]":"md:w-[264px]",mobileOpen?"translate-x-0":"-translate-x-full",className)}
  {...props}>{children}</aside>
 </>;
}
export function SidebarInset({children,className,...props}:React.HTMLAttributes<HTMLDivElement>){
 return <div data-slot="sidebar-inset" className={cn("flex min-h-screen min-w-0 flex-1 flex-col",className)} {...props}>{children}</div>;
}
export function SidebarTrigger({className,onClick,...props}:React.ButtonHTMLAttributes<HTMLButtonElement>){
 const {toggle,setOpenMobile,mobileOpen}=useSidebar();
 const [isMobile,setIsMobile]=useState(false);
 useEffect(()=>{
  const query=window.matchMedia("(max-width: 767px)");
  const update=()=>setIsMobile(query.matches);
  update();query.addEventListener("change",update);
  return()=>query.removeEventListener("change",update);
 },[]);
 return <button type="button" data-slot="sidebar-trigger" aria-label="Toggle navigation"
  className={cn("inline-flex size-9 items-center justify-center rounded-lg border border-sidebar-border hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-blue-400",className)}
  {...props} onClick={e=>{if(isMobile)setOpenMobile(!mobileOpen);else toggle();onClick?.(e);}}>
  <PanelLeft className="size-4" aria-hidden="true"/>
 </button>;
}
export function SidebarHeader({className,...props}:React.HTMLAttributes<HTMLDivElement>){
 return <div data-slot="sidebar-header" className={cn("shrink-0 p-3",className)} {...props}/>;
}
export function SidebarFooter({className,...props}:React.HTMLAttributes<HTMLDivElement>){
 return <div data-slot="sidebar-footer" className={cn("mt-auto shrink-0 p-3",className)} {...props}/>;
}
export function SidebarContent({className,...props}:React.HTMLAttributes<HTMLDivElement>){
 return <div data-slot="sidebar-content" className={cn("min-h-0 flex-1 overflow-y-auto px-2",className)} {...props}/>;
}
export function SidebarGroup({className,...props}:React.HTMLAttributes<HTMLDivElement>){
 return <section data-slot="sidebar-group" className={cn("mb-3 space-y-1",className)} {...props}/>;
}
export function SidebarGroupLabel({asChild,children,className,...props}:React.HTMLAttributes<HTMLElement> & {asChild?:boolean}){
 const cls=cn("flex w-full items-center rounded-md px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground group-data-[collapsible=icon]:hidden",className);
 if(asChild&&React.isValidElement<{className?:string}>(children)){
  return React.cloneElement(children,{className:cn(cls,children.props.className)});
 }
 return <div className={cls} {...(props as React.HTMLAttributes<HTMLDivElement>)}>{children}</div>;
}
export function SidebarMenu({className,...props}:React.HTMLAttributes<HTMLUListElement>){
 return <ul data-slot="sidebar-menu" className={cn("space-y-0.5",className)} {...props}/>;
}
export function SidebarMenuItem({className,...props}:React.HTMLAttributes<HTMLLIElement>){
 return <li data-slot="sidebar-menu-item" className={cn("list-none",className)} {...props}/>;
}
type MenuButtonProps=React.ButtonHTMLAttributes<HTMLButtonElement> & {asChild?:boolean;isActive?:boolean;tooltip?:string};
export function SidebarMenuButton({asChild,isActive,tooltip,className,children,...props}:MenuButtonProps){
 const cls=cn("flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-2 focus-visible:outline-sidebar-ring [&_svg]:size-4 [&_svg]:shrink-0",
 isActive?"bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-sidebar-border":"",className);
 if(asChild&&React.isValidElement<{className?:string;title?:string}>(children)){
  return React.cloneElement(children,{className:cn(cls,children.props.className),title:tooltip});
 }
 return <button type="button" title={tooltip} className={cls} {...props}>{children}</button>;
}
