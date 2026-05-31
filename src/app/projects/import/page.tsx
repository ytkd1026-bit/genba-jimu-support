"use client";

// TODO: 元請書類読取は案件登録の中核機能として、550円プランの3ヶ月無料期間でも一部提供する。
// TODO: レシートスキャンと支出AI分類は有料プラン機能として実装予定。
// TODO: AI読取結果は必ず確認画面を挟み、手入力修正後に登録確定する。

// TODO: Supabase連携後、アップロード書類を storage に保存する。
// TODO: AI読取後、確認画面を通して projects に登録する。
// TODO: 元請情報は customers に保存し、projects.customer_id と紐づける。

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { getScanDraftsByType, type ScanDraft } from "@/app/utils/scanDrafts";

const IMPORT_DRAFT_KEY = "genba_jimu_import_draft";

const labelCls = "block text-sm font-bold text-stone-700 mb-1";
const inputCls =
  "w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-base text-stone-800 placeholder:text-stone-300 focus:border-[#8B4A3C] focus:outline-none focus:ring-2 focus:ring-[#8B4A3C]/20";

const DOCUMENT_TYPES = [
  { label: "PDFを選択",        icon: "📄" },
  { label: "FAX画像を選択",    icon: "🖨️" },
  { label: "LINEスクショを選択", icon: "💬" },
  { label: "メール添付書類を選択", icon: "📧" },
];

const INITIAL_DRAFT = {
  clientName:     "",
  contactName:    "",
  projectName:    "",
  address:        "",
  koujiContent:   "",
  gentyoDate:     "",
  sekouDate:      "",
  contractAmount: "",
  paymentTerms:   "",
  memo:           "",
};

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className="w-24 shrink-0 pt-0.5 text-xs text-stone-400">{label}</span>
      <span className={value ? "text-stone-800" : "text-stone-300"}>{value || "（未入力）"}</span>
    </li>
  );
}

