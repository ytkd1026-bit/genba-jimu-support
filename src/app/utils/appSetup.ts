// 初回設定の完了状態を保持する（仕様8）
//
// 初回設定（自社情報・標準粗利率・元請・単価マスタ）が済んだかどうかを記録する。
// 完了後もユーザーは設定をいつでも編集できる（この状態は「導線の出し分け」にのみ使う）。
// 将来 Supabase へ移行する際は read/write の実装だけ差し替える。

const APP_SETUP_KEY = "genba_app_setup_v1";

export type AppSetupState = {
  setupCompleted: boolean;
  completedAt?: string;
};

const DEFAULT_STATE: AppSetupState = { setupCompleted: false };

export function getAppSetup(): AppSetupState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(APP_SETUP_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<AppSetupState>;
    return { setupCompleted: parsed.setupCompleted === true, completedAt: parsed.completedAt };
  } catch {
    return DEFAULT_STATE;
  }
}

export function isSetupCompleted(): boolean {
  return getAppSetup().setupCompleted;
}

export function setSetupCompleted(completed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    const state: AppSetupState = {
      setupCompleted: completed,
      completedAt: completed ? new Date().toISOString() : undefined,
    };
    localStorage.setItem(APP_SETUP_KEY, JSON.stringify(state));
  } catch {
    // 保存失敗は致命的でない（導線判定のみ）
  }
}
