// TODO: 将来的にSupabase連携後はサーバー側でモードを管理する

export type TestMode = "first_user" | "demo" | "normal";

const STORAGE_KEY = "genba_jimu_test_mode";

export function getTestMode(): TestMode {
  if (typeof window === "undefined") return "normal";
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "first_user" || v === "demo") return v;
  return "normal";
}

export function setTestMode(mode: TestMode): void {
  localStorage.setItem(STORAGE_KEY, mode);
}

export const TEST_MODE_LABELS: Record<TestMode, string> = {
  first_user: "初回ユーザーテストモード",
  demo:       "デモデータモード",
  normal:     "通常開発モード",
};
