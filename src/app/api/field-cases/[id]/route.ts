// 現場事例 1件取得 API（承認前含む・確認画面/再表示用）
//   GET /api/field-cases/[id]

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseClient";
import { getFieldCaseWithDetail } from "@/app/utils/fieldCaseWorkflow";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const supabase = getSupabaseAdminClient();
    const detail = await getFieldCaseWithDetail(supabase, id);
    if (!detail) {
      return NextResponse.json({ ok: false, error: "案件が見つかりません" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...detail });
  } catch (err) {
    const message = err instanceof Error ? err.message : "取得に失敗しました";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
