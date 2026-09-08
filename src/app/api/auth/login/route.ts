import { NextResponse } from "next/server";
import { hasTrustedOrigin, verifyOperatorPassword } from "@/lib/auth/crypto";
import { issueSession, sessionCookieName, sessionCookieOptions } from "@/lib/auth/session";

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return new Response("Forbidden", { status: 403 });
  const failure = () => NextResponse.redirect(new URL("/login?error=1", process.env.LEADFINDER_APP_ORIGIN), 303);
  try {
    if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return failure();
    // Bound the body even when Content-Length is absent or untrusted.
    const reader = request.body?.getReader();
    if (!reader) return failure();
    let body = "";
    let size = 0;
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); return failure(); }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    const form = new URLSearchParams(body);
    const user = form.get("user") ?? "";
    const password = form.get("password") ?? "";
    if (user.length > 256 || password.length > 1024 || !await verifyOperatorPassword(user, password)) return failure();
    const token = await issueSession();
    const response = NextResponse.redirect(new URL("/", process.env.LEADFINDER_APP_ORIGIN), 303);
    response.cookies.set(sessionCookieName(), token, sessionCookieOptions());
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return failure();
  }
}
