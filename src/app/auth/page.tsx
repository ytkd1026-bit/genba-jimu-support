"use client";

// ログイン / 新規登録（メール＋パスワード）。
// Phase 1で共有するのは、自社情報・元請・単価マスタのみ。
// クラウド未設定（env未入力）のときは、その旨と設定手順の案内を表示する。

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authRepository } from "@/app/lib/supabase/authRepository";
import { getSupabaseHost, isSupabaseConfigured } from "@/app/lib/supabase/client";
import type { AuthFailureDiagnostic } from "@/app/lib/supabase/authErrors";
import type { AuthTraceEvent } from "@/app/lib/supabase/authRepository";

const inputCls =
  "w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-base text-stone-800 placeholder:text-stone-300 focus:border-[#8B4A3C] focus:outline-none focus:ring-2 focus:ring-[#8B4A3C]/20";
const labelCls = "mb-1 block text-sm font-bold text-stone-700";
const isDevelopment = process.env.NODE_ENV !== "production";

type LoginTraceEvent = "login:start" | AuthTraceEvent;

function unknownAuthMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "不明な認証エラー";
}

export default function AuthPage() {
  const router = useRouter();
  const [configured] = useState(() => isSupabaseConfigured());
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [lastAuthError, setLastAuthError] = useState<AuthFailureDiagnostic | null>(null);
  const [appHost, setAppHost] = useState("確認中");
  const [authTrace, setAuthTrace] = useState<LoginTraceEvent[]>([]);

  const showDiagnostics =
    process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_SHOW_AUTH_DIAGNOSTICS === "1";
  const runtimeId = process.env.NEXT_PUBLIC_APP_RUNTIME_ID ?? "phase1-safe-migration-v2";

  useEffect(() => {
    // Auth通信の完了を待たず、開いているbundleのhostを直ちに識別できるようにする。
    void Promise.resolve().then(() => setAppHost(window.location.host));
    void Promise.all([authRepository.getUser(), authRepository.hasSession()]).then(([user, session]) => {
      setSignedInEmail(user?.email ?? null);
      setHasSession(session);
    });
  }, []);

  function switchTab(next: "signin" | "signup") {
    setTab(next);
    setMsg(null); // 直前の入力エラー等が残らないように消す
    setAuthTrace([]);
  }

  function recordAuthTrace(event: LoginTraceEvent) {
    if (!isDevelopment) return;
    console.info(`[auth] ${event}`);
    setAuthTrace((current) => [...current, event].slice(-8));
  }

  function normalizedEmail(): string {
    return email.trim().toLowerCase();
  }

  function validateCredentials(normalized: string): boolean {
    if (!normalized) {
      setMsg({ ok: false, text: "メールアドレスを入力してください。" });
      return false;
    }
    if (!password) {
      setMsg({ ok: false, text: "パスワードを入力してください。" });
      return false;
    }
    if (password.length < 6) {
      setMsg({ ok: false, text: "パスワードは6文字以上にしてください。" });
      return false;
    }
    return true;
  }

  async function handleLogin(e?: React.SyntheticEvent) {
    e?.preventDefault();
    if (busy) return;
    const loginEmail = normalizedEmail();
    if (!validateCredentials(loginEmail)) return;

    setBusy(true);
    setMsg(null);
    setLastAuthError(null);
    setAuthTrace([]);
    recordAuthTrace("login:start");
    try {
      const res = await authRepository.signIn(loginEmail, password, recordAuthTrace);
      if (res.ok) {
        setHasSession(await authRepository.hasSession());
        router.push("/?justSignedIn=1");
      } else {
        setMsg({ ok: false, text: res.error });
        setLastAuthError(res.diagnostic);
        setHasSession(await authRepository.hasSession());
      }
    } catch (error) {
      const message = unknownAuthMessage(error);
      recordAuthTrace("auth:error");
      setMsg({ ok: false, text: "ネットワークエラーです。Supabaseへ接続できません。" });
      setLastAuthError({ stage: "request", message });
      setHasSession(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleSignUp(e?: React.SyntheticEvent) {
    e?.preventDefault();
    if (busy) return;
    const signupEmail = normalizedEmail();
    if (!validateCredentials(signupEmail)) return;

    setBusy(true);
    setMsg(null);
    setLastAuthError(null);
    try {
      const res = await authRepository.signUp(signupEmail, password);
      if (res.ok) {
        if (!res.user) {
          setMsg({ ok: true, text: "確認メールを送信しました。メール内のリンクを開いてから、ログインしてください。" });
          return;
        }
        setHasSession(await authRepository.hasSession());
        router.push("/?justSignedIn=1");
      } else {
        setMsg({ ok: false, text: res.error });
        setLastAuthError(res.diagnostic);
        setHasSession(await authRepository.hasSession());
      }
    } catch (error) {
      const message = unknownAuthMessage(error);
      setMsg({ ok: false, text: "ネットワークエラーです。Supabaseへ接続できません。" });
      setLastAuthError({ stage: "request", message });
      setHasSession(false);
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (tab === "signin") void handleLogin();
    else void handleSignUp();
  }

  async function handleSignOut() {
    await authRepository.signOut();
    setSignedInEmail(null);
    setHasSession(false);
    setLastAuthError(null);
    setMsg({ ok: true, text: "ログアウトしました。" });
  }

  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-6 sm:max-w-lg">
        <Link href="/" className="mb-2 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">← ホームへ戻る</Link>
        <h1 className="text-xl font-bold text-stone-800">アカウント</h1>
        <p className="mt-1 text-sm text-stone-500">同じアカウントでログインすると、自社情報・元請・単価マスタをMacとiPhoneで共有できます。</p>

        {!configured && (
          <div className="mt-4 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
            <p className="text-sm font-bold text-amber-800">クラウド接続が未設定です</p>
            <p className="mt-1 text-sm leading-relaxed text-amber-700">
              端末間共有には Supabase の接続情報が必要です。プロジェクトを作成し、
              <code className="mx-1 rounded bg-white px-1">.env.local</code> に
              <code className="mx-1 rounded bg-white px-1">NEXT_PUBLIC_SUPABASE_URL</code> と
              <code className="mx-1 rounded bg-white px-1">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>
              を設定してください。未設定の間も、この端末内（ローカル保存）ではこれまで通り使えます。
            </p>
          </div>
        )}

        {configured && signedInEmail && (
          <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100">
            <p className="text-sm text-stone-600">ログイン中：<b className="text-stone-800">{signedInEmail}</b></p>
            <button type="button" onClick={handleSignOut} className="mt-3 min-h-[44px] w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-bold text-stone-600 active:opacity-80">ログアウト</button>
          </div>
        )}

        {configured && !signedInEmail && (
          <>
            {/* タブ切替（type="button" で form submit を発火させない） */}
            <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1">
              <button
                type="button"
                aria-pressed={tab === "signin"}
                onClick={() => switchTab("signin")}
                className={`min-h-[44px] rounded-lg text-sm font-bold transition-colors ${tab === "signin" ? "bg-[#8B4A3C] text-white shadow-sm" : "bg-transparent text-stone-500"}`}
              >
                ログイン
              </button>
              <button
                type="button"
                aria-pressed={tab === "signup"}
                onClick={() => switchTab("signup")}
                className={`min-h-[44px] rounded-lg text-sm font-bold transition-colors ${tab === "signup" ? "bg-[#8B4A3C] text-white shadow-sm" : "bg-transparent text-stone-500"}`}
              >
                新規登録
              </button>
            </div>

            {/* 選択中モードの見出し（切替が確実に分かるように） */}
            <div className="mt-3 rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-stone-100">
              <p className="text-base font-bold text-stone-800">
                {tab === "signin" ? "ログイン" : "新規アカウント登録"}
              </p>
              <p className="mt-0.5 text-xs text-stone-500">
                {tab === "signin"
                  ? "登録済みのメールアドレスとパスワードでログインします。"
                  : "はじめての方はこちら。メールアドレスとパスワードでアカウントを作成します。"}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-2 space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100">
              <div>
                <label className={labelCls}>メールアドレス</label>
                <input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputCls} required />
              </div>
              <div>
                <label className={labelCls}>パスワード{tab === "signup" ? "（6文字以上）" : ""}</label>
                <input type="password" autoComplete={tab === "signin" ? "current-password" : "new-password"} autoCapitalize="none" autoCorrect="off" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6文字以上" className={inputCls} required minLength={6} />
              </div>
              {msg && <p className={`text-sm font-bold ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
              {tab === "signin" ? (
                <button type="button" onClick={handleLogin} disabled={busy} className="min-h-[48px] w-full rounded-xl bg-[#8B4A3C] px-4 py-3 text-sm font-bold text-white active:opacity-80 disabled:opacity-50">
                  {busy ? "処理中..." : "ログインする"}
                </button>
              ) : (
                <button type="button" onClick={handleSignUp} disabled={busy} className="min-h-[48px] w-full rounded-xl bg-[#8B4A3C] px-4 py-3 text-sm font-bold text-white active:opacity-80 disabled:opacity-50">
                  {busy ? "処理中..." : "この内容で新規登録する"}
                </button>
              )}
            </form>
            <p className="mt-3 text-center text-xs text-stone-400">
              案件・見積・請求は現在この端末内に保存され、Phase 1の共有対象には含まれません。
            </p>
          </>
        )}

        {showDiagnostics && (
          <div className="mt-5 rounded-xl bg-stone-100 px-3 py-2 text-[11px] leading-relaxed text-stone-500" aria-label="認証診断">
            <p className="font-bold text-stone-600">実機テスト用 認証診断</p>
            <p>Supabase設定：{configured ? "OK" : "NG"}</p>
            <p>接続先host：{getSupabaseHost()}</p>
            <p>現在のアプリhost：{appHost}</p>
            <p>session：{hasSession ? "あり" : "なし"}</p>
            <p>runtime：{runtimeId}</p>
            {isDevelopment && <p>認証処理：{authTrace.length > 0 ? authTrace.join(" → ") : "未実行"}</p>}
            <p className="break-words">
              最終認証エラー：{lastAuthError
                ? `${lastAuthError.stage}${lastAuthError.code ? ` / ${lastAuthError.code}` : ""}${lastAuthError.status ? ` / HTTP ${lastAuthError.status}` : ""} / ${lastAuthError.message}`
                : "なし"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
