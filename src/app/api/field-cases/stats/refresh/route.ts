// 現場事例 統計 洗い替え API（承認処理と分離した非同期実行用）
//   POST /api/field-cases/stats/refresh
//   GET  /api/field-cases/stats            … 現在の統計を返す
//
// 承認レスポンスを遅くしないため、統計更新はこのエンドポイント（cron/Runtimeから起動）で行う。

import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseClient";
import { refreshStats } from "@/app/utils/fieldCaseWorkflow";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const supabase = getSupabaseAdminClient();
    await refreshStats(supabase);
    const { data } = await supabase.from("field_case_stats").select("*").order("dimension");
    return NextResponse.json({ ok: true, stats: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "統計更新に失敗しました";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const { data } = await supabase.from("field_case_stats").select("*").order("dimension");
    return NextResponse.json({ ok: true, stats: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "取得に失敗しました";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
