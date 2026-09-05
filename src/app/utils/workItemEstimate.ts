// WorkItem → 提出用（見積・請求）データへの共通変換
//
// 帳票が本体ではなく案件データ（WorkItem）が本体。見積書・請求書は
// WorkItem から生成する。提出用には売価のみを渡し、原価・粗利は含めない
// （SellingLine 型が原価フィールドを持たないことで型レベルで保証する）。
//
// 税計算はアプリ内で1方式に統一する（既存見積と同じ端数処理: 税 = floor(小計 × 0.1)）。

import type { WorkItem } from "./workItems";
import type { SellingLine } from "@/components/pdf/WorkEstimatePDF";
import type { EstimateItem, SavedEstimate, LineSnapshot } from "./savedEstimates";
import {
  calculateTaxBreakdown,
  normalizeTaxType,
  normalizeTaxRate,
  type TaxBreakdown,
  type TaxType,
  type TaxRate,
} from "./taxCalculation";

export type { LineSnapshot };

/** WorkItem[] を提出用の売価明細（原価なし）へ変換する（税区分は安全に補完） */
export function workItemsToSellingLines(workItems: WorkItem[]): SellingLine[] {
  return workItems.map((w) => ({
    workItemId: w.workItemId,
    category: w.category,
    workName: w.workName,
    workDescription: w.workDescription,
    location1: w.location1,
    location2: w.location2,
    quantity: w.quantity,
    unit: w.unit,
    sellingUnitPrice: w.sellingUnitPrice,
    sellingAmount: w.sellingAmount,
    note: w.note,
    taxType: normalizeTaxType(w.taxType),
    taxRate: normalizeTaxRate(w.taxRate),
  }));
}

/** WorkItem[] を保存用の明細スナップショットへ変換する */
export function workItemsToSnapshots(workItems: WorkItem[]): LineSnapshot[] {
  return workItems.map((w) => ({
    workItemId: w.workItemId,
    workName: w.workName,
    quantity: w.quantity,
    unit: w.unit,
    unitPrice: w.sellingUnitPrice,
    amount: w.sellingAmount,
    taxType: normalizeTaxType(w.taxType),
    taxRate: normalizeTaxRate(w.taxRate),
  }));
}

/**
 * 保存済みスナップショットを提出用明細（SellingLine）へ復元する。
 * 保存済み見積・請求の再表示／再発行に使う（現在の WorkItem は読まない）。
 * スナップショットに無い明細項目（分類・工事内容・施工箇所・備考）は空にする。
 */
export function snapshotsToSellingLines(snaps: LineSnapshot[]): SellingLine[] {
  return snaps.map((s) => ({
    workItemId: s.workItemId,
    category: "",
    workName: s.workName,
    workDescription: "",
    location1: "",
    location2: "",
    quantity: s.quantity,
    unit: s.unit,
    sellingUnitPrice: s.unitPrice,
    sellingAmount: s.amount,
    note: "",
    taxType: normalizeTaxType(s.taxType),
    taxRate: normalizeTaxRate(s.taxRate),
  }));
}

/**
 * 保存済み見積（1つの版）を提出用明細（SellingLine）へ復元する。
 *
 * 金額・税は lineSnapshots が正本（保存時点の税区分・税率を保持している）。
 * 分類・工事内容・施工箇所・備考は lineSnapshots に無いため、同じ保存時点に作られた
 * estimateItems（同じ WorkItem 配列から同じ並びで作られる）から補う。
 * どちらも保存済みデータで、現在の WorkItem は読まない＝過去版の内容は変わらない。
 *
 * lineSnapshots を持たない旧データは estimateItems だけから復元する（後方互換）。
 */
export function savedEstimateToSellingLines(est: SavedEstimate): SellingLine[] {
  const items = est.estimateItems ?? [];
  const snaps = est.lineSnapshots;

  if (!snaps || snaps.length === 0) {
    // 旧形式：税区分の概念が無いため課税10%として扱う（既存の取り込みと同じ考え方）
    return items.map((item, i) => {
      const quantity = toNum(item.qty);
      const sellingUnitPrice = toNum(item.unitPrice);
      return {
        workItemId: `L-${i + 1}`,
        category: item.category,
        workName: item.koujiName,
        workDescription: item.koujiContent,
        location1: item.location1,
        location2: item.location2,
        quantity,
        unit: item.unit,
        sellingUnitPrice,
        sellingAmount: quantity * sellingUnitPrice,
        note: item.note,
        taxType: "taxable" as TaxType,
        taxRate: 10 as TaxRate,
      };
    });
  }

  return snaps.map((s, i) => {
    // 並びは保存時点で一致している。件数がずれている場合だけ説明欄を空にする。
    const item = snaps.length === items.length ? items[i] : undefined;
    return {
      workItemId: s.workItemId,
      category: item?.category ?? "",
      workName: s.workName,
      workDescription: item?.koujiContent ?? "",
      location1: item?.location1 ?? "",
      location2: item?.location2 ?? "",
      quantity: s.quantity,
      unit: s.unit,
      sellingUnitPrice: s.unitPrice,
      sellingAmount: s.amount,
      note: item?.note ?? "",
      taxType: normalizeTaxType(s.taxType),
      taxRate: normalizeTaxRate(s.taxRate),
    };
  });
}

