export type AuthFailureStage = "configuration" | "request" | "supabase" | "session";

export type AuthFailureDiagnostic = {
  stage: AuthFailureStage;
  code?: string;
  status?: number;
  message: string;
};

export function friendlyAuthError(message: string, code?: string): string {
  if (code === "invalid_credentials" || /invalid login credentials/i.test(message)) {
    return "メールアドレスまたはパスワードが違います。";
  }
  if (code === "email_not_confirmed" || /email not confirmed/i.test(message)) {
    return "メールアドレスの確認が完了していません。確認メールを開いてください。";
  }
  if (code === "user_already_exists" || /user already registered/i.test(message)) {
    return "このメールアドレスは既に登録されています。";
  }
  if (/password should be at least/i.test(message)) return "パスワードは6文字以上にしてください。";
  if (/email/i.test(message) && /invalid/i.test(message)) return "メールアドレスの形式が正しくありません。";
  if (/failed to fetch|network|load failed|internet connection/i.test(message)) return "ネットワークエラーです。Supabaseへ接続できません。";
  return `Supabase認証エラー：${message}`;
}

