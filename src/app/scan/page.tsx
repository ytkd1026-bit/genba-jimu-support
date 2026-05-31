"use client";

// TODO: /scan で読み取った元請書類データを /projects/import に渡す
// TODO: レシート読取結果は expenses または receipts に保存する
// TODO: Supabase storage にアップロードファイルを保存する
// TODO: OCR/AI読取APIを後工程で接続する

import Link from "next/link";
import { useState, useRef } from "react";

// ─── 型定義 ──────────────────────────────────────────────────
type ScanType = "agency" | "receipt" | "order" | "other" | null;

// ─── スタイル定数 ─────────────────────────────────────────────
const inputCls =
  "w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-base text-stone-800 placeholder:text-stone-300 focus:border-[#8B4A3C] focus:outline-none focus:ring-2 focus:ring-[#8B4A3C]/20";
const labelCls = "mb-1 block text-sm font-bold text-stone-700";

// ─── スキャン種別 ─────────────────────────────────────────────
const SCAN_TYPES: { id: ScanType; icon: string; title: string; desc: string }[] = [
  { id: "agency",  icon: "📄", title: "元請書類を読み取る",   desc: "PDF・FAX・LINE画像から案件下書きを作る" },
  { id: "receipt", icon: "🧾", title: "レシートを読み取る",   desc: "支出データの下書きを作る" },
  { id: "order",   icon: "📋", title: "発注書・注文書を読み取る", desc: "元請からの発注内容を確認する" },
  { id: "other",   icon: "📁", title: "その他書類を読み取る", desc: "後で分類する書類として保存する" },
];

