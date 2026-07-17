"use client";

// TODO: Supabase連携後、projects / invoices / invoice_items から未請求案件を取得する
// TODO: 案件の請求状態を project_progress と連動する
// TODO: 単体請求書作成後、請求状態を「請求済み」に変更する
// TODO: 一括請求に含めた案件は bulk_invoice_items に追加する
// TODO: 月次収支報告の売上一覧と連動する
// TODO: 入金予定日は schedule_events に反映する

import Link from "next/link";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getTestMode } from "@/app/utils/testMode";
import { matchesKeyword } from "@/app/utils/search";

// ─── localStorage キー ─────────────────────────────────────────
const UNBILLED_PROJECTS_STORAGE_KEY = "genba_jimu_unbilled_projects";

// ─── 型定義 ──────────────────────────────────────────────────
type BillingStatus =
  | "unbilled"
  | "single_invoiced"
  | "bulk_selected"
  | "paid_waiting"
  | "paid";

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
  isBulkSelected: boolean;
  invoicedAt: string | null;
  completedAt: string;
  paymentTerms: string;
};

// ─── デモ用初期データ ──────────────────────────────────────────
const initialInvoiceProjects: UnbilledProject[] = [
  {
    id: "project-1",
    date: "2026/05/20",
    projectName: "〇〇マンション クロス貼替",
    clientName: "△△工務店",
    siteAddress: "大阪府堺市〇〇区",
    workContent: "洋室クロス貼替・洗面所CF貼替",
    totalAmount: 105600,
    billingStatus: "unbilled",
    isBulkCandidate: true,
    isBulkSelected: false,
    invoicedAt: null,
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
    billingStatus: "unbilled",
    isBulkCandidate: true,
    isBulkSelected: false,
    invoicedAt: null,
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
    billingStatus: "unbilled",
    isBulkCandidate: false,
    isBulkSelected: false,
    invoicedAt: null,
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
    billingStatus: "paid_waiting",
    isBulkCandidate: false,
    isBulkSelected: false,
    invoicedAt: null,
    completedAt: "2026/06/10",
    paymentTerms: "翌月末払い",
  },
];

// ─── ユーティリティ ───────────────────────────────────────────
function fmtYen(n: number): string {
  return n.toLocaleString("ja-JP") + "円";
}

/**
 * 数値正規化ガード（S-1）: 有限数以外（欠損・文字列・NaN・Infinity）は 0 として集計する。
 * 正常データでは恒等（値をそのまま返す）。保存データは変更しない（読み取り側のみ）。
 */
