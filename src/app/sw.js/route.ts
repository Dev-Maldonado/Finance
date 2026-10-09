import { serviceWorkerSource } from "@/lib/pwa-worker";
export const dynamic = "force-static";
export function GET() {
  return new Response(serviceWorkerSource(process.env.NEXT_PUBLIC_FINORA_PWA_VERSION || "mobile-v1"), { headers: {
    "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-cache, no-store, must-revalidate", "Service-Worker-Allowed": "/",
  } });
}
