// S-7 請求漏れ・入力漏れ 警告の集計（読取専用・データ非破壊）
// 判定条件は固定（docs参照）。請求/入金の正本は Project.status とする
// （SavedInvoice.status は PDF発行後も 'draft' のままで信頼できないため使わない）。

import { projectsStore, type Project } from "./projects";
import { workItemsStore } from "./workItems";
import { getSavedInvoices, type SavedInvoice } from "./savedInvoices";
import { isCompanySettingsIncomplete } from "./companySettings";

export type OverdueEntry = { project: Project; invoice: SavedInvoice; dueDate: string };

export type ProjectWarnings = {
  unbilled: Project[];      // 未請求：施工完了だが請求前
  unpaid: Project[];        // 未入金：請求済だが入金前
  costMissing: Project[];   // 原価未入力：工事項目ありで原価合計0（受注以降）
  overdue: OverdueEntry[];  // 支払期限超過：未入金かつ dueDate 経過
  settingsIncomplete: boolean; // 会社設定未完了
  totalCount: number;       // 警告総数（設定未完了は1件として加算）
};

// 受注以降（原価が入っているべき段階）。cancelled は除外。
const COST_EXPECTED_STATUS = new Set([
  "approved", "scheduled", "in_progress", "completed", "invoiced", "paid",
]);

/** "YYYY-MM-DD" を Date に。無効・空・「別途協議」等は null */
function parseDueDate(due: string | undefined): Date | null {
  if (!due) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

function isTodayAfter(due: Date): boolean {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return today.getTime() > due.getTime();
}

/**
 * 全案件から S-7 警告を集計する（読取専用）。
 */
export function computeProjectWarnings(): ProjectWarnings {
  const projects = projectsStore.getAll();
  const invoices = getSavedInvoices();

  const unbilled: Project[] = [];
  const unpaid: Project[] = [];
  const costMissing: Project[] = [];
  const overdue: OverdueEntry[] = [];

  for (const p of projects) {
    if (p.status === "cancelled") continue;

    // 未請求：施工完了だが請求前
    if (p.status === "completed") unbilled.push(p);

    // 未入金：請求済だが入金前
    if (p.status === "invoiced") unpaid.push(p);

    // 原価未入力：工事項目ありで原価合計0（受注以降）
    if (COST_EXPECTED_STATUS.has(p.status)) {
      const items = workItemsStore.getByProjectId(p.projectId);
      if (items.length > 0) {
        const costSum = items.reduce((s, w) => s + (w.totalCost || 0), 0);
        if (costSum === 0) costMissing.push(p);
      }
    }

    // 支払期限超過：未入金かつ有効な dueDate が経過
    if (p.status === "invoiced") {
      const inv = invoices.find((i) => i.projectId === p.projectId);
      const due = parseDueDate(inv?.dueDate);
      if (inv && due && isTodayAfter(due)) {
        overdue.push({ project: p, invoice: inv, dueDate: inv.dueDate });
      }
    }
  }

  const settingsIncomplete = isCompanySettingsIncomplete();
  const totalCount =
    unbilled.length + unpaid.length + costMissing.length + overdue.length +
    (settingsIncomplete ? 1 : 0);

  return { unbilled, unpaid, costMissing, overdue, settingsIncomplete, totalCount };
}

/**
 * 原価入力済み率（0〜1）。受注以降の工事項目を持つ案件のうち、
 * 原価合計が1円以上入っている案件の割合。分母0なら null。
 */
export function costEntryRate(): { rate: number | null; entered: number; total: number } {
  const projects = projectsStore.getAll().filter(
    (p) => p.status !== "cancelled" && COST_EXPECTED_STATUS.has(p.status),
  );
  let total = 0;
  let entered = 0;
  for (const p of projects) {
    const items = workItemsStore.getByProjectId(p.projectId);
    if (items.length === 0) continue;
    total += 1;
    const costSum = items.reduce((s, w) => s + (w.totalCost || 0), 0);
    if (costSum > 0) entered += 1;
  }
  return { rate: total === 0 ? null : entered / total, entered, total };
}
