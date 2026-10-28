import { createAuth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  const session = await createAuth().api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/sign-in");

  // Do not display private academy data until D1 role checks are implemented.
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Sohojac staff portal</h1>
      <p className="mt-4">Authenticated as {session.user.email}.</p>
      <p className="mt-3 text-sm text-slate-600">
        Authentication test only. Academy information is not available until
        server-side D1 staff authorization has been implemented.
      </p>
    </main>
  );
}
