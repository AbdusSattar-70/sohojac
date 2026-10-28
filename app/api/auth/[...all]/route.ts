import { createAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return createAuth().handler(request);
}

export function POST(request: Request) {
  return createAuth().handler(request);
}
