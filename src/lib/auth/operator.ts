import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionCookieName, verifySession } from "@/lib/auth/session";

export async function getAuthenticatedOperator() {
  return verifySession((await cookies()).get(sessionCookieName())?.value);
}

export async function requireAuthenticatedOperator() {
  const operator = await getAuthenticatedOperator();
  if (!operator) redirect("/login");
  return operator;
}
