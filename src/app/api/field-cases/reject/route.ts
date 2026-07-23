// 現場事例 却下 API
//   POST /api/field-cases/reject
//   body: { caseId, actor?, reason? }

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseClient";
import { setWorkflowStatus } from "@/app/utils/fieldCaseWorkflow";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "リクエストの解析に失敗しました" }, { status: 400 });
  }
  if (typeof body.caseId !== "string") {
    return NextResponse.json({ ok: false, error: "caseId は必須です" }, { status: 400 });
  }
  try {
    const supabase = getSupabaseAdminClient();
    const c = await setWorkflowStatus(
      supabase,
      body.caseId,
      "rejected",
      typeof body.actor === "string" ? body.actor : "代表者",
      typeof body.reason === "string" ? body.reason : undefined,
    );
    return NextResponse.json({ ok: true, case: c });
  } catch (err) {
    const message = err instanceof Error ? err.message : "却下に失敗しました";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
