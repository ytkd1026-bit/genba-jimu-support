// 新UI（/new）専用の共有デザイントークンとステータス補助。
// 既存 utils/* のデータ・型はそのまま再利用し、ここでは表示用の補助のみを定義する。
// 破壊防止のため、このファイルは既存コードから import されない（/new 専用）。

import type { ProjectStatus } from "@/app/utils/projects";

// ─── カラーパレット（白基調・淡いグレー・落ち着いた青緑） ──────────
export const THEME = {
  bg:        "#f6f8f8", // ページ背景（ごく淡いグレー）
  surface:   "#ffffff", // カード面
  border:    "#e6ebeb", // 境界線
  primary:   "#0d9488", // 青緑（teal-600）
  primaryDk: "#0f766e", // 濃い青緑（teal-700）
  primaryBg: "#e6f4f2", // 青緑の淡い背景
  text:      "#1f2a2e", // 主要テキスト
  muted:     "#64748b", // 補助テキスト
} as const;

// ─── ステータスを工程カテゴリへまとめる（新UIの色分け用） ──────────
// 既存の ProjectStatus（10種）は変更しない。表示上のグルーピングのみ。
export type StatusCategory =
  | "survey"      // 現地調査
  | "estimate"    // 見積フェーズ
  | "order"       // 受注・施工予定
  | "working"     // 施工中
  | "done"        // 施工完了（未請求含む）
  | "billing"     // 請求・入金
  | "closed"      // 入金済み
  | "cancelled";  // 中止

export function statusCategory(status: ProjectStatus): StatusCategory {
  switch (status) {
    case "survey":      return "survey";
    case "estimating":
    case "submitted":   return "estimate";
    case "approved":
    case "scheduled":   return "order";
    case "in_progress": return "working";
    case "completed":   return "done";
    case "invoiced":    return "billing";
    case "paid":        return "closed";
    case "cancelled":   return "cancelled";
  }
}

// ステータスバッジの配色（Tailwindクラス）
export const STATUS_BADGE: Record<StatusCategory, string> = {
  survey:    "bg-sky-50 text-sky-700 ring-sky-200",
  estimate:  "bg-amber-50 text-amber-700 ring-amber-200",
  order:     "bg-teal-50 text-teal-700 ring-teal-200",
  working:   "bg-indigo-50 text-indigo-700 ring-indigo-200",
  done:      "bg-emerald-50 text-emerald-700 ring-emerald-200",
  billing:   "bg-rose-50 text-rose-700 ring-rose-200",
  closed:    "bg-slate-100 text-slate-500 ring-slate-200",
  cancelled: "bg-slate-100 text-slate-400 ring-slate-200",
};

export function statusBadgeClass(status: ProjectStatus): string {
  return STATUS_BADGE[statusCategory(status)];
}

// ─── 案件フィルター（/new/projects 用） ──────────────────────────
export type ProjectFilter =
  | "all"
  | "active"      // 進行中（中止・入金済み以外）
  | "estimating"  // 見積中
  | "scheduled"   // 施工予定
  | "in_progress" // 施工中
  | "unbilled"    // 未請求（施工完了だが請求済みでない）
  | "completed";  // 完了（入金済み）

export const FILTER_LABELS: Record<ProjectFilter, string> = {
  all:         "すべて",
  active:      "進行中",
  estimating:  "見積中",
  scheduled:   "施工予定",
  in_progress: "施工中",
  unbilled:    "未請求",
  completed:   "完了",
};
