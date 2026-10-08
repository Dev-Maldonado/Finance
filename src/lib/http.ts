import { NextResponse } from "next/server";
export function fail(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Falha ao processar solicitação";
  return NextResponse.json(
    { error: message },
    { status: message === "UNAUTHORIZED" ? 401 : 400 },
  );
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) throw new Error("Origem não autorizada");
  const parsed = new URL(origin);
  const host = request.headers.get("host") || new URL(request.url).host;
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.host !== host ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new Error("Origem não autorizada");
}