function fin(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

// ─── ステータス表示ラベル ──────────────────────────────────────
const STATUS_LABEL: Record<BillingStatus, string> = {
  unbilled:        "未請求",
  single_invoiced: "単体請求済み",
  bulk_selected:   "一括請求追加済み",
  paid_waiting:    "入金待ち",
  paid:            "入金済み",
};

// ─── ステータス色 ─────────────────────────────────────────────
const STATUS_STYLE: Record<BillingStatus, string> = {
  unbilled:        "bg-amber-100 text-amber-800",
  single_invoiced: "bg-blue-100 text-blue-700",
  bulk_selected:   "bg-purple-100 text-purple-700",
  paid_waiting:    "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-300",
  paid:            "bg-green-100 text-green-700",
};

const STATUS_CARD_STYLE: Record<BillingStatus, string> = {
  unbilled:        "border-amber-200 bg-white",
  single_invoiced: "border-blue-200 bg-blue-50",
  bulk_selected:   "border-purple-200 bg-purple-50",
  paid_waiting:    "border-yellow-200 bg-yellow-50",
  paid:            "border-green-200 bg-green-50",
};

// ─── 絞り込みマップ（コンポーネント外で定義） ─────────────────
const STATUS_FILTER_OPTIONS: { label: string; value: BillingStatus | null }[] = [
  { label: "すべて",           value: null },
  { label: "未請求",           value: "unbilled" },
  { label: "一括請求追加済み", value: "bulk_selected" },
  { label: "単体請求済み",     value: "single_invoiced" },
  { label: "入金待ち",         value: "paid_waiting" },
  { label: "入金済み",         value: "paid" },
];

// ─── 案件カード ───────────────────────────────────────────────
function ProjectCard({
  project,
  onSingleInvoice,
  onBulkSelect,
}: {
  project: UnbilledProject;
  onSingleInvoice: (id: string) => void;
  onBulkSelect: (id: string) => void;
}) {
  return (
    <div className={`overflow-hidden rounded-2xl border shadow-sm ${STATUS_CARD_STYLE[project.billingStatus]}`}>
      {/* カードヘッダー */}
      <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[project.billingStatus]}`}>
            {STATUS_LABEL[project.billingStatus]}
          </span>
          {project.isBulkCandidate && project.billingStatus === "unbilled" && (
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
          {project.invoicedAt && (
            <span className="text-xs text-stone-400">請求日：{project.invoicedAt}</span>
          )}
        </div>
        {/* 金額（目立つ表示） */}
        <div className="rounded-xl bg-[#fdf0ec] px-3 py-2 text-right">
          <p className="text-xs text-[#8B4A3C]">税込金額</p>
          <p className="text-xl font-bold text-[#8B4A3C]">{fmtYen(fin(project.totalAmount))}</p>
        </div>
      </div>

      {/* アクションボタン */}
      <div className="grid grid-cols-3 gap-1.5 border-t border-stone-100 px-4 py-3">
        <button
          type="button"
          onClick={() => onSingleInvoice(project.id)}
          className="flex items-center justify-center rounded-xl bg-[#8B4A3C] px-2 py-2.5 text-center text-xs font-bold text-white active:opacity-80"
        >
          単体請求書<br />を作る
        </button>
        <button
          type="button"
          onClick={() => onBulkSelect(project.id)}
          className="flex items-center justify-center rounded-xl border border-[#8B4A3C] bg-white px-2 py-2.5 text-center text-xs font-bold text-[#8B4A3C] active:opacity-80"
        >
          一括請求<br />に含める
        </button>
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
  const router = useRouter();
  const [isDemo,          setIsDemo]          = useState(false);
  const [loaded,          setLoaded]          = useState(false);
  const [invoiceProjects, setInvoiceProjects] = useState<UnbilledProject[]>([]);
  const [searchClient,    setSearchClient]    = useState("");
  const [searchProject,   setSearchProject]   = useState("");
  const [selectedStatus,  setSelectedStatus]  = useState("すべて");
  const [infoMsg,         setInfoMsg]         = useState("");

  // 初回：testMode を確認してデータを設定
  useEffect(() => {
    const demo = getTestMode() === "demo";
    setIsDemo(demo);
    if (demo) {
      try {
        const saved = localStorage.getItem(UNBILLED_PROJECTS_STORAGE_KEY);
        if (saved) {
          setInvoiceProjects(JSON.parse(saved) as UnbilledProject[]);
        } else {
          setInvoiceProjects(initialInvoiceProjects);
        }
      } catch {
        setInvoiceProjects(initialInvoiceProjects);
      }
    }
    // normal/first_user: [] のまま
    setLoaded(true);
  }, []);

  // デモモードのみ localStorage へ保存
  useEffect(() => {
    if (!loaded || !isDemo) return;
    localStorage.setItem(UNBILLED_PROJECTS_STORAGE_KEY, JSON.stringify(invoiceProjects));
  }, [invoiceProjects, isDemo, loaded]);

  // 単体請求済みに変更
  function handleSingleInvoice(id: string) {
    const ok = window.confirm("この案件の単体請求書を作成済みにしますか？");
    if (!ok) return;
    setInvoiceProjects((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, billingStatus: "single_invoiced" as BillingStatus, invoicedAt: "2026/06/30", isBulkSelected: false }
          : p
      )
    );
    router.push("/projects/sample/single-invoice");
  }

  // 一括請求に追加
  function handleBulkSelect(id: string) {
    const ok = window.confirm("この案件を一括請求に含めますか？");
    if (!ok) return;
    setInvoiceProjects((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, billingStatus: "bulk_selected" as BillingStatus, isBulkSelected: true }
          : p
      )
    );
    router.push("/projects/sample/invoice");
  }

  // 初期状態に戻す
  function handleReset() {
    const ok = window.confirm(
      "請求状態を初期状態に戻しますか？この画面の仮保存データがリセットされます。"
    );
    if (!ok) return;
    const resetData = isDemo ? initialInvoiceProjects : [];
    setInvoiceProjects(resetData);
    if (isDemo) localStorage.removeItem(UNBILLED_PROJECTS_STORAGE_KEY);
    setInfoMsg("請求状態を初期状態に戻しました。");
    setTimeout(() => setInfoMsg(""), 3000);
  }

  // 絞り込み
  const filtered = useMemo(() => {
    const statusFilter = STATUS_FILTER_OPTIONS.find((o) => o.label === selectedStatus)?.value ?? null;
    return invoiceProjects.filter((p) => {
      const mc = searchClient  === "" || matchesKeyword([p.clientName], searchClient);
      const mp = searchProject === "" || matchesKeyword([p.projectName, p.workContent, p.siteAddress], searchProject);
      const ms = statusFilter === null || p.billingStatus === statusFilter;
      return mc && mp && ms;
    });
  }, [invoiceProjects, searchClient, searchProject, selectedStatus]);

  // セクション分け
  const unbilledList       = filtered.filter((p) => p.billingStatus === "unbilled");
  const bulkSelectedList   = filtered.filter((p) => p.billingStatus === "bulk_selected");
  const singleInvoicedList = filtered.filter((p) => p.billingStatus === "single_invoiced");
  const paidWaitingList    = filtered.filter((p) => p.billingStatus === "paid_waiting");

  // サマリー計算（全データ対象）
  const unbilledCount       = invoiceProjects.filter((p) => p.billingStatus === "unbilled").length;
  const unbilledTotal       = invoiceProjects
    .filter((p) => p.billingStatus === "unbilled")
    .reduce((s, p) => s + fin(p.totalAmount), 0);
  const singleInvoicedCount = invoiceProjects.filter((p) => p.billingStatus === "single_invoiced").length;
  const bulkSelectedCount   = invoiceProjects.filter((p) => p.billingStatus === "bulk_selected").length;
  const paidWaitingCount    = invoiceProjects.filter((p) => p.billingStatus === "paid_waiting").length;

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
                <p className="text-xs text-amber-200">単体請求済み</p>
                <p className="text-base font-bold">{singleInvoicedCount}件</p>
              </div>
              <div className="rounded-xl bg-white/10 px-3 py-2">
                <p className="text-xs text-amber-200">一括請求追加済み</p>
                <p className="text-base font-bold">{bulkSelectedCount}件</p>
              </div>
              <div className="col-span-2 rounded-xl bg-white/10 px-3 py-2">
                <p className="text-xs text-amber-200">入金待ち</p>
                <p className="text-base font-bold">{paidWaitingCount}件</p>
              </div>
            </div>
          </div>

          {isDemo && (
            /* 注意カード（仮保存について） */
            <div className="rounded-2xl bg-yellow-50 p-4 shadow-sm ring-1 ring-yellow-200">
              <h3 className="mb-1.5 text-sm font-bold text-yellow-800">請求状態の仮保存について</h3>
              <p className="text-sm leading-relaxed text-yellow-700">
                現在は localStorage に仮保存しています。<br />
                同じブラウザでは再読み込み後も状態が残りますが、別端末や別ブラウザには共有されません。<br />
                本運用では Supabase と連携して保存する予定です。
              </p>
            </div>
          )}

          {/* インラインメッセージ */}
          {infoMsg && (
            <div className="rounded-xl bg-green-50 px-4 py-3 ring-1 ring-green-200">
              <p className="text-sm font-bold text-green-700">{infoMsg}</p>
            </div>
          )}

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
              {STATUS_FILTER_OPTIONS.map((o) => (
                <option key={o.label} value={o.label}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* データなし（normal/first_user） */}
          {!isDemo && invoiceProjects.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-stone-200 py-10 text-center">
              <p className="text-sm text-stone-500">未請求案件はありません。</p>
              <p className="mt-1.5 text-sm text-stone-500">案件登録・見積作成後、請求書作成を試してください。</p>
            </div>
          )}

          {/* ── 未請求 ── */}
          {unbilledList.length > 0 && (
            <section>
              <h2 className="mb-2 px-1 text-sm font-bold text-stone-700">
                未請求
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                  {unbilledList.length}件
                </span>
              </h2>
              <div className="space-y-3">
                {unbilledList.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    onSingleInvoice={handleSingleInvoice}
                    onBulkSelect={handleBulkSelect}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ── 一括請求に追加済み ── */}
          {bulkSelectedList.length > 0 && (
            <section>
              <h2 className="mb-2 px-1 text-sm font-bold text-purple-700">
                一括請求に追加済み
                <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                  {bulkSelectedList.length}件
                </span>
              </h2>
              <div className="space-y-3">
                {bulkSelectedList.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    onSingleInvoice={handleSingleInvoice}
                    onBulkSelect={handleBulkSelect}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ── 単体請求済み ── */}
          {singleInvoicedList.length > 0 && (
            <section>
              <h2 className="mb-2 px-1 text-sm font-bold text-blue-700">
                単体請求済み
                <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                  {singleInvoicedList.length}件
                </span>
              </h2>
              <div className="space-y-3">
                {singleInvoicedList.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    onSingleInvoice={handleSingleInvoice}
                    onBulkSelect={handleBulkSelect}
                  />
                ))}
              </div>
            </section>
          )}

          {/* 未請求・一括・単体のいずれもない場合（デモモードで絞り込み結果が空のとき） */}
          {isDemo && unbilledList.length === 0 && bulkSelectedList.length === 0 && singleInvoicedList.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-stone-200 py-10 text-center">
              <p className="text-sm text-stone-400">該当する案件はありません</p>
            </div>
          )}

          {/* ── 入金待ち ── */}
          {paidWaitingList.length > 0 && (
            <section>
              <h2 className="mb-2 px-1 text-sm font-bold text-stone-700">
                入金待ち
                <span className="ml-2 rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">
                  {paidWaitingList.length}件
                </span>
              </h2>
              <div className="space-y-3">
                {paidWaitingList.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    onSingleInvoice={handleSingleInvoice}
                    onBulkSelect={handleBulkSelect}
                  />
                ))}
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

          {/* 初期状態に戻すボタン */}
          <button
            type="button"
            onClick={handleReset}
            className="flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-white py-3 text-sm font-bold text-stone-400 shadow-sm active:opacity-80"
          >
            請求状態を初期状態に戻す
          </button>

          {/* テスト感想リンク */}
          <div className="flex justify-end pb-8">
            <Link href="/test-feedback" className="text-xs text-stone-400 underline underline-offset-2 hover:text-[#8B4A3C]">
              この画面の感想を書く
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}
