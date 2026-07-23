// 現場データ検索 API
//   GET  /api/field-cases/search?q=エラー651&category=設備工事&subcategory=給湯器&limit=20&offset=0
//   POST /api/field-cases/search  { query, category?, subcategory?, limit?, offset? }
//
// 原因・症状・対応方法・タグを横断した全文/部分一致検索を返す。
// 読み取りのため anon クライアントを使用する。

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { searchFieldCases } from "@/app/utils/fieldCases";

export const dynamic = "force-dynamic";

async function run(args: {
  query: string;
  category?: string;
  subcategory?: string;
  limit?: number;
  offset?: number;
}) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Supabase が未設定です。", results: [] },
      { status: 503 },
    );
  }
  try {
    const supabase = getSupabaseClient();
    const results = await searchFieldCases(supabase, args);
    return NextResponse.json({ ok: true, count: results.length, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "検索に失敗しました";
    return NextResponse.json({ ok: false, error: message, results: [] }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  return run({
    query: p.get("q") ?? p.get("query") ?? "",
    category: p.get("category") ?? undefined,
    subcategory: p.get("subcategory") ?? undefined,
    limit: p.get("limit") ? Number(p.get("limit")) : undefined,
    offset: p.get("offset") ? Number(p.get("offset")) : undefined,
  });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "リクエストの解析に失敗しました", results: [] },
      { status: 400 },
    );
  }
  return run({
    query: typeof body.query === "string" ? body.query : "",
    category: typeof body.category === "string" ? body.category : undefined,
    subcategory: typeof body.subcategory === "string" ? body.subcategory : undefined,
    limit: typeof body.limit === "number" ? body.limit : undefined,
    offset: typeof body.offset === "number" ? body.offset : undefined,
  });
}
