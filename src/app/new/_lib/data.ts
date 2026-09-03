// 新UI（/new）用のデータ読み取り補助。
// 既存 localStorage ストア（utils/*）を「読むだけ」。書き込み・削除・キー追加はしない。
// 取得できない数値は算出せず、呼び出し側で「未集計」表示にする。

import { projectsStore, type Project, type ProjectStatus } from "@/app/utils/projects";
import { getSavedEstimates, type SavedEstimate } from "@/app/utils/savedEstimates";
import { getSavedInvoices, type SavedInvoice } from "@/app/utils/savedInvoices";
import { getCustomers, type Customer } from "@/app/utils/customers";

export type { Project, ProjectStatus, SavedEstimate, SavedInvoice, Customer };

/** 全案件を更新日時の新しい順で取得（クライアント専用） */
export function loadProjects(): Project[] {
  return projectsStore
    .getAll()
    .slice()
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

export function loadEstimates(): SavedEstimate[] {
  return getSavedEstimates();
}

export function loadInvoices(): SavedInvoice[] {
  return getSavedInvoices();
}

export function loadCustomers(): Customer[] {
  return getCustomers();
}

// ─── 要対応の集計（実データのみ・存在しないものは 0 のまま） ──────
export type ActionSummary = {
  estimateNotSubmitted: number; // 見積未提出（estimating）
  unbilled: number;             // 未請求（completed）
  awaitingPayment: number;      // 入金待ち（invoiced）
};

export function actionSummary(projects: Project[]): ActionSummary {
  const count = (s: ProjectStatus) => projects.filter((p) => p.status === s).length;
  return {
    estimateNotSubmitted: count("estimating"),
    unbilled:             count("completed"),
    awaitingPayment:      count("invoiced"),
  };
}

// ─── 進行中の定義（中止・入金済み以外） ──────────────────────────
export function isActive(p: Project): boolean {
  return p.status !== "cancelled" && p.status !== "paid";
}

// ─── 今月の発行済み請求書合計（実データ。パースできないものは無視） ──
export function monthlyIssuedTotal(invoices: SavedInvoice[], now = new Date()): number | null {
  const issued = invoices.filter((i) => i.status === "issued");
  if (issued.length === 0) return null; // データなし → 未集計扱い
  const y = now.getFullYear();
  const m = now.getMonth();
  let sum = 0;
  let matched = 0;
  for (const inv of issued) {
    const d = new Date(inv.invoiceDate);
    if (!isNaN(d.getTime()) && d.getFullYear() === y && d.getMonth() === m) {
      sum += inv.total || 0;
      matched++;
    }
  }
  return matched > 0 ? sum : 0;
}

export function formatYen(n: number): string {
  return "¥" + n.toLocaleString("ja-JP");
}
