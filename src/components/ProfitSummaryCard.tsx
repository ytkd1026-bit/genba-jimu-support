"use client";

// 利益管理カード（案件詳細用・追加候補として設計）
//
// 設計方針:
// - データ源は WorkItem（04 工事項目・原価）のみ。このカードは読み取り専用で、
//   独自の保存キーを持たない（データ破壊リスクゼロ）。
// - 表示項目: 売上（税抜）・材料費・外注費・その他原価・粗利・粗利率。
//   指定の5項目に「その他原価（労務・諸経費・その他）」を加えているのは、
//   売上 −（材料費＋外注費）だけでは粗利と一致せず金額が合わないため。
//   粗利の定義は既存の WorkItem と同じ（売上 − 原価合計）。
// - 内部管理情報のため、提出用帳票（PDF）には一切出さない。

import Link from "next/link";
import { useEffect, useState } from "react";
import { workItemsStore, type WorkItem } from "@/app/utils/workItems";

function fmtYen(n: number): string {
  return "¥" + n.toLocaleString("ja-JP");
}

export function ProfitSummaryCard({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<WorkItem[] | null>(null);

  // localStorage を読むためマウント後に集計する
  useEffect(() => {
    setItems(workItemsStore.getByProjectId(projectId));
  }, [projectId]);

  if (items === null) return null;

  const workItemsHref = `/projects/${encodeURIComponent(projectId)}/work-items`;

  if (items.length === 0) {
    return (
      <section className="mb-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100">
        <h2 className="mb-2 border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">
          🔒 利益管理（内部）
        </h2>
        <p className="text-xs text-stone-400">
          工事項目がまだありません。「04 工事項目・原価」で登録すると、売上・原価・粗利をここで確認できます。
        </p>
        <Link href={workItemsHref}
          className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-stone-200 px-4 py-2 text-xs font-bold text-stone-500 active:opacity-75">
          工事項目・原価へ →
        </Link>
      </section>
    );
  }

  const sales = items.reduce((s, w) => s + w.sellingAmount, 0);
  const material = items.reduce((s, w) => s + w.materialCost, 0);
  const subcontract = items.reduce((s, w) => s + w.subcontractCost, 0);
  const otherCosts = items.reduce(
    (s, w) => s + w.laborCost + w.expenseCost + w.otherCost,
    0,
  );
  const totalCost = material + subcontract + otherCosts;
  const grossProfit = sales - totalCost;
  const rate = sales > 0 ? (grossProfit / sales) * 100 : 0;
  const costMissing = sales > 0 && totalCost === 0;

  return (
    <section className="mb-3 rounded-2xl bg-amber-50 p-4 shadow-sm ring-1 ring-amber-200">
      <div className="mb-2 flex items-center justify-between border-b border-amber-200/60 pb-2">
        <h2 className="text-sm font-bold text-amber-800">🔒 利益管理（内部）</h2>
        <span className="text-[11px] text-amber-600">PDFには出ません</span>
      </div>

      <dl className="space-y-1.5 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-amber-800">売上（税抜）</dt>
          <dd className="font-bold text-amber-900">{fmtYen(sales)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-amber-800">材料費</dt>
          <dd className="text-amber-900">{fmtYen(material)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-amber-800">外注費</dt>
          <dd className="text-amber-900">{fmtYen(subcontract)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-amber-800">その他原価（労務・諸経費など）</dt>
          <dd className="text-amber-900">{fmtYen(otherCosts)}</dd>
        </div>
        <div className="flex items-center justify-between border-t border-amber-200/60 pt-1.5">
          <dt className="font-bold text-amber-800">粗利</dt>
          <dd className={`font-bold ${grossProfit < 0 ? "text-red-600" : "text-amber-900"}`}>
            {fmtYen(grossProfit)}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="font-bold text-amber-800">粗利率</dt>
          <dd className={`font-bold ${grossProfit < 0 ? "text-red-600" : "text-amber-900"}`}>
            {rate.toFixed(1)}%
          </dd>
        </div>
      </dl>

      {costMissing && (
        <div className="mt-2 rounded-xl bg-white px-3 py-2 ring-1 ring-amber-300">
          <p className="text-xs font-bold text-amber-800">⚠️ 原価が未入力です</p>
          <p className="mt-0.5 text-xs text-amber-700">
            材料費・外注費を入力すると正しい粗利が確認できます。
          </p>
        </div>
      )}

      <Link href={workItemsHref}
        className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-amber-300 bg-white px-4 py-2 text-xs font-bold text-amber-800 active:opacity-75">
        工事項目・原価を編集 →
      </Link>
    </section>
  );
}
