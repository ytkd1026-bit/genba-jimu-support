// Supabase クライアント
// 将来 localStorage から Supabase へ移行する現場データ層の入口。
//
// - ブラウザ / anon 用: NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
// - サーバ / 管理用:   SUPABASE_URL(なければ NEXT_PUBLIC) + SUPABASE_SERVICE_ROLE_KEY
//
// service_role キーは RLS をバイパスするため、必ずサーバ側（API Route / Server Action）
// でのみ使用すること。クライアントバンドルへ含めてはいけない。

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const PUBLIC_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

let browserClient: SupabaseClient | null = null;

/** ブラウザ / anon 権限のクライアント（検索・読み取り中心）。 */
export function getSupabaseClient(): SupabaseClient {
  if (!PUBLIC_URL || !ANON_KEY) {
    throw new Error(
      "Supabase の環境変数が未設定です（NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY）。",
    );
  }
  if (!browserClient) {
    browserClient = createClient(PUBLIC_URL, ANON_KEY, {
      auth: { persistSession: false },
    });
  }
  return browserClient;
}

/**
 * サーバ専用の service_role クライアント。
 * 書き込み（Insert / Storage upload / Decision Log）はこちらを使う。
 * ※ API Route / Server Action からのみ呼び出すこと。
 */
export function getSupabaseAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? PUBLIC_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !serviceKey) {
    throw new Error(
      "Supabase の管理用環境変数が未設定です（SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）。",
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Supabase が利用可能に設定されているか（環境変数の有無）。 */
export function isSupabaseConfigured(): boolean {
  return Boolean(PUBLIC_URL && ANON_KEY);
}
