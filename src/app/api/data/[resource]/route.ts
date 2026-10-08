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
    if (!(resource in schemas)) throw new Error("Recurso não autorizado");
    const { db } = await authenticatedDb();
    const body = await req.json();
    if (resource === "savings_goals" && !body.id)
      throw new Error("Crie caixinhas pela operação transacional");
    const data: Record<string, unknown> = schemas[resource as Resource].parse(
      body.data,
    );
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
    const { error } = await db.from(resource).delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
