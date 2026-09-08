import { NextRequest, NextResponse } from "next/server";
import { sessionCookieName, verifySession } from "@/lib/auth/session";

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const publicRoute = ["/login", "/api/auth/login", "/api/automation/run-due-schedules"].includes(path);
  if (publicRoute) return NextResponse.next();
  const operator = await verifySession(request.cookies.get(sessionCookieName())?.value);
  if (!operator) {
    const response = NextResponse.redirect(new URL("/login", request.url), 303);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static/|favicon[.]ico$).*)"],
};
