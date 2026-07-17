// 請求漏れ・入金漏れ防止の警告判定ユーティリティ（S-7）
//
// 職人が毎日開くホーム画面に「お金の取りこぼし」を警告カードとして出すための
// 判定をここへ集約する。判定はすべて読み取りのみで、データは一切変更しない。
//
// 5種類の警告:
//   unbilled     未請求       … 施工完了なのに請求書PDFを発行していない
//   unpaid       未入金       … 請求済みだが入金済みになっていない（期限内）
//   overdue      支払期限超過 … 請求済みのまま支払期限を過ぎている
//   missingCost  原価未入力   … 施工中以降なのに原価がすべて0円のまま
//   companySettingsIssues 会社設定未完了 … 帳票にデモ値が印字される状態

import { projectsStore, type Project, type ProjectStatus } from "./projects";
import { getSavedInvoices, type SavedInvoice } from "./savedInvoices";
import { workItemsStore } from "./workItems";
import { getCompanySettingsIssues } from "./companySettings";

export type ProjectAlert = {
  projectId: string;
  projectName: string;
  /** カードに出す補足（例: 支払期限 2026/07/01） */
  detail: string;
};

export type BillingAlerts = {
  unbilled: ProjectAlert[];
  unpaid: ProjectAlert[];
  overdue: ProjectAlert[];
  missingCost: ProjectAlert[];
  companySettingsIssues: string[];
};

/** 警告が1件でもあるか */
export function hasAnyAlert(a: BillingAlerts): boolean {
  return (
    a.unbilled.length > 0 ||
    a.unpaid.length > 0 ||
    a.overdue.length > 0 ||
    a.missingCost.length > 0 ||
    a.companySettingsIssues.length > 0
  );
}

/** "YYYY-MM-DD" / "YYYY/MM/DD" 形式のみ日付として解釈する（"別途協議" 等は null） */
function parseDueDate(v: string | undefined): string | null {
  if (!v) return null;
  const s = v.replace(/\//g, "-").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * 数値正規化ガード（S-1）: 有限数以外（欠損・文字列・NaN・Infinity）は 0 として集計する。
 * 正常データでは恒等（値をそのまま返す）。1件の異常データで合計が NaN になり
 * 警告判定が壊れるのを防ぐ。保存データは変更しない（読み取り側のみ）。
 */
function fin(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function displayName(p: Project): string {
  return p.projectName || p.propertyName || "（案件名未入力）";
}

// 原価未入力を警告する対象ステータス（着工後）
const COST_CHECK_STATUSES: ProjectStatus[] = [
  "in_progress",
  "completed",
  "invoiced",
  "paid",
];

/**
 * すべての警告を集計する。localStorage を読むためクライアント側でのみ呼ぶこと。
 */
export function collectBillingAlerts(): BillingAlerts {
  const projects = projectsStore.getAll();
  const invoices = getSavedInvoices();
  const invoiceByProject = new Map<string, SavedInvoice>();
  for (const inv of invoices) {
    if (inv.projectId && !invoiceByProject.has(inv.projectId)) {
      invoiceByProject.set(inv.projectId, inv);
    }
  }

  const today = todayIso();
  const unbilled: ProjectAlert[] = [];
  const unpaid: ProjectAlert[] = [];
  const overdue: ProjectAlert[] = [];
  const missingCost: ProjectAlert[] = [];

  for (const p of projects) {
    if (p.status === "cancelled") continue;

    // 未請求: 施工完了のまま（請求PDF発行でステータスは「請求済み」へ自動前進する）
    if (p.status === "completed") {
      unbilled.push({
        projectId: p.projectId,
        projectName: displayName(p),
        detail: "施工完了・請求書未発行",
      });
    }

    // 未入金 / 支払期限超過: 請求済みのまま入金済みになっていない
    if (p.status === "invoiced") {
      const inv = invoiceByProject.get(p.projectId);
      const due = parseDueDate(inv?.dueDate);
      if (due && due < today) {
        overdue.push({
          projectId: p.projectId,
          projectName: displayName(p),
          detail: `支払期限 ${due.replace(/-/g, "/")} 超過`,
        });
      } else {
        unpaid.push({
          projectId: p.projectId,
          projectName: displayName(p),
          detail: due ? `支払期限 ${due.replace(/-/g, "/")}` : "支払期限 未設定",
        });
      }
    }

    // 原価未入力: 着工後なのに売価はあるが原価がすべて0円
    if (COST_CHECK_STATUSES.includes(p.status)) {
      const items = workItemsStore.getByProjectId(p.projectId);
      if (items.length > 0) {
        const selling = items.reduce((s, w) => s + fin(w.sellingAmount), 0);
        const cost = items.reduce((s, w) => s + fin(w.totalCost), 0);
        if (selling > 0 && cost === 0) {
          missingCost.push({
            projectId: p.projectId,
            projectName: displayName(p),
            detail: "粗利が計算できません",
          });
        }
      }
    }
  }

  return {
    unbilled,
    unpaid,
    overdue,
    missingCost,
    companySettingsIssues: getCompanySettingsIssues(),
  };
}
