// 現場事例 draft 保存 API（修正を保存 / 保留）
//   POST /api/field-cases/draft
//   body: { caseId, ...FieldCaseValues, hold?: boolean }
//     hold=true で workflow_status=pending_approval（保留）、既定は draft のまま。

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseClient";
import { saveDraftFieldCase, coerceFieldCaseValues } from "@/app/utils/fieldCaseWorkflow";

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
    const saved = await saveDraftFieldCase(supabase, {
      caseId: body.caseId,
      values: coerceFieldCaseValues(body),
      workflowStatus: body.hold === true ? "pending_approval" : "draft",
    });
    return NextResponse.json({ ok: true, case: saved });
  } catch (err) {
    const message = err instanceof Error ? err.message : "保存に失敗しました";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
