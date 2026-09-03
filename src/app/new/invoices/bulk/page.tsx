"use client";

import Link from "next/link";
import PageHeader from "@/app/new/_components/PageHeader";
import { useState, useMemo, useEffect } from "react";
import { bulkInvoicePdfFileName } from "@/app/utils/pdfFileName";
import { getTestMode } from "@/app/utils/testMode";
import { matchesKeyword } from "@/app/utils/search";
import { getCompanyInfoForPdf, getBankSettings } from "@/app/utils/companySettings";

// TODO: Supabase連携後は、新規案件登録時の元請情報を customers テーブルに保存し、
//       projects.customer_id と紐づける。現在は仮データで動作確認中。

// ─── 型定義 ──────────────────────────────────────────────────
type Customer = {
  id: string;
  name: string;
  displayName: string;
  contactName: string;
  postalCode: string;
  address: string;
  closingDay: string;
  paymentTerm: string;
  dueDate: string;
};

type InvoiceProject = {
  id: string;
  customerId: string;
  included: boolean;
  projectName: string;
  siteAddress: string;
  workSummary: string;
  completedAt: string;
  subtotal: number;
  tax: number;
  total: number;
};

type BankInfo = {
  bankName: string;
  branchName: string;
  accountType: string;
  accountNumber: string;
  accountHolder: string;
};

// ─── 元請・得意先マスタ（仮） ─────────────────────────────────
// TODO: Supabase連携後は customers テーブルから取得する
// TODO: customer.address は元請マスタ customers から取得する
const CUSTOMERS: Customer[] = [
  {
    id: "customer-1",
    name: "△△工務店",
    displayName: "△△工務店 御中",
    contactName: "山田様",
    postalCode: "〒590-0001",
    address: "大阪府堺市〇〇区〇〇町1-2-3",
    closingDay: "月末締め",
    paymentTerm: "翌月末払い",
    dueDate: "2026-06-30",
  },
  {
    id: "customer-2",
    name: "□□リフォーム",
    displayName: "□□リフォーム 御中",
    contactName: "佐藤様",
    postalCode: "〒530-0002",
    address: "大阪府大阪市□□区□□町4-5-6",
    closingDay: "20日締め",
    paymentTerm: "翌月20日払い",
    dueDate: "2026-06-20",
  },
  {
    id: "customer-3",
    name: "〇〇建設",
    displayName: "〇〇建設 御中",
    contactName: "田中様",
    postalCode: "〒591-0003",
    address: "大阪府堺市◇◇区◇◇町7-8-9",
    closingDay: "月末締め",
    paymentTerm: "翌々月10日払い",
    dueDate: "2026-07-10",
  },
];

// ─── 自社情報（事業者設定画面と共有） ───────────────────────────
// 事業者設定画面で保存した内容をlocalStorageから読み込んでPDFへ反映する
// TODO: Supabase連携後は company_settings テーブルから取得する
// TODO: 小窓付き封筒の規格に合わせた印刷位置テンプレを追加する

type CompanyInfoState = {
  name: string;
  postalCode: string;
  address: string;
  representative: string; // "代表　山田 太郎" 形式
  tel: string;
  email: string;
  invoiceNumber: string;
};

const DEFAULT_COMPANY_INFO: CompanyInfoState = {
  name: "REVO",
  postalCode: "〒590-0000",
  address: "大阪府堺市〇〇区〇〇町",
  representative: "代表　山田 太郎",
  tel: "090-0000-0000",
  email: "example@example.com",
  invoiceNumber: "T0000000000000",
};

