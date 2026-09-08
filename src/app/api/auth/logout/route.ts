import { NextResponse } from "next/server";
import { hasTrustedOrigin } from "@/lib/auth/crypto";
import { requireAuthenticatedOperator } from "@/lib/auth/operator";
import { expiredSessionCookieOptions, sessionCookieName } from "@/lib/auth/session";

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return new Response("Forbidden", { status: 403 });
  await requireAuthenticatedOperator();
  const response = NextResponse.redirect(new URL("/login", process.env.LEADFINDER_APP_ORIGIN), 303);
  response.cookies.set(sessionCookieName(), "", expiredSessionCookieOptions());
  response.headers.set("Cache-Control", "no-store");
  return response;
}
