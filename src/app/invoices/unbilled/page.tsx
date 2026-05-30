"use client";

// TODO: Supabase連携後、projects / invoices / invoice_items から未請求案件を取得する
// TODO: 案件の請求状態を project_progress と連動する
// TODO: 単体請求書作成後、請求状態を「請求済み」に変更する
// TODO: 一括請求に含めた案件は bulk_invoice_items に追加する
// TODO: 月次収支報告の売上一覧と連動する
// TODO: 入金予定日は schedule_events に反映する

import Link from "next/link";
import { useState, useMemo } from "react";

// ─── 型定義 ──────────────────────────────────────────────────
type BillingStatus = "未請求" | "入金待ち" | "請求済み";

type UnbilledProject = {
  id: string;
  date: string;
  projectName: string;
  clientName: string;
  siteAddress: string;
  workContent: string;
  totalAmount: number;
  billingStatus: BillingStatus;
  isBulkCandidate: boolean;
  completedAt: string;
  paymentTerms: string;
};

// ─── 仮データ ─────────────────────────────────────────────────
const ALL_PROJECTS: UnbilledProject[] = [
  {
    id: "project-1",
    date: "2026/05/20",
    projectName: "〇〇マンション クロス貼替",
    clientName: "△△工務店",
    siteAddress: "大阪府堺市〇〇区",
    workContent: "洋室クロス貼替・洗面所CF貼替",
    totalAmount: 105600,
    billingStatus: "未請求",
    isBulkCandidate: true,
    completedAt: "2026/05/20",
    paymentTerms: "翌月末払い",
  },
  {
    id: "project-2",
    date: "2026/05/22",
    projectName: "△△邸 CF貼替",
    clientName: "△△工務店",
    siteAddress: "大阪府堺市△△区",
    workContent: "洗面所CF貼替",
    totalAmount: 30800,
    billingStatus: "未請求",
    isBulkCandidate: true,
    completedAt: "2026/05/22",
    paymentTerms: "翌月末払い",
  },
  {
    id: "project-3",
    date: "2026/06/05",
    projectName: "□□店舗 床補修",
    clientName: "□□リフォーム",
    siteAddress: "大阪府大阪市□□区",
    workContent: "店舗床補修",
    totalAmount: 88000,
    billingStatus: "未請求",
    isBulkCandidate: false,
    completedAt: "2026/06/05",
    paymentTerms: "都度請求",
  },
  {
    id: "project-4",
    date: "2026/06/10",
    projectName: "◇◇マンション 雑工事",
    clientName: "〇〇建設",
    siteAddress: "大阪府堺市□□区",
    workContent: "雑工事一式",
    totalAmount: 22000,
    billingStatus: "入金待ち",
    isBulkCandidate: false,
    completedAt: "2026/06/10",
    paymentTerms: "翌月末払い",
  },
];

// ─── ユーティリティ ───────────────────────────────────────────
function fmtYen(n: number): string {
  return n.toLocaleString("ja-JP") + "円";
}

// ─── ステータス色 ─────────────────────────────────────────────
const STATUS_STYLE: Record<BillingStatus, string> = {
  未請求:   "bg-amber-100 text-amber-800",
  入金待ち: "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-300",
  請求済み: "bg-green-100 text-green-700",
};

const STATUS_CARD_STYLE: Record<BillingStatus, string> = {
  未請求:   "border-amber-200 bg-white",
  入金待ち: "border-yellow-200 bg-yellow-50",
  請求済み: "border-green-200 bg-green-50",
};

