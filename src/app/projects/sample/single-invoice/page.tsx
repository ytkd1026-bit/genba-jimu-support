"use client";

// TODO: Supabase連携後、single_invoices テーブルに保存する
// TODO: projects の請求状態と連動する
// TODO: 月次収支報告の売上一覧へ反映する
// TODO: 入金予定日を schedule_events に反映する
// TODO: 事業者設定は company_settings から取得する
// TODO: 将来的に /invoices/single を作り、単体請求書一覧専用ページにする。

import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import { singleInvoicePdfFileName } from "@/app/utils/pdfFileName";
import { getTestMode } from "@/app/utils/testMode";
import { matchesKeyword } from "@/app/utils/search";
import { draftKey } from "@/app/utils/draftStorage";
import { upsertInvoice, getSavedInvoices } from "@/app/utils/savedInvoices";
import { useAutoDraft } from "@/hooks/useAutoDraft";
import { SaveStatusBar } from "@/components/SaveStatusBar";
import { getCompanyInfoForPdf, getBankSettings } from "@/app/utils/companySettings";
import { simpleTaxAmount } from "@/app/utils/taxCalculation";

// ─── 型定義 ──────────────────────────────────────────────────
type CompanyInfo = {
  name: string; postalCode: string; address: string;
  representative: string; tel: string; email: string; invoiceNumber: string;
};
type BankInfo = {
  bankName: string; branchName: string; accountType: string;
  accountNumber: string; accountHolder: string;
};
type InvoiceLine = {
  id: number; category: string; koujiName: string; koujiContent: string;
  location: string; qty: string; unit: string; unitPrice: number; note: string;
};
type SearchableProject = {
  id: string; date: string; projectName: string; clientName: string;
  siteAddress: string; workContent: string; completedAt: string; totalAmount: number;
};

// ─── デフォルト値 ─────────────────────────────────────────────
const DEFAULT_COMPANY: CompanyInfo = {
  name: "REVO", postalCode: "〒590-0000", address: "大阪府堺市〇〇区〇〇町",
  representative: "代表　山田 太郎", tel: "090-0000-0000",
  email: "example@example.com", invoiceNumber: "T0000000000000",
};
const DEFAULT_BANK: BankInfo = {
  bankName: "〇〇銀行", branchName: "〇〇支店", accountType: "普通",
  accountNumber: "1234567", accountHolder: "ヤマダ タロウ",
};
const INVOICE_NO = "INV-S-0001";

// ─── 自動下書き保存設定 ────────────────────────────────────────
const INVOICE_DRAFT_KEY = draftKey('invoice', 'new');

// 保存対象フィールドの根拠：
//   invoiceDate / dueDate / selectedProjectId → ユーザーが画面で変更できる
//   note        → const（編集不可）なので保存不要
//   bank        → genba_settings から読み込む固定値。編集不可なので保存不要
//   companyInfo → 同上
//   invoiceItems (INVOICE_LINES) → ページ内定数。編集不可なので保存不要
//   subtotal/tax/total → INVOICE_LINES から計算。編集不可なので保存不要
type InvoiceDraftData = {
  invoiceId?: string;
  invoiceDate: string;
  dueDate: string;
  selectedProjectId?: string;
};

// ─── 案件検索用仮データ ───────────────────────────────────────
// 注：PDFフォント（Noto Sans JP）は△□◇等の記号グリフを収録していないため、
//     プレースホルダー文言には「〇〇」を使用する（文字化け防止）
const SEARCH_PROJECTS: SearchableProject[] = [
  {
    id: "sp1", date: "2026/05/20",
    projectName: "〇〇マンション クロス貼替", clientName: "〇〇工務店",
    siteAddress: "大阪府堺市〇〇区", workContent: "洋室クロス貼替・洗面所CF貼替",
    completedAt: "2026-05-20", totalAmount: 105600,
  },
  {
    id: "sp2", date: "2026/06/05",
    projectName: "〇〇店舗 床補修", clientName: "〇〇リフォーム",
    siteAddress: "大阪府大阪市〇〇区", workContent: "店舗床補修",
    completedAt: "2026-06-05", totalAmount: 88000,
  },
  {
    id: "sp3", date: "2026/06/10",
    projectName: "〇〇マンション 雑工事", clientName: "〇〇建設",
    siteAddress: "大阪府堺市〇〇区", workContent: "雑工事一式",
    completedAt: "2026-06-10", totalAmount: 22000,
  },
];

