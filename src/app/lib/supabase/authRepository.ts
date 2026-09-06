"use client";

// メール＋パスワード認証。iPhone実機で失敗箇所を判別できるよう、
// 設定・通信・Supabase応答・session永続化を段階別に返す。

import { getSupabase, isSupabaseConfigured } from "./client";
import { clearBackendCache } from "./backend";
import { friendlyAuthError, type AuthFailureDiagnostic } from "./authErrors";

export type AuthUser = { id: string; email: string | null };

export type AuthTraceEvent = "auth:request" | "auth:success" | "auth:error";
export type AuthTraceHandler = (event: AuthTraceEvent) => void;

export type AuthResult =
  | { ok: true; user: AuthUser | null }
  | { ok: false; error: string; diagnostic: AuthFailureDiagnostic };

function failure(
  stage: AuthFailureDiagnostic["stage"],
  message: string,
  options?: { code?: string; status?: number; friendly?: string },
): AuthResult {
  return {
    ok: false,
    error: options?.friendly ?? friendlyAuthError(message, options?.code),
    diagnostic: { stage, message, code: options?.code, status: options?.status },
  };
}

function unknownMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "不明な通信エラー";
}

function emitTrace(handler: AuthTraceHandler | undefined, event: AuthTraceEvent): void {
  try {
    handler?.(event);
  } catch {
    // 診断表示側の失敗で認証処理を止めない。
  }
}

async function verifyPersistedSession(expectedUserId: string): Promise<AuthResult | null> {
  try {
    const sb = getSupabase();
    if (!sb) return failure("configuration", "Supabase client is not configured", { friendly: "クラウド接続が未設定です。" });
    const { data, error } = await sb.auth.getSession();
    if (error) {
      return failure("session", error.message, {
        code: error.code,
        status: error.status,
        friendly: "セッション保存に失敗しました。Safariのサイトデータ設定を確認してください。",
      });
    }
    if (!data.session || data.session.user.id !== expectedUserId) {
      return failure("session", "Session was not persisted after sign in", {
        friendly: "セッション保存に失敗しました。Safariのサイトデータ設定を確認してください。",
      });
    }
    return null;
  } catch (error) {
    const message = unknownMessage(error);
    return failure("session", message, {
      friendly: /network|fetch|load failed/i.test(message)
        ? "ネットワークエラーです。Supabaseへ接続できません。"
        : "セッション保存に失敗しました。Safariのサイトデータ設定を確認してください。",
    });
  }
}

export const authRepository = {
  configured(): boolean {
    return isSupabaseConfigured();
  },

  async getUser(): Promise<AuthUser | null> {
    const sb = getSupabase();
    if (!sb) return null;
    try {
      const { data, error } = await sb.auth.getUser();
      if (error) return null;
      return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
    } catch {
      return null;
    }
  },

  async hasSession(): Promise<boolean> {
    const sb = getSupabase();
    if (!sb) return false;
    try {
      const { data, error } = await sb.auth.getSession();
      return !error && !!data.session;
    } catch {
      return false;
    }
  },

  async signUp(email: string, password: string): Promise<AuthResult> {
    const sb = getSupabase();
    if (!sb) return failure("configuration", "Supabase client is not configured", { friendly: "クラウド接続が未設定です。" });
    try {
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) {
        return failure("supabase", error.message, { code: error.code, status: error.status });
      }
      if (data.session && data.user) {
        const sessionFailure = await verifyPersistedSession(data.user.id);
        if (sessionFailure) return sessionFailure;
      }
      clearBackendCache();
      return { ok: true, user: data.user ? { id: data.user.id, email: data.user.email ?? null } : null };
    } catch (error) {
      const message = unknownMessage(error);
      return failure("request", message, {
        friendly: "ネットワークエラーです。Supabaseへ接続できません。",
      });
    }
  },

  async signIn(email: string, password: string, onTrace?: AuthTraceHandler): Promise<AuthResult> {
    try {
      // getSupabase() 自体が例外になっても、画面を busy のまま停止させない。
      const sb = getSupabase();
      if (!sb) {
        emitTrace(onTrace, "auth:error");
        return failure("configuration", "Supabase client is not configured", { friendly: "クラウド接続が未設定です。" });
      }

      emitTrace(onTrace, "auth:request");
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        emitTrace(onTrace, "auth:error");
        return failure("supabase", error.message, { code: error.code, status: error.status });
      }
      if (!data.user || !data.session) {
        emitTrace(onTrace, "auth:error");
        return failure("session", "Supabase returned no session", {
          friendly: "セッション保存に失敗しました。Safariのサイトデータ設定を確認してください。",
        });
      }
      const sessionFailure = await verifyPersistedSession(data.user.id);
      if (sessionFailure) {
        emitTrace(onTrace, "auth:error");
        return sessionFailure;
      }
      clearBackendCache();
      emitTrace(onTrace, "auth:success");
      return { ok: true, user: { id: data.user.id, email: data.user.email ?? null } };
    } catch (error) {
      emitTrace(onTrace, "auth:error");
      const message = unknownMessage(error);
      return failure("request", message, {
        friendly: "ネットワークエラーです。Supabaseへ接続できません。",
      });
    }
  },

  async signOut(): Promise<void> {
    const sb = getSupabase();
    if (!sb) return;
    try {
      await sb.auth.signOut();
    } finally {
      clearBackendCache();
    }
  },
};