// ─── 案件カード ───────────────────────────────────────────────
function ProjectCard({ project }: { project: UnbilledProject }) {
  return (
    <div className={`overflow-hidden rounded-2xl border shadow-sm ${STATUS_CARD_STYLE[project.billingStatus]}`}>
      {/* カードヘッダー */}
      <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[project.billingStatus]}`}>
            {project.billingStatus}
          </span>
          {project.isBulkCandidate && (
            <span className="rounded-full bg-[#8B4A3C]/10 px-2 py-0.5 text-xs font-bold text-[#8B4A3C]">
              一括請求候補
            </span>
          )}
        </div>
        <span className="text-xs text-stone-400">{project.date}</span>
      </div>

      {/* カード本文 */}
      <div className="px-4 py-3 space-y-1.5">
        <p className="text-base font-bold text-stone-800 leading-tight">{project.projectName}</p>
        <p className="text-xs text-stone-400">{project.clientName}　{project.siteAddress}</p>
        <p className="text-xs text-stone-500">{project.workContent}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5">
          <span className="text-xs text-stone-400">完了日：{project.completedAt}</span>
          <span className="text-xs text-stone-400">支払条件：{project.paymentTerms}</span>
        </div>
        {/* 金額（目立つ表示） */}
        <div className="rounded-xl bg-[#fdf0ec] px-3 py-2 text-right">
          <p className="text-xs text-[#8B4A3C]">税込金額</p>
          <p className="text-xl font-bold text-[#8B4A3C]">{fmtYen(project.totalAmount)}</p>
        </div>
      </div>

      {/* アクションボタン */}
      <div className="grid grid-cols-3 gap-1.5 border-t border-stone-100 px-4 py-3">
        <Link
          href="/projects/sample/single-invoice"
          className="flex items-center justify-center rounded-xl bg-[#8B4A3C] px-2 py-2.5 text-center text-xs font-bold text-white active:opacity-80"
        >
          単体請求書<br />を作る
        </Link>
        <Link
          href="/projects/sample/invoice"
          className="flex items-center justify-center rounded-xl border border-[#8B4A3C] bg-white px-2 py-2.5 text-center text-xs font-bold text-[#8B4A3C] active:opacity-80"
        >
          一括請求<br />に含める
        </Link>
        <Link
          href="/projects/sample"
          className="flex items-center justify-center rounded-xl border border-stone-200 bg-white px-2 py-2.5 text-center text-xs font-bold text-stone-600 active:opacity-80"
        >
          案件<br />を見る
        </Link>
      </div>
    </div>
  );
}

// ─── メインページ ─────────────────────────────────────────────
export default function UnbilledPage() {
  const [searchClient,   setSearchClient]   = useState("");
  const [searchProject,  setSearchProject]  = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("すべて");

  // 絞り込み
  const filtered = useMemo(() => {
    return ALL_PROJECTS.filter((p) => {
      const mc = searchClient  === "" || p.clientName.includes(searchClient);
      const mp = searchProject === "" || p.projectName.includes(searchProject);
      const ms = selectedStatus === "すべて" || p.billingStatus === selectedStatus;
      return mc && mp && ms;
    });
  }, [searchClient, searchProject, selectedStatus]);

  // セクション分け
  const singleUnbilled  = filtered.filter((p) => p.billingStatus === "未請求" && !p.isBulkCandidate);
  const bulkCandidates  = filtered.filter((p) => p.billingStatus === "未請求" && p.isBulkCandidate);
  const awaitingPayment = filtered.filter((p) => p.billingStatus === "入金待ち");

  // サマリー計算（全データ対象）
  const unbilledAll    = ALL_PROJECTS.filter((p) => p.billingStatus === "未請求");
  const unbilledCount  = unbilledAll.length;
  const unbilledTotal  = unbilledAll.reduce((s, p) => s + p.totalAmount, 0);
  const thisMonthCount = unbilledAll.filter((p) => p.paymentTerms === "翌月末払い").length;
  const bulkCount      = unbilledAll.filter((p) => p.isBulkCandidate).length;

  const inputCls =
    "w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-800 placeholder:text-stone-300 focus:border-[#8B4A3C] focus:outline-none focus:ring-1 focus:ring-[#8B4A3C]/30";
  const selectCls =
    "w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-800 focus:border-[#8B4A3C] focus:outline-none focus:ring-1 focus:ring-[#8B4A3C]/30";

  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        {/* ヘッダー */}
        <header className="mb-4">
          <Link href="/" className="mb-3 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← ホームへ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">未請求一覧</h1>
          <p className="mt-1 text-sm text-stone-500">
            請求がまだ終わっていない案件を確認します。
          </p>
        </header>

        <div className="space-y-3">

          {/* 集計カード */}
          <div className="rounded-2xl bg-[#8B4A3C] p-4 shadow-sm text-white">
            <h2 className="mb-3 border-b border-white/20 pb-2 text-sm font-bold">集計</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-amber-200">未請求件数</p>
                <p className="text-2xl font-bold">{unbilledCount}件</p>
              </div>
              <div>
                <p className="text-xs text-amber-200">未請求合計額</p>
                <p className="text-lg font-bold">{fmtYen(unbilledTotal)}</p>
              </div>
              <div className="rounded-xl bg-white/10 px-3 py-2">
                <p className="text-xs text-amber-200">今月請求予定</p>
                <p className="text-base font-bold">{thisMonthCount}件</p>
              </div>
              <div className="rounded-xl bg-white/10 px-3 py-2">
                <p className="text-xs text-amber-200">一括請求候補</p>
                <p className="text-base font-bold">{bulkCount}件</p>
              </div>
            </div>
          </div>

          {/* 注意カード */}
          <div className="rounded-2xl bg-yellow-50 p-4 shadow-sm ring-1 ring-yellow-200">
            <h3 className="mb-1.5 text-sm font-bold text-yellow-800">⚠️ 請求漏れ注意</h3>
            <p className="text-sm leading-relaxed text-yellow-700">
              施工完了後、請求書を作成していない案件は売上に反映されません。
              月末前に未請求一覧を確認してください。
            </p>
          </div>

          {/* 絞り込み */}
          <div className="rounded-2xl bg-white p-4 shadow-sm space-y-2.5">
            <h2 className="border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">
              絞り込み
            </h2>
            <input
              type="text"
              placeholder="元請名で検索"
              value={searchClient}
              onChange={(e) => setSearchClient(e.target.value)}
              className={inputCls}
            />
            <input
              type="text"
              placeholder="案件名で検索"
              value={searchProject}
              onChange={(e) => setSearchProject(e.target.value)}
              className={inputCls}
            />
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className={selectCls}
            >
              {["すべて", "未請求", "入金待ち", "請求済み"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* ── 未請求（単体請求） ── */}
          {singleUnbilled.length > 0 && (
            <section>
              <h2 className="mb-2 px-1 text-sm font-bold text-stone-700">
                未請求
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                  {singleUnbilled.length}件
                </span>
              </h2>
              <div className="space-y-3">
                {singleUnbilled.map((p) => <ProjectCard key={p.id} project={p} />)}
              </div>
            </section>
          )}

          {/* ── 一括請求候補 ── */}
          {bulkCandidates.length > 0 && (
            <section>
              <h2 className="mb-2 px-1 text-sm font-bold text-[#8B4A3C]">
                一括請求候補
                <span className="ml-2 rounded-full bg-[#8B4A3C]/10 px-2 py-0.5 text-xs text-[#8B4A3C]">
                  {bulkCandidates.length}件
                </span>
              </h2>

              {/* 一括請求候補の説明 */}
              <div className="mb-2 rounded-xl border border-[#8B4A3C]/20 bg-[#fff8f5] px-4 py-3">
                <p className="mb-1 text-xs font-bold text-[#8B4A3C]">一括請求候補について</p>
                <p className="text-xs leading-relaxed text-stone-600">
                  同じ元請の未請求案件は、一括請求にまとめると請求漏れを防ぎやすくなります。
                  月末締めの元請は、一括請求候補として確認してください。
                </p>
              </div>

              <div className="space-y-3">
                {bulkCandidates.map((p) => <ProjectCard key={p.id} project={p} />)}
              </div>
            </section>
          )}

          {/* 未請求も一括候補もない場合 */}
          {singleUnbilled.length === 0 && bulkCandidates.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-stone-200 py-10 text-center">
              <p className="text-sm text-stone-400">未請求の案件はありません</p>
            </div>
          )}

          {/* ── 入金待ち ── */}
          {awaitingPayment.length > 0 && (
            <section>
              <h2 className="mb-2 px-1 text-sm font-bold text-stone-700">
                入金待ち
                <span className="ml-2 rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">
                  {awaitingPayment.length}件
                </span>
              </h2>
              <div className="space-y-3">
                {awaitingPayment.map((p) => <ProjectCard key={p.id} project={p} />)}
              </div>
            </section>
          )}

          {/* 月次収支への導線 */}
          <Link
            href="/reports/monthly"
            className="flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-white py-4 text-base font-bold text-stone-600 shadow-sm active:opacity-80"
          >
            月次収支で確認
          </Link>

        </div>
      </div>
    </div>
  );
}
