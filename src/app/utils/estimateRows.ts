// 見積・原価入力の「行」共通ロジック
//
// 見積入力画面（既存案件の /projects/[id]/work-items）と新規見積フロー（/estimate/new）で
// 同じ計算・変換・空行判定を使うため、行まわりの純ロジックをここへ集約する。
// 画面ごとに再実装しない（計算式は costCalc.ts / workItems.ts に委譲）。

import {
  deriveCostAmountsFromUnits,
  withRecalculatedAmounts,
  normalizeWorkItem,
  type WorkItem,
} from "./workItems";
import {
  unitCostTotal,
  referenceSellingUnitPrice,
  costAmountOf,
  sellingAmountOf,
  grossProfitOf,
  grossProfitRateOf,
  profitLevel,
  type ProfitLevel,
} from "./costCalc";
import { parseNumericInput } from "./numberInput";
import {
  calculateTaxBreakdown,
  normalizeTaxType,
  normalizeTaxRate,
  type TaxType,
  type TaxRate,
  type TaxBreakdown,
} from "./taxCalculation";
import type { UnitPriceMasterItem } from "./unitPriceMaster";

// ── 工種プリセット（クロス以外も選べる。マスタが無くても候補に出す・仕様17） ──
export const WORK_CATEGORY_PRESETS = [
  "クロス工事",
  "CF工事",
  "フロアタイル工事",
  "長尺シート工事",
  "タイルカーペット工事",
  "ロールカーペット工事",
  "化粧シート工事",
  "ガラスフィルム工事",
  "カーテン工事",
  "ブラインド工事",
  "下地処理",
  "巾木工事",
  "撤去工事",
  "諸経費",
  "その他",
];

// ── 施工場所プリセット（候補＋自由入力。仕様20） ──
export const LOCATION_PRESETS = [
  "LDK", "LD", "K", "洋室", "和室", "寝室", "子供部屋", "廊下", "玄関",
  "洗面室", "脱衣室", "トイレ", "浴室", "階段", "クローゼット", "WIC", "収納", "共通", "その他",
];

// 税区分・税率の1択マッピング
export const TAX_COMBO: Record<string, { taxType: TaxType; taxRate: TaxRate }> = {
  taxable_10: { taxType: "taxable", taxRate: 10 },
  taxable_8: { taxType: "taxable", taxRate: 8 },
  taxable_0: { taxType: "taxable", taxRate: 0 },
  non_taxable: { taxType: "non_taxable", taxRate: 0 },
  tax_exempt: { taxType: "tax_exempt", taxRate: 0 },
};
export function taxComboValue(taxType: TaxType, taxRate: TaxRate): string {
  if (taxType === "non_taxable") return "non_taxable";
  if (taxType === "tax_exempt") return "tax_exempt";
  if (taxRate === 8) return "taxable_8";
  if (taxRate === 0) return "taxable_0";
  return "taxable_10";
}

// ── 入力中の1行（数量・採用売価は文字列で保持し全角入力を許容） ──
export type EditableWorkItem = {
  workItemId: string;
  category: string;
  workName: string;
  materialName: string;
  workDescription: string;
  location1: string;
  location2: string;
  quantity: string;
  unit: string;
  sellingUnitPrice: string;
  note: string;
  taxType: TaxType;
  taxRate: TaxRate;
  materialUnitCost: number;
  laborUnitCost: number;
  subcontractUnitCost: number;
  otherUnitCost: number;
  targetProfitRate: number;
  expenseCost: number;
  masterId: string;
  relatedDamageIds: string[];
  relatedPhotoIds: string[];
  createdAt: string;
};

export function fmtYen(n: number): string {
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}
export function fmtPct(rate: number): string {
  return (rate * 100).toFixed(1) + "%";
}
export function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

/** 完全な空行を作る（仕様13。工種・項目・材料・単価を勝手に入れない） */
export function emptyEditableRow(workItemId: string): EditableWorkItem {
  return {
    workItemId,
    category: "",
    workName: "",
    materialName: "",
    workDescription: "",
    location1: "",
    location2: "",
    quantity: "",
    unit: "",
    sellingUnitPrice: "",
    note: "",
    taxType: "taxable",
    taxRate: 10,
    materialUnitCost: 0,
    laborUnitCost: 0,
    subcontractUnitCost: 0,
    otherUnitCost: 0,
    targetProfitRate: 0,
    expenseCost: 0,
    masterId: "",
    relatedDamageIds: [],
    relatedPhotoIds: [],
    createdAt: new Date().toISOString(),
  };
}

