"use client";

// TODO: Supabase連携後は、選択月に応じて invoices / expenses / receipts から集計する。
// TODO: レシートAI読取は1,980円プランで月50枚まで、超過分は従量課金。
// TODO: 3,300円プランは1,980円プランの3倍上限。
// TODO: AI読取は確認画面と手入力修正を必須にする。

import Link from "next/link";
import { useState } from "react";

// ---- 型定義 ----

type InvoiceStatus = "未請求" | "請求済み" | "入金済み";
type PaymentStatus = "未入金" | "入金済み";
type ConfirmStatus = "未確認" | "確認済み";

interface SaleItem {
  projectName: string;
  client: string;
  invoiceStatus: InvoiceStatus;
  paymentStatus: PaymentStatus;
  amount: number;
  dueDate: string;
}

interface ExpenseItem {
  date: string;
  payee: string;
  category: string;
  projectName: string;
  amount: number;
  document: string;
  status: ConfirmStatus;
}

interface ExpenseBreakdown {
  label: string;
  amount: number;
}

// ---- 仮データ ----

const MONTHS = ["2026年5月", "2026年6月", "2026年7月"];

const SUMMARY = {
  sales: 382400,
  expenses: 146800,
  grossProfit: 235600,
  grossMargin: 61.6,
  uninvoiced: 88000,
  unpaid: 127600,
};

const SALES: SaleItem[] = [
  {
    projectName: "〇〇マンション クロス貼替",
    client: "△△工務店",
    invoiceStatus: "請求済み",
    paymentStatus: "未入金",
    amount: 96800,
    dueDate: "2026/06/30",
  },
  {
    projectName: "△△邸 CF貼替",
    client: "△△工務店",
    invoiceStatus: "請求済み",
    paymentStatus: "未入金",
    amount: 30800,
    dueDate: "2026/06/30",
  },
  {
    projectName: "□□店舗 床補修",
    client: "□□リフォーム",
    invoiceStatus: "未請求",
    paymentStatus: "未入金",
    amount: 88000,
    dueDate: "未定",
  },
  {
    projectName: "◇◇マンション 雑工事",
    client: "〇〇建設",
    invoiceStatus: "入金済み",
    paymentStatus: "入金済み",
    amount: 22000,
    dueDate: "2026/05/31",
  },
];

const EXPENSES: ExpenseItem[] = [
  {
    date: "2026/05/10",
    payee: "〇〇商店",
    category: "材料費",
    projectName: "〇〇マンション クロス貼替",
    amount: 16500,
    document: "レシート",
    status: "確認済み",
  },
  {
    date: "2026/05/12",
    payee: "コインパーキング",
    category: "駐車場・交通費",
    projectName: "〇〇マンション クロス貼替",
    amount: 2400,
    document: "レシート",
    status: "未確認",
  },
  {
    date: "2026/05/15",
    payee: "外注職人A",
    category: "外注費",
    projectName: "□□店舗 床補修",
    amount: 45000,
    document: "請求書PDF",
    status: "確認済み",
  },
  {
    date: "2026/05/20",
    payee: "産廃業者",
    category: "廃材処分費",
    projectName: "共通",
    amount: 8000,
    document: "領収書",
    status: "未確認",
  },
];

const EXPENSE_BREAKDOWN: ExpenseBreakdown[] = [
  { label: "材料費", amount: 46500 },
  { label: "外注費", amount: 75000 },
  { label: "駐車場・交通費", amount: 8400 },
  { label: "廃材処分費", amount: 8000 },
  { label: "道具・消耗品", amount: 5900 },
  { label: "その他", amount: 3000 },
];

const DOCUMENT_BUTTONS = [
  { label: "レシート画像を追加", icon: "🧾" },
  { label: "発注書PDFを追加", icon: "📄" },
  { label: "FAX画像を追加", icon: "🖨️" },
  { label: "元請注文書を追加", icon: "📋" },
];

// ---- ユーティリティ ----

function yen(n: number) {
  return n.toLocaleString("ja-JP") + "円";
}

