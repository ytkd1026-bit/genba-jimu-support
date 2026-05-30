"use client";

// TODO: 元請書類読取は案件登録の中核機能として、550円プランの3ヶ月無料期間でも一部提供する。
// TODO: レシートスキャンと支出AI分類は有料プラン機能として実装予定。
// TODO: AI読取結果は必ず確認画面を挟み、手入力修正後に登録確定する。

// TODO: Supabase連携後、アップロード書類を storage に保存する。
// TODO: AI読取後、確認画面を通して projects に登録する。
// TODO: 元請情報は customers に保存し、projects.customer_id と紐づける。

import Link from "next/link";
import { useState } from "react";

const labelCls = "block text-sm font-bold text-stone-700 mb-1";
const inputCls =
  "w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-base text-stone-800 placeholder:text-stone-300 focus:border-[#8B4A3C] focus:outline-none focus:ring-2 focus:ring-[#8B4A3C]/20";

const DOCUMENT_TYPES = [
  { label: "PDFを選択", icon: "📄" },
  { label: "FAX画像を選択", icon: "🖨️" },
  { label: "LINEスクショを選択", icon: "💬" },
  { label: "メール添付書類を選択", icon: "📧" },
];

const INITIAL_DRAFT = {
  clientName: "△△工務店",
  contactName: "山田様",
  projectName: "〇〇マンション クロス貼替",
  address: "大阪府堺市〇〇区",
  koujiContent: "洋室クロス貼替・洗面所CF貼替",
  gentyoDate: "2026-05-30",
  sekouDate: "2026-06-03",
  contractAmount: "105600",
  paymentTerms: "月末締め翌月末払い",
  memo: "FAX・PDF読取後は人が確認してから登録",
};

export default function ImportProjectPage() {
  const [draft, setDraft] = useState(INITIAL_DRAFT);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    setDraft((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleDocumentSelect() {
    alert("書類アップロードとAI読取は次工程で追加します。");
  }

  function handleRegister() {
    alert("案件登録保存は次工程で追加します。");
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
          <h1 className="text-xl font-bold text-stone-800">元請書類から案件登録</h1>
          <p className="mt-1 text-sm text-stone-500">
            元請から届いたPDF・FAX・LINE画像をもとに、案件登録の下書きを作ります。
          </p>
        </header>

        <div className="space-y-3">

          {/* 書類選択 */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-3 border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">
              読み取る書類を選択
            </h2>
            <div className="grid grid-cols-2 gap-2.5">
              {DOCUMENT_TYPES.map((doc) => (
                <button
                  key={doc.label}
                  type="button"
                  onClick={handleDocumentSelect}
                  className="flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-stone-200 bg-stone-50 px-3 py-3 text-stone-600 active:opacity-70"
                >
                  <span className="text-2xl leading-none">{doc.icon}</span>
                  <span className="text-center text-xs font-bold leading-tight">
                    {doc.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* AI読取の注意カード */}
          <div className="rounded-2xl bg-yellow-50 p-4 shadow-sm ring-1 ring-yellow-200">
            <h2 className="mb-1.5 text-sm font-bold text-yellow-800">
              ⚠️ AI読取の確認について
            </h2>
            <p className="text-sm leading-relaxed text-yellow-700">
              AI読取は金額・日付・住所を誤読する可能性があります。
              必ず人が確認・修正してから案件登録してください。
            </p>
          </div>

          {/* 案件登録下書き（編集可能） */}
          <div className="rounded-2xl bg-white p-4 shadow-sm space-y-4">
            <h2 className="border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">
              案件登録下書き
            </h2>

            <div>
              <label htmlFor="clientName" className={labelCls}>
                元請名
              </label>
              <input
                id="clientName"
                name="clientName"
                type="text"
                value={draft.clientName}
                onChange={handleChange}
                className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="contactName" className={labelCls}>
                担当者
              </label>
              <input
                id="contactName"
                name="contactName"
                type="text"
                value={draft.contactName}
                onChange={handleChange}
                className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="projectName" className={labelCls}>
                案件名
              </label>
              <input
                id="projectName"
                name="projectName"
                type="text"
                value={draft.projectName}
                onChange={handleChange}
                className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="address" className={labelCls}>
                現場住所
              </label>
              <input
                id="address"
                name="address"
                type="text"
                value={draft.address}
                onChange={handleChange}
                className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="koujiContent" className={labelCls}>
                工事内容
              </label>
              <textarea
                id="koujiContent"
                name="koujiContent"
                rows={3}
                value={draft.koujiContent}
                onChange={handleChange}
                className={inputCls + " resize-none"}
              />
            </div>

            <div>
              <label htmlFor="gentyoDate" className={labelCls}>
                現調予定日
              </label>
              <input
                id="gentyoDate"
                name="gentyoDate"
                type="date"
                value={draft.gentyoDate}
                onChange={handleChange}
                className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="sekouDate" className={labelCls}>
                施工予定日
              </label>
              <input
                id="sekouDate"
                name="sekouDate"
                type="date"
                value={draft.sekouDate}
                onChange={handleChange}
                className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="contractAmount" className={labelCls}>
                請負金額（円）
              </label>
              <input
                id="contractAmount"
                name="contractAmount"
                type="number"
                value={draft.contractAmount}
                onChange={handleChange}
                className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="paymentTerms" className={labelCls}>
                支払条件
              </label>
              <input
                id="paymentTerms"
                name="paymentTerms"
                type="text"
                value={draft.paymentTerms}
                onChange={handleChange}
                className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="memo" className={labelCls}>
                備考
              </label>
              <textarea
                id="memo"
                name="memo"
                rows={3}
                value={draft.memo}
                onChange={handleChange}
                className={inputCls + " resize-none"}
              />
            </div>
          </div>

          {/* ボタン群 */}
          <div className="space-y-3 pb-8 pt-1">
            <button
              type="button"
              onClick={handleRegister}
              className="w-full rounded-2xl bg-[#8B4A3C] py-4 text-base font-bold text-white shadow-sm active:opacity-80"
            >
              この内容で案件登録する
            </button>
            <Link
              href="/projects/new"
              className="flex w-full items-center justify-center rounded-2xl border border-[#8B4A3C] bg-white py-4 text-base font-bold text-[#8B4A3C] shadow-sm active:opacity-80"
            >
              手入力で新規案件登録へ進む
            </Link>
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