export default function ImportProjectPage() {
  const router = useRouter();
  const [draft, setDraft] = useState(INITIAL_DRAFT);
  const [savedMsg, setSavedMsg] = useState("");

  // スキャン下書き
  const [scanDrafts, setScanDrafts] = useState<ScanDraft[]>([]);
  const [showDrafts, setShowDrafts] = useState(false);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);

  useEffect(() => {
    setScanDrafts(getScanDraftsByType("client_document"));
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setDraft((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleDocumentSelect() {
    alert("書類アップロードとAI読取は次工程で追加します。");
  }

  function handleDraftSave() {
    try {
      const data = { ...draft, savedAt: new Date().toLocaleString("ja-JP") };
      localStorage.setItem(IMPORT_DRAFT_KEY, JSON.stringify(data));
      setSavedMsg("下書きを保存しました。");
      setTimeout(() => setSavedMsg(""), 4000);
    } catch {
      setSavedMsg("保存に失敗しました。");
    }
  }

  function handleLoadScanDraft(scanDraft: ScanDraft) {
    const d = scanDraft.extractedData;
    setDraft({
      clientName:     d.clientName     ?? "",
      contactName:    d.contactName    ?? "",
      projectName:    d.projectName    ?? "",
      address:        d.address        ?? "",
      koujiContent:   d.workContent    ?? "",
      gentyoDate:     "",
      sekouDate:      (d.sekouDate ?? "").replace(/\//g, "-"),
      contractAmount: d.contractAmount ?? "",
      paymentTerms:   d.paymentTerms   ?? "",
      memo:           d.memo           ?? "",
    });
    setSelectedDraftId(scanDraft.id);
    setShowDrafts(false);
    setSavedMsg("スキャン下書きを読み込みました。内容を確認・修正してください。");
    setTimeout(() => setSavedMsg(""), 5000);
  }

  function fmtDate(iso: string) {
    try { return new Date(iso).toLocaleDateString("ja-JP"); } catch { return iso; }
  }

  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        <header className="mb-4">
          <Link href="/projects/register" className="mb-3 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← 案件検索・登録へ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">元請書類から案件登録</h1>
          <p className="mt-1 text-sm text-stone-500">
            元請から届いたPDF・FAX・LINE画像をもとに、案件登録の下書きを作ります。
          </p>
        </header>

        <div className="space-y-3">

          {/* ── 保存済みスキャン下書きから登録 ── */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <button
              type="button"
              onClick={() => setShowDrafts((v) => !v)}
              className="flex w-full items-center justify-between"
            >
              <div className="text-left">
                <p className="text-sm font-bold text-stone-800">保存済みスキャン下書きから登録</p>
                <p className="mt-0.5 text-xs text-stone-400">
                  スキャン登録で保存した案件下書きを読み込みます
                  {scanDrafts.length > 0 && `（${scanDrafts.length}件）`}
                </p>
              </div>
              <span className={`ml-4 shrink-0 text-sm font-bold transition-transform ${showDrafts ? "rotate-90 text-[#8B4A3C]" : "text-stone-300"}`}>
                ›
              </span>
            </button>

            {showDrafts && (
              <div className="mt-3 space-y-2">
                {scanDrafts.length === 0 ? (
                  <div className="rounded-xl border-2 border-dashed border-stone-200 py-6 text-center">
                    <p className="text-xs text-stone-500">保存済みの案件下書きはありません。</p>
                    <p className="mt-1 text-xs text-stone-400">スキャン登録から元請書類を読み取ってください。</p>
                    <Link href="/scan" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#8B4A3C]">
                      スキャン登録へ →
                    </Link>
                  </div>
                ) : (
                  scanDrafts.map((sd) => (
                    <div
                      key={sd.id}
                      className={`rounded-xl border p-3 space-y-2 ${
                        selectedDraftId === sd.id
                          ? "border-[#8B4A3C] bg-[#fff8f5]"
                          : "border-stone-100 bg-stone-50"
                      }`}
                    >
                      <div>
                        <p className="text-sm font-bold text-stone-800 leading-tight">
                          {sd.extractedData.projectName || "（案件名未入力）"}
                        </p>
                        <p className="text-xs text-stone-500">{sd.extractedData.clientName}</p>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-stone-400">
                          {sd.extractedData.address && <span>📍 {sd.extractedData.address}</span>}
                          {sd.extractedData.workContent && <span>🔨 {sd.extractedData.workContent}</span>}
                          {sd.extractedData.contractAmount && (
                            <span>
                              💴 ¥{Number(sd.extractedData.contractAmount).toLocaleString("ja-JP")}
                            </span>
                          )}
                          <span>🗓 {fmtDate(sd.createdAt)}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleLoadScanDraft(sd)}
                        className="w-full rounded-xl bg-[#8B4A3C] py-2.5 text-sm font-bold text-white active:opacity-80"
                      >
                        この下書きから案件登録
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* 書類選択 */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-3 border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">読み取る書類を選択</h2>
            <div className="grid grid-cols-2 gap-2.5">
              {DOCUMENT_TYPES.map((doc) => (
                <button key={doc.label} type="button" onClick={handleDocumentSelect}
                  className="flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-stone-200 bg-stone-50 px-3 py-3 text-stone-600 active:opacity-70">
                  <span className="text-2xl leading-none">{doc.icon}</span>
                  <span className="text-center text-xs font-bold leading-tight">{doc.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* AI読取の注意カード */}
          <div className="rounded-2xl bg-yellow-50 p-4 shadow-sm ring-1 ring-yellow-200">
            <h2 className="mb-1.5 text-sm font-bold text-yellow-800">⚠️ AI読取の確認について</h2>
            <p className="text-sm leading-relaxed text-yellow-700">
              AI読取は金額・日付・住所を誤読する可能性があります。
              必ず人が確認・修正してから案件登録してください。
            </p>
          </div>

          {/* 案件登録下書き（編集可能） */}
          <div className="rounded-2xl bg-white p-4 shadow-sm space-y-4">
            <h2 className="border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">案件登録下書き</h2>

            <div>
              <label htmlFor="clientName" className={labelCls}>元請名</label>
              <input id="clientName" name="clientName" type="text" value={draft.clientName} onChange={handleChange} className={inputCls} placeholder="例：△△工務店" />
            </div>
            <div>
              <label htmlFor="contactName" className={labelCls}>担当者</label>
              <input id="contactName" name="contactName" type="text" value={draft.contactName} onChange={handleChange} className={inputCls} placeholder="例：山田様" />
            </div>
            <div>
              <label htmlFor="projectName" className={labelCls}>案件名</label>
              <input id="projectName" name="projectName" type="text" value={draft.projectName} onChange={handleChange} className={inputCls} placeholder="例：〇〇マンション クロス貼替" />
            </div>
            <div>
              <label htmlFor="address" className={labelCls}>現場住所</label>
              <input id="address" name="address" type="text" value={draft.address} onChange={handleChange} className={inputCls} placeholder="例：大阪府堺市〇〇区" />
            </div>
            <div>
              <label htmlFor="koujiContent" className={labelCls}>工事内容</label>
              <textarea id="koujiContent" name="koujiContent" rows={3} value={draft.koujiContent} onChange={handleChange} className={inputCls + " resize-none"} placeholder="例：洋室クロス貼替・洗面所CF貼替" />
            </div>
            <div>
              <label htmlFor="gentyoDate" className={labelCls}>現調予定日</label>
              <input id="gentyoDate" name="gentyoDate" type="date" value={draft.gentyoDate} onChange={handleChange} className={inputCls} />
            </div>
            <div>
              <label htmlFor="sekouDate" className={labelCls}>施工予定日</label>
              <input id="sekouDate" name="sekouDate" type="date" value={draft.sekouDate} onChange={handleChange} className={inputCls} />
            </div>
            <div>
              <label htmlFor="contractAmount" className={labelCls}>請負金額（円）</label>
              <input id="contractAmount" name="contractAmount" type="number" value={draft.contractAmount} onChange={handleChange} className={inputCls} placeholder="例：105600" />
            </div>
            <div>
              <label htmlFor="paymentTerms" className={labelCls}>支払条件</label>
              <input id="paymentTerms" name="paymentTerms" type="text" value={draft.paymentTerms} onChange={handleChange} className={inputCls} placeholder="例：月末締め翌月末払い" />
            </div>
            <div>
              <label htmlFor="memo" className={labelCls}>備考</label>
              <textarea id="memo" name="memo" rows={3} value={draft.memo} onChange={handleChange} className={inputCls + " resize-none"} placeholder="備考（任意）" />
            </div>
          </div>

          {/* ── 読取内容確認カード ── */}
          <div className="overflow-hidden rounded-2xl shadow-sm ring-2 ring-[#8B4A3C]/20">
            <div className="bg-[#8B4A3C] px-4 py-3">
              <h2 className="text-sm font-bold text-white">読取内容確認</h2>
              <p className="mt-0.5 text-xs text-amber-100">
                AI読取結果は誤認識の可能性があります。登録前に必ず確認してください。
              </p>
            </div>
            <div className="bg-[#fff8f5] p-4">
              <ul className="space-y-2">
                <ConfirmRow label="元請名"   value={draft.clientName} />
                <ConfirmRow label="担当者"   value={draft.contactName} />
                <ConfirmRow label="案件名"   value={draft.projectName} />
                <ConfirmRow label="現場住所" value={draft.address} />
                <ConfirmRow label="工事内容" value={draft.koujiContent} />
                <ConfirmRow label="金額"     value={draft.contractAmount ? `¥${Number(draft.contractAmount).toLocaleString("ja-JP")}` : ""} />
                <ConfirmRow label="支払条件" value={draft.paymentTerms} />
                <ConfirmRow label="施工予定日" value={draft.sekouDate.replace(/-/g, "/")} />
              </ul>
            </div>
          </div>

          {/* 見積内容を確認・編集 */}
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100">
            <p className="mb-2 text-xs text-stone-500">
              読み取った内容をもとに、見積明細を確認・編集します。
            </p>
            <Link
              href="/projects/sample/estimate"
              className="flex w-full items-center justify-center rounded-2xl border-2 border-[#8B4A3C] bg-white py-3.5 text-base font-bold text-[#8B4A3C] shadow-sm active:opacity-80"
            >
              見積内容を確認・編集
            </Link>
          </div>

          {/* ボタン群 */}
          <div className="space-y-3 pb-8 pt-1">
            <button
              type="button"
              onClick={handleDraftSave}
              className="w-full rounded-2xl bg-[#8B4A3C] py-4 text-base font-bold text-white shadow-sm active:opacity-80"
            >
              下書き保存
            </button>
            {savedMsg && (
              <div className="rounded-xl bg-green-50 px-4 py-3 ring-1 ring-green-200">
                <p className="text-sm font-bold text-green-700">{savedMsg}</p>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                alert("案件登録しました。案件詳細画面へ進みます。");
                router.push("/projects/sample");
              }}
              className="w-full rounded-2xl border border-stone-300 bg-white py-4 text-base font-bold text-stone-600 shadow-sm active:opacity-80"
            >
              案件詳細へ進む
            </button>
            <Link
              href="/"
              className="flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-white py-3 text-sm font-bold text-stone-400 shadow-sm active:opacity-80"
            >
              ホームへ戻る
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