// ─── 案件データ（仮） ─────────────────────────────────────────
// TODO: Supabase連携後は projects テーブルから customer_id でフィルタして取得する
const INITIAL_ALL_PROJECTS: InvoiceProject[] = [
  {
    id: "project-1", customerId: "customer-1", included: true,
    projectName: "〇〇マンション クロス貼替",
    siteAddress: "大阪府堺市〇〇区",
    workSummary: "洋室クロス貼替・洗面所CF貼替",
    completedAt: "2026-05-20",
    subtotal: 88000, tax: 8800, total: 96800,
  },
  {
    id: "project-2", customerId: "customer-1", included: true,
    projectName: "△△邸 CF貼替",
    siteAddress: "大阪府堺市△△区",
    workSummary: "洗面所CF貼替",
    completedAt: "2026-05-22",
    subtotal: 28000, tax: 2800, total: 30800,
  },
  {
    id: "project-3", customerId: "customer-2", included: true,
    projectName: "□□店舗 床補修",
    siteAddress: "大阪府大阪市□□区",
    workSummary: "床下地補修・フロアタイル部分貼替",
    completedAt: "2026-05-25",
    subtotal: 80000, tax: 8000, total: 88000,
  },
  {
    id: "project-4", customerId: "customer-3", included: true,
    projectName: "◇◇マンション 雑工事",
    siteAddress: "大阪府堺市◇◇区",
    workSummary: "カーテンレール取付・軽微補修",
    completedAt: "2026-05-28",
    subtotal: 20000, tax: 2000, total: 22000,
  },
];

// ─── 定数 ────────────────────────────────────────────────────
const ACCOUNT_TYPES = ["普通", "当座"];

function emptyProject(customerId: string, idx: number): InvoiceProject {
  return {
    id: `new-${Date.now()}-${idx}`, customerId, included: true,
    projectName: "", siteAddress: "", workSummary: "",
    completedAt: "", subtotal: 0, tax: 0, total: 0,
  };
}

function fmtYen(n: number): string { return "¥" + n.toLocaleString("ja-JP"); }

// ─── スタイル定数 ─────────────────────────────────────────────
const fi = "w-full rounded-lg border border-[var(--nu-border)] bg-[var(--nu-bg)] px-3 py-2 text-sm text-[var(--nu-text)] placeholder:text-slate-300 focus:border-[var(--nu-primary)] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[var(--nu-primary)]/30";
const fs = "w-full rounded-lg border border-[var(--nu-border)] bg-[var(--nu-bg)] px-3 py-2 text-sm text-[var(--nu-text)] focus:border-[var(--nu-primary)] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[var(--nu-primary)]/30";
const lbl = "mb-0.5 block text-xs text-slate-400";

