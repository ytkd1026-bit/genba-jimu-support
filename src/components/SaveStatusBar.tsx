"use client";

import type { SaveStatus } from "@/hooks/useAutoDraft";

// 自動保存ステータス表示の共通コンポーネント。
// 見積・請求書・案件登録・材料計算・写真台帳の各画面で重複していた表示をここに集約する。
// 既定は「下書き保存」の文言。写真台帳のようにストアへ直接保存する画面は
// savedLabel / savingLabel で文言だけ差し替えて同じ見た目を使う。
export function SaveStatusBar({
  status,
  savedAt,
  savedLabel = "下書き保存済み",
  savingLabel = "下書き保存中...",
}: {
  status: SaveStatus;
  savedAt: Date | null;
  savedLabel?: string;
  savingLabel?: string;
}) {
  if (status === "idle") return null;

  const cls =
    status === "dirty" ? "bg-stone-50 text-stone-400 ring-1 ring-stone-200" :
    status === "saving" ? "bg-blue-50 text-blue-500 ring-1 ring-blue-200" :
    status === "saved" ? "bg-green-50 text-green-600 ring-1 ring-green-200" :
    "bg-red-50 text-red-600 ring-1 ring-red-200";

  const icon =
    status === "dirty" ? "✏️" :
    status === "saving" ? "⏳" :
    status === "saved" ? "✓" : "⚠️";

  const label =
    status === "dirty" ? "入力中（自動保存します）" :
    status === "saving" ? savingLabel :
    status === "saved" ? `${savedLabel} ${savedAt ? savedAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : ""}` :
    "保存エラー";

  return (
    <div className={`mb-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${cls}`}>
      <span className="shrink-0">{icon}</span>
      <span>{label}</span>
    </div>
  );
}
