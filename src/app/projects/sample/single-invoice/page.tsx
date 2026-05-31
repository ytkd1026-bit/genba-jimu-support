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

const SETTINGS_STORAGE_KEY = "genba_settings";

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

// ─── 案件検索用仮データ ───────────────────────────────────────
const SEARCH_PROJECTS: SearchableProject[] = [
  {
    id: "sp1", date: "2026/05/20",
    projectName: "〇〇マンション クロス貼替", clientName: "△△工務店",
    siteAddress: "大阪府堺市〇〇区", workContent: "洋室クロス貼替・洗面所CF貼替",
    completedAt: "2026-05-20", totalAmount: 105600,
  },
  {
    id: "sp2", date: "2026/06/05",
    projectName: "□□店舗 床補修", clientName: "□□リフォーム",
    siteAddress: "大阪府大阪市□□区", workContent: "店舗床補修",
    completedAt: "2026-06-05", totalAmount: 88000,
  },
  {
    id: "sp3", date: "2026/06/10",
    projectName: "◇◇マンション 雑工事", clientName: "〇〇建設",
    siteAddress: "大阪府堺市□□区", workContent: "雑工事一式",
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

  // 事業者設定を localStorage から読み込む
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      const rep = saved.representative ? `代表　${saved.representative}` : DEFAULT_COMPANY.representative;
      setCompanyInfo({
        name:           saved.businessName   ?? DEFAULT_COMPANY.name,
        postalCode:     saved.postalCode     ?? DEFAULT_COMPANY.postalCode,
        address:        saved.address        ?? DEFAULT_COMPANY.address,
        representative: rep,
        tel:            saved.tel            ?? DEFAULT_COMPANY.tel,
        email:          saved.email          ?? DEFAULT_COMPANY.email,
        invoiceNumber:  saved.invoiceNumber  ?? DEFAULT_COMPANY.invoiceNumber,
      });
      setBank({
        bankName:      saved.bankName      ?? DEFAULT_BANK.bankName,
        branchName:    saved.branchName    ?? DEFAULT_BANK.branchName,
        accountType:   saved.accountType   ?? DEFAULT_BANK.accountType,
        accountNumber: saved.accountNumber ?? DEFAULT_BANK.accountNumber,
        accountHolder: saved.accountHolder ?? DEFAULT_BANK.accountHolder,
      });
    } catch { /* デフォルト値のまま */ }
  }, []);

  // 金額計算（固定明細）
  const subtotalSum  = INVOICE_LINES.reduce((s, l) => s + toNum(l.unitPrice) * toNum(l.qty), 0);
  const taxSum       = Math.floor(subtotalSum * 0.1);
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
    clientName:  "△△工務店",
    siteAddress: "大阪府堺市〇〇区",
    workContent: "洋室クロス貼替・洗面所CF貼替",
    completedAt: "2026-05-20",
  };
  const displayClientName = displayProject.clientName + " 御中";

  // PDF 生成
  async function handlePDF() {
    if (isPdfLoading) return;
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
            <button type="button" onClick={handlePDF} disabled={isPdfLoading}
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
