import { NextResponse } from "next/server";
import { authenticatedDb } from "@/lib/server";
import { fail, sameOrigin } from "@/lib/http";
import { operationSchemas } from "@/lib/resources";
import { z } from "zod";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { db } = await authenticatedDb();
    const body = await req.json();
    if (!(body.action in operationSchemas))
      throw new Error("Operação inválida");
    const payload = operationSchemas[
      body.action as keyof typeof operationSchemas
    ].parse(body.payload);
    const { data, error } = await db.rpc("execute_operation", {
      action: body.action,
      payload,
      request_id: z.uuid().parse(body.request_id),
    });
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (e) {
    return fail(e);
  }
}