// ─── 請求明細（内部保持・PDF用） ─────────────────────────────
const INVOICE_LINES: InvoiceLine[] = [
  {
    id: 1, category: "内装工事", koujiName: "クロス貼替",
    koujiContent: "既存クロスめくり・下地処理・新規クロス貼り",
    location: "洋室 / 壁", qty: "50", unit: "m", unitPrice: 1200, note: "",
  },
  {
    id: 2, category: "床工事", koujiName: "CF貼替",
    koujiContent: "既存CF撤去・下地調整・新規CF貼り",
    location: "洗面所 / 床", qty: "8", unit: "㎡", unitPrice: 3500, note: "",
  },
  {
    id: 3, category: "諸経費", koujiName: "諸経費",
    koujiContent: "駐車場代・交通費・廃材処分費",
    location: "現場全体 / 共通", qty: "1", unit: "式", unitPrice: 8000, note: "",
  },
];

function toNum(v: string | number): number {
  const n = typeof v === "number" ? v : parseFloat(v);
  return isNaN(n) ? 0 : n;
}
function fmtYen(n: number): string { return "¥" + n.toLocaleString("ja-JP"); }

const searchInputCls = "w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-800 placeholder:text-stone-300 focus:border-[#8B4A3C] focus:outline-none focus:ring-1 focus:ring-[#8B4A3C]/30";
const inputCls = "w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-800 focus:border-[#8B4A3C] focus:outline-none focus:ring-1 focus:ring-[#8B4A3C]/20";

