import { NextResponse } from "next/server";
import { protectRequest } from "@/lib/security/request-protection";

/** Apply to API mutations AND React Server Actions before domain handlers. */
export async function proxy(request: Request) {
  return (await protectRequest(request)) ?? NextResponse.next();
}
export const config = { matcher: ["/:path*"] };
