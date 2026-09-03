"use client";

// TODO: Supabase連携後、company_settings テーブルに保存する
// TODO: 見積書PDF、請求書PDF、一括請求PDFへ company_settings を反映する
// TODO: 振込先は invoice_settings または bank_accounts として分離する可能性あり
// TODO: インボイス登録番号はPDF出力前に入力チェックする
// TODO: 複数口座対応は上位プラン機能として検討する

import Link from "next/link";
import PageHeader from "@/app/new/_components/PageHeader";
import { useState, useEffect } from "react";

// ─── 定数 ────────────────────────────────────────────────────
const ACCOUNT_TYPES = ["普通", "当座"] as const;
type AccountType = typeof ACCOUNT_TYPES[number];

// 事業者設定をlocalStorageへ保存・読込するキー（一括請求PDFと共有）
const SETTINGS_STORAGE_KEY = "genba_settings";

// ─── 型定義 ──────────────────────────────────────────────────
interface CompanyForm {
  businessName: string;
  representative: string;
  postalCode: string;
  address: string;
  tel: string;
  email: string;
  invoiceNumber: string;
}

interface BankForm {
  bankName: string;
  branchName: string;
  accountType: AccountType;
  accountNumber: string;
  accountHolder: string;
}

// ─── スタイル定数 ─────────────────────────────────────────────
const inputCls =
  "w-full rounded-xl border border-[var(--nu-border)] bg-white px-4 py-3 text-base text-[var(--nu-text)] placeholder:text-slate-300 focus:border-[var(--nu-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-primary)]/20";
const selectCls =
  "w-full rounded-xl border border-[var(--nu-border)] bg-white px-4 py-3 text-base text-[var(--nu-text)] focus:border-[var(--nu-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-primary)]/20";
const labelCls = "mb-1 block text-sm font-bold text-[var(--nu-text)]";

// ─── デフォルト値 ────────────────────────────────────────────
const DEFAULT_COMPANY: CompanyForm = {
  businessName:   "REVO",
  representative: "山田 太郎",
  postalCode:     "〒590-0000",
  address:        "大阪府堺市〇〇区〇〇町",
  tel:            "090-0000-0000",
  email:          "example@example.com",
  invoiceNumber:  "T0000000000000",
};

const DEFAULT_BANK: BankForm = {
  bankName:      "〇〇銀行",
  branchName:    "〇〇支店",
  accountType:   "普通",
  accountNumber: "1234567",
  accountHolder: "ヤマダ タロウ",
};

