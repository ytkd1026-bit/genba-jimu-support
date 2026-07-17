"use client";

// 利益管理カード（案件詳細用・確定仕様）
//
// 二層構造:
//   上層（職人向け）  … 「この案件の手残り予測」を最も大きく表示し、直下に粗利率
//   下層（経営者向け）… 売上・原価合計（材料費／外注費／その他原価の内訳つき）・
//                        粗利・粗利率・固定費按分・手残り予測
//
// 設計方針:
// - データ源は WorkItem（04 工事項目・原価）のみ。読み取り専用で独自の保存キーを
//   持たない（既存データ・保存形式は変更しない）。
// - 外注費は原価合計に含めつつ、必ず独立項目として表示する（1項目へ丸めない）。
// - その他原価 = 労務原価 + 諸経費 + その他原価（WorkItem の既存3項目の合算。推測はしない）。
// - 固定費按分は既存データに保存項目が無いため、推測せず 0円 で表示する。
// - 0円の項目も非表示にしない。折りたたみもしない。
// - 内部管理情報のため、提出用帳票（PDF）には一切出さない。
//
// 計算定義:
//   原価合計   = 材料費 + 外注費 + その他原価
//   粗利       = 売上 − 原価合計
//   粗利率     = 売上 > 0 ? 粗利 ÷ 売上 × 100 : 0（ゼロ除算防止）
//   手残り予測 = 粗利 − 固定費按分

import Link from "next/link";
import { useEffect, useState } from "react";
import { workItemsStore, type WorkItem } from "@/app/utils/workItems";

function fmtYen(n: number): string {
  return "¥" + n.toLocaleString("ja-JP");
}

function fmtRate(n: number): string {
  return n.toFixed(1) + "%";
}

export function ProfitSummaryCard({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<WorkItem[] | null>(null);

  // localStorage を読むためマウント後に集計する
  useEffect(() => {
    setItems(workItemsStore.getByProjectId(projectId));
  }, [projectId]);

  if (items === null) return null;

  const workItemsHref = `/projects/${encodeURIComponent(projectId)}/work-items`;

  // ── 集計（すべて既存 WorkItem 項目の合算） ─────────────────
  const sales = items.reduce((s, w) => s + w.sellingAmount, 0);
  const material = items.reduce((s, w) => s + w.materialCost, 0);
  const subcontract = items.reduce((s, w) => s + w.subcontractCost, 0);
  const otherCosts = items.reduce(
    (s, w) => s + w.laborCost + w.expenseCost + w.otherCost,
    0,
  );
  const costTotal = material + subcontract + otherCosts;
  const grossProfit = sales - costTotal;
  const grossProfitRate = sales > 0 ? (grossProfit / sales) * 100 : 0;
  // 固定費按分: 既存データに保存項目が無いため 0円 固定（別項目から推測しない）
  const fixedCostAllocation = 0;
  const takeHome = grossProfit - fixedCostAllocation;

  const costMissing = sales > 0 && costTotal === 0;
  const takeHomeCls = takeHome < 0 ? "text-red-600" : "text-amber-900";
  const profitCls = grossProfit < 0 ? "text-red-600" : "text-amber-900";

  return (
    <section className="mb-3 rounded-2xl bg-amber-50 p-4 shadow-sm ring-1 ring-amber-200">
      <div className="mb-3 flex items-center justify-between border-b border-amber-200/60 pb-2">
        <h2 className="text-sm font-bold text-amber-800">🔒 利益管理（内部）</h2>
        <span className="text-[11px] text-amber-600">PDFには出ません</span>
      </div>

      {/* ── 上層: 手残り予測（カード内で最大表示）＋粗利率 ───── */}
      <div className="rounded-xl bg-white px-4 py-4 text-center ring-1 ring-amber-200/60">
        <p className="text-xs font-bold text-amber-800">この案件の手残り予測</p>
        <p className={`mt-1 text-3xl font-bold tracking-tight ${takeHomeCls}`}>
          {fmtYen(takeHome)}
        </p>
        <p className="mt-1 text-xs text-amber-700">粗利率 {fmtRate(grossProfitRate)}</p>
      </div>

      {items.length === 0 && (
        <p className="mt-2 text-xs text-amber-700">
          工事項目が未登録のため全項目0円です。「04 工事項目・原価」で登録すると反映されます。
        </p>
      )}

      {/* ── 下層: 詳細内訳（折りたたみなし・0円でも全項目表示） ── */}
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-amber-800">売上</dt>
          <dd className="font-bold text-amber-900">{fmtYen(sales)}</dd>
        </div>

        <div className="flex items-center justify-between border-t border-amber-200/60 pt-1.5">
          <dt className="font-bold text-amber-800">原価合計</dt>
          <dd className="font-bold text-amber-900">{fmtYen(costTotal)}</dd>
        </div>
        <div className="flex items-center justify-between pl-3">
          <dt className="text-amber-800">├ 材料費</dt>
          <dd className="text-amber-900">{fmtYen(material)}</dd>
        </div>
        <div className="flex items-center justify-between pl-3">
          <dt className="text-amber-800">├ 外注費</dt>
          <dd className="text-amber-900">{fmtYen(subcontract)}</dd>
        </div>
        <div className="flex items-center justify-between pl-3">
          <dt className="text-amber-800">└ その他原価</dt>
          <dd className="text-amber-900">{fmtYen(otherCosts)}</dd>
        </div>

        <div className="flex items-center justify-between border-t border-amber-200/60 pt-1.5">
          <dt className="font-bold text-amber-800">粗利</dt>
          <dd className={`font-bold ${profitCls}`}>{fmtYen(grossProfit)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-amber-800">粗利率</dt>
          <dd className="text-amber-900">{fmtRate(grossProfitRate)}</dd>
        </div>

        <div className="flex items-center justify-between border-t border-amber-200/60 pt-1.5">
          <dt className="text-amber-800">固定費按分</dt>
          <dd className="text-amber-900">{fmtYen(fixedCostAllocation)}</dd>
        </div>

        <div className="flex items-center justify-between border-t border-amber-200/60 pt-1.5">
          <dt className="font-bold text-amber-800">手残り予測</dt>
          <dd className={`font-bold ${takeHomeCls}`}>{fmtYen(takeHome)}</dd>
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

      <p className="mt-2 text-[11px] leading-relaxed text-amber-600">
        ※手残り予測は、案件粗利から固定費按分を差し引いた概算です。税金・社会保険・個人生活費は含みません。
      </p>

      <Link href={workItemsHref}
        className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-amber-300 bg-white px-4 py-2 text-xs font-bold text-amber-800 active:opacity-75">
        工事項目・原価を編集 →
      </Link>
    </section>
  );
}
