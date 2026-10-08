import { NextResponse } from "next/server";
import { serverDb } from "@/lib/server";
export async function GET(req: Request) {
  const url = new URL(req.url),
    code = url.searchParams.get("code");
  if (code) {
    const db = await serverDb();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(new URL("/configuracoes", url.origin));
  }
  return NextResponse.redirect(new URL("/?auth_error=1", url.origin));
}
