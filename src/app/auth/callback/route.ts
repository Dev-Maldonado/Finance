import { NextResponse } from "next/server";
import { serverDb } from "@/lib/server";
export async function GET(req: Request) {
  const url = new URL(req.url),
    code = url.searchParams.get("code");
  let authError = url.searchParams.get("error_code") === "otp_expired"
    ? "otp_expired" : "invalid_link";
  if (code) {
    const db = await serverDb();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error)
      return new NextResponse(null, {
        status: 303,
        headers: { Location: "/configuracoes" },
      });
    if (error.code === "otp_expired") authError = "otp_expired";
  }
  // Relative redirects preserve the browser's public origin behind reverse proxies.
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/?auth_error=${authError}` },
  });
}