/** 保存済み見積の税内訳を取り出す（保存時点の内訳が最優先・無ければスナップショットから再計算） */
export function savedEstimateBreakdown(est: SavedEstimate): TaxBreakdown {
  if (est.taxBreakdown) return est.taxBreakdown;
  if (est.lineSnapshots && est.lineSnapshots.length > 0) {
    return taxBreakdownFromSnapshots(est.lineSnapshots);
  }
  return taxBreakdownOf(savedEstimateToSellingLines(est));
}

/** 旧見積明細の文字列数値（qty / unitPrice）を数値へ変換する */
function toNum(v: string): number {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

/** スナップショットから税率別の内訳を計算する（保存時点の税額を再現） */
export function taxBreakdownFromSnapshots(snaps: LineSnapshot[]): TaxBreakdown {
  return calculateTaxBreakdown(
    snaps.map((s) => ({
      amount: s.amount,
      taxType: normalizeTaxType(s.taxType),
      taxRate: normalizeTaxRate(s.taxRate),
    })),
  );
}

/** 売価明細（税区分つき）から税率別の内訳を計算する（共通税計算関数を使用） */
export function taxBreakdownOf(
  lines: Array<{ sellingAmount: number; taxType: TaxType; taxRate: TaxRate }>,
): TaxBreakdown {
  return calculateTaxBreakdown(
    lines.map((l) => ({
      amount: l.sellingAmount,
      taxType: normalizeTaxType(l.taxType),
      taxRate: normalizeTaxRate(l.taxRate),
    })),
  );
}

export type EstimateTotals = {
  subtotal: number;
  tax: number;
  total: number;
  breakdown: TaxBreakdown;
};

/**
 * 提出用明細（税区分つき）から小計・消費税・税込合計を求める。
 * 税計算は共通の calculateTaxBreakdown に委譲する（税率別に合算後 Math.floor）。
 */
export function computeEstimateTotals(
  lines: Array<{ sellingAmount: number; taxType: TaxType; taxRate: TaxRate }>,
): EstimateTotals {
  const breakdown = taxBreakdownOf(lines);
  return {
    subtotal: breakdown.subtotal,
    tax: breakdown.taxTotal,
    total: breakdown.total,
    breakdown,
  };
}

/**
 * WorkItem[] を旧 SavedEstimate.estimateItems 形式（文字列 qty/unitPrice）へ変換する。
 * 案件見積を SavedEstimate として保存し、既存の保存済み見積一覧と互換を保つために使う。
 */
export function workItemsToEstimateItems(workItems: WorkItem[]): EstimateItem[] {
  return workItems.map((w, i) => ({
    id: i + 1,
    category: w.category,
    koujiName: w.workName,
    koujiContent: w.workDescription,
    location1: w.location1,
    location2: w.location2,
    qty: String(w.quantity),
    unit: w.unit,
    unitPrice: String(w.sellingUnitPrice),
    note: w.note,
  }));
}

/**
 * 案件IDに紐づく見積・請求の書類番号を組み立てる。
 * 例: REV-2026-0001-EST-01 / REV-2026-0001-INV-01
 * 本番では固定サンプル番号（EST-0001 等）を使わないための共通関数。
 */
export function projectDocumentNumber(
  projectId: string,
  kind: "EST" | "INV",
  seq = 1,
): string {
  return `${projectId}-${kind}-${String(seq).padStart(2, "0")}`;
}

/** 既存の projectId 付き保存済み見積から、その案件の最新版番号+1 を求める（簡易版管理） */
export function nextEstimateSeq(saved: SavedEstimate[], projectId: string): number {
  const prefix = `${projectId}-EST-`;
  let max = 0;
  for (const e of saved) {
    if (!e.estimateNo?.startsWith(prefix)) continue;
    const n = parseInt(e.estimateNo.slice(prefix.length), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return max + 1;
}
