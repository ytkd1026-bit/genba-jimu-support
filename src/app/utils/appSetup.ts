// 初回設定の完了状態を、Supabase user＋organization単位で保持する（仕様8）。
//
// 初回設定（自社情報・標準粗利率・元請・単価マスタ）が済んだかどうかを記録する。
// 完了後もユーザーは設定をいつでも編集できる（この状態は「導線の出し分け」にのみ使う）。
// 旧固定キーは既存ユーザー移行の読み取り専用。新形式の保存成功後だけ削除する。

const APP_SETUP_KEY_PREFIX = "genba_app_setup_v1";
const LEGACY_APP_SETUP_KEY = APP_SETUP_KEY_PREFIX;

export type AppSetupState = {
  setupCompleted: boolean;
  completedAt?: string;
  userId?: string;
  organizationId?: string;
};

const DEFAULT_STATE: AppSetupState = { setupCompleted: false };

export function appSetupStorageKey(userId: string, organizationId: string): string {
  return `${APP_SETUP_KEY_PREFIX}:${userId}:${organizationId}`;
}

function parseState(raw: string | null): AppSetupState {
  if (!raw) return DEFAULT_STATE;
  const parsed = JSON.parse(raw) as Partial<AppSetupState>;
  return {
    setupCompleted: parsed.setupCompleted === true,
    completedAt: parsed.completedAt,
    userId: parsed.userId,
    organizationId: parsed.organizationId,
  };
}

export function getAppSetup(userId: string, organizationId: string): AppSetupState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const state = parseState(localStorage.getItem(appSetupStorageKey(userId, organizationId)));
    if (
      !state.setupCompleted ||
      state.userId !== userId ||
      state.organizationId !== organizationId
    ) return DEFAULT_STATE;
    return state;
  } catch {
    return DEFAULT_STATE;
  }
}

export function isSetupCompleted(userId: string, organizationId: string): boolean {
  return getAppSetup(userId, organizationId).setupCompleted;
}

export function setSetupCompleted(userId: string, organizationId: string, completed: boolean): boolean {
  if (typeof window === "undefined") return false;
  try {
    const state: AppSetupState = {
      setupCompleted: completed,
      completedAt: completed ? new Date().toISOString() : undefined,
      userId,
      organizationId,
    };
    localStorage.setItem(appSetupStorageKey(userId, organizationId), JSON.stringify(state));
    // scoped保存が成功した後だけ、旧固定キーを除去する。
    localStorage.removeItem(LEGACY_APP_SETUP_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * 旧固定キーを現在のscopeへ一度だけ移す。
 * organization・会社設定の確認後に呼び出し、別ユーザーへ無条件継承しない。
 */
export function migrateLegacySetupState(userId: string, organizationId: string): boolean {
  if (typeof window === "undefined") return false;
  if (isSetupCompleted(userId, organizationId)) return true;
  try {
    const legacy = parseState(localStorage.getItem(LEGACY_APP_SETUP_KEY));
    if (!legacy.setupCompleted) return false;
    return setSetupCompleted(userId, organizationId, true);
  } catch {
    return false;
  }
}
