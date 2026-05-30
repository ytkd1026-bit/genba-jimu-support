"use client";

// TODO: Supabase連携後、single_invoices テーブルに保存する
// TODO: projects の請求状態と連動する
// TODO: 月次収支報告の売上一覧へ反映する
// TODO: 入金予定日を schedule_events に反映する
// TODO: 事業者設定は company_settings から取得する

import Link from "next/link";
import { useState, useEffect } from "react";
import { singleInvoicePdfFileName } from "@/app/utils/pdfFileName";

// 事業者設定との共通キー
const SETTINGS_STORAGE_KEY = "genba_settings";

// ─── 型定義 ──────────────────────────────────────────────────
type CompanyInfo = {
  name: string;
  postalCode: string;
  address: string;
  representative: string;
  tel: string;
  email: string;
  invoiceNumber: string;
};

type BankInfo = {
  bankName: string;
  branchName: string;
  accountType: string;
  accountNumber: string;
  accountHolder: string;
};

type InvoiceLine = {
  id: number;
  category: string;
  koujiName: string;
  koujiContent: string;
  location: string;
  qty: string;
  unit: string;
  unitPrice: number;
  note: string;
};

// ─── デフォルト値 ────────────────────────────────────────────
const DEFAULT_COMPANY: CompanyInfo = {
  name:           "REVO",
  postalCode:     "〒590-0000",
  address:        "大阪府堺市〇〇区〇〇町",
  representative: "代表　山田 太郎",
  tel:            "090-0000-0000",
  email:          "example@example.com",
  invoiceNumber:  "T0000000000000",
};

const DEFAULT_BANK: BankInfo = {
  bankName:      "〇〇銀行",
  branchName:    "〇〇支店",
  accountType:   "普通",
  accountNumber: "1234567",
  accountHolder: "ヤマダ タロウ",
};

// ─── 仮データ ─────────────────────────────────────────────────
const INVOICE_NO = "INV-S-0001";

const CUSTOMER = {
  displayName: "△△工務店 御中",
  contactName: "山田様",
  closingDay:  "都度請求",
};

const PROJECT = {
  projectName:  "〇〇マンション クロス貼替",
  siteAddress:  "大阪府堺市〇〇区",
  workContent:  "洋室クロス貼替・洗面所CF貼替",
  completedAt:  "2026-05-20",
};

