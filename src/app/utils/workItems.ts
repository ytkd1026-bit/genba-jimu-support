// 工事項目（WorkItem）の型定義と保存ユーティリティ
// 既存の見積明細（EstimateItem）と原価入力（CostItem）を1行単位で統合する型。
// 提出用帳票では売価のみ表示し、原価・粗利は絶対に出さないこと。
//
// 旧形式の見積（genba_jimu_saved_estimates）からの変換は
// migrateLegacyEstimateToWorkItems() を使う。旧データは変更しない。

import { createListStore } from "./listStore";
import { issueRecordId } from "./idGenerator";
import { normalizeTaxType, normalizeTaxRate, type TaxType, type TaxRate } from "./taxCalculation";
import type { SavedEstimate } from "./savedEstimates";

export const WORK_ITEMS_KEY = "genba_work_items_v1";

export type WorkItem = {
  workItemId: string;       // 例: W-001（案件内連番）
  projectId: string;
  // ── 提出用（帳票に出る） ──────────────────────────────
  category: string;         // 分類
  workName: string;         // 工事名
  workDescription: string;  // 工事内容
  location1: string;        // 施工箇所1
  location2: string;        // 施工箇所2
  quantity: number;         // 数量
  unit: string;             // 単位
  sellingUnitPrice: number; // 売価単価
  sellingAmount: number;    // 売価金額 = quantity × sellingUnitPrice
  note: string;             // 備考
  taxType: TaxType;         // 税区分（課税/非課税/不課税）
  taxRate: TaxRate;         // 税率（課税のとき 10 or 8 or 0、非課税/不課税は 0）
  // ── 内部管理（帳票に出さない） ───────────────────────
  materialCost: number;     // 材料原価
  laborCost: number;        // 労務原価
  subcontractCost: number;  // 外注原価
  expenseCost: number;      // 諸経費
  otherCost: number;        // その他原価
  totalCost: number;        // 原価合計
  grossProfit: number;      // 粗利 = sellingAmount - totalCost
  grossProfitRate: number;  // 粗利率（0〜1）
  // ── 関連付け ─────────────────────────────────────────
  relatedDamageIds: string[];
  relatedPhotoIds: string[];
  createdAt: string;
  updatedAt: string;
};

// ─── 金額計算 ─────────────────────────────────────────────────
export type WorkItemAmounts = Pick<
  WorkItem,
  "sellingAmount" | "totalCost" | "grossProfit" | "grossProfitRate"
>;

/**
 * 数量・単価・各原価から売価金額・原価合計・粗利・粗利率を計算する。
 * 計算式は仕様どおり:
 *   sellingAmount   = quantity × sellingUnitPrice
 *   totalCost       = materialCost + laborCost + subcontractCost + expenseCost + otherCost
 *   grossProfit     = sellingAmount - totalCost
 *   grossProfitRate = sellingAmount > 0 ? grossProfit / sellingAmount : 0
 */
export function computeWorkItemAmounts(input: {
  quantity: number;
  sellingUnitPrice: number;
  materialCost: number;
  laborCost: number;
  subcontractCost: number;
  expenseCost: number;
  otherCost: number;
}): WorkItemAmounts {
  const sellingAmount = input.quantity * input.sellingUnitPrice;
  const totalCost =
    input.materialCost +
    input.laborCost +
    input.subcontractCost +
    input.expenseCost +
    input.otherCost;
  const grossProfit = sellingAmount - totalCost;
  const grossProfitRate = sellingAmount > 0 ? grossProfit / sellingAmount : 0;
  return { sellingAmount, totalCost, grossProfit, grossProfitRate };
}

/** 金額・原価の入力を反映した WorkItem を返す（再計算込み・保存はしない） */
export function withRecalculatedAmounts(item: WorkItem): WorkItem {
  return { ...item, ...computeWorkItemAmounts(item) };
}

// ─── 保存ユーティリティ ───────────────────────────────────────
export const workItemsStore = createListStore<WorkItem>(
  WORK_ITEMS_KEY,
  (w) => w.workItemId,
  (w) => w.projectId,
);

/** 案件内で一意な工事項目IDを発行する（例: W-001） */
export function issueWorkItemId(projectId: string): string {
  const existing = workItemsStore
    .getByProjectId(projectId)
    .map((w) => w.workItemId);
  return issueRecordId("workItem", projectId, existing);
}

/** 空の工事項目を作成する（保存はしない） */
export function createEmptyWorkItem(
  projectId: string,
  workItemId: string,
): WorkItem {
  const now = new Date().toISOString();
  return {
    workItemId,
    projectId,
    category: "",
    workName: "",
    workDescription: "",
    location1: "",
    location2: "",
    quantity: 1,
    unit: "式",
    sellingUnitPrice: 0,
    sellingAmount: 0,
    note: "",
    taxType: "taxable",
    taxRate: 10,
    materialCost: 0,
    laborCost: 0,
    subcontractCost: 0,
    expenseCost: 0,
    otherCost: 0,
    totalCost: 0,
    grossProfit: 0,
    grossProfitRate: 0,
    relatedDamageIds: [],
    relatedPhotoIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ─── 旧形式からの移行 ─────────────────────────────────────────

/** 旧見積明細の文字列数値（qty / unitPrice）を数値へ変換する */
function toNum(v: string): number {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

/**
 * 旧形式の見積（genba_jimu_saved_estimates の1件）を WorkItem の配列へ変換する。
 * 旧形式には原価情報が含まれないため、各原価は 0 で初期化される。
 * 変換のみで保存はしない。旧データも変更しない。
 */
export function migrateLegacyEstimateToWorkItems(
  estimate: SavedEstimate,
  projectId: string,
): WorkItem[] {
  const now = new Date().toISOString();
  const issuedIds = workItemsStore
    .getByProjectId(projectId)
    .map((w) => w.workItemId);

  return estimate.estimateItems.map((item) => {
    const workItemId = issueRecordId("workItem", projectId, issuedIds);
    issuedIds.push(workItemId);

    const quantity = toNum(item.qty);
    const sellingUnitPrice = toNum(item.unitPrice);
    const amounts = computeWorkItemAmounts({
      quantity,
      sellingUnitPrice,
      materialCost: 0,
      laborCost: 0,
      subcontractCost: 0,
      expenseCost: 0,
      otherCost: 0,
    });

    return {
      workItemId,
      projectId,
      category: item.category,
      workName: item.koujiName,
      workDescription: item.koujiContent,
      location1: item.location1,
      location2: item.location2,
      quantity,
      unit: item.unit,
      sellingUnitPrice,
      note: item.note,
      // 旧見積は税区分の概念が無いため課税10%として取り込む
      taxType: "taxable",
      taxRate: 10,
      materialCost: 0,
      laborCost: 0,
      subcontractCost: 0,
      expenseCost: 0,
      otherCost: 0,
      relatedDamageIds: [],
      relatedPhotoIds: [],
      createdAt: now,
      updatedAt: now,
      ...amounts,
    };
  });
}
