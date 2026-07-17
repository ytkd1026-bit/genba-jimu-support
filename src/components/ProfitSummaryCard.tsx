"use client";

// 利益管理カード（案件詳細用・フェーズ2）
//
// 目的: 「職人は一瞬で判断できる」「経営者は詳細分析できる」の両立。
//   上層（職人向け）  … 手残り予測（最大表示）＋ 粗利率・利益ランク・回収率
//   下層（経営者向け）… 売上／材料費／外注費／その他原価／原価合計／粗利／
//                        固定費按分（未設定）／実質利益／請求済／入金済／未入金
//
// 設計方針:
// - 読み取り専用。データ源は既存の WorkItem（genba_work_items_v1）・
//   保存済み請求書（genba_jimu_saved_invoices）・案件ステータス（genba_projects_v1）のみ。
//   独自の保存キーを持たず、既存データ・保存形式は一切変更しない。
// - 外注費は原価合計に含めつつ、必ず独立項目として表示する（1項目へ丸めない）。
// - 固定費按分は保存項目が存在しないため「固定費按分（未設定）」として¥0表示
//   （将来の固定費設定機能で置き換える前提。別項目からの推測はしない）。
// - 入金済は既存データに入金額の記録が無いため、案件ステータスが「入金済み（paid）」の
//   とき請求済み全額、それ以外は¥0として導出する（保存はしない）。
// - 内部管理情報のため、提出用帳票（PDF）には一切出さない。
//
// 計算定義:
//   原価合計   = 材料費 + 外注費 + その他原価
//   粗利       = 売上 − 原価合計
//   粗利率     = 売上 > 0 ? 粗利 ÷ 売上 × 100 : 0（ゼロ除算防止）
//   実質利益   = 粗利 − 固定費按分（上層では「手残り予測」として表示）
//   回収率     = 請求済 > 0 ? 入金済 ÷ 請求済 × 100 : 0（ゼロ除算防止）
//   利益ランク = 粗利率 S:50%以上 / A:40%以上 / B:30%以上 / C:20%以上 / D:20%未満
//               （売上0円のときは判定不能として「—」）

import Link from "next/link";
import { useEffect, useState } from "react";
import { workItemsStore, type WorkItem } from "@/app/utils/workItems";
import { getSavedInvoices } from "@/app/utils/savedInvoices";
import { projectsStore } from "@/app/utils/projects";
import { getAppMode, type AppMode } from "@/app/utils/companySettings";

function fmtYen(n: number): string {
  return "¥" + n.toLocaleString("ja-JP");
}

function fmtRate(n: number): string {
  return n.toFixed(1) + "%";
}

// ─── 利益ランク（粗利率ベース） ───────────────────────────────
type ProfitRank = "S" | "A" | "B" | "C" | "D" | "—";

function profitRank(sales: number, rate: number): ProfitRank {
  if (sales <= 0) return "—"; // 売上0円は判定不能
  if (rate >= 50) return "S";
  if (rate >= 40) return "A";
  if (rate >= 30) return "B";
  if (rate >= 20) return "C";
  return "D";
}

const RANK_CLS: Record<ProfitRank, string> = {
  S: "bg-green-100 text-green-700",
  A: "bg-teal-100 text-teal-700",
  B: "bg-blue-100 text-blue-700",
  C: "bg-amber-100 text-amber-700",
  D: "bg-red-100 text-red-700",
  "—": "bg-stone-100 text-stone-400",
};

type MoneyState = {
  items: WorkItem[];
  invoicedTotal: number; // 請求済（保存済み請求書の税込合計）
  isPaid: boolean;       // 案件ステータスが「入金済み」か
  mode: AppMode;         // 利用モード（表示のみ切り替え。計算は両モードで同一）
};