const INITIAL_LINES: InvoiceLine[] = [
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

// ─── ユーティリティ ───────────────────────────────────────────
function toNum(v: string | number): number {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isNaN(n) ? 0 : n;
}
function fmtYen(n: number): string {
  return "¥" + n.toLocaleString("ja-JP");
}

// ─── スタイル定数 ─────────────────────────────────────────────
const inputCls =
  "w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-base text-stone-800 placeholder:text-stone-300 focus:border-[#8B4A3C] focus:outline-none focus:ring-2 focus:ring-[#8B4A3C]/20";
const labelCls = "mb-1 block text-sm font-bold text-stone-700";
const lbl = "mb-0.5 block text-xs text-stone-400";

// ─── コンポーネント ───────────────────────────────────────────
export default function SingleInvoicePage() {
  const [invoiceDate,  setInvoiceDate]  = useState("2026-06-30");
  const [dueDate,      setDueDate]      = useState("2026-07-31");
  const [paymentTerm,  setPaymentTerm]  = useState("翌月末払い");
  const [note,         setNote]         = useState(
    "お振込み手数料はご負担ください。ご確認よろしくお願いいたします。"
  );
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [companyInfo,  setCompanyInfo]  = useState<CompanyInfo>(DEFAULT_COMPANY);
  const [bank,         setBank]         = useState<BankInfo>(DEFAULT_BANK);

  // 事業者設定を localStorage から読み込む
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      const rep = saved.representative
        ? `代表　${saved.representative}`
        : DEFAULT_COMPANY.representative;
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
    } catch {
      // 読み込み失敗時はデフォルト値のまま
    }
  }, []);

  // 金額計算
  const subtotalSum  = INITIAL_LINES.reduce((s, l) => s + toNum(l.unitPrice) * toNum(l.qty), 0);
  const taxSum       = Math.floor(subtotalSum * 0.1);
  const totalWithTax = subtotalSum + taxSum;

  // PDF 生成
  async function handlePDF() {
    if (isPdfLoading) return;
    setIsPdfLoading(true);
    try {
      const { pdf } = await import('@react-pdf/renderer');
      const { makeSingleInvoicePDF } = await import('./SingleInvoicePDF');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const element: any = makeSingleInvoicePDF({
        invoiceNo: INVOICE_NO,
        invoiceDate,
        dueDate,
        customer: {
          displayName: CUSTOMER.displayName,
          contactName: CUSTOMER.contactName,
          closingDay:  CUSTOMER.closingDay,
          paymentTerm,
        },
        project: {
          projectName: PROJECT.projectName,
          siteAddress: PROJECT.siteAddress,
          workContent: PROJECT.workContent,
          completedAt: PROJECT.completedAt,
        },
        lines: INITIAL_LINES.map((l) => ({
          category:    l.category,
          koujiName:   l.koujiName,
          koujiContent: l.koujiContent,
          location:    l.location,
          qty:         l.qty,
          unit:        l.unit,
          unitPrice:   l.unitPrice,
          note:        l.note,
        })),
        subtotalSum,
        taxSum,
        totalWithTax,
        bank,
        invoiceNote: note,
        companyInfo,
      });
      const blob = await pdf(element).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = singleInvoicePdfFileName({
        clientName:  "△△工務店",
        projectName: PROJECT.projectName,
        workContent: PROJECT.workContent,
        invoiceDate,
      });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF生成エラー:', err);
      alert('PDFの生成に失敗しました。ネットワーク接続を確認してから再試行してください。');
    } finally {
      setIsPdfLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        {/* ヘッダー */}
        <header className="mb-4">
          <Link
            href="/projects/sample"
            className="mb-3 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75"
          >
            ← 案件詳細へ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">単体請求書作成</h1>
          <p className="mt-1 text-sm text-stone-500">
            この案件だけの請求書を作成します。
          </p>
        </header>

        <div className="space-y-4">

          {/* ── 請求情報 ── */}
          <div className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-stone-100 pb-2">
              <h2 className="text-sm font-bold text-stone-700">請求情報</h2>
              <span className="text-xs text-stone-400">{INVOICE_NO}</span>
            </div>

            {/* 請求先（固定表示） */}
            <div className="rounded-xl border border-stone-100 bg-stone-50 divide-y divide-stone-100">
              <div className="flex items-start gap-2 px-3 py-2">
                <span className="w-20 shrink-0 text-xs text-stone-400 pt-0.5">請求先</span>
                <span className="text-sm font-bold text-stone-800">{CUSTOMER.displayName}</span>
              </div>
              <div className="flex items-start gap-2 px-3 py-2">
                <span className="w-20 shrink-0 text-xs text-stone-400 pt-0.5">担当者</span>
                <span className="text-sm text-stone-700">{CUSTOMER.contactName}</span>
              </div>
              <div className="flex items-start gap-2 px-3 py-2">
                <span className="w-20 shrink-0 text-xs text-stone-400 pt-0.5">締日</span>
                <span className="text-sm text-stone-700">{CUSTOMER.closingDay}</span>
              </div>
            </div>

            {/* 編集可能項目 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="invoiceDate" className={labelCls}>請求日</label>
                <input
                  id="invoiceDate" type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="dueDate" className={labelCls}>支払期日</label>
                <input
                  id="dueDate" type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <label htmlFor="paymentTerm" className={labelCls}>支払条件</label>
              <input
                id="paymentTerm" type="text"
                value={paymentTerm}
                onChange={(e) => setPaymentTerm(e.target.value)}
                placeholder="例：翌月末払い"
                className={inputCls}
              />
            </div>
          </div>

          {/* ── 案件情報 ── */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-3 border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">案件情報</h2>
            <div className="rounded-xl border border-stone-100 bg-stone-50 divide-y divide-stone-100">
              {[
                { label: "案件名",    value: PROJECT.projectName },
                { label: "現場住所",  value: PROJECT.siteAddress },
                { label: "工事内容",  value: PROJECT.workContent },
                { label: "完了日",    value: PROJECT.completedAt.replace(/-/g, '/') },
              ].map((item) => (
                <div key={item.label} className="flex items-start gap-2 px-3 py-2">
                  <span className="w-20 shrink-0 text-xs text-stone-400 pt-0.5">{item.label}</span>
                  <span className="text-sm text-stone-700">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── 請求明細 ── */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-3 border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">請求明細</h2>
            <div className="space-y-2.5">
              {INITIAL_LINES.map((line) => {
                const sub = toNum(line.unitPrice) * toNum(line.qty);
                const tax = Math.floor(sub * 0.1);
                return (
                  <div key={line.id} className="rounded-xl border border-stone-100 p-3">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">
                        {line.category}
                      </span>
                      <span className="text-sm font-bold text-stone-800">{line.koujiName}</span>
                    </div>
                    <p className="mb-1 text-xs text-stone-500">{line.koujiContent}</p>
                    <p className="mb-1.5 text-xs text-stone-400">{line.location}</p>
                    <div className="flex items-center justify-between text-xs text-stone-500">
                      <span>{line.qty} {line.unit} × {fmtYen(line.unitPrice)}</span>
                      <div className="text-right">
                        <span className="text-stone-600">小計：{fmtYen(sub)}</span>
                        <span className="mx-1 text-stone-300">|</span>
                        <span className="font-bold text-[#8B4A3C]">税込：{fmtYen(sub + tax)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── 請求金額 ── */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-3 border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">請求金額</h2>
            <div className="divide-y divide-stone-100 rounded-xl border border-stone-100">
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-sm text-stone-500">小計合計</span>
                <span className="text-sm font-medium text-stone-800">{fmtYen(subtotalSum)}</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-sm text-stone-500">消費税（10%）</span>
                <span className="text-sm font-medium text-stone-700">{fmtYen(taxSum)}</span>
              </div>
              <div className="flex items-center justify-between rounded-b-xl bg-[#fdf0ec] px-4 py-3">
                <p className="text-xs font-bold text-[#8B4A3C]">税込請求額</p>
                <span className="text-2xl font-bold text-[#8B4A3C]">{fmtYen(totalWithTax)}</span>
              </div>
            </div>
          </div>

          {/* ── 請求元情報（自社） ── */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-3 border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">
              請求元情報（自社）
            </h2>
            <div className="rounded-xl border border-stone-100 bg-stone-50 divide-y divide-stone-100">
              <div className="flex items-start gap-2 px-3 py-2">
                <span className="w-24 shrink-0 text-xs text-stone-400 pt-0.5">会社名</span>
                <span className="text-sm font-bold text-stone-800">{companyInfo.name}</span>
              </div>
              <div className="flex items-start gap-2 px-3 py-2">
                <span className="w-24 shrink-0 text-xs text-stone-400 pt-0.5">住所</span>
                <span className="text-sm text-stone-700">{companyInfo.postalCode} {companyInfo.address}</span>
              </div>
              <div className="flex items-start gap-2 px-3 py-2">
                <span className="w-24 shrink-0 text-xs text-stone-400 pt-0.5">代表者</span>
                <span className="text-sm text-stone-700">{companyInfo.representative}</span>
              </div>
              <div className="flex items-start gap-2 px-3 py-2">
                <span className="w-24 shrink-0 text-xs text-stone-400 pt-0.5">TEL / MAIL</span>
                <span className="text-sm text-stone-700">{companyInfo.tel}　{companyInfo.email}</span>
              </div>
              <div className="flex items-start gap-2 px-3 py-2">
                <span className="w-24 shrink-0 text-xs text-[#8B4A3C] font-bold pt-0.5">登録番号</span>
                <span className="text-sm font-bold text-[#8B4A3C]">{companyInfo.invoiceNumber}</span>
              </div>
            </div>
            <p className="mt-2 text-xs text-stone-400">
              ※ <a href="/settings/company" className="underline text-[#8B4A3C]">事業者設定</a>で変更できます。
            </p>
          </div>

          {/* ── 振込先 ── */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-3 border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">振込先</h2>
            <div className="divide-y divide-stone-100 rounded-xl border border-stone-100">
              {[
                { label: "銀行名",    value: bank.bankName },
                { label: "支店名",    value: bank.branchName },
                { label: "口座種別",  value: bank.accountType },
                { label: "口座番号",  value: bank.accountNumber },
                { label: "口座名義",  value: bank.accountHolder },
              ].map((item) => (
                <div key={item.label} className="flex items-start gap-2 px-3 py-2">
                  <span className="w-20 shrink-0 text-xs text-stone-400 pt-0.5">{item.label}</span>
                  <span className="text-sm text-stone-700">{item.value || "（未設定）"}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-stone-400">
              ※ <a href="/settings/company" className="underline text-[#8B4A3C]">事業者設定</a>で変更できます。
            </p>
          </div>

          {/* ── 備考 ── */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <label htmlFor="note" className={labelCls}>備考</label>
            <textarea
              id="note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例：お振込み手数料はご負担ください。"
              className={inputCls + " resize-none"}
            />
          </div>

          {/* ── ボタン群 ── */}
          <div className="space-y-3 pb-8 pt-1">
            <button
              type="button"
              onClick={handlePDF}
              disabled={isPdfLoading}
              className="w-full rounded-2xl bg-[#8B4A3C] py-3.5 text-white shadow-sm active:opacity-80 disabled:opacity-50"
            >
              <span className="block text-base font-bold">
                {isPdfLoading ? '生成中...' : '請求書PDFを作る'}
              </span>
              <span className="block mt-0.5 text-xs font-normal text-amber-100">
                {isPdfLoading
                  ? 'フォント読み込み中（初回のみ時間がかかります）'
                  : '単体請求書 · 原価非表示'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => alert("単体請求書の保存は次工程で追加します。")}
              className="w-full rounded-2xl border border-[#8B4A3C] bg-white py-4 text-base font-bold text-[#8B4A3C] shadow-sm active:opacity-80"
            >
              仮保存
            </button>
            <Link
              href="/projects/sample"
              className="flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-white py-4 text-base font-bold text-stone-600 shadow-sm active:opacity-80"
            >
              案件詳細へ戻る
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}
