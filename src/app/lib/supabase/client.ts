"use client";

// Supabase クライアント（ブラウザ用・単一インスタンス）
//
// 環境変数（NEXT_PUBLIC_SUPABASE_URL と クライアント公開キー）が未設定なら
// null を返し、アプリは従来どおり localStorage で動作する（段階移行のため）。
// 各画面は直接ここを触らず、必ず Repository 層（repositories/*）経由で使うこと。
//
// クライアント公開キーは、新命名 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY（sb_publishable_...）を優先し、
// 旧命名 NEXT_PUBLIC_SUPABASE_ANON_KEY（eyJ... の JWT 形式）にもフォールバック対応する。
// どちらも createClient のクライアントキーとして同じ役割で動作する。

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let cached: SupabaseClient | null = null;

/** Supabase が設定されているか（URL と anon key の両方が入っている） */
export function isSupabaseConfigured(): boolean {
  return typeof url === "string" && url.length > 0 && typeof anonKey === "string" && anonKey.length > 0;
}

/** 診断表示用。URLのhostだけを返し、Publishable keyや完全URLは表示しない。 */
export function getSupabaseHost(): string {
  if (!url) return "未設定";
  try {
    return new URL(url).host;
  } catch {
    return "URL不正";
  }
}

/** ブラウザ用 Supabase クライアント。未設定なら null。 */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (cached) return cached;
  cached = createClient(url as string, anonKey as string, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return cached;
}