// ─── コンポーネント ───────────────────────────────────────────
export default function ScanPage() {
  const [scanType,    setScanType]    = useState<ScanType>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [hasScanned,  setHasScanned]  = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── 元請書類フォーム ──────────────────────────────────────
  const [agencyForm, setAgencyForm] = useState({
    clientName:     "△△工務店",
    contactName:    "山田様",
    projectName:    "〇〇マンション クロス貼替",
    address:        "大阪府堺市〇〇区",
    workContent:    "洋室クロス貼替・洗面所CF貼替",
    contractAmount: "105600",
    sekouDate:      "2026/06/03",
    paymentTerms:   "月末締め翌月末払い",
    memo:           "AI読取後は必ず人が確認してください。",
  });

  // ── レシートフォーム ─────────────────────────────────────
  const [receiptForm, setReceiptForm] = useState({
    date:        "2026/06/01",
    payee:       "〇〇商店",
    amount:      "16500",
    taxCategory: "10%",
    category:    "材料費",
    projectLink: "〇〇マンション クロス貼替",
    memo:        "レシート読取結果は必ず確認してください。",
  });

  // ── 発注書フォーム ───────────────────────────────────────
  const [orderForm, setOrderForm] = useState({
    clientName:   "△△工務店",
    orderDate:    "2026/06/01",
    projectName:  "〇〇マンション クロス貼替",
    workContent:  "洋室クロス貼替・洗面所CF貼替",
    orderAmount:  "105600",
    paymentTerms: "月末締め翌月末払い",
    memo:         "",
  });

  // ── 確認チェックボックス ─────────────────────────────────
  const [checks, setChecks] = useState({
    amount:  false,
    date:    false,
    address: false,
    client:  false,
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setHasScanned(false);
  }

  function handleScan() {
    if (!scanType) {
      alert("スキャン種別を選択してください。");
      return;
    }
    setHasScanned(true);
    // リセット
    setChecks({ amount: false, date: false, address: false, client: false });
  }

  function getFileTypeLabel(file: File): string {
    if (file.type === "application/pdf")   return "PDF";
    if (file.type.startsWith("image/")) return "画像";
    return "ファイル";
  }

  function agencyChange(e: React.ChangeEvent<HTMLInputElement>) {
    setAgencyForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }
  function receiptChange(e: React.ChangeEvent<HTMLInputElement>) {
    setReceiptForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }
  function orderChange(e: React.ChangeEvent<HTMLInputElement>) {
    setOrderForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        {/* ヘッダー */}
        <header className="mb-4">
          <Link href="/" className="mb-3 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← ホームへ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">スキャン登録</h1>
          <p className="mt-1 text-sm text-stone-500">
            PDF・FAX・LINE画像・レシートを読み取り、案件登録や支出登録に使います。
          </p>
        </header>

        <div className="space-y-4">

          {/* ── スキャン種別選択 ── */}
          <div className="space-y-2">
            <h2 className="px-1 text-sm font-bold text-stone-700">スキャン種別を選んでください</h2>
            {SCAN_TYPES.map((type) => {
              const isSelected = scanType === type.id;
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => { setScanType(type.id); setHasScanned(false); }}
                  className={`flex w-full items-center gap-4 rounded-2xl p-4 text-left shadow-sm active:opacity-75 transition-colors ${
                    isSelected
                      ? "bg-[#8B4A3C] ring-2 ring-[#8B4A3C]"
                      : "bg-white ring-1 ring-stone-100"
                  }`}
                >
                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl ${
                    isSelected ? "bg-white/10" : "bg-[#fdf0ec]"
                  }`}>
                    {type.icon}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <span className={`text-sm font-bold ${isSelected ? "text-white" : "text-stone-800"}`}>
                      {type.title}
                    </span>
                    <span className={`text-xs leading-snug ${isSelected ? "text-amber-100" : "text-stone-500"}`}>
                      {type.desc}
                    </span>
                  </div>
                  <span className={`ml-auto shrink-0 text-lg ${isSelected ? "text-white" : "text-stone-300"}`}>
                    {isSelected ? "✓" : "›"}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ── ファイル選択 ── */}
          <div className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
            <h2 className="border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">
              ファイルを選択
            </h2>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-200 bg-stone-50 py-8 active:opacity-70"
            >
              <span className="text-3xl">📂</span>
              <span className="text-sm font-bold text-stone-600">ファイルを選択</span>
              <span className="text-xs text-stone-400">PDF・画像（JPEG・PNG）に対応</span>
            </button>

            {/* 選択ファイル情報 */}
            {selectedFile && (
              <div className="rounded-xl border border-stone-100 bg-stone-50 px-4 py-3 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg">
                    {selectedFile.type === "application/pdf" ? "📄" : "🖼️"}
                  </span>
                  <p className="text-sm font-bold text-stone-800 leading-tight break-all">
                    {selectedFile.name}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-stone-400">
                  <span className="rounded bg-stone-200 px-1.5 py-0.5 font-bold text-stone-600">
                    {getFileTypeLabel(selectedFile)}
                  </span>
                  <span>読取待ち</span>
                </div>
              </div>
            )}
          </div>

          {/* ── 仮読取ボタン ── */}
          <button
            type="button"
            onClick={handleScan}
            className="w-full rounded-2xl bg-[#8B4A3C] py-4 text-base font-bold text-white shadow-sm active:opacity-80"
          >
            仮読取する
          </button>

          {/* ── 元請書類 仮読取結果 ── */}
          {hasScanned && scanType === "agency" && (
            <div className="rounded-2xl bg-white p-4 shadow-sm space-y-4">
              <h2 className="border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">
                仮読取結果（元請書類）
              </h2>
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-200">
                ⚠️ 読取内容を必ず確認・修正してから案件登録へ進んでください。
              </p>
              {[
                { label: "元請名",       name: "clientName",      type: "text" },
                { label: "担当者",       name: "contactName",     type: "text" },
                { label: "案件名",       name: "projectName",     type: "text" },
                { label: "現場住所",     name: "address",         type: "text" },
                { label: "工事内容",     name: "workContent",     type: "text" },
                { label: "請負金額（円）", name: "contractAmount", type: "number" },
                { label: "施工予定日",   name: "sekouDate",       type: "text" },
                { label: "支払条件",     name: "paymentTerms",    type: "text" },
                { label: "備考",         name: "memo",            type: "text" },
              ].map(({ label, name, type }) => (
                <div key={name}>
                  <label className={labelCls}>{label}</label>
                  <input
                    type={type}
                    name={name}
                    value={agencyForm[name as keyof typeof agencyForm]}
                    onChange={agencyChange}
                    className={inputCls}
                  />
                </div>
              ))}
              <Link
                href="/projects/import"
                className="flex w-full items-center justify-center rounded-2xl bg-[#8B4A3C] py-4 text-base font-bold text-white shadow-sm active:opacity-80"
              >
                案件登録へ進む
              </Link>
            </div>
          )}

          {/* ── レシート 仮読取結果 ── */}
          {hasScanned && scanType === "receipt" && (
            <div className="rounded-2xl bg-white p-4 shadow-sm space-y-4">
              <h2 className="border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">
                仮読取結果（レシート）
              </h2>
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-200">
                ⚠️ 読取内容を必ず確認・修正してから支出登録へ進んでください。
              </p>
              {[
                { label: "日付",       name: "date",        type: "text" },
                { label: "支払先",     name: "payee",       type: "text" },
                { label: "金額（円）", name: "amount",      type: "number" },
                { label: "税区分",     name: "taxCategory", type: "text" },
                { label: "分類",       name: "category",    type: "text" },
                { label: "案件紐づけ", name: "projectLink", type: "text" },
                { label: "メモ",       name: "memo",        type: "text" },
              ].map(({ label, name, type }) => (
                <div key={name}>
                  <label className={labelCls}>{label}</label>
                  <input
                    type={type}
                    name={name}
                    value={receiptForm[name as keyof typeof receiptForm]}
                    onChange={receiptChange}
                    className={inputCls}
                  />
                </div>
              ))}
              <Link
                href="/reports/monthly"
                className="flex w-full items-center justify-center rounded-2xl bg-[#8B4A3C] py-4 text-base font-bold text-white shadow-sm active:opacity-80"
              >
                支出登録へ進む
              </Link>
            </div>
          )}

          {/* ── 発注書・注文書 仮読取結果 ── */}
          {hasScanned && scanType === "order" && (
            <div className="rounded-2xl bg-white p-4 shadow-sm space-y-4">
              <h2 className="border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">
                仮読取結果（発注書・注文書）
              </h2>
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-200">
                ⚠️ 読取内容を必ず確認・修正してから案件詳細へ進んでください。
              </p>
              {[
                { label: "元請名",       name: "clientName",   type: "text" },
                { label: "発注日",       name: "orderDate",    type: "text" },
                { label: "案件名",       name: "projectName",  type: "text" },
                { label: "工事内容",     name: "workContent",  type: "text" },
                { label: "発注金額（円）", name: "orderAmount", type: "number" },
                { label: "支払条件",     name: "paymentTerms", type: "text" },
                { label: "備考",         name: "memo",         type: "text" },
              ].map(({ label, name, type }) => (
                <div key={name}>
                  <label className={labelCls}>{label}</label>
                  <input
                    type={type}
                    name={name}
                    value={orderForm[name as keyof typeof orderForm]}
                    onChange={orderChange}
                    className={inputCls}
                  />
                </div>
              ))}
              <Link
                href="/projects/sample"
                className="flex w-full items-center justify-center rounded-2xl bg-[#8B4A3C] py-4 text-base font-bold text-white shadow-sm active:opacity-80"
              >
                案件詳細へ進む
              </Link>
            </div>
          )}

          {/* ── その他書類 仮読取結果 ── */}
          {hasScanned && scanType === "other" && (
            <div className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
              <h2 className="border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">
                仮読取結果（その他書類）
              </h2>
              <p className="rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-500">
                後で分類する書類として仮保存します。
              </p>
              <div className="rounded-xl border border-stone-100 bg-stone-50 px-4 py-3 space-y-1">
                <p className="text-xs text-stone-500">
                  ファイル：{selectedFile?.name ?? "（未選択）"}
                </p>
                <p className="text-xs text-stone-400">分類：未分類</p>
                <p className="text-xs text-stone-400">ステータス：保存待ち</p>
              </div>
              <Link
                href="/"
                className="flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-white py-4 text-base font-bold text-stone-600 shadow-sm active:opacity-80"
              >
                ホームへ戻る
              </Link>
            </div>
          )}

          {/* ── 読取内容確認カード ── */}
          {hasScanned && (
            <div className="rounded-2xl bg-amber-50 p-4 shadow-sm ring-1 ring-amber-200 space-y-3">
              <h3 className="text-sm font-bold text-amber-800">読取内容確認</h3>
              <p className="text-xs text-amber-700 leading-relaxed">
                スキャン読取は誤認識する可能性があります。金額・日付・住所・元請名は必ず確認してください。
              </p>
              <div className="space-y-2.5">
                {[
                  { key: "amount",  label: "金額を確認した" },
                  { key: "date",    label: "日付を確認した" },
                  { key: "address", label: "住所を確認した" },
                  { key: "client",  label: "元請名・支払先を確認した" },
                ].map(({ key, label }) => {
                  const checked = checks[key as keyof typeof checks];
                  return (
                    <label key={key} className="flex cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setChecks((prev) => ({ ...prev, [key]: e.target.checked }))
                        }
                        className="h-5 w-5 rounded border-amber-300 accent-[#8B4A3C]"
                      />
                      <span className={`text-sm ${checked ? "text-green-700 line-through" : "text-amber-800"}`}>
                        {label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="pb-8" />

        </div>
      </div>
    </div>
  );
}