// ─── コンポーネント ───────────────────────────────────────────
export default function CompanySettingsPage() {
  const [company, setCompany] = useState<CompanyForm>(DEFAULT_COMPANY);
  const [bank, setBank] = useState<BankForm>(DEFAULT_BANK);
  const [saveMsg, setSaveMsg] = useState("");
  const [pdfInfo, setPdfInfo] = useState(false);

  // 起動時にlocalStorageから読み込む
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      setCompany({
        businessName:   saved.businessName   ?? DEFAULT_COMPANY.businessName,
        representative: saved.representative ?? DEFAULT_COMPANY.representative,
        postalCode:     saved.postalCode     ?? DEFAULT_COMPANY.postalCode,
        address:        saved.address        ?? DEFAULT_COMPANY.address,
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
      // localStorage読み込み失敗時はデフォルトのまま
    }
  }, []);

  function handleCompanyChange(e: React.ChangeEvent<HTMLInputElement>) {
    setCompany((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleBankChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    setBank((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleSave() {
    try {
      const payload = { ...company, ...bank };
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));
      setSaveMsg("事業者設定を保存しました。");
      setTimeout(() => setSaveMsg(""), 4000);
    } catch {
      setSaveMsg("保存に失敗しました。ブラウザの設定を確認してください。");
      setTimeout(() => setSaveMsg(""), 6000);
    }
  }

  function handleReset() {
    const ok = confirm(
      "設定を初期値に戻しますか？\n入力中の内容はすべてデモ値に戻ります。"
    );
    if (!ok) return;
    setCompany(DEFAULT_COMPANY);
    setBank(DEFAULT_BANK);
    try {
      localStorage.removeItem(SETTINGS_STORAGE_KEY);
    } catch {
      // 削除失敗は無視
    }
    setSaveMsg("設定を初期値に戻しました。");
    setTimeout(() => setSaveMsg(""), 4000);
  }

  function handlePdfCheck() {
    setPdfInfo(true);
    setTimeout(() => setPdfInfo(false), 6000);
  }

  return (
    <div className="">
      <PageHeader title="自社情報" subtitle="会社・振込先・帳票の設定" back="/new/my" />
      <div className="px-4 py-4">

        {/* ヘッダー */}

        <div className="space-y-4">

          {/* ── 基本情報 ── */}
          <div className="rounded-2xl bg-white p-4 shadow-sm space-y-4">
            <h2 className="border-b border-[var(--nu-border-soft)] pb-2 text-sm font-bold text-[var(--nu-text)]">
              基本情報
            </h2>

            <div>
              <label htmlFor="businessName" className={labelCls}>屋号・会社名</label>
              <input
                id="businessName" name="businessName" type="text"
                value={company.businessName} onChange={handleCompanyChange}
                placeholder="例：REVO" className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="representative" className={labelCls}>代表者名</label>
              <input
                id="representative" name="representative" type="text"
                value={company.representative} onChange={handleCompanyChange}
                placeholder="例：山田 太郎" className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="postalCode" className={labelCls}>郵便番号</label>
              <input
                id="postalCode" name="postalCode" type="text"
                value={company.postalCode} onChange={handleCompanyChange}
                placeholder="例：〒590-0000" className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="address" className={labelCls}>住所</label>
              <input
                id="address" name="address" type="text"
                value={company.address} onChange={handleCompanyChange}
                placeholder="例：大阪府堺市〇〇区〇〇町" className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="tel" className={labelCls}>TEL</label>
              <input
                id="tel" name="tel" type="tel"
                value={company.tel} onChange={handleCompanyChange}
                placeholder="例：090-0000-0000" className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="email" className={labelCls}>MAIL</label>
              <input
                id="email" name="email" type="email"
                value={company.email} onChange={handleCompanyChange}
                placeholder="例：example@example.com" className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="invoiceNumber" className={labelCls}>インボイス登録番号</label>
              <input
                id="invoiceNumber" name="invoiceNumber" type="text"
                value={company.invoiceNumber} onChange={handleCompanyChange}
                placeholder="例：T0000000000000" className={inputCls}
              />
              <p className="mt-1 text-xs text-slate-400">
                「T」から始まる13桁の番号を入力してください。
              </p>
            </div>
          </div>

          {/* ── 書類表示プレビュー ── */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-1 border-b border-[var(--nu-border-soft)] pb-2 text-sm font-bold text-[var(--nu-text)]">
              書類表示
            </h2>
            <p className="mb-3 text-xs text-slate-400">
              見積書・請求書に表示する名称を確認します。
            </p>
            <div className="rounded-xl border border-[var(--nu-border-soft)] bg-[var(--nu-bg)] divide-y divide-[var(--nu-border-soft)]">
              <div className="flex items-start gap-2 px-3 py-2.5">
                <span className="w-28 shrink-0 text-xs text-slate-400 pt-0.5">書類上の表示名</span>
                <span className="text-sm font-bold text-[var(--nu-text)]">
                  {company.businessName || "（未入力）"}
                </span>
              </div>
              <div className="flex items-start gap-2 px-3 py-2.5">
                <span className="w-28 shrink-0 text-xs text-slate-400 pt-0.5">代表者表示</span>
                <span className="text-sm text-[var(--nu-text)]">
                  {company.representative ? `代表　${company.representative}` : "（未入力）"}
                </span>
              </div>
              <div className="flex items-start gap-2 px-3 py-2.5">
                <span className="w-28 shrink-0 text-xs text-slate-400 pt-0.5">登録番号表示</span>
                <span className="text-sm font-bold text-[var(--nu-primary)]">
                  {company.invoiceNumber ? `登録番号：${company.invoiceNumber}` : "（未入力）"}
                </span>
              </div>
            </div>
          </div>

          {/* ── インボイス注意カード ── */}
          <div className="rounded-2xl bg-yellow-50 p-4 shadow-sm ring-1 ring-yellow-200">
            <h3 className="mb-1.5 text-sm font-bold text-yellow-800">
              ⚠️ インボイス番号について
            </h3>
            <p className="text-sm leading-relaxed text-yellow-700">
              インボイス登録番号は請求書・見積書に表示される重要な番号です。
              誤入力があると取引先の経理処理に影響する可能性があります。
              正式な登録番号を確認して入力してください。
            </p>
          </div>

          {/* ── 振込先 ── */}
          <div className="rounded-2xl bg-white p-4 shadow-sm space-y-4">
            <h2 className="border-b border-[var(--nu-border-soft)] pb-2 text-sm font-bold text-[var(--nu-text)]">
              振込先
            </h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="bankName" className={labelCls}>銀行名</label>
                <input
                  id="bankName" name="bankName" type="text"
                  value={bank.bankName} onChange={handleBankChange}
                  placeholder="例：〇〇銀行" className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="branchName" className={labelCls}>支店名</label>
                <input
                  id="branchName" name="branchName" type="text"
                  value={bank.branchName} onChange={handleBankChange}
                  placeholder="例：〇〇支店" className={inputCls}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="accountType" className={labelCls}>口座種別</label>
                <select
                  id="accountType" name="accountType"
                  value={bank.accountType}
                  onChange={handleBankChange}
                  className={selectCls}
                >
                  {ACCOUNT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="accountNumber" className={labelCls}>口座番号</label>
                <input
                  id="accountNumber" name="accountNumber"
                  type="text" inputMode="numeric"
                  value={bank.accountNumber} onChange={handleBankChange}
                  placeholder="例：1234567" className={inputCls}
                />
              </div>
            </div>

            <div>
              <label htmlFor="accountHolder" className={labelCls}>口座名義（カタカナ）</label>
              <input
                id="accountHolder" name="accountHolder" type="text"
                value={bank.accountHolder} onChange={handleBankChange}
                placeholder="例：ヤマダ タロウ" className={inputCls}
              />
            </div>
          </div>

          {/* ── PDF反映状況 ── */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-1.5 border-b border-[var(--nu-border-soft)] pb-2 text-sm font-bold text-[var(--nu-text)]">
              PDFへの反映状況
            </h2>
            <p className="mb-3 text-sm text-slate-500 leading-relaxed">
              「保存する」を押すと、以下のPDFに自社情報・振込先が反映されます。
            </p>
            <ul className="space-y-1.5">
              {[
                { label: "見積書PDF",        done: true },
                { label: "見積書兼注文書PDF", done: true },
                { label: "保存用PDF",         done: true },
                { label: "一括請求書PDF",     done: true },
                { label: "単体請求書PDF",     done: false },
              ].map(({ label, done }) => (
                <li key={label} className="flex items-center gap-2 text-sm">
                  <span className={done ? "text-green-500" : "text-slate-300"}>
                    {done ? "✓" : "○"}
                  </span>
                  <span className={done ? "text-[var(--nu-text)]" : "text-slate-400"}>
                    {label}
                  </span>
                  {!done && (
                    <span className="text-xs text-slate-300">（次工程）</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* ── ボタン群 ── */}
          <div className="space-y-3 pb-8 pt-1">
            <button
              type="button"
              onClick={handleSave}
              className="w-full rounded-2xl bg-[var(--nu-primary)] py-4 text-base font-bold text-white shadow-sm active:opacity-80"
            >
              保存する
            </button>
            {saveMsg && (
              <div className="rounded-xl bg-green-50 px-4 py-3 ring-1 ring-green-200">
                <p className="text-sm font-bold text-green-700">{saveMsg}</p>
              </div>
            )}
            <button
              type="button"
              onClick={handlePdfCheck}
              className="w-full rounded-2xl border border-[var(--nu-primary)] bg-white py-4 text-base font-bold text-[var(--nu-primary)] shadow-sm active:opacity-80"
            >
              PDF反映を確認
            </button>
            {pdfInfo && (
              <div className="rounded-xl bg-[var(--nu-bg)] px-4 py-3 ring-1 ring-[var(--nu-border)]">
                <p className="text-sm text-[var(--nu-text)] leading-relaxed">
                  見積書PDF・見積書兼注文書PDF・保存用PDF・一括請求PDFに事業者設定の値が反映されます。
                  変更後は「保存する」を押してから各PDFを出力してください。
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={handleReset}
              className="w-full rounded-2xl border border-[var(--nu-border)] bg-white py-4 text-base font-bold text-slate-500 shadow-sm active:opacity-80"
            >
              設定を初期値に戻す
            </button>
            <Link
              href="/new"
              className="flex w-full items-center justify-center rounded-2xl border border-[var(--nu-border)] bg-white py-4 text-base font-bold text-slate-600 shadow-sm active:opacity-80"
            >
              ホームへ戻る
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}