/**
 * 完全な空行かどうか（仕様14。保存・PDF対象から除外する）。
 * 工種・項目名・材料名・施工場所が未入力で、採用売価・原価単価が0なら空行。
 * 数量だけ入っていても（初期値1など）内容が無ければ空行とみなす。
 */
export function isEmptyRow(row: EditableWorkItem): boolean {
  const hasText =
    row.category.trim() !== "" ||
    row.workName.trim() !== "" ||
    row.materialName.trim() !== "" ||
    row.location1.trim() !== "" ||
    row.workDescription.trim() !== "" ||
    row.note.trim() !== "";
  const hasMoney =
    parseNumericInput(row.sellingUnitPrice) > 0 ||
    unitCostTotal(row) > 0 ||
    row.masterId !== "";
  return !hasText && !hasMoney;
}

export function toEditable(w: WorkItem): EditableWorkItem {
  const n = normalizeWorkItem(w);
  return {
    workItemId: n.workItemId,
    category: n.category,
    workName: n.workName,
    materialName: n.materialName ?? "",
    workDescription: n.workDescription,
    location1: n.location1,
    location2: n.location2,
    quantity: String(n.quantity),
    unit: n.unit,
    sellingUnitPrice: String(n.sellingUnitPrice),
    note: n.note,
    taxType: normalizeTaxType(n.taxType),
    taxRate: normalizeTaxRate(n.taxRate),
    materialUnitCost: n.materialUnitCost ?? 0,
    laborUnitCost: n.laborUnitCost ?? 0,
    subcontractUnitCost: n.subcontractUnitCost ?? 0,
    otherUnitCost: n.otherUnitCost ?? 0,
    targetProfitRate: n.targetProfitRate ?? 0,
    expenseCost: n.expenseCost,
    masterId: n.masterId ?? "",
    relatedDamageIds: n.relatedDamageIds,
    relatedPhotoIds: n.relatedPhotoIds,
    createdAt: n.createdAt,
  };
}

/** 復元した下書き（旧形式の可能性あり）を新しい行形へ安全に正規化する */
export function normalizeEditableRow(
  r: Partial<EditableWorkItem> & { workItemId: string },
): EditableWorkItem {
  return {
    ...emptyEditableRow(r.workItemId),
    ...r,
    taxType: normalizeTaxType(r.taxType),
    taxRate: normalizeTaxRate(r.taxRate),
    relatedDamageIds: r.relatedDamageIds ?? [],
    relatedPhotoIds: r.relatedPhotoIds ?? [],
    createdAt: r.createdAt ?? new Date().toISOString(),
  };
}

export function toWorkItem(row: EditableWorkItem, projectId: string, now: string): WorkItem {
  const quantity = parseNumericInput(row.quantity);
  const sellingUnitPrice = parseNumericInput(row.sellingUnitPrice);
  const units = {
    materialUnitCost: row.materialUnitCost,
    laborUnitCost: row.laborUnitCost,
    subcontractUnitCost: row.subcontractUnitCost,
    otherUnitCost: row.otherUnitCost,
  };
  const amt = deriveCostAmountsFromUnits(units, quantity);
  const base: WorkItem = {
    workItemId: row.workItemId,
    projectId,
    category: row.category,
    workName: row.workName,
    workDescription: row.workDescription,
    location1: row.location1,
    location2: row.location2,
    quantity,
    unit: row.unit,
    sellingUnitPrice,
    sellingAmount: 0,
    note: row.note,
    taxType: row.taxType,
    taxRate: row.taxType === "taxable" ? row.taxRate : 0,
    materialCost: amt.materialCost,
    laborCost: amt.laborCost,
    subcontractCost: amt.subcontractCost,
    expenseCost: row.expenseCost,
    otherCost: amt.otherCost,
    totalCost: 0,
    grossProfit: 0,
    grossProfitRate: 0,
    materialUnitCost: row.materialUnitCost,
    laborUnitCost: row.laborUnitCost,
    subcontractUnitCost: row.subcontractUnitCost,
    otherUnitCost: row.otherUnitCost,
    targetProfitRate: row.targetProfitRate,
    materialName: row.materialName,
    masterId: row.masterId,
    relatedDamageIds: row.relatedDamageIds,
    relatedPhotoIds: row.relatedPhotoIds,
    createdAt: row.createdAt,
    updatedAt: now,
  };
  return withRecalculatedAmounts(base);
}