// ─── 案件カード（簡略表示） ──────────────────────────────────
function ProjectCard({
  project, index, canDelete,
  onUpdate, onToggle, onDelete,
}: {
  project: InvoiceProject; index: number; canDelete: boolean;
  onUpdate: (field: keyof InvoiceProject, value: string | number) => void;
  onToggle: () => void; onDelete: () => void;
}) {
  return (
    <div className={`overflow-hidden rounded-2xl shadow-sm transition-opacity ${
      project.included
        ? "bg-white ring-1 ring-[var(--nu-border-soft)]"
        : "bg-[var(--nu-bg)] opacity-60 ring-1 ring-[var(--nu-border)]"
    }`}>
      {/* カードヘッダー */}
      <div className={`flex items-center justify-between border-b px-4 py-2.5 ${
        project.included ? "border-[var(--nu-border-soft)] bg-[var(--nu-bg)]" : "border-[var(--nu-border)] bg-[var(--nu-bg)]"
      }`}>
        <div className="flex items-center gap-2.5">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={project.included} onChange={onToggle}
              className="h-4 w-4 rounded border-[var(--nu-border)] accent-[var(--nu-primary)]" />
            <span className="text-xs font-bold text-slate-600">案件 {index + 1}</span>
          </label>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
            project.included ? "bg-[var(--nu-primary)]/10 text-[var(--nu-primary)]" : "bg-[var(--nu-border)] text-slate-500"
          }`}>
            {project.included ? "請求対象" : "対象外"}
          </span>
        </div>
        <button type="button"
          onClick={onDelete}
          disabled={!canDelete}
          title={!canDelete ? "案件行は最低1行必要です" : undefined}
          className={`text-xs ${canDelete ? "text-slate-400 active:text-red-500" : "cursor-not-allowed text-slate-200"}`}>
          削除
        </button>
      </div>

      <div className={`p-4 space-y-2.5 ${!project.included ? "pointer-events-none select-none" : ""}`}>
        {/* 案件名 */}
        <div>
          <label className={lbl}>案件名</label>
          <input type="text" value={project.projectName}
            onChange={(e) => onUpdate("projectName", e.target.value)}
            placeholder="例：〇〇マンション クロス貼替" className={fi} />
        </div>
        {/* 工事内容 */}
        <div>
          <label className={lbl}>工事内容</label>
          <input type="text" value={project.workSummary}
            onChange={(e) => onUpdate("workSummary", e.target.value)}
            placeholder="例：洋室クロス貼替・洗面所CF貼替" className={fi} />
        </div>
        {/* 完了日 */}
        <div>
          <label className={lbl}>完了日</label>
          <input type="date" value={project.completedAt}
            onChange={(e) => onUpdate("completedAt", e.target.value)} className={fi} />
        </div>
        {/* 合計金額（税込） */}
        <div className="flex items-center justify-between rounded-xl bg-[var(--nu-primary-bg)] px-3 py-2.5">
          <span className="text-xs font-bold text-[var(--nu-primary)]">合計金額（税込）</span>
          <input type="number" inputMode="numeric" value={project.total}
            onChange={(e) => {
              const total = parseFloat(e.target.value) || 0;
              const subtotal = Math.round(total / 1.1);
              onUpdate("total", total);
              onUpdate("subtotal", subtotal);
              onUpdate("tax", total - subtotal);
            }}
            className="w-36 rounded-lg border border-[var(--nu-primary)]/30 bg-[var(--nu-primary-bg)] px-2 py-1 text-right text-base font-bold text-[var(--nu-primary)] focus:border-[var(--nu-primary)] focus:outline-none" />
        </div>
        {/* この案件を確認ボタン */}
        <Link
          href="/new/projects"
          className="flex w-full items-center justify-center rounded-xl border border-[var(--nu-border)] bg-white py-2 text-xs font-bold text-slate-500 active:opacity-75"
        >
          この案件を確認
        </Link>
      </div>
    </div>
  );
}

// ─── メインページ ─────────────────────────────────────────────
export default function InvoicePage() {
  // モード
  const [isDemo, setIsDemo] = useState(false);

  // 案件データ（全元請分）
  const [allProjects, setAllProjects] = useState<InvoiceProject[]>([]);
  const [newProjectCount, setNewProjectCount] = useState(0);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [searchStarted, setSearchStarted] = useState(false);

  // キーワード検索
  const [searchKeyword, setSearchKeyword] = useState("");

  // 画面内メッセージ
  const [invoiceMsg, setInvoiceMsg] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

  // 請求情報
  const [invoiceNo] = useState("INV-0001");
  const [invoiceDate, setInvoiceDate] = useState("2026-05-30");
  const [selectedCustomerId, setSelectedCustomerId] = useState(CUSTOMERS[0].id);
  const [periodFrom, setPeriodFrom] = useState("2026-05-01");
  const [periodTo, setPeriodTo] = useState("2026-05-31");

  // 自社情報（事業者設定からlocalStorage経由で読み込む）
  const [companyInfo, setCompanyInfo] = useState<CompanyInfoState>(DEFAULT_COMPANY_INFO);

  // 振込先（事業者設定からlocalStorage経由で読み込む）
  const [bank, setBank] = useState<BankInfo>({
    bankName: "〇〇銀行",
    branchName: "〇〇支店",
    accountType: "普通",
    accountNumber: "1234567",
    accountHolder: "ヤマダ タロウ",
  });

  // テストモード確認 + demo時のみサンプル案件を読み込む
  useEffect(() => {
    const demo = getTestMode() === "demo";
    setIsDemo(demo);
    if (demo) setAllProjects(INITIAL_ALL_PROJECTS);
  }, []);

  // 事業者設定を共通ユーティリティから読み込む（genba_settings を直接参照しない）
  useEffect(() => {
    setCompanyInfo(getCompanyInfoForPdf());
    setBank(getBankSettings());
  }, []);

  // 備考（デモ初期値）
  const [invoiceNote, setInvoiceNote] = useState(
    "5月施工分の一括請求です。お振込み手数料はご負担ください。"
  );

  // 選択中の元請情報
  const selectedCustomer = useMemo(
    () => CUSTOMERS.find((c) => c.id === selectedCustomerId) ?? CUSTOMERS[0],
    [selectedCustomerId]
  );

  // 元請変更時：支払期日などを自動セット
  function handleCustomerChange(customerId: string) {
    setSelectedCustomerId(customerId);
  }

  // 選択元請に絞った案件リスト（キーワード含む検索）
  const filteredProjects = useMemo(() => {
    const byCustomer = allProjects.filter((p) => p.customerId === selectedCustomerId);
    if (!searchKeyword.trim()) return byCustomer;
    return byCustomer.filter((p) =>
      matchesKeyword(
        [p.projectName, p.siteAddress, p.workSummary, p.completedAt, p.total],
        searchKeyword
      )
    );
  }, [allProjects, selectedCustomerId, searchKeyword]);

  // 案件操作
  function toggleProject(id: string) {
    setAllProjects((prev) => prev.map((p) => p.id === id ? { ...p, included: !p.included } : p));
  }
  function updateProject(id: string, field: keyof InvoiceProject, value: string | number) {
    setAllProjects((prev) => prev.map((p) => p.id === id ? { ...p, [field]: value } : p));
  }
  function addProject() {
    const n = newProjectCount + 1;
    setNewProjectCount(n);
    setAllProjects((prev) => [...prev, emptyProject(selectedCustomerId, n)]);
  }
  function removeProject(id: string) {
    setAllProjects((prev) => prev.filter((p) => p.id !== id));
  }

  // 集計（表示中かつチェック済み）
  const targets = filteredProjects.filter((p) => p.included);
  const subtotalSum = targets.reduce((acc, p) => acc + p.subtotal, 0);
  // TODO(税区分): 一括請求は案件単位の集計（各案件 p.tax）で、明細単位の税区分は未対応。
  //   案件単位の税区分対応（taxBreakdown 連携）は今後。個別請求は案件請求画面で税区分対応済み。
  const taxSum = targets.reduce((acc, p) => acc + p.tax, 0);
  const totalWithTax = targets.reduce((acc, p) => acc + p.total, 0);

  // ── 一括請求書PDF 生成 ────────────────────────────────────────
  async function handleBulkInvoicePDF() {
    if (isPdfLoading) return;
    if (targets.length === 0) {
      setInvoiceMsg("請求対象案件がありません。請求対象にチェックを入れてください。");
      setTimeout(() => setInvoiceMsg(""), 4000);
      return;
    }
    setIsPdfLoading(true);
    try {
      const { pdf } = await import('@react-pdf/renderer');
      const { makeBulkInvoicePDF } = await import('@/app/projects/sample/invoice/BulkInvoicePDF');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const element: any = makeBulkInvoicePDF({
        invoiceNo,
        invoiceDate,
        periodFrom,
        periodTo,
        customer: selectedCustomer,
        projects: targets.map((p) => ({
          projectName: p.projectName,
          siteAddress: p.siteAddress,
          workSummary: p.workSummary,
          completedAt: p.completedAt,
          subtotal: p.subtotal,
          tax: p.tax,
          total: p.total,
        })),
        subtotalSum,
        taxSum,
        totalWithTax,
        bank,
        invoiceNote,
        companyInfo: companyInfo,
      });
      const blob = await pdf(element).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = bulkInvoicePdfFileName({
        clientName:  selectedCustomer.name,
        periodFrom:  periodFrom,
        invoiceDate: invoiceDate,
      });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF生成エラー:', err);
      setInvoiceMsg('PDFの生成に失敗しました。ネットワーク接続を確認してから再試行してください。');
      setTimeout(() => setInvoiceMsg(""), 6000);
    } finally {
      setIsPdfLoading(false);
    }
  }

  return (
    <div className="">
      <PageHeader title="一括請求書" subtitle="元請ごとにまとめて請求する" back="/new/invoices" />
      <div className="px-4 py-4">

        {/* ヘッダー */}

        {/* 請求情報カード */}
        <div className="mb-4 rounded-2xl border border-[var(--nu-border)] bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between border-b border-[var(--nu-border-soft)] pb-2">
            <span className="text-sm font-bold text-[var(--nu-text)]">請求情報</span>
            <span className="text-xs text-slate-400">{invoiceNo}</span>
          </div>

          {/* 説明文 */}
          <p className="mb-3 rounded-lg bg-[var(--nu-bg)] px-3 py-2 text-xs text-slate-500">
            請求先を選ぶと、その元請に紐づく請求対象案件だけを表示します。
          </p>

          <div className="space-y-3">
            {/* 請求先プルダウン */}
            <div>
              <label className={lbl}>請求先</label>
              <select
                value={selectedCustomerId}
                onChange={(e) => handleCustomerChange(e.target.value)}
                className={fs}
              >
                {CUSTOMERS.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* 選択した元請の自動表示 */}
            <div className="rounded-xl border border-[var(--nu-border-soft)] bg-[var(--nu-bg)] divide-y divide-[var(--nu-border-soft)]">
              <div className="flex items-start gap-2 px-3 py-2">
                <span className="w-20 shrink-0 text-xs text-slate-400 pt-0.5">請求先表示名</span>
                <span className="text-sm font-bold text-[var(--nu-text)]">{selectedCustomer.displayName}</span>
              </div>
              <div className="flex items-start gap-2 px-3 py-2">
                <span className="w-20 shrink-0 text-xs text-slate-400 pt-0.5">担当者</span>
                <span className="text-sm text-[var(--nu-text)]">{selectedCustomer.contactName}</span>
              </div>
              <div className="flex items-start gap-2 px-3 py-2">
                <span className="w-20 shrink-0 text-xs text-slate-400 pt-0.5">郵便番号</span>
                <span className="text-sm text-[var(--nu-text)]">{selectedCustomer.postalCode}</span>
              </div>
              <div className="flex items-start gap-2 px-3 py-2">
                <span className="w-20 shrink-0 text-xs text-slate-400 pt-0.5">住所</span>
                <span className="text-sm text-[var(--nu-text)]">{selectedCustomer.address}</span>
              </div>
              <div className="flex items-start gap-2 px-3 py-2">
                <span className="w-20 shrink-0 text-xs text-slate-400 pt-0.5">締日</span>
                <span className="text-sm text-[var(--nu-text)]">{selectedCustomer.closingDay}</span>
              </div>
              <div className="flex items-start gap-2 px-3 py-2">
                <span className="w-20 shrink-0 text-xs text-slate-400 pt-0.5">支払条件</span>
                <span className="text-sm text-[var(--nu-text)]">{selectedCustomer.paymentTerm}</span>
              </div>
              <div className="flex items-start gap-2 px-3 py-2">
                <span className="w-20 shrink-0 text-xs text-[var(--nu-primary)] font-bold pt-0.5">支払期日</span>
                <span className="text-sm font-bold text-[var(--nu-primary)]">
                  {selectedCustomer.dueDate.replace(/-/g, "/")}
                </span>
              </div>
            </div>

            {/* 対象期間・請求日 */}
            <div>
              <label className={lbl}>対象期間</label>
              <div className="flex items-center gap-2">
                <input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} className={fi} />
                <span className="shrink-0 text-xs text-slate-400">〜</span>
                <input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} className={fi} />
              </div>
            </div>
            <div>
              <label className={lbl}>請求日</label>
              <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={fi} />
            </div>
            {/* キーワード検索 */}
            <div>
              <label className={lbl}>案件キーワード検索（任意）</label>
              <input
                type="text"
                placeholder="案件名・現場住所・工事内容・金額など"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className={fi}
              />
            </div>
            {/* 検索開始ボタン */}
            <button type="button"
              onClick={() => setSearchStarted(true)}
              className="w-full rounded-xl bg-[var(--nu-primary)] py-2.5 text-sm font-bold text-white active:opacity-80">
              検索開始
            </button>
          </div>
        </div>

        {/* インラインメッセージ */}
        {invoiceMsg && (
          <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
            <p className="text-sm text-amber-700">{invoiceMsg}</p>
          </div>
        )}
        {saveMsg && (
          <div className="mb-4 rounded-xl bg-green-50 px-4 py-3 ring-1 ring-green-200">
            <p className="text-sm font-bold text-green-700">{saveMsg}</p>
          </div>
        )}

        {/* 請求対象案件（検索開始後のみ表示） */}
        {searchStarted && <section className="mb-4 space-y-3">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[var(--nu-text)]">請求対象案件</h2>
              <span className="rounded bg-[var(--nu-bg)] px-2 py-0.5 text-[10px] font-bold text-slate-600">
                {selectedCustomer.name}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              チェックした案件の税込金額を合計して請求金額を出します。
            </p>
          </div>

          {filteredProjects.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-[var(--nu-border)] py-8 text-center space-y-1">
              <p className="text-sm text-slate-500">
                {isDemo
                  ? "この元請の案件はまだありません"
                  : "一括請求する案件はまだありません。"}
              </p>
              {!isDemo && (
                <p className="text-sm text-slate-400">案件登録、または見積作成から始めてください。</p>
              )}
            </div>
          ) : (
            filteredProjects.map((project, index) => (
              <ProjectCard
                key={project.id} project={project} index={index}
                canDelete={filteredProjects.length > 1}
                onUpdate={(field, value) => updateProject(project.id, field, value)}
                onToggle={() => toggleProject(project.id)}
                onDelete={() => removeProject(project.id)}
              />
            ))
          )}

          <button type="button" onClick={addProject}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--nu-border)] py-3.5 text-sm font-bold text-slate-500 active:opacity-75">
            <span className="text-base leading-none">＋</span>
            案件行を追加
          </button>
        </section>}

        {/* 集計カード（検索開始後のみ表示） */}
        {searchStarted && <>
        <div className="mb-4 overflow-hidden rounded-2xl border border-[var(--nu-border)] bg-white shadow-sm">
          <div className="p-4">
            <h2 className="mb-3 text-sm font-bold text-[var(--nu-text)]">請求金額</h2>
            <div className="divide-y divide-[var(--nu-border-soft)] rounded-xl border border-[var(--nu-border-soft)]">
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-sm text-slate-500">対象案件数</span>
                <span className="text-sm font-bold text-[var(--nu-text)]">{targets.length}件</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-sm text-slate-500">小計合計</span>
                <span className="text-sm font-medium text-[var(--nu-text)]">{fmtYen(subtotalSum)}</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-sm text-slate-500">消費税合計</span>
                <span className="text-sm font-medium text-[var(--nu-text)]">{fmtYen(taxSum)}</span>
              </div>
              <div className="flex items-center justify-between rounded-b-xl bg-[var(--nu-primary-bg)] px-4 py-3">
                <div>
                  <p className="text-xs text-[var(--nu-primary)]">税込請求額</p>
                  <p className="text-[11px] text-[var(--nu-primary)]/70">
                    支払期日：{selectedCustomer.dueDate.replace(/-/g, "/")}
                  </p>
                </div>
                <span className="text-2xl font-bold text-[var(--nu-primary)]">{fmtYen(totalWithTax)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── 一括請求書確認プレビュー ── */}
        {/* TODO: 将来的に /invoices/bulk を作り、元請別・請求月別に一括請求書一覧を確認できるようにする。 */}
        <div className="mb-4 overflow-hidden rounded-2xl shadow-sm ring-2 ring-[var(--nu-primary)]/20">
          <div className="bg-[var(--nu-primary)] px-4 py-3">
            <h2 className="text-sm font-bold text-white">一括請求書確認プレビュー</h2>
            <p className="mt-0.5 text-xs text-amber-100">
              PDF出力前に、請求先・対象案件・請求額・振込先・備考を確認してください。
            </p>
          </div>
          <div className="bg-[var(--nu-primary-bg)] p-4 space-y-3">
            <ul className="space-y-2">
              {[
                { label: "請求先",   value: selectedCustomer.displayName },
                { label: "対象期間", value: `${periodFrom.replace(/-/g, "/")} 〜 ${periodTo.replace(/-/g, "/")}` },
                { label: "請求日",   value: invoiceDate.replace(/-/g, "/") },
                { label: "支払期日", value: selectedCustomer.dueDate.replace(/-/g, "/") },
                { label: "対象案件数", value: `${targets.length}件` },
              ].map((item) => (
                <li key={item.label} className="flex items-start gap-2 text-sm">
                  <span className="w-24 shrink-0 pt-0.5 text-xs text-slate-400">{item.label}</span>
                  <span className="text-[var(--nu-text)]">{item.value}</span>
                </li>
              ))}
            </ul>
            {/* 対象案件一覧 */}
            {targets.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-slate-600">対象案件一覧</p>
                {targets.map((p) => (
                  <div key={p.id} className="rounded-lg border border-[var(--nu-border)] bg-white px-3 py-2">
                    <p className="text-xs font-bold text-[var(--nu-text)]">{p.projectName}</p>
                    <p className="text-xs text-slate-500">{p.siteAddress}　完了：{p.completedAt.replace(/-/g, "/")}</p>
                    <p className="text-right text-xs font-bold text-[var(--nu-primary)]">{fmtYen(p.total)}</p>
                  </div>
                ))}
              </div>
            )}
            {/* 金額サマリー */}
            <div className="divide-y divide-[var(--nu-border-soft)] rounded-xl border border-[var(--nu-border)] bg-white">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-xs text-slate-500">小計合計</span>
                <span className="text-sm font-medium text-[var(--nu-text)]">{fmtYen(subtotalSum)}</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-xs text-slate-500">消費税合計</span>
                <span className="text-sm font-medium text-slate-600">{fmtYen(taxSum)}</span>
              </div>
              <div className="flex items-center justify-between rounded-b-xl bg-[var(--nu-primary-bg)] px-3 py-2.5">
                <span className="text-xs font-bold text-[var(--nu-primary)]">税込請求額</span>
                <span className="text-2xl font-bold text-[var(--nu-primary)]">{fmtYen(totalWithTax)}</span>
              </div>
            </div>
            {/* 振込先 */}
            <div className="rounded-xl border border-[var(--nu-border)] bg-white p-3">
              <p className="mb-1.5 text-xs font-bold text-slate-600">振込先</p>
              <p className="text-xs text-[var(--nu-text)] leading-relaxed">
                {bank.bankName}　{bank.branchName}　{bank.accountType}　{bank.accountNumber}　{bank.accountHolder}
              </p>
            </div>
            {invoiceNote && (
              <div className="rounded-xl border border-[var(--nu-border)] bg-white p-3">
                <p className="mb-1 text-xs font-bold text-slate-600">備考</p>
                <p className="text-xs text-[var(--nu-text)] leading-relaxed">{invoiceNote}</p>
              </div>
            )}
          </div>
        </div>
        </>}

        {/* ボタン群 */}
        <div className="space-y-3 pb-8">
          {!searchStarted && (
            <p className="py-4 text-center text-sm text-slate-400">
              請求先・対象期間・請求日を入力して「検索開始」を押してください。
            </p>
          )}
          <button
            type="button"
            onClick={handleBulkInvoicePDF}
            disabled={isPdfLoading || !searchStarted}
            className="w-full rounded-2xl bg-[var(--nu-primary)] py-3.5 text-white shadow-sm active:opacity-80 disabled:opacity-50"
          >
            <span className="block text-base font-bold">
              {isPdfLoading ? '生成中...' : '請求書PDFを作る'}
            </span>
            <span className="block mt-0.5 text-xs font-normal text-amber-100">
              {isPdfLoading ? 'フォント読み込み中（初回のみ時間がかかります）' : '得意先別 一括請求書'}
            </span>
          </button>
          <button type="button"
            onClick={() => { setSaveMsg("一括請求書を仮保存しました。次工程で保存機能を追加します。"); setTimeout(() => setSaveMsg(""), 4000); }}
            className="w-full rounded-2xl border border-[var(--nu-primary)] bg-white py-4 text-base font-bold text-[var(--nu-primary)] shadow-sm active:opacity-80">
            仮保存
          </button>
          <Link href="/new/invoices/unbilled"
            className="flex w-full items-center justify-center rounded-2xl border border-[var(--nu-border)] bg-white py-4 text-base font-bold text-slate-600 shadow-sm active:opacity-80">
            一括請求書一覧確認
          </Link>
          <Link href="/new/projects"
            className="flex w-full items-center justify-center rounded-2xl border border-[var(--nu-border)] bg-white py-4 text-base font-bold text-slate-500 shadow-sm active:opacity-80">
            案件詳細へ戻る
          </Link>
          <div className="flex justify-end pt-1">
          </div>
        </div>

      </div>
    </div>
  );
}
