"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpenCheck, CalendarDays, CircleHelp,
  ClipboardList, ExternalLink, GraduationCap, LayoutDashboard, LogOut,
  Menu, PanelLeftClose, PanelLeftOpen, Search, Settings2, ShieldCheck,
  UserRound, UsersRound, Wallet, X,
  type LucideIcon,
} from "lucide-react";
import Logo from "@/components/shared/logo";
import { authClient } from "@/lib/auth-client";
import type { StaffAccess } from "@/lib/staff-access";

type Entry = {
  label: string;
  href?: string;
  icon: LucideIcon;
  restricted?: boolean;
  ownerAdminOnly?: boolean;
};
type Group = { title: string; items: Entry[] };

const groups: Group[] = [
  {
    title: "Daily work",
    items: [
      { label: "Overview", href: "/app", icon: LayoutDashboard },
      { label: "Action center", icon: ClipboardList },
    ],
  },
  {
    title: "CRM & admissions",
    items: [
      { label: "Enquiries", href: "/app/prospects", icon: Search, restricted: true },
      { label: "Admissions", href: "/app/admissions", icon: BookOpenCheck },
    ],
  },
  {
    title: "Academics",
    items: [
      { label: "Academic years", href: "/app/academic-years", icon: CalendarDays },
      { label: "Programme offerings", href: "/app/offerings", icon: GraduationCap },
      { label: "Subjects", href: "/app/subjects", icon: BookOpenCheck },
      { label: "Batches", href: "/app/batches", icon: CalendarDays },
      { label: "Routines", href: "/app/routine", icon: CalendarDays, restricted: true },
      { label: "Attendance", href: "/app/attendance", icon: CalendarDays, restricted: true },
      { label: "Assessments", href: "/app/assessments", icon: ClipboardList, restricted: true },
    ],
  },
  {
    title: "People & finance",
    items: [
      { label: "Students", href: "/app/students", icon: UsersRound, restricted: true },
      { label: "Fee plans", href: "/app/fee-plans", icon: Wallet },
      { label: "Collections", href: "/app/collections", icon: Wallet, restricted: true },
      { label: "Expenses", href: "/app/expenses", icon: Wallet, ownerAdminOnly: true },
      { label: "Management reports", href: "/app/reports", icon: LayoutDashboard, ownerAdminOnly: true },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "Staff & access", href: "/app/staff-access", icon: ShieldCheck, ownerAdminOnly: true },
      { label: "Settings", icon: Settings2 },
      { label: "Audit history", href: "/app/audit", icon: ShieldCheck, ownerAdminOnly: true },
      { label: "Help & workflows", icon: CircleHelp },
    ],
  },
];

function activePath(pathname: string, href: string) {
  return href === "/app" ? pathname === "/app" : pathname === href || pathname.startsWith(href + "/");
}