// ── 1行の計算値（画面表示用・共通計算に委譲） ──
export type RowMetrics = {
  quantity: number;
  unitCost: number;
  costAmount: number;
  targetProfitRate: number;
  referencePrice: number;
  sellingUnitPrice: number;
  sellingAmount: number;
  grossProfit: number;
  grossProfitRate: number;
  level: ProfitLevel;
};
export function rowMetrics(row: EditableWorkItem): RowMetrics {
  const quantity = parseNumericInput(row.quantity);
  const sellingUnitPrice = parseNumericInput(row.sellingUnitPrice);
  const unitCost = unitCostTotal(row);
  const costAmount = costAmountOf(unitCost, quantity) + row.expenseCost;
  const referencePrice = referenceSellingUnitPrice(unitCost, row.targetProfitRate);
  const sellingAmount = sellingAmountOf(sellingUnitPrice, quantity);
  const grossProfit = grossProfitOf(sellingAmount, costAmount);
  const grossProfitRate = grossProfitRateOf(grossProfit, sellingAmount);
  return {
    quantity,
    unitCost,
    costAmount,
    targetProfitRate: row.targetProfitRate,
    referencePrice,
    sellingUnitPrice,
    sellingAmount,
    grossProfit,
    grossProfitRate,
    level: profitLevel(grossProfitRate),
  };
}

// ── 案件全体集計（税は共通関数へ委譲。粗利率＝総粗利÷総売上・仕様16） ──
export type EditorTotals = {
  selling: number;
  cost: number;
  grossProfit: number;
  grossProfitRate: number;
  breakdown: TaxBreakdown;
  level: ProfitLevel;
};
export function computeEditorTotals(rows: EditableWorkItem[]): EditorTotals {
  const perRow = rows.map((row) => rowMetrics(row));
  const taxLines = rows.map((row, i) => ({
    amount: perRow[i].sellingAmount,
    taxType: row.taxType,
    taxRate: (row.taxType === "taxable" ? row.taxRate : 0) as TaxRate,
  }));
  const breakdown = calculateTaxBreakdown(taxLines);
  const selling = breakdown.subtotal;
  const cost = perRow.reduce((s, m) => s + m.costAmount, 0);
  const grossProfit = selling - cost;
  const grossProfitRate = selling > 0 ? grossProfit / selling : 0;
  return { selling, cost, grossProfit, grossProfitRate, breakdown, level: profitLevel(grossProfitRate) };
}

// ── マスタ参照（工種→項目→材料の親子構造・仕様17/18/19） ──
export function workCategoryOptions(masters: UnitPriceMasterItem[], rows: EditableWorkItem[]): string[] {
  return uniq([
    ...WORK_CATEGORY_PRESETS,
    ...masters.map((m) => m.workCategory),
    ...rows.map((r) => r.category),
  ].filter(Boolean));
}
export function itemNamesOf(masters: UnitPriceMasterItem[], category: string): string[] {
  return uniq(masters.filter((m) => m.workCategory === category).map((m) => m.itemName));
}
export function materialsOf(masters: UnitPriceMasterItem[], category: string, itemName: string): string[] {
  return uniq(
    masters
      .filter((m) => m.workCategory === category && m.itemName === itemName)
      .map((m) => m.materialName)
      .filter(Boolean),
  );
}
export function resolveMaster(
  masters: UnitPriceMasterItem[],
  category: string,
  itemName: string,
  materialName: string,
): UnitPriceMasterItem | null {
  return (
    masters.find(
      (m) => m.workCategory === category && m.itemName === itemName && m.materialName === materialName,
    ) ??
    masters.find((m) => m.workCategory === category && m.itemName === itemName) ??
    null
  );
}

/** マスタ1件を行へ適用するためのパッチ（数量が空なら1を補う） */
export function applyMasterPatch(
  master: UnitPriceMasterItem,
  currentQuantity: string,
): Partial<EditableWorkItem> {
  return {
    category: master.workCategory,
    workName: master.itemName,
    materialName: master.materialName,
    unit: master.unit,
    materialUnitCost: master.materialUnitCost,
    laborUnitCost: master.laborUnitCost,
    subcontractUnitCost: master.subcontractUnitCost,
    otherUnitCost: master.otherUnitCost,
    targetProfitRate: master.targetProfitRate,
    taxType: master.taxType,
    taxRate: master.taxRate,
    masterId: master.id,
    sellingUnitPrice: String(
      master.standardSellingUnitPrice > 0 ? master.standardSellingUnitPrice : master.referenceSellingUnitPrice,
    ),
    quantity: currentQuantity.trim() === "" ? "1" : currentQuantity,
  };
}

// ── 粗利レベルの色・ラベル ──
export const LEVEL_TEXT: Record<ProfitLevel, string> = {
  ok: "text-teal-600",
  caution: "text-amber-600",
  warning: "text-red-600",
};
export const LEVEL_LABEL: Record<ProfitLevel, string> = {
  ok: "正常",
  caution: "注意",
  warning: "警告",
};
