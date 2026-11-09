import { NextResponse } from "next/server";
import { AUTH_COOKIE, authToken } from "@/lib/auth";

export async function POST(request: Request) {
  const form = await request.formData();
  const given = String(form.get("password") ?? "");
  const password = process.env.DASHBOARD_PASSWORD;
  const base = new URL(request.url);

  if (!password) return NextResponse.redirect(new URL("/", base), 303);
  if (given !== password) return NextResponse.redirect(new URL("/login?error=1", base), 303);

  const res = NextResponse.redirect(new URL("/", base), 303);
  res.cookies.set(AUTH_COOKIE, await authToken(password), {
    httpOnly: true,
    secure: base.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
