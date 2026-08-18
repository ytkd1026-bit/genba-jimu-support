// 工事項目（WorkItem）の型定義と保存ユーティリティ
// 既存の見積明細（EstimateItem）と原価入力（CostItem）を1行単位で統合する型。
// 提出用帳票では売価のみ表示し、原価・粗利は絶対に出さないこと。
//
// 旧形式の見積（genba_jimu_saved_estimates）からの変換は
// migrateLegacyEstimateToWorkItems() を使う。旧データは変更しない。

import { createListStore } from "./listStore";
import { issueRecordId } from "./idGenerator";
import type { TaxType, TaxRate } from "./taxCalculation";
import type { SavedEstimate } from "./savedEstimates";
import type { UnitPriceMasterItem } from "./unitPriceMaster";
import { referenceSellingUnitPrice } from "./costCalc";

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
  // 金額（＝内訳原価。数量×原価単価で算出。1見積行が材料＋労務の複合内訳を持つことを許容）
  materialCost: number;     // 材料原価（金額）
  laborCost: number;        // 労務原価（金額）
  subcontractCost: number;  // 外注原価（金額）
  expenseCost: number;      // 諸経費（金額。単価マスタ対象外。後方互換で存続）
  otherCost: number;        // その他原価（金額）
  totalCost: number;        // 原価合計（金額）
  grossProfit: number;      // 粗利 = sellingAmount - totalCost
  grossProfitRate: number;  // 粗利率（0〜1）
  // ── 単価マスタ由来の原価単価内訳（任意・後方互換） ───────
  // 旧データには存在しない。normalizeWorkItem() で金額÷数量から補完する。
  // これらが入っていれば「原価単価×数量」で金額を導出でき、数量1回入力で
  // 見積・原価の両方が自動計算される（見積側と原価側の二重入力をなくす）。
  materialUnitCost?: number;    // 材料原価単価
  laborUnitCost?: number;       // 労務原価単価
  subcontractUnitCost?: number; // 外注原価単価
  otherUnitCost?: number;       // その他原価単価
  targetProfitRate?: number;    // 目標粗利率（0〜1。参考売上単価の算出に使う）
  materialName?: string;        // 材料名（単価マスタ由来。帳票では workName/内容を使う）
  masterId?: string;            // 由来の単価マスタID（任意・トレーサビリティ用）
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

// ─── 単価マスタ方式（原価単価×数量で金額を導出） ─────────────────
// 見積側と原価側の二重入力をなくす中核。原価単価内訳（materialUnitCost 等）から
// 数量分の金額（materialCost 等）を導出する。諸経費は単価マスタ対象外のため触らない。

export type UnitCostFields = {
  materialUnitCost: number;
  laborUnitCost: number;
  subcontractUnitCost: number;
  otherUnitCost: number;
};

export type CostAmountFields = {
  materialCost: number;
  laborCost: number;
  subcontractCost: number;
  otherCost: number;
};

/** 原価単価内訳 × 数量 → 各原価金額（諸経費は含めない） */
export function deriveCostAmountsFromUnits(
  units: UnitCostFields,
  quantity: number,
): CostAmountFields {
  return {
    materialCost: units.materialUnitCost * quantity,
    laborCost: units.laborUnitCost * quantity,
    subcontractCost: units.subcontractUnitCost * quantity,
    otherCost: units.otherUnitCost * quantity,
  };
}

/**
 * 旧データを含む WorkItem を安全に正規化する（保存はしない）。
 * - 単価マスタ由来の原価単価が無い旧データは、金額÷数量で単価を補完する
 *   （数量が同じなら金額は不変。既存案件の数値を変えない）。
 * - 数量0 の旧データは単価0とする。
 * これにより新しい「見積・原価入力」画面でも旧データが破綻せず表示できる。
 */
