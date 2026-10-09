import { NextResponse } from "next/server";
import { authenticatedDb } from "@/lib/server";
import { fail, sameOrigin } from "@/lib/http";
import { schemas, Resource } from "@/lib/resources";
import { z } from "zod";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ resource: string }> },
) {
  try {
    sameOrigin(req);
    const { resource } = await params;
    if (!Object.hasOwn(schemas, resource)) throw new Error("Recurso não autorizado");
    const { db, user } = await authenticatedDb();
    const body = await req.json();
    if (resource === "savings_goals" && !body.id)
      throw new Error("Crie caixinhas pela operação transacional");
    if (resource === "savings_reconciliations")
      throw new Error("Use a operação de conciliação para registrar e autorizar o ajuste separadamente");
    const data: Record<string, unknown> = schemas[resource as Resource].parse(
      body.data,
    );
    if (resource === "user_settings") {
      const { error } = await db.from(resource).upsert({ ...data, user_id: user.id });
      if (error) throw new Error(error.message);
      return NextResponse.json({ id: user.id });
    }
    if (body.id && resource === "recurring_transactions") {
      const { data: result, error } = await db.rpc("revise_recurring", { recurrence_id: z.uuid().parse(body.id), replacement: data, cancel: false });
      if (error) throw new Error(error.message);
      return NextResponse.json({ id: result });
    }
    if (body.id && resource === "investment_income") {
      const { data: result, error } = await db.rpc("revise_income", {
        income_id: z.uuid().parse(body.id), replacement: data, cancel: false,
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({ id: result });
    }
    if (body.id && resource === "investment_opening_positions") {
      const { data: result, error } = await db.rpc("revise_opening_position", {
        position_id: z.uuid().parse(body.id), replacement: data,
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({ id: result });
    }
    if (body.id && resource === "investment_corporate_actions")
      throw new Error("Evento corporativo com efeitos na posição exige conciliação específica; não pode ser sobrescrito");
    const query = body.id
      ? db.from(resource).update(data).eq("id", z.uuid().parse(body.id))
      : db.from(resource).insert(data);
    const { data: result, error } = await query.select("id").single();
    if (error) throw new Error(error.message);
    return NextResponse.json(result);
  } catch (e) {
    return fail(e);
  }
}
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ resource: string }> },
) {
  try {
    sameOrigin(req);
    const { resource } = await params;
    if (
      ![
        "categories",
        "budgets",
        "financial_goals",
        "investment_income",
      ].includes(resource)
    )
      throw new Error(
        "Arquive contas; registros financeiros não são apagados silenciosamente",
      );
    const { db } = await authenticatedDb();
    const id = z.uuid().parse(new URL(req.url).searchParams.get("id"));
    if (resource === "categories") {
      const { error } = await db.rpc("archive_category", { category_id: id });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    if (resource === "investment_income") {
      const { error } = await db.rpc("revise_income", { income_id: id, replacement: {}, cancel: true });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    const { error } = await db.from(resource).delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
