// ============================================================
// groupLinesByCategory / EstimateCategoryGroup — このファイルの責務
// ------------------------------------------------------------
// ＜groupLinesByCategory＞
// ・工種分類の唯一のロジック（画面とPDFで共通利用する）
// ・工種の並び順の唯一の定義（工種マスタの displayOrder に従う／諸経費が最後）
// ・画面側・PDF側で分類や並び順を独自実装してはいけない
//
// ＜EstimateCategoryGroup＞
// ・提出用の集計（見積書としてお客様へ出す情報）
// ・原価・粗利を含めない（型レベルで持たない）
// ・PDFと画面で共通利用する
// ・ページ情報を持たない（何ページ目かは描画時にのみ決まる）
//
// 原価を含む分析用の集計は categoryProfitSummary.ts にある。混同しないこと。
// ============================================================
//
// 提出用：工種セクションへのグループ化と工種小計。
//
// このファイルは原価を一切扱わない。SellingLine（原価フィールドを持たない型）だけを受け取る。
// 原価を含む分析用の集計は categoryProfitSummary.ts にあり、提出用PDFからは参照しない。
//
// ページ情報は持たない。1工種が何ページに渡るかは描画時にのみ決まるため、
// ここでは「工種というセクション」と「その小計」だけを持つ。
//
// 税計算は既存の taxBreakdownOf / computeEstimateTotals に委譲する（再実装しない）。

import { computeEstimateTotals } from "@/app/utils/workItemEstimate";
import type { TaxBreakdown } from "@/app/utils/taxCalculation";
import type { SellingLine } from "@/components/pdf/WorkEstimatePDF";
import {
  resolveWorkCategory,
  workCategoryById,
  type AnalysisGroup,
} from "./workCategoryMaster";

/** 見積書の1セクション（＝1工種）。複数ページに渡りうる。 */
export type EstimateCategoryGroup = {
  categoryId: string;
  categoryLabel: string;
  displayOrder: number;
  analysisGroup: AnalysisGroup;
  lines: SellingLine[];
  /** 工種小計（税抜） */
  subtotal: number;
  /** 工種の消費税 */
  tax: number;
  /** 工種の税込 */
  total: number;
  /** 税率別内訳 */
  taxBreakdown: TaxBreakdown;
};

/**
 * 明細を工種ごとにまとめ、マスタの displayOrder 順に並べる。
 * 諸経費は displayOrder が最大のため、常に最後になる。
 * 明細が0件の工種はセクションを作らない。
 */
export function groupLinesByCategory(lines: SellingLine[]): EstimateCategoryGroup[] {
  const buckets = new Map<string, SellingLine[]>();

  for (const line of lines) {
    const cat = resolveWorkCategory(line.category);
    const list = buckets.get(cat.categoryId);
    if (list) list.push(line);
    else buckets.set(cat.categoryId, [line]);
  }

  const groups: EstimateCategoryGroup[] = [];
  for (const [categoryId, groupLines] of buckets) {
    const cat = workCategoryById(categoryId);
    const totals = computeEstimateTotals(groupLines);
    groups.push({
      categoryId,
      categoryLabel: cat.categoryName,
      displayOrder: cat.displayOrder,
      analysisGroup: cat.analysisGroup,
      lines: groupLines,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      taxBreakdown: totals.breakdown,
    });
  }

  return groups.sort((a, b) => a.displayOrder - b.displayOrder);
}
