import { createClient } from "@supabase/supabase-js";
import { CDIRateProvider, BrapiProvider } from "./providers";
import { syncCVM, syncFundRegistry } from "./cvm-sync";
export async function syncMarket() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Configuração de sincronização ausente");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const today = new Date().toISOString().slice(0, 10);
  const outcomes = [];
  for (const provider of ["bcb", "brapi", "cvm"]) {
    try {
      let count = 0;
      const { data: last } = await db
        .from("provider_sync_states")
        .select("last_success")
        .eq("provider", provider)
        .maybeSingle();
      if (last?.last_success?.slice(0, 10) === today) {
        outcomes.push({ provider, status: "cached", records: 0 });
        continue;
      }
      if (provider === "bcb") {
        const { data: state } = await db
          .from("provider_sync_states")
          .select("*")
          .eq("provider", "bcb")
          .maybeSingle();
        let start = state?.last_date
          ? new Date(Date.parse(state.last_date) - 7 * 86400000)
              .toISOString()
              .slice(0, 10)
          : new Date(Date.parse(today) - 365 * 86400000)
              .toISOString()
              .slice(0, 10);
        const { data: oldestLot } = await db
          .from("savings_lots")
          .select("start_date")
          .order("start_date")
          .limit(1)
          .maybeSingle();
        const { data: oldestRate } = await db
          .from("benchmark_rates")
          .select("date")
          .eq("series", "12")
          .order("date")
          .limit(1)
          .maybeSingle();
        if (
          oldestLot &&
          (!oldestRate || oldestLot.start_date < oldestRate.date)
        )
          start = oldestLot.start_date < start ? oldestLot.start_date : start;
        const rates: {
          series: string;
          date: string;
          value: string;
          source: string;
        }[] = [];
        for (let cursor = start; cursor <= today;) {
          const windowEnd = new Date(
            Math.min(Date.parse(cursor) + 365 * 86400000, Date.parse(today)),
          )
            .toISOString()
            .slice(0, 10);
          for (const series of ["12", "11"])
            rates.push(
              ...(await new CDIRateProvider(undefined, series).history(
                cursor,
                windowEnd,
              )),
            );
          cursor = new Date(Date.parse(windowEnd) + 86400000)
            .toISOString()
            .slice(0, 10);
        }
        if (rates.length) {
          const { error } = await db
            .from("benchmark_rates")
            .upsert(rates, { onConflict: "series,date" });
          if (error) throw error;
          const { error: e } = await db.from("provider_sync_states").upsert({
            provider,
            last_success: new Date().toISOString(),
            last_date: rates.at(-1)!.date,
          });
          if (e) throw e;
          count = rates.length;
        }
      } else if (provider === "cvm") {
        const registryCount = await syncFundRegistry(db);
        const countCurrent = await syncCVM(
          db,
          today.slice(0, 7).replace("-", ""),
        );
        const previous = new Date(Date.parse(today));
        previous.setUTCDate(1);
        previous.setUTCMonth(previous.getUTCMonth() - 1);
        count =
          registryCount +
          countCurrent +
          (await syncCVM(
            db,
            previous.toISOString().slice(0, 7).replace("-", ""),
          ));
        const { error: e } = await db.from("provider_sync_states").upsert({
          provider,
          last_success: new Date().toISOString(),
          last_date: today,
        });
        if (e) throw e;
      } else {
        const { data: assets, error } = await db
          .from("investment_assets")
          .select("ticker,asset_class,currency");
        if (error) throw error;
        const tickers = new Set(
          (assets ?? [])
            .filter((a) =>
              ["stock", "fii", "etf", "bdr", "fiagro"].includes(a.asset_class),
            )
            .map((a) => a.ticker),
        );
        if (tickers.size === 0) {
          await db.from("provider_sync_logs").insert({
            provider,
            status: "skipped",
            message: "Nenhum ativo elegível cadastrado",
          });
          outcomes.push({ provider, status: "skipped", records: 0 });
          continue;
        }
        for (const ticker of tickers) {
          const assetClass = assets!.find(
            (a) => a.ticker === ticker,
          )!.asset_class;
          const providerApi = new BrapiProvider();
          const quote = await providerApi.getQuote(ticker, assetClass);
          const { error: e } = await db
            .from("asset_price_history")
            .upsert(quote, { onConflict: "ticker,date,source" });
          if (e) throw e;
          count++;
          const history = await providerApi.getHistoricalPrices(
            ticker,
            assetClass,
          );
          for (let i = 0; i < history.length; i += 500) {
            const { error: e } = await db
              .from("asset_price_history")
              .upsert(history.slice(i, i + 500), {
                onConflict: "ticker,date,source",
              });
            if (e) throw e;
            count += Math.min(500, history.length - i);
          }
          const dividends = [
            ...new Map(
              (await providerApi.getDividends(ticker, assetClass)).map(
                (event) => [event.source_id, event],
              ),
            ).values(),
          ];
          if (dividends.length) {
            const { error: e } = await db
              .from("asset_cash_events")
              .upsert(dividends, { onConflict: "source_id" });
            if (e) throw e;
            count += dividends.length;
          }
        }
        const { error: e } = await db.from("provider_sync_states").upsert({
          provider,
          last_success: new Date().toISOString(),
          last_date: today,
        });
        if (e) throw e;
      }
      await db
        .from("provider_sync_logs")
        .insert({ provider, status: "success", records: count });
      outcomes.push({ provider, status: "success", records: count });
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : e && typeof e === "object" && "message" in e
            ? String(e.message)
            : "Falha no provedor";
      await db
        .from("provider_sync_logs")
        .insert({ provider, status: "error", message });
      outcomes.push({ provider, status: "error", message });
    }
  }
  return outcomes;
}
