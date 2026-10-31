"use client";
import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saveAcademyIdentity } from "./identity-actions";
export function AcademyIdentityForm({
  name,
  branchName,
  mode = "setup",
}: {
  name: string;
  branchName: string;
  mode?: "setup" | "edit";
}) {
  const [pending, start] = useTransition(),
    [message, setMessage] = useState("");
  const router = useRouter();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    start(async () => {
      const r = await saveAcademyIdentity({
        name: f.get("name"),
        branch_name: f.get("branch_name"),
      });
      setMessage(r.message);
      if (r.ok) router.refresh();
    });
  }
  return (
    <form
      data-editor
      data-busy={pending ? "true" : "false"}
      onSubmit={submit}
      className="space-y-4 rounded-2xl border bg-card p-5"
    >
      <fieldset disabled={pending} className="contents">
        <h2 className="font-semibold">{mode === "setup" ? "First-time academy setup" : "Edit academy details"}</h2>
        {mode === "setup" && <p className="text-sm text-muted-foreground">Confirm these details once to finish setting up your academy. This step disappears when the details are saved.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            Academy name
            <input
              name="name"
              required
              defaultValue={name || "Sohoj Academy"}
              maxLength={160}
              className="mt-1 w-full rounded-lg border bg-background p-3"
            />
          </label>
          <label className="block text-sm">
            Main campus name
            <input
              name="branch_name"
              required
              defaultValue={branchName}
              maxLength={160}
              className="mt-1 w-full rounded-lg border bg-background p-3"
            />
          </label>
        </div>
        <button
          disabled={pending}
          className="rounded-lg border px-4 py-3 text-sm"
        >
          {mode === "setup" ? "Confirm academy identity" : "Save academy details"}
        </button>
        {mode === "edit" && <Link href="/dashboard/academics/settings" className="ml-3 inline-flex min-h-11 items-center rounded-lg px-3 text-sm hover:bg-muted">Done editing</Link>}
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
      </fieldset>
    </form>
  );
}
