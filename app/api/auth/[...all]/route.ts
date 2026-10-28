import { createAuth, isStaffOrigin } from "@/lib/auth";

export const dynamic = "force-dynamic";

function handler(request: Request) {
  if (!isStaffOrigin(request.url)) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  try {
    return createAuth().handler(request);
  } catch {
    return Response.json({ error: "Staff sign-in is not available" }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}

export function GET(request: Request) { return handler(request); }
export function POST(request: Request) { return handler(request); }