function invoiceBadge(s: InvoiceStatus) {
  if (s === "未請求") return "bg-amber-100 text-amber-800";
  if (s === "入金済み") return "bg-green-100 text-green-800";
  return "bg-stone-100 text-stone-700";
}

function paymentBadge(s: PaymentStatus) {
  if (s === "未入金") return "bg-amber-100 text-amber-800";
  return "bg-green-100 text-green-800";
}

function confirmBadge(s: ConfirmStatus) {
  if (s === "未確認") return "bg-amber-100 text-amber-800";
  return "bg-green-100 text-green-800";
}

// ---- コンポーネント ----

export default function MonthlyReportPage() {
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[0]);
  const [showSales,    setShowSales]    = useState(false);
  const [showExpenses, setShowExpenses] = useState(false);

  function handleDocumentAdd() {
    alert("書類アップロードとAI読取は次工程で追加します。");
  }

  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        {/* ヘッダー */}
        <header className="mb-4">
          <Link
            href="/"
            className="mb-3 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75"
          >
            ← ホームへ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">月次収支報告</h1>
          <p className="mt-1 text-sm text-stone-500">
            売上・支出・粗利・未請求・未入金を月ごとに確認します。
          </p>
        </header>

        <div className="space-y-3">

          {/* 対象月セレクト */}
          {/* TODO: Supabase連携後は、選択月に応じて invoices / expenses / receipts から集計する。 */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <label
              htmlFor="month"
              className="mb-1.5 block text-sm font-bold text-stone-700"
            >
              対象月
            </label>
            <select
              id="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-base text-stone-800 focus:border-[#8B4A3C] focus:outline-none focus:ring-2 focus:ring-[#8B4A3C]/20"
            >
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* 月次サマリーカード */}
          <div className="rounded-2xl bg-[#8B4A3C] p-4 shadow-sm text-white">
            <h2 className="mb-3 border-b border-white/20 pb-2 text-sm font-bold">
              {selectedMonth}の収支サマリー
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-amber-100">売上合計</p>
                <p className="text-lg font-bold">{yen(SUMMARY.sales)}</p>
              </div>
              <div>
                <p className="text-xs text-amber-100">支出合計</p>
                <p className="text-lg font-bold">{yen(SUMMARY.expenses)}</p>
              </div>
              <div>
                <p className="text-xs text-amber-100">粗利</p>
                <p className="text-lg font-bold">{yen(SUMMARY.grossProfit)}</p>
              </div>
              <div>
                <p className="text-xs text-amber-100">粗利率</p>
                <p className="text-lg font-bold">{SUMMARY.grossMargin}%</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-white/20 pt-3">
              <div className="rounded-xl bg-amber-600/40 px-3 py-2">
                <p className="text-xs text-amber-100">未請求金額</p>
                <p className="text-base font-bold">{yen(SUMMARY.uninvoiced)}</p>
              </div>
              <div className="rounded-xl bg-amber-600/40 px-3 py-2">
                <p className="text-xs text-amber-100">未入金金額</p>
                <p className="text-base font-bold">{yen(SUMMARY.unpaid)}</p>
              </div>
            </div>
          </div>

          {/* 売上確認ボタン & 詳細 */}
          <button
            type="button"
            onClick={() => setShowSales((v) => !v)}
            className="flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3.5 shadow-sm ring-1 ring-stone-100 active:opacity-80"
          >
            <div className="text-left">
              <p className="text-sm font-bold text-stone-800">売上確認</p>
              <p className="mt-0.5 text-xs text-stone-400">
                {yen(SUMMARY.sales)}　請求済み・未請求・入金済み・未入金
              </p>
            </div>
            <span className={`ml-4 shrink-0 text-sm font-bold transition-transform ${showSales ? "rotate-90 text-[#8B4A3C]" : "text-stone-300"}`}>
              ›
            </span>
          </button>

          {showSales && (
            <div className="rounded-2xl bg-white p-4 shadow-sm space-y-2.5">
              {SALES.map((item) => (
                <div key={item.projectName} className="rounded-xl border border-stone-100 p-3">
                  <div className="mb-1.5 flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-stone-800 leading-tight">{item.projectName}</p>
                      <p className="mt-0.5 text-xs text-stone-400">{item.client}</p>
                    </div>
                    <p className="shrink-0 text-base font-bold text-stone-800">{yen(item.amount)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${invoiceBadge(item.invoiceStatus)}`}>
                      {item.invoiceStatus}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${paymentBadge(item.paymentStatus)}`}>
                      {item.paymentStatus}
                    </span>
                    <span className="ml-auto text-xs text-stone-400">支払期日：{item.dueDate}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 支出確認ボタン & 詳細 */}
          <button
            type="button"
            onClick={() => setShowExpenses((v) => !v)}
            className="flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3.5 shadow-sm ring-1 ring-stone-100 active:opacity-80"
          >
            <div className="text-left">
              <p className="text-sm font-bold text-stone-800">支出確認</p>
              <p className="mt-0.5 text-xs text-stone-400">
                {yen(SUMMARY.expenses)}　材料費・外注費・経費など
              </p>
            </div>
            <span className={`ml-4 shrink-0 text-sm font-bold transition-transform ${showExpenses ? "rotate-90 text-[#8B4A3C]" : "text-stone-300"}`}>
              ›
            </span>
          </button>

          {showExpenses && (
            <div className="rounded-2xl bg-white p-4 shadow-sm space-y-2.5">
              {EXPENSES.map((item, i) => (
                <div key={i} className="rounded-xl border border-stone-100 p-3">
                  <div className="mb-1.5 flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-stone-800 leading-tight">{item.payee}</p>
                      <p className="mt-0.5 text-xs text-stone-400">{item.date}　{item.category}</p>
                      <p className="mt-0.5 text-xs text-stone-400">{item.projectName}</p>
                    </div>
                    <p className="shrink-0 text-base font-bold text-stone-800">{yen(item.amount)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">{item.document}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${confirmBadge(item.status)}`}>
                      {item.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 支出内訳 */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-3 border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">
              支出内訳
            </h2>
            <ul className="space-y-2">
              {EXPENSE_BREAKDOWN.map((item) => (
                <li key={item.label} className="flex items-center justify-between">
                  <span className="text-sm text-stone-600">{item.label}</span>
                  <span className="text-sm font-bold text-stone-800">
                    {yen(item.amount)}
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between border-t border-stone-100 pt-2">
                <span className="text-sm font-bold text-stone-700">合計</span>
                <span className="text-sm font-bold text-[#8B4A3C]">
                  {yen(EXPENSE_BREAKDOWN.reduce((s, e) => s + e.amount, 0))}
                </span>
              </li>
            </ul>
          </div>

          {/* 書類・証憑管理 */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-1.5 border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">
              書類・証憑管理
            </h2>
            <p className="mb-3 text-xs text-stone-400 leading-relaxed">
              レシート、発注書PDF、FAX画像、元請からの注文書を月次収支に紐づけます。
              レシートスキャンとAI分類は有料プラン機能として実装予定です。
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {DOCUMENT_BUTTONS.map((btn) => (
                <button
                  key={btn.label}
                  type="button"
                  onClick={handleDocumentAdd}
                  className="flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-stone-200 bg-stone-50 px-3 py-3 text-stone-600 active:opacity-70"
                >
                  <span className="text-2xl leading-none">{btn.icon}</span>
                  <span className="text-center text-xs font-bold leading-tight">
                    {btn.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* AI読取注意カード */}
          <div className="rounded-2xl bg-yellow-50 p-4 shadow-sm ring-1 ring-yellow-200">
            <h2 className="mb-1.5 text-sm font-bold text-yellow-800">
              ⚠️ AI読取について
            </h2>
            <p className="text-sm leading-relaxed text-yellow-700">
              レシートやFAXの自動読取は便利ですが、金額・日付・住所の誤読が起こる可能性があります。
              AI読取後は必ず確認画面で人が確認・修正してから月次収支に反映します。
            </p>
          </div>

          {/* ホームへ戻る */}
          <div className="pb-8 pt-1">
            <Link
              href="/"
              className="flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-white py-4 text-base font-bold text-stone-600 shadow-sm active:opacity-80"
            >
              ホームへ戻る
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}