export default function SingleInvoicePage() {
  // 案件検索
  const [searchDate,    setSearchDate]    = useState("");
  const [searchProject, setSearchProject] = useState("");
  const [searchClient,  setSearchClient]  = useState("");
  const [hasSearched,   setHasSearched]   = useState(false);
  const [selectedProject, setSelectedProject] = useState<SearchableProject | null>(null);

  // 請求設定（PDF生成に使用・UIには非表示）
  const [invoiceDate, setInvoiceDate] = useState("2026-06-30");
  const [dueDate,     setDueDate]     = useState("2026-07-31");
  const [note] = useState("お振込み手数料はご負担ください。ご確認よろしくお願いいたします。");
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [companyInfo,  setCompanyInfo]  = useState<CompanyInfo>(DEFAULT_COMPANY);
  const [bank,         setBank]         = useState<BankInfo>(DEFAULT_BANK);
  const [saveMsg,      setSaveMsg]      = useState("");

  // ── 自動下書き保存関連 state ──────────────────────────────────
  const [isDemoMode,         setIsDemoMode]         = useState<boolean | null>(null);
  const [showRestoreBanner,  setShowRestoreBanner]  = useState(false);
  const [currentInvoiceId,   setCurrentInvoiceId]   = useState<string | null>(null);
  const [invoicePdfSaveStatus, setInvoicePdfSaveStatus] = useState<null | 'saving' | 'saved' | 'failed'>(null);

  const draftData = useMemo<InvoiceDraftData>(() => ({
    invoiceId: currentInvoiceId ?? undefined,
    invoiceDate,
    dueDate,
    selectedProjectId: selectedProject?.id,
  }), [currentInvoiceId, invoiceDate, dueDate, selectedProject?.id]);

  const autoDraftEnabled = isDemoMode === false;
  const { saveStatus, savedAt, clearDraft, restoredDraft } = useAutoDraft<InvoiceDraftData>(
    INVOICE_DRAFT_KEY, 'invoice', 'new', draftData,
    { enabled: autoDraftEnabled, debounceMs: 800 },
  );

  // デモモード検知・下書き復元バナー・beforeunload
  useEffect(() => { setIsDemoMode(getTestMode() === 'demo'); }, []);

  useEffect(() => {
    if (isDemoMode !== false || !restoredDraft) return;
    setShowRestoreBanner(true);
  }, [isDemoMode, restoredDraft]);

  useEffect(() => {
    if (!autoDraftEnabled) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (saveStatus === 'dirty') { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saveStatus, autoDraftEnabled]);

  function handleRestoreInvoiceDraft() {
    if (!restoredDraft) return;
    const d = restoredDraft.data;
    if (d.invoiceId) setCurrentInvoiceId(d.invoiceId);
    setInvoiceDate(d.invoiceDate);
    setDueDate(d.dueDate);
    if (d.selectedProjectId) {
      const found = SEARCH_PROJECTS.find((p) => p.id === d.selectedProjectId);
      if (found) setSelectedProject(found);
    }
    setShowRestoreBanner(false);
  }

  function handleDiscardInvoiceDraft() {
    clearDraft();
    setShowRestoreBanner(false);
  }

  async function saveBeforeInvoicePdf(): Promise<boolean> {
    if (invoicePdfSaveStatus === 'saving' || isPdfLoading) return false;
    setInvoicePdfSaveStatus('saving');
    try {
      const now = new Date().toLocaleString('ja-JP');
      const id = currentInvoiceId ?? `inv-${Date.now()}`;
      const existing = currentInvoiceId
        ? getSavedInvoices().find((e) => e.id === currentInvoiceId)
        : null;
      upsertInvoice({
        id,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        invoiceNo: existing?.invoiceNo ?? INVOICE_NO,
        projectId: selectedProject?.id,
        projectName: displayProject.projectName,
        clientName: displayProject.clientName,
        invoiceDate,
        dueDate,
        subtotal: subtotalSum,
        tax: taxSum,
        total: totalWithTax,
        status: 'draft',
        memo: note,
      });
      setCurrentInvoiceId(id);
      clearDraft();
      setInvoicePdfSaveStatus('saved');
      return true;
    } catch (err) {
      console.error('請求書PDF発行前保存エラー:', err);
      alert('保存に失敗しました。PDFは発行していません。入力内容は下書きとして残っています。');
      setInvoicePdfSaveStatus('failed');
      return false;
    }
  }

  // 事業者設定を共通ユーティリティから読み込む（genba_settings を直接参照しない）
  useEffect(() => {
    setCompanyInfo(getCompanyInfoForPdf());
    setBank(getBankSettings());
  }, []);

  // 金額計算（固定明細）
  const subtotalSum  = INVOICE_LINES.reduce((s, l) => s + toNum(l.unitPrice) * toNum(l.qty), 0);
  // TODO(税区分): この単体請求フローは INVOICE_LINES（税区分なし）を全額課税10%で計算する。
  //   税区分・税率対応は案件請求 /projects/[projectId]/invoice（WorkItem＋共通税計算）に実装済み。
  const taxSum       = simpleTaxAmount(subtotalSum);
  const totalWithTax = subtotalSum + taxSum;

  // 検索結果（ボタン押下後のみ表示）
  const filteredProjects = useMemo(() => {
    if (!hasSearched) return [];
    const source = getTestMode() === "demo" ? SEARCH_PROJECTS : [];
    return source.filter((p) => {
      const md = searchDate    === "" || p.date.includes(searchDate.replace(/-/g, "/"));
      const mp = searchProject === "" || matchesKeyword([p.projectName, p.siteAddress, p.workContent], searchProject);
      const mc = searchClient  === "" || matchesKeyword([p.clientName], searchClient);
      return md && mp && mc;
    });
  }, [hasSearched, searchDate, searchProject, searchClient]);

  // 表示用の案件情報
  const displayProject = selectedProject ?? {
    projectName: "〇〇マンション クロス貼替",
    clientName:  "〇〇工務店",
    siteAddress: "大阪府堺市〇〇区",
    workContent: "洋室クロス貼替・洗面所CF貼替",
    completedAt: "2026-05-20",
  };
  const displayClientName = displayProject.clientName + " 御中";

  // PDF 生成（発行前に本保存）
  async function handlePDF() {
    if (isPdfLoading || invoicePdfSaveStatus === 'saving') return;
    const saved = await saveBeforeInvoicePdf();
    if (!saved) return;
    setIsPdfLoading(true);
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const { makeSingleInvoicePDF } = await import("./SingleInvoicePDF");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const element: any = makeSingleInvoicePDF({
        invoiceNo: INVOICE_NO,
        invoiceDate,
        dueDate,
        customer: {
          displayName: displayClientName,
          contactName: "山田様",
          closingDay:  "都度請求",
          paymentTerm: "翌月末払い",
        },
        project: {
          projectName: displayProject.projectName,
          siteAddress: displayProject.siteAddress,
          workContent: displayProject.workContent,
          completedAt: displayProject.completedAt,
        },
        lines: INVOICE_LINES.map((l) => ({
          category: l.category, koujiName: l.koujiName, koujiContent: l.koujiContent,
          location: l.location, qty: l.qty, unit: l.unit, unitPrice: l.unitPrice, note: l.note,
        })),
        subtotalSum, taxSum, totalWithTax,
        bank, invoiceNote: note, companyInfo,
      });
      const blob = await pdf(element).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = singleInvoicePdfFileName({
        clientName:  displayProject.clientName,
        projectName: displayProject.projectName,
        workContent: displayProject.workContent,
        invoiceDate,
      });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setInvoicePdfSaveStatus(null);
    } catch (err) {
      console.error("PDF生成エラー:", err);
      alert("PDFの生成に失敗しました。ネットワーク接続を確認してから再試行してください。");
    } finally {
      setIsPdfLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        <header className="mb-4">
          <Link href="/invoices" className="mb-3 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← 請求書関係へ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">単体請求書作成</h1>
          <p className="mt-1 text-sm text-stone-500">この案件だけの請求書を作成します。</p>
        </header>

        {/* ── この画面でできること ── */}
        <div className="mb-4 rounded-2xl border border-[#8B4A3C]/15 bg-[#fff8f5] p-4 shadow-sm">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#8B4A3C]">
            <span>💡</span>この画面でできること
          </p>
          <p className="text-sm leading-relaxed text-stone-700">
            この画面では、1件の案件に対する請求書を作れます。<br />
            入力内容は自動で下書き保存されます。<br />
            PDFを作る前に請求書データを保存します。
          </p>
        </div>

        {/* ── 自動下書き保存ステータスバー ── */}
        <SaveStatusBar status={saveStatus} savedAt={savedAt} />

        {/* ── 下書き復元バナー ── */}
        {showRestoreBanner && restoredDraft && (
          <div className="mb-4 overflow-hidden rounded-2xl border border-amber-300 bg-amber-50 shadow-sm">
            <div className="border-b border-amber-200 bg-amber-100 px-4 py-2.5">
              <p className="text-sm font-bold text-amber-800">前回入力途中の下書きがあります</p>
            </div>
            <div className="space-y-2 px-4 py-3">
              <p className="text-xs text-amber-700">
                最終更新：{new Date(restoredDraft.updatedAt).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={handleRestoreInvoiceDraft}
                  className="flex-1 rounded-xl bg-amber-600 py-2.5 text-sm font-bold text-white active:opacity-80">
                  下書きを復元する
                </button>
                <button type="button" onClick={handleDiscardInvoiceDraft}
                  className="flex-1 rounded-xl border border-amber-300 bg-white py-2.5 text-sm font-bold text-amber-700 active:opacity-80">
                  破棄して新しく作る
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">

          {/* ── 1. 案件検索 ── */}
          <div className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
            <h2 className="border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">案件検索</h2>

            {/* 選択中バナー */}
            {selectedProject && (
              <div className="flex items-center justify-between rounded-xl bg-[#8B4A3C]/10 px-3 py-2.5">
                <div>
                  <p className="text-[10px] font-bold text-[#8B4A3C]">選択中の案件</p>
                  <p className="text-sm font-bold text-stone-800">{selectedProject.projectName}</p>
                  <p className="text-xs text-stone-500">{selectedProject.clientName}</p>
                </div>
                <button type="button" onClick={() => setSelectedProject(null)}
                  className="ml-2 shrink-0 rounded-lg bg-white px-2 py-1 text-xs font-bold text-stone-500 active:opacity-70">
                  解除
                </button>
              </div>
            )}

            <div className="space-y-2">
              <input type="date" value={searchDate} onChange={(e) => setSearchDate(e.target.value)} className={searchInputCls} />
              <input type="text" placeholder="案件名で検索" value={searchProject}
                onChange={(e) => setSearchProject(e.target.value)} className={searchInputCls} />
              <input type="text" placeholder="元請名で検索" value={searchClient}
                onChange={(e) => setSearchClient(e.target.value)} className={searchInputCls} />
              <button type="button"
                onClick={() => setHasSearched(true)}
                className="w-full rounded-xl bg-[#8B4A3C] py-2.5 text-sm font-bold text-white active:opacity-80">
                検索
              </button>
            </div>

            {/* 検索結果 */}
            {hasSearched && (
              <div className="space-y-2">
                {filteredProjects.length === 0 ? (
                  <p className="py-2 text-center text-xs text-stone-400">該当する案件はありません。</p>
                ) : (
                  filteredProjects.map((p) => (
                    <div key={p.id} className="rounded-xl border border-stone-100 bg-stone-50 p-3 space-y-1.5">
                      <div>
                        <p className="text-xs text-stone-400">{p.date}　{p.clientName}</p>
                        <p className="text-sm font-bold text-stone-800 leading-tight">{p.projectName}</p>
                        <p className="text-xs text-stone-500">{p.siteAddress}</p>
                        <p className="text-xs text-stone-400">{p.workContent}</p>
                        <p className="text-xs text-stone-400">完了日：{p.completedAt.replace(/-/g, "/")}</p>
                        <p className="mt-1 text-sm font-bold text-[#8B4A3C]">{fmtYen(p.totalAmount)}</p>
                      </div>
                      <button type="button"
                        onClick={() => {
                          setSelectedProject(p);
                          setHasSearched(false);
                          setSearchDate(""); setSearchProject(""); setSearchClient("");
                        }}
                        className="w-full rounded-xl bg-[#8B4A3C] py-2 text-sm font-bold text-white active:opacity-80">
                        この案件で請求書を作る
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {!hasSearched && !selectedProject && (
              <p className="py-1 text-center text-xs text-stone-400">
                日付・案件名・元請名を入力して検索してください。
              </p>
            )}
          </div>

          {/* ── 2. 請求日・支払期日（コンパクト編集） ── */}
          <div className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
            <h2 className="border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">請求日設定</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-stone-400">請求日</label>
                <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-stone-400">支払期日</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
              </div>
            </div>
          </div>

          {/* ── 3. 請求書確認プレビュー ── */}
          <div className="overflow-hidden rounded-2xl shadow-sm ring-2 ring-[#8B4A3C]/20">
            <div className="bg-[#8B4A3C] px-4 py-3">
              <h2 className="text-sm font-bold text-white">請求書確認プレビュー</h2>
              <p className="mt-0.5 text-xs text-amber-100">
                PDF出力前に、請求先・請求額・振込先を確認してください。
              </p>
            </div>
            <div className="bg-[#fff8f5] p-4 space-y-3">
              {!selectedProject && (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  上の案件検索から案件を選択すると、請求先情報が自動で反映されます。
                </p>
              )}
              <ul className="space-y-2">
                {[
                  { label: "請求先",   value: displayClientName },
                  { label: "案件名",   value: displayProject.projectName },
                  { label: "現場住所", value: displayProject.siteAddress },
                  { label: "工事内容", value: displayProject.workContent },
                  { label: "完了日",   value: displayProject.completedAt.replace(/-/g, "/") },
                  { label: "請求日",   value: invoiceDate.replace(/-/g, "/") },
                  { label: "支払期日", value: dueDate.replace(/-/g, "/") },
                ].map((item) => (
                  <li key={item.label} className="flex items-start gap-2 text-sm">
                    <span className="w-20 shrink-0 pt-0.5 text-xs text-stone-400">{item.label}</span>
                    <span className="text-stone-800">{item.value}</span>
                  </li>
                ))}
              </ul>
              <div className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-xs text-stone-500">小計</span>
                  <span className="text-sm font-medium text-stone-800">{fmtYen(subtotalSum)}</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-xs text-stone-500">消費税（10%）</span>
                  <span className="text-sm font-medium text-stone-600">{fmtYen(taxSum)}</span>
                </div>
                <div className="flex items-center justify-between rounded-b-xl bg-[#fdf0ec] px-3 py-2.5">
                  <span className="text-xs font-bold text-[#8B4A3C]">税込請求額</span>
                  <span className="text-2xl font-bold text-[#8B4A3C]">{fmtYen(totalWithTax)}</span>
                </div>
              </div>
              <div className="rounded-xl border border-stone-200 bg-white p-3">
                <p className="mb-1.5 text-xs font-bold text-stone-600">振込先</p>
                <p className="text-xs text-stone-700 leading-relaxed">
                  {bank.bankName}　{bank.branchName}　{bank.accountType}　{bank.accountNumber}　{bank.accountHolder}
                </p>
              </div>
            </div>
          </div>

          {/* ── 4. ボタン4種類 ── */}
          <div className="space-y-3 pb-8 pt-1">
            {invoicePdfSaveStatus === 'saving' && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                <p className="text-sm font-bold text-blue-700">PDF発行前に請求書を保存しています...</p>
              </div>
            )}
            {invoicePdfSaveStatus === 'failed' && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm font-bold text-red-700">保存に失敗しました。PDFは発行していません。</p>
              </div>
            )}
            <button type="button" onClick={handlePDF}
              disabled={isPdfLoading || invoicePdfSaveStatus === 'saving'}
              className="w-full rounded-2xl bg-[#8B4A3C] py-3.5 text-white shadow-sm active:opacity-80 disabled:opacity-50">
              <span className="block text-base font-bold">
                {isPdfLoading ? "生成中..." : "請求書PDFを作る"}
              </span>
              <span className="block mt-0.5 text-xs font-normal text-amber-100">
                {isPdfLoading ? "フォント読み込み中（初回のみ時間がかかります）" : "単体請求書 · 原価非表示"}
              </span>
            </button>
            <button type="button"
              onClick={() => { setSaveMsg("単体請求書を仮保存しました。次工程で保存機能を追加します。"); setTimeout(() => setSaveMsg(""), 4000); }}
              className="w-full rounded-2xl border border-[#8B4A3C] bg-white py-4 text-base font-bold text-[#8B4A3C] shadow-sm active:opacity-80">
              仮保存
            </button>
            {saveMsg && (
              <div className="rounded-xl bg-green-50 px-4 py-3 ring-1 ring-green-200">
                <p className="text-sm font-bold text-green-700">{saveMsg}</p>
              </div>
            )}
            <Link href="/invoices/unbilled"
              className="flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-white py-4 text-base font-bold text-stone-600 shadow-sm active:opacity-80">
              単体請求書一覧確認
            </Link>
            <Link href="/projects/sample"
              className="flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-white py-3 text-sm font-bold text-stone-400 shadow-sm active:opacity-80">
              案件詳細へ戻る
            </Link>
            <div className="flex justify-end pt-1">
              <Link href="/test-feedback" className="text-xs text-stone-400 underline underline-offset-2 hover:text-[#8B4A3C]">
                この画面の感想を書く
              </Link>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
