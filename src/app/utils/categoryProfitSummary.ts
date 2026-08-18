// ============================================================
// CategoryProfitSummary — このファイルの責務
// ------------------------------------------------------------
// ・利益分析専用の集計（原価・粗利・粗利率・単位別数量を含む）
// ・利用先は 利益分析／工程管理／将来のAI棟梁 のみ
// ・提出用の画面・PDFからの参照は禁止（原価が客先へ漏れるため）
//   → 提出用は estimateCategoryGroups.ts（原価を持たない）を使う
//   → WorkEstimatePDF.tsx は「原価をpropsに含めない」設計のため import 禁止
// ・categoryId で提出用の EstimateCategoryGroup と突き合わせられる
// ・ページ情報を持たない（案件と工種を軸にした集計だけ）
// ============================================================
//
// 分析用：工種別の原価・粗利集計。
//
// 用途は利益分析・工程管理・将来のAI棟梁への提供。
// 提出用の帳票（見積書PDF）からは絶対に参照しない。
//   → 提出用は estimateCategoryGroups.ts（原価を持たない）を使う。
//   → WorkEstimatePDF.tsx は「原価・粗利を props に含めない設計（型レベルで排除）」のため、
//     このファイルを import してはいけない。
//
// ページ情報は持たない。工種と案件を軸にした集計だけを持つ。

import type { WorkItem } from "@/app/utils/workItems";
import {
  resolveWorkCategory,
  workCategoryById,
  type AnalysisGroup,
} from "@/components/sheets/workCategoryMaster";

/** 工種別の利益集計。categoryId で提出用のセクションと突き合わせられる。 */
export type CategoryProfitSummary = {
  projectId: string;
  categoryId: string;
  categoryName: string;
  analysisGroup: AnalysisGroup;

  /** 売価合計（税抜） */
  sellingAmount: number;

  materialCost: number;
  laborCost: number;
  subcontractCost: number;
  expenseCost: number;
  otherCost: number;
  totalCost: number;

  grossProfit: number;
  /** 粗利率（0〜1）。売価0のときは0。 */
  grossProfitRate: number;

  lineCount: number;
  /** 単位別の数量合計。将来の歩掛り分析の素材にする。 */
  quantityByUnit: Record<string, number>;
};

function emptySummary(
  projectId: string,
  categoryId: string,
): CategoryProfitSummary {
  const cat = workCategoryById(categoryId);
  return {
    projectId,
    categoryId,
    categoryName: cat.categoryName,
    analysisGroup: cat.analysisGroup,
    sellingAmount: 0,
    materialCost: 0,
    laborCost: 0,
    subcontractCost: 0,
    expenseCost: 0,
    otherCost: 0,
    totalCost: 0,
    grossProfit: 0,
    grossProfitRate: 0,
    lineCount: 0,
    quantityByUnit: {},
  };
}

/**
 * WorkItem[] を工種別に集計する。
 * 並びはマスタの displayOrder 順（諸経費が最後）。
 */
export function summarizeProfitByCategory(
  projectId: string,
  workItems: WorkItem[],
): CategoryProfitSummary[] {
  const map = new Map<string, CategoryProfitSummary>();

  for (const w of workItems) {
    const cat = resolveWorkCategory(w.category);
    let s = map.get(cat.categoryId);
    if (!s) {
      s = emptySummary(projectId, cat.categoryId);
      map.set(cat.categoryId, s);
    }

    s.sellingAmount    += w.sellingAmount ?? 0;
    s.materialCost     += w.materialCost ?? 0;
    s.laborCost        += w.laborCost ?? 0;
    s.subcontractCost  += w.subcontractCost ?? 0;
    s.expenseCost      += w.expenseCost ?? 0;
    s.otherCost        += w.otherCost ?? 0;
    s.lineCount        += 1;

    const unit = (w.unit ?? "").trim() || "（単位なし）";
    s.quantityByUnit[unit] = (s.quantityByUnit[unit] ?? 0) + (w.quantity ?? 0);
  }

  const list = [...map.values()];
  for (const s of list) {
    s.totalCost = s.materialCost + s.laborCost + s.subcontractCost + s.expenseCost + s.otherCost;
    s.grossProfit = s.sellingAmount - s.totalCost;
    s.grossProfitRate = s.sellingAmount > 0 ? s.grossProfit / s.sellingAmount : 0;
  }

  return list.sort(
    (a, b) => workCategoryById(a.categoryId).displayOrder - workCategoryById(b.categoryId).displayOrder,
  );
}

/** 分析軸（analysisGroup）でさらにまとめる。工種が増えても軸は増えない。 */
export function rollUpByAnalysisGroup(
  summaries: CategoryProfitSummary[],
): Array<{ analysisGroup: AnalysisGroup; sellingAmount: number; totalCost: number; grossProfit: number }> {
  const map = new Map<AnalysisGroup, { analysisGroup: AnalysisGroup; sellingAmount: number; totalCost: number; grossProfit: number }>();
  for (const s of summaries) {
    const cur = map.get(s.analysisGroup) ?? {
      analysisGroup: s.analysisGroup,
      sellingAmount: 0,
      totalCost: 0,
      grossProfit: 0,
    };
    cur.sellingAmount += s.sellingAmount;
    cur.totalCost += s.totalCost;
    cur.grossProfit += s.grossProfit;
    map.set(s.analysisGroup, cur);
  }
  return [...map.values()];
}
