import { Finora } from "@/components/finora";
import { supabasePublicConfig } from "@/lib/supabase-config";
export default async function Page({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const { section } = await params;
  return (
    <Finora
      section={section?.[0] ?? "inicio"}
      detail={section?.[1]}
      configured={Boolean(supabasePublicConfig())}
    />
  );
}
