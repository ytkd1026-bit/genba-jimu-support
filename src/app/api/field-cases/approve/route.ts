// 現場事例 承認して保存 API
//   POST /api/field-cases/approve
//   body: { caseId, approvedBy, editReasons?, photoCaptions?, ...FieldCaseValues }
//
// 「承認して保存」1回で完了する。主要データを同期保存し、AI値↔承認値の差分を監査へ、
// Decision Log・監査ログを残す。統計/類似/RAG/PDF/サムネは非同期ジョブへ分離する。

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseClient";
import { approveFieldCase, coerceFieldCaseValues } from "@/app/utils/fieldCaseWorkflow";

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
  const approvedBy = typeof body.approvedBy === "string" && body.approvedBy ? body.approvedBy : "代表者";
  const editReasons =
    body.editReasons && typeof body.editReasons === "object"
      ? (body.editReasons as Record<string, string>)
      : undefined;
  const photoCaptions = Array.isArray(body.photoCaptions)
    ? (body.photoCaptions as { id: string; caption: string }[])
    : undefined;

  try {
    const supabase = getSupabaseAdminClient();
    const result = await approveFieldCase(supabase, {
      caseId: body.caseId,
      approvedValues: coerceFieldCaseValues(body),
      approvedBy,
      editReasons,
      photoCaptions,
    });
    return NextResponse.json({
      ok: true,
      caseId: result.case.id,
      caseNo: result.caseNo,
      editCount: result.editCount,
      case: result.case,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "承認に失敗しました";
    console.error("[field-cases/approve]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