export function StaffShell({ staff, children }: { staff: StaffAccess; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const canManage = staff.role === "OWNER" || staff.role === "ADMIN" || staff.role === "OPERATOR";

  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [mobileOpen]);

  const pageTitle = pathname.startsWith("/app/prospects") ? "Enquiries"
    : pathname.startsWith("/app/staff-access") ? "Staff & access"
    : pathname.startsWith("/app/academic-years") ? "Academic years"
    : pathname.startsWith("/app/subjects") ? "Subjects"
    : pathname.startsWith("/app/assessments") ? "Assessments"
    : pathname.startsWith("/app/routine") ? "Routines"
    : pathname.startsWith("/app/reports") ? "Management reports"
    : pathname.startsWith("/app/expenses") ? "Expenses"
    : pathname.startsWith("/app/audit") ? "Audit history"
    : pathname.startsWith("/app/attendance") ? "Attendance"
    : pathname.startsWith("/app/collections") ? "Collections"
    : pathname.startsWith("/app/students") ? "Students"
    : pathname.startsWith("/app/admissions") ? "Admissions"
    : pathname.startsWith("/app/fee-plans") ? "Fee plans"
    : pathname.startsWith("/app/batches") ? "Batches"
    : pathname.startsWith("/app/offerings") ? "Programme offerings"
    : "Overview";

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error("Sign out failed");
      router.replace("/sign-in");
      router.refresh();
    } catch {
      setSignOutError("Could not sign out. Please retry.");
      setSigningOut(false);
    }
  }

  const renderNavigation = (minimized: boolean) => (
    <>
      <div className="border-b border-slate-200 px-3 py-3">
        <Link href="/app" onClick={() => setMobileOpen(false)}
          className="flex min-h-12 items-center gap-3 rounded-xl px-2 text-slate-900 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          aria-label="Sohoj Academy staff dashboard">
          <Logo variant="mark" size={40} priority />
          {!minimized && <div className="min-w-0">
            <p className="truncate text-[13px] font-extrabold tracking-tight">Sohoj Academy</p>
            <p className="truncate text-[11px] font-medium text-slate-500">Digital Campus · ERP</p>
          </div>}
        </Link>
        <button type="button" onClick={() => setCollapsed(value => !value)}
          className="mt-2 hidden h-8 w-full items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 md:flex"
          aria-label={minimized ? "Expand sidebar" : "Collapse sidebar"} title={minimized ? "Expand sidebar" : "Collapse sidebar"}>
          {minimized ? <PanelLeftOpen size={17} /> : <><PanelLeftClose size={17}/><span className="ml-2 text-xs">Collapse menu</span></>}
        </button>
      </div>
      <nav aria-label="Staff workspace navigation" className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2 py-4">
        {groups.map((group) => {
          const visible = group.items.filter(item =>
            (!item.restricted || canManage) &&
            (!item.ownerAdminOnly || staff.role === "OWNER" || staff.role === "ADMIN")
          );
          if (!visible.length) return null;
          return <section key={group.title}>
            {!minimized && <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400">
              {group.title}
            </p>}
            <div className="space-y-0.5">
              {visible.map((item) => {
                const Icon = item.icon;
                const current = item.href ? activePath(pathname, item.href) : false;
                const label = item.label;
                const base = "flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors";
                if (!item.href) {
                  return <div key={item.label} title={item.label + " · planned module"} aria-disabled="true"
                    className={base + " cursor-not-allowed text-slate-400"} >
                    <Icon size={17} className="shrink-0 opacity-70" aria-hidden="true"/>
                    {!minimized && <><span className="min-w-0 flex-1 truncate">{label}</span><span className="text-[9px] font-medium uppercase tracking-wider text-slate-400">Soon</span></>}
                  </div>;
                }
                return <Link key={item.label} href={item.href} onClick={() => setMobileOpen(false)}
                  title={minimized ? label : undefined}
                  aria-current={current ? "page" : undefined}
                  className={base + (current
                    ? " bg-blue-50 text-blue-800 ring-1 ring-blue-100"
                    : " text-slate-600 hover:bg-slate-100 hover:text-slate-950")}>
                  <Icon size={17} className="shrink-0" aria-hidden="true"/>
                  {!minimized && <span className="truncate">{label}</span>}
                </Link>;
              })}
            </div>
          </section>;
        })}
      </nav>
      <div className="border-t border-slate-200 p-3">
        <div title={staff.email} className="flex items-center gap-3 rounded-xl bg-slate-100 px-2.5 py-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-700 text-white">
            <UserRound size={17} aria-hidden="true"/>
          </span>
          {!minimized && <div className="min-w-0">
            <p className="truncate text-xs font-bold text-slate-900">{staff.name}</p>
            <p className="truncate text-[11px] text-slate-500">{staff.role} · {staff.email}</p>
          </div>}
        </div>
        <button type="button" disabled={signingOut} onClick={() => void signOut()}
          title="Sign out" className="mt-2 flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-[13px] font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50">
          <LogOut size={17} aria-hidden="true"/>{!minimized && (signingOut ? "Signing out…" : "Sign out")}
        </button>
        {signOutError && !minimized && <p role="alert" className="mt-2 text-xs text-red-700">{signOutError}</p>}
      </div>
    </>
  );

  return (
    <div lang="en" data-locale="en" className="flex min-h-screen w-full bg-slate-50 font-sans text-slate-900">
      <aside className={"hidden h-screen shrink-0 flex-col border-r border-slate-200 bg-white md:sticky md:top-0 md:flex " + (collapsed ? "w-[76px]" : "w-[264px]")}>
        {renderNavigation(collapsed)}
      </aside>
      {mobileOpen && <div className="fixed inset-0 z-50 md:hidden">
        <button type="button" aria-label="Close navigation overlay"
          className="absolute inset-0 bg-slate-950/55" onClick={() => setMobileOpen(false)}/>
        <aside aria-label="Mobile workspace navigation" className="absolute inset-y-0 left-0 flex w-[min(19rem,90vw)] flex-col bg-white shadow-2xl">
          <div className="absolute right-2 top-2 z-10">
            <button type="button" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"><X size={18}/></button>
          </div>
          {renderNavigation(false)}
        </aside>
      </div>}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
          <button type="button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 md:hidden">
            <Menu size={19}/>
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-bold uppercase tracking-[0.17em] text-slate-500">Sohoj Academy · Digital Campus</p>
            <p className="truncate text-sm font-bold text-slate-900 sm:text-base">{pageTitle}</p>
          </div>
          {canManage && <Link href="/app/prospects" title="Open enquiries" aria-label="Open enquiries"
            className="hidden size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 sm:inline-flex">
            <Search size={18}/>
          </Link>}
          <a href="/" title="Public website" className="hidden items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 sm:inline-flex">
            <ExternalLink size={14}/> Website
          </a>
          <div title={staff.email} className="flex size-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-800">
            <UserRound size={18}/>
          </div>
        </header>
        <main id="staff-main" className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
        <footer className="mx-auto max-w-[1600px] px-4 pb-5 text-xs text-slate-400 sm:px-6 lg:px-8">
          Sohoj Academy · Learning made easy & fun
        </footer>
      </div>
    </div>
  );
}