export function normalizeWorkItem(raw: WorkItem): WorkItem {
  const quantity = Number.isFinite(raw.quantity) ? raw.quantity : 0;
  const hasUnitCosts =
    raw.materialUnitCost !== undefined ||
    raw.laborUnitCost !== undefined ||
    raw.subcontractUnitCost !== undefined ||
    raw.otherUnitCost !== undefined;

  const perUnit = (amount: number): number =>
    quantity > 0 ? amount / quantity : 0;

  return {
    ...raw,
    materialUnitCost: hasUnitCosts
      ? raw.materialUnitCost ?? 0
      : perUnit(raw.materialCost),
    laborUnitCost: hasUnitCosts
      ? raw.laborUnitCost ?? 0
      : perUnit(raw.laborCost),
    subcontractUnitCost: hasUnitCosts
      ? raw.subcontractUnitCost ?? 0
      : perUnit(raw.subcontractCost),
    otherUnitCost: hasUnitCosts
      ? raw.otherUnitCost ?? 0
      : perUnit(raw.otherCost),
    targetProfitRate: raw.targetProfitRate ?? 0,
    materialName: raw.materialName ?? "",
    masterId: raw.masterId ?? "",
  };
}

/**
 * 単価マスタ1件と数量から WorkItem を作る（保存はしない）。
 * 原価単価・目標粗利率・単位・税区分はマスタから取得し、原価金額は数量で導出、
 * 採用売上単価の初期値はマスタの標準売上単価（＝参考売上単価）とする。
 */
export function workItemFromMaster(
  master: UnitPriceMasterItem,
  projectId: string,
  workItemId: string,
  quantity: number,
): WorkItem {
  const now = new Date().toISOString();
  const units: UnitCostFields = {
    materialUnitCost: master.materialUnitCost,
    laborUnitCost: master.laborUnitCost,
    subcontractUnitCost: master.subcontractUnitCost,
    otherUnitCost: master.otherUnitCost,
  };
  const amounts = deriveCostAmountsFromUnits(units, quantity);
  const sellingUnitPrice =
    master.standardSellingUnitPrice > 0
      ? master.standardSellingUnitPrice
      : master.referenceSellingUnitPrice;
  const base: WorkItem = {
    workItemId,
    projectId,
    category: master.workCategory,
    workName: master.itemName,
    workDescription: "",
    location1: "",
    location2: "",
    quantity,
    unit: master.unit,
    sellingUnitPrice,
    sellingAmount: 0,
    note: "",
    taxType: master.taxType,
    taxRate: master.taxRate,
    materialCost: amounts.materialCost,
    laborCost: amounts.laborCost,
    subcontractCost: amounts.subcontractCost,
    expenseCost: 0,
    otherCost: amounts.otherCost,
    totalCost: 0,
    grossProfit: 0,
    grossProfitRate: 0,
    materialUnitCost: master.materialUnitCost,
    laborUnitCost: master.laborUnitCost,
    subcontractUnitCost: master.subcontractUnitCost,
    otherUnitCost: master.otherUnitCost,
    targetProfitRate: master.targetProfitRate,
    materialName: master.materialName,
    masterId: master.id,
    relatedDamageIds: [],
    relatedPhotoIds: [],
    createdAt: now,
    updatedAt: now,
  };
  return withRecalculatedAmounts(base);
}

/** 原価単価内訳・目標粗利率から参考売上単価を求める（共通計算に委譲） */
export function workItemReferenceSellingUnitPrice(item: {
  materialUnitCost?: number;
  laborUnitCost?: number;
  subcontractUnitCost?: number;
  otherUnitCost?: number;
  targetProfitRate?: number;
}): number {
  const unitCost =
    (item.materialUnitCost ?? 0) +
    (item.laborUnitCost ?? 0) +
    (item.subcontractUnitCost ?? 0) +
    (item.otherUnitCost ?? 0);
  return referenceSellingUnitPrice(unitCost, item.targetProfitRate ?? 0);
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