export function ProfitSummaryCard({ projectId }: { projectId: string }) {
  const [money, setMoney] = useState<MoneyState | null>(null);

  // localStorage を読むためマウント後に集計する（すべて読み取りのみ）
  useEffect(() => {
    const items = workItemsStore.getByProjectId(projectId);
    const invoicedTotal = getSavedInvoices()
      .filter((inv) => inv.projectId === projectId)
      .reduce((s, inv) => s + inv.total, 0);
    const isPaid = projectsStore.getById(projectId)?.status === "paid";
    setMoney({ items, invoicedTotal, isPaid, mode: getAppMode() });
  }, [projectId]);

  if (money === null) return null;

  const { items, invoicedTotal, isPaid, mode } = money;
  const isSimple = mode === "simple";
  const workItemsHref = `/projects/${encodeURIComponent(projectId)}/work-items`;

  // ── 利益（既存 WorkItem 項目の合算） ───────────────────────
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
  // 固定費按分: 保存項目が無いため未設定（¥0）。推測はしない
  const fixedCostAllocation = 0;
  const netProfit = grossProfit - fixedCostAllocation; // 実質利益 = 手残り予測
  const rank = profitRank(sales, grossProfitRate);

  // ── 資金繰り（既存の請求書・ステータスから導出） ───────────
  const paidTotal = isPaid ? invoicedTotal : 0;
  const unpaidTotal = invoicedTotal - paidTotal;
  const collectionRate = invoicedTotal > 0 ? (paidTotal / invoicedTotal) * 100 : 0;

  const costMissing = sales > 0 && costTotal === 0;
  const netCls = netProfit < 0 ? "text-red-600" : "text-amber-900";
  const profitCls = grossProfit < 0 ? "text-red-600" : "text-amber-900";

  return (
    <section className="mb-3 rounded-2xl bg-amber-50 p-4 shadow-sm ring-1 ring-amber-200">
      <div className="mb-3 flex items-center justify-between border-b border-amber-200/60 pb-2">
        <h2 className="text-sm font-bold text-amber-800">🔒 利益管理（内部）</h2>
        <span className="text-[11px] text-amber-600">PDFには出ません</span>
      </div>

      {/* ── 上層: 手残り予測（最大表示）。経営モードのみ利益ランク・回収率も表示 ── */}
      <div className="rounded-xl bg-white px-4 py-4 text-center ring-1 ring-amber-200/60">
        <p className="text-xs font-bold text-amber-800">この案件の手残り予測</p>
        <p className={`mt-1 text-3xl font-bold tracking-tight ${netCls}`}>
          {fmtYen(netProfit)}
        </p>
        {isSimple ? (
          <p className="mt-1 text-xs text-amber-700">粗利率 {fmtRate(grossProfitRate)}</p>
        ) : (
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <div className="rounded-lg bg-amber-50 px-1 py-1.5">
              <p className="text-[10px] text-amber-600">粗利率</p>
              <p className="text-sm font-bold text-amber-900">{fmtRate(grossProfitRate)}</p>
            </div>
            <div className="rounded-lg bg-amber-50 px-1 py-1.5">
              <p className="text-[10px] text-amber-600">利益ランク</p>
              <p className="mt-0.5">
                <span className={`inline-block min-w-[28px] rounded-full px-2 text-sm font-bold ${RANK_CLS[rank]}`}>
                  {rank}
                </span>
              </p>
            </div>
            <div className="rounded-lg bg-amber-50 px-1 py-1.5">
              <p className="text-[10px] text-amber-600">回収率</p>
              <p className="text-sm font-bold text-amber-900">{fmtRate(collectionRate)}</p>
            </div>
          </div>
        )}
      </div>

      {items.length === 0 && (
        <p className="mt-2 text-xs text-amber-700">
          工事項目が未登録のため利益は全項目0円です。「04 工事項目・原価」で登録すると反映されます。
        </p>
      )}

      {/* ── 下層（シンプルモード）: 売上・原価・粗利・粗利率のみ ──
           表示を減らしても計算は経営モードと同一
           （原価 = 材料費 + 外注費 + その他原価。外注費は必ず含める） */}
      {isSimple ? (
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-amber-800">売上（税抜）</dt>
            <dd className="font-bold text-amber-900">{fmtYen(sales)}</dd>
          </div>
          <div className="flex items-center justify-between border-t border-amber-200/60 pt-1.5">
            <dt className="text-amber-800">原価</dt>
            <dd className="text-amber-900">{fmtYen(costTotal)}</dd>
          </div>
          <div className="flex items-center justify-between border-t border-amber-200/60 pt-1.5">
            <dt className="font-bold text-amber-800">粗利</dt>
            <dd className={`font-bold ${profitCls}`}>{fmtYen(grossProfit)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-amber-800">粗利率</dt>
            <dd className="text-amber-900">{fmtRate(grossProfitRate)}</dd>
          </div>
        </dl>
      ) : (
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-amber-800">売上（税抜）</dt>
          <dd className="font-bold text-amber-900">{fmtYen(sales)}</dd>
        </div>
        <div className="flex items-center justify-between border-t border-amber-200/60 pt-1.5">
          <dt className="text-amber-800">材料費</dt>
          <dd className="text-amber-900">{fmtYen(material)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-amber-800">外注費</dt>
          <dd className="text-amber-900">{fmtYen(subcontract)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-amber-800">その他原価</dt>
          <dd className="text-amber-900">{fmtYen(otherCosts)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="font-bold text-amber-800">原価合計</dt>
          <dd className="font-bold text-amber-900">{fmtYen(costTotal)}</dd>
        </div>
        <div className="flex items-center justify-between border-t border-amber-200/60 pt-1.5">
          <dt className="font-bold text-amber-800">粗利</dt>
          <dd className={`font-bold ${profitCls}`}>{fmtYen(grossProfit)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-amber-800">固定費按分（未設定）</dt>
          <dd className="text-amber-900">{fmtYen(fixedCostAllocation)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="font-bold text-amber-800">実質利益</dt>
          <dd className={`font-bold ${netCls}`}>{fmtYen(netProfit)}</dd>
        </div>

        {/* 資金繰り（請求書ベースのため税込。上の売上・粗利は税抜） */}
        <div className="flex items-center justify-between border-t border-amber-200/60 pt-1.5">
          <dt className="text-amber-800">請求済（税込）</dt>
          <dd className="text-amber-900">{fmtYen(invoicedTotal)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-amber-800">入金済（税込）</dt>
          <dd className="text-amber-900">{fmtYen(paidTotal)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className={`${unpaidTotal > 0 ? "font-bold text-red-600" : "text-amber-800"}`}>未入金（税込）</dt>
          <dd className={`${unpaidTotal > 0 ? "font-bold text-red-600" : "text-amber-900"}`}>{fmtYen(unpaidTotal)}</dd>
        </div>
      </dl>
      )}

      {costMissing && (
        <div className="mt-2 rounded-xl bg-white px-3 py-2 ring-1 ring-amber-300">
          <p className="text-xs font-bold text-amber-800">⚠️ 原価が未入力です</p>
          <p className="mt-0.5 text-xs text-amber-700">
            材料費・外注費を入力すると正しい粗利が確認できます。
          </p>
        </div>
      )}

      {/* 固定費が未設定（現状は常に未設定）の間は、手残り予測＝粗利であることを明示する */}
      {fixedCostAllocation === 0 && (
        <p className="mt-2 text-[11px] leading-relaxed text-amber-600">
          固定費が未設定のため、現在の手残り予測は粗利と同額です。税金・社会保険・借入返済・事業主生活費は含みません。
        </p>
      )}
      {!isSimple && (
        <p className="mt-1 text-[11px] leading-relaxed text-amber-600">
          入金済は案件の進捗状況が「入金済み」のとき請求済み全額として表示します。
        </p>
      )}

      <Link href={workItemsHref}
        className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-amber-300 bg-white px-4 py-2 text-xs font-bold text-amber-800 active:opacity-75">
        工事項目・原価を編集 →
      </Link>
    </section>
  );
}
