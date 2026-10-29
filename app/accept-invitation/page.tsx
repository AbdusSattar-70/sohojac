"use client";

import {Suspense,useState,type FormEvent} from "react";
import {useSearchParams} from "next/navigation";
import Link from "next/link";
import Logo from "@/components/shared/logo";

export default function AcceptInvitationPage(){
  return <Suspense fallback={<main className="p-8 text-sm">Preparing your invitation…</main>}>
    <ActivateAccount/>
  </Suspense>;
}

function ActivateAccount(){
  const search=useSearchParams();
  const token=search.get("token")?.trim()||"";
  const valid=/^[0-9a-f]{64}$/i.test(token);
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [busy,setBusy]=useState(false);
  const [complete,setComplete]=useState(false);
  const [error,setError]=useState("");

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!valid||busy)return;
    if(password.length<8||password.length>128||password!==confirm){
      setError("Enter matching passwords of 8–128 characters.");return;
    }
    setError("");setBusy(true);
    try{
      const result=await fetch("/api/staff/accept-invitation",{
        method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({token,password}),
      });
      const body=await result.json() as {ok?:boolean;error?:string};
      if(!result.ok||!body.ok)throw new Error(body.error||"Could not accept invitation");
      setComplete(true);setPassword("");setConfirm("");
      window.history.replaceState(null,"","/accept-invitation");
    }catch(error){setError(error instanceof Error?error.message:"Could not activate account");}
    finally{setBusy(false);}
  }

  return <main lang="en" className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 text-slate-900">
    <div className="w-full max-w-md space-y-6 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
      <div className="flex items-center gap-3">
        <Logo size={44} variant="mark"/>
        <div><p className="text-sm font-extrabold">Sohoj Academy</p>
          <p className="text-xs text-slate-500">Digital Campus · Staff Activation</p></div>
      </div>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Activate your staff account</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Your request must have been reviewed and your invitation sent to the registered email.
          Choose a password to finish activation.
        </p>
      </div>
      {complete?<div role="status" className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
        Account activated. Your verified staff role will be checked on every request.
      </div>:!valid?<div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        The invitation link is missing or invalid. Contact the academy administrator for a fresh invitation.
      </div>:<form className="space-y-4" onSubmit={submit}>
        <label className="block text-sm font-semibold">Password (8–128 characters)
          <input type="password" minLength={8} maxLength={128} required autoComplete="new-password"
            value={password} onChange={e=>setPassword(e.target.value)}
            className="mt-1.5 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus-visible:outline-2 focus-visible:outline-blue-700"/>
        </label>
        <label className="block text-sm font-semibold">Confirm password
          <input type="password" minLength={8} maxLength={128} required autoComplete="new-password"
            value={confirm} onChange={e=>setConfirm(e.target.value)}
            className="mt-1.5 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus-visible:outline-2 focus-visible:outline-blue-700"/>
        </label>
        {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy||password!==confirm}
          className="min-h-11 w-full rounded-lg bg-blue-700 px-4 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">
          {busy?"Activating…":"Activate account"}
        </button>
      </form>}
      <Link href="/sign-in" className="inline-block text-sm font-bold text-blue-700 hover:underline">Return to sign in</Link>
    </div>
  </main>;
}
