import { Finora } from "@/components/finora";
export default async function Page({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const { section } = await params;
  return (
    <Finora
      section={section?.[0] ?? "dashboard"}
      detail={section?.[1]}
      configured={Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      )}
    />
  );
}
