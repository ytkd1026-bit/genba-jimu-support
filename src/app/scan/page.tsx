"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { saveScanDraft } from "@/app/utils/scanDrafts";
import { saveExpenseDraft } from "@/app/utils/expenses";
import { saveOrderDraft } from "@/app/utils/orderDrafts";
import { saveStoredDocument } from "@/app/utils/documentStorage";
import { ocrImageFile, extractAmountFromText, extractDateFromText } from "@/app/utils/scanOcr";

// ─── 型定義 ──────────────────────────────────────────────────
type ScanType = "agency" | "receipt" | "order" | "other" | null;

type FieldConfig = {
  label: string;
  name: string;
  type: "text" | "number" | "textarea";
};

// ─── スタイル定数 ─────────────────────────────────────────────
const inputCls =
  "w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-base text-stone-800 placeholder:text-stone-300 focus:border-[#8B4A3C] focus:outline-none focus:ring-2 focus:ring-[#8B4A3C]/20";
const labelCls = "mb-1 block text-sm font-bold text-stone-700";

// ─── スキャン種別 ─────────────────────────────────────────────
const SCAN_TYPES: { id: ScanType; icon: string; title: string; desc: string }[] = [
  { id: "agency",  icon: "📄", title: "元請書類を読み取る",      desc: "PDF・FAX・LINE画像から案件下書きを作る" },
  { id: "receipt", icon: "🧾", title: "レシートを読み取る",      desc: "支出データの下書きを作る" },
  { id: "order",   icon: "📋", title: "発注書・注文書を読み取る", desc: "元請からの発注内容を確認する" },
  { id: "other",   icon: "📁", title: "その他書類を読み取る",     desc: "後で分類する書類として保存する" },
];

const DOCUMENT_CATEGORIES = ["元請資料", "現場写真", "発注関連", "請求関連", "レシート", "その他"];

// ─── ファイル種別ユーティリティ ───────────────────────────────
function getFileTypeLabel(file: File): string {
  if (file.type === "application/pdf") return "PDF";
  if (file.type.startsWith("image/")) return "画像";
  return "ファイル";
}

function isPreviewableImage(file: File): boolean {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.type);
}

function isHeic(file: File): boolean {
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    file.name.toLowerCase().endsWith(".heic") ||
    file.name.toLowerCase().endsWith(".heif")
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── フォームフィールド描画 ───────────────────────────────────
function FormField({
  field,
  value,
  onChange,
}: {
  field: FieldConfig;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}) {
  return (
    <div>
      <label className={labelCls}>{field.label}</label>
      {field.type === "textarea" ? (
        <textarea
          name={field.name}
          value={value}
          onChange={onChange}
          rows={4}
          className={inputCls + " resize-y"}
        />
      ) : (
        <input
          type={field.type}
          name={field.name}
          value={value}
          onChange={onChange}
          className={inputCls}
        />
      )}
    </div>
  );
}

// ─── OCR読取文字表示 ──────────────────────────────────────────
function OcrTextArea({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className={labelCls}>読取文字（編集可）</label>
      <p className="text-xs text-amber-700">
        OCR結果は誤認識する可能性があります。金額・日付・住所・元請名は必ず確認してください。
      </p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={7}
        className="w-full resize-y rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 font-mono text-sm text-stone-700 focus:border-[#8B4A3C] focus:outline-none focus:ring-2 focus:ring-[#8B4A3C]/20"
      />
    </div>
  );
}

// ─── コンポーネント ───────────────────────────────────────────
export default function ScanPage() {
  const [scanType,     setScanType]     = useState<ScanType>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl,   setPreviewUrl]   = useState<string | null>(null);
  const [hasScanned,   setHasScanned]   = useState(false);
  const [noFileWarn,   setNoFileWarn]   = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // OCR 状態
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [ocrProgress,  setOcrProgress]  = useState(0);
  const [ocrText,      setOcrText]      = useState("");
  const [ocrError,     setOcrError]     = useState("");
  const [scanNote,     setScanNote]     = useState("");

  // 保存済みフラグ
  const [agencySaved,  setAgencySaved]  = useState(false);
  const [receiptSaved, setReceiptSaved] = useState(false);
  const [orderSaved,   setOrderSaved]   = useState(false);
  const [otherSaved,   setOtherSaved]   = useState(false);

  // objectURL のメモリ後始末
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // ── フォーム状態（全て空で初期化） ──────────────────────────
  const [agencyForm, setAgencyForm] = useState({
    clientName:     "",
    contactName:    "",
    projectName:    "",
    address:        "",
    workContent:    "",
    contractAmount: "",
    sekouDate:      "",
    paymentTerms:   "",
    memo:           "",
  });

  const [receiptForm, setReceiptForm] = useState({
    date:        "",
    payee:       "",
    amount:      "",
    taxCategory: "",
    category:    "",
    projectLink: "",
    memo:        "",
  });

  const [orderForm, setOrderForm] = useState({
    clientName:   "",
    orderDate:    "",
    projectName:  "",
    workContent:  "",
    orderAmount:  "",
    paymentTerms: "",
    memo:         "",
  });

  const [otherForm, setOtherForm] = useState({
    documentName:   "",
    category:       "その他",
    relatedProject: "",
    memo:           "",
  });

  // ── 確認チェックボックス ─────────────────────────────────
  const [checks, setChecks] = useState({
    amount:  false,
    date:    false,
    address: false,
    client:  false,
  });

  function resetSavedStates() {
    setAgencySaved(false);
    setReceiptSaved(false);
    setOrderSaved(false);
    setOtherSaved(false);
  }

  function resetForms() {
    setAgencyForm({ clientName: "", contactName: "", projectName: "", address: "", workContent: "", contractAmount: "", sekouDate: "", paymentTerms: "", memo: "" });
    setReceiptForm({ date: "", payee: "", amount: "", taxCategory: "", category: "", projectLink: "", memo: "" });
    setOrderForm({ clientName: "", orderDate: "", projectName: "", workContent: "", orderAmount: "", paymentTerms: "", memo: "" });
    setOtherForm({ documentName: "", category: "その他", relatedProject: "", memo: "" });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setHasScanned(false);
    setNoFileWarn(false);
    setOcrText("");
    setOcrError("");
    setScanNote("");
    resetSavedStates();
    if (file && isPreviewableImage(file)) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }
  }

  function populateFormsFromOcr(text: string, type: ScanType, file: File | null) {
    const amount = extractAmountFromText(text);
    const date   = extractDateFromText(text);

    if (type === "agency") {
      setAgencyForm({ clientName: "", contactName: "", projectName: "", address: "", workContent: "", contractAmount: amount, sekouDate: date, paymentTerms: "", memo: text });
    } else if (type === "receipt") {
      setReceiptForm({ date, payee: "", amount, taxCategory: "", category: "", projectLink: "", memo: text });
    } else if (type === "order") {
      setOrderForm({ clientName: "", orderDate: date, projectName: "", workContent: "", orderAmount: amount, paymentTerms: "", memo: text });
    } else if (type === "other") {
      setOtherForm({ documentName: file?.name ?? "", category: "その他", relatedProject: "", memo: text });
    }
  }

  async function handleScan() {
    if (!selectedFile) { setNoFileWarn(true); return; }
    if (!scanType) { alert("スキャン種別を選択してください。"); return; }

    setNoFileWarn(false);
    setChecks({ amount: false, date: false, address: false, client: false });
    resetSavedStates();
    setOcrText("");
    setOcrError("");
    setScanNote("");
    setOcrProgress(0);
    resetForms();

    // PDF: OCR非対応
    if (selectedFile.type === "application/pdf") {
      setScanNote("PDFの中身読取は次工程で実装します。現在はファイル保存と下書き入力のみ対応しています。");
      if (scanType === "other") {
        setOtherForm((prev) => ({ ...prev, documentName: selectedFile.name }));
      }
      setHasScanned(true);
      return;
    }

    // HEIC: OCR非対応
    if (isHeic(selectedFile)) {
      setScanNote("HEIC形式はブラウザで直接読取できない場合があります。スクリーンショット、またはJPEG/PNGに変換してから読み取ってください。");
      if (scanType === "other") {
        setOtherForm((prev) => ({ ...prev, documentName: selectedFile.name }));
      }
      setHasScanned(true);
      return;
    }

    // 画像 OCR
    if (!isPreviewableImage(selectedFile)) {
      setHasScanned(true);
      return;
    }

    setIsOcrLoading(true);
    try {
      const text = await ocrImageFile(selectedFile, (p) => setOcrProgress(p));
      setOcrText(text);
      populateFormsFromOcr(text, scanType, selectedFile);
      setHasScanned(true);
    } catch (err) {
      console.error("OCR error:", err);
      setOcrError(
        "画像の読取に失敗しました。\n写真が暗い、文字が小さい、傾いている場合は、撮り直して再度お試しください。"
      );
    } finally {
      setIsOcrLoading(false);
    }
  }

  function agencyChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setAgencyForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }
  function receiptChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setReceiptForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }
  function orderChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setOrderForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }
  function otherChange(field: string, value: string) {
    setOtherForm((prev) => ({ ...prev, [field]: value }));
  }

  // ── 保存ハンドラ ─────────────────────────────────────────
  function handleAgencySave() {
    saveScanDraft({
      scanType:      "client_document",
      fileName:      selectedFile?.name ?? "",
      fileType:      selectedFile?.type ?? "",
      fileSize:      selectedFile?.size ?? 0,
      status:        "draft",
      extractedData: { ...agencyForm },
      memo:          agencyForm.memo,
      ocrText:       ocrText || undefined,
    });
    setAgencySaved(true);
  }

  function handleReceiptSave() {
    saveExpenseDraft({
      date:          receiptForm.date,
      vendor:        receiptForm.payee,
      amount:        receiptForm.amount,
      taxType:       receiptForm.taxCategory,
      category:      receiptForm.category,
      linkedProject: receiptForm.projectLink,
      memo:          receiptForm.memo,
      fileName:      selectedFile?.name ?? "",
      fileType:      selectedFile?.type ?? "",
      fileSize:      selectedFile?.size ?? 0,
      status:        "draft",
      ocrText:       ocrText || undefined,
    });
    setReceiptSaved(true);
  }

  function handleOrderSave() {
    saveOrderDraft({
      clientName:      orderForm.clientName,
      orderDate:       orderForm.orderDate,
      projectName:     orderForm.projectName,
      workDescription: orderForm.workContent,
      orderAmount:     orderForm.orderAmount,
      paymentTerm:     orderForm.paymentTerms,
      memo:            orderForm.memo,
      fileName:        selectedFile?.name ?? "",
      fileType:        selectedFile?.type ?? "",
      fileSize:        selectedFile?.size ?? 0,
      status:          "draft",
      ocrText:         ocrText || undefined,
    });
    setOrderSaved(true);
  }

  function handleOtherSave() {
    saveStoredDocument({
      documentName:   otherForm.documentName || selectedFile?.name || "（無題書類）",
      category:       otherForm.category,
      relatedProject: otherForm.relatedProject,
      memo:           otherForm.memo,
      fileName:       selectedFile?.name ?? "",
      fileType:       selectedFile?.type ?? "",
      fileSize:       selectedFile?.size ?? 0,
      ocrText:        ocrText || undefined,
    });
    setOtherSaved(true);
  }

  // ── 後続ボタン（保存後） ─────────────────────────────────
  function PostSaveButtons({
    primaryLabel, primaryHref,
    secondaryLabel, secondaryHref,
  }: {
    primaryLabel: string; primaryHref: string;
    secondaryLabel: string; secondaryHref: string;
  }) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl bg-green-50 px-4 py-3 ring-1 ring-green-200">
          <p className="text-sm font-bold text-green-700">✓ 保存しました。</p>
        </div>
        <Link
          href={primaryHref}
          className="flex w-full items-center justify-center rounded-2xl bg-[#8B4A3C] py-4 text-base font-bold text-white shadow-sm active:opacity-80"
        >
          {primaryLabel}
        </Link>
        <Link
          href={secondaryHref}
          className="flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-white py-3.5 text-sm font-bold text-stone-600 shadow-sm active:opacity-80"
        >
          {secondaryLabel}
        </Link>
      </div>
    );
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

          {/* ── 読取精度 注意カード ── */}
          <div className="rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-200">
            <h2 className="mb-1.5 text-sm font-bold text-stone-700">読取精度について</h2>
            <p className="text-xs leading-relaxed text-stone-500">
              現在はOCR読取の初期版です。
              画像から文字を抽出しますが、金額・日付・住所・元請名を誤認識する可能性があります。
              必ず画面上で確認・修正してから保存してください。
              PDF本文読取、HEIC直接読取、AIによる高精度な項目分類は次工程で実装します。
            </p>
          </div>

          {/* ── スキャン種別選択 ── */}
          <div className="space-y-2">
            <h2 className="px-1 text-sm font-bold text-stone-700">スキャン種別を選んでください</h2>
            {SCAN_TYPES.map((type) => {
              const isSelected = scanType === type.id;
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => {
                    setScanType(type.id);
                    setHasScanned(false);
                    setOcrText("");
                    setOcrError("");
                    setScanNote("");
                    resetSavedStates();
                  }}
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
              <span className="text-xs text-stone-400">PDF・画像（JPEG・PNG・WebP）に対応</span>
              <span className="text-xs text-stone-400">iPhone写真（HEIC）はプレビューできない場合があります</span>
            </button>

            {/* 選択ファイルプレビュー */}
            {selectedFile && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-stone-700">選択したファイル</h3>

                <div className="rounded-xl border border-stone-100 bg-stone-50 px-4 py-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">
                      {selectedFile.type === "application/pdf" ? "📄" : "🖼️"}
                    </span>
                    <p className="text-sm font-bold text-stone-800 leading-tight break-all">
                      {selectedFile.name}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-stone-400">
                    <span className="rounded bg-stone-200 px-1.5 py-0.5 font-bold text-stone-600">
                      {getFileTypeLabel(selectedFile)}
                    </span>
                    <span>{selectedFile.type || "不明"}</span>
                    <span>{formatFileSize(selectedFile.size)}</span>
                  </div>
                </div>

                {/* 画像プレビュー */}
                {isPreviewableImage(selectedFile) && previewUrl && (
                  <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="プレビュー"
                      className="max-h-[60vh] w-full object-contain"
                      style={{ background: "#fff" }}
                    />
                  </div>
                )}

                {/* HEIC 専用カード */}
                {isHeic(selectedFile) && (
                  <div className="overflow-hidden rounded-xl ring-1 ring-orange-300">
                    <div className="flex items-center gap-2 bg-orange-100 px-4 py-2.5">
                      <span className="text-lg">📱</span>
                      <p className="text-sm font-bold text-orange-800">
                        iPhone写真（HEIC形式）が選択されています
                      </p>
                    </div>
                    <div className="bg-orange-50 px-4 py-3 space-y-3">
                      <p className="text-xs leading-relaxed text-orange-700">
                        iPhoneで撮影した写真はHEIC形式で保存されています。
                        ChromeやSafariなど一部のブラウザでは画像プレビューが表示されませんが、
                        ファイルの選択と仮読取はそのまま続行できます。
                      </p>
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-orange-800">プレビューを表示したい場合の対処方法</p>
                        <div className="rounded-lg bg-white px-3 py-2.5 space-y-1.5 ring-1 ring-orange-200">
                          <p className="text-xs font-bold text-stone-700">方法①　スクリーンショットで代替する</p>
                          <ol className="space-y-0.5 text-xs leading-relaxed text-stone-500 list-decimal list-inside">
                            <li>iPhoneのカメラロールで対象の写真を開く</li>
                            <li>スクリーンショットを撮る（電源ボタン＋音量アップ）</li>
                            <li>撮ったスクリーンショット（JPEG）をアップロードする</li>
                          </ol>
                        </div>
                        <div className="rounded-lg bg-white px-3 py-2.5 space-y-1.5 ring-1 ring-orange-200">
                          <p className="text-xs font-bold text-stone-700">方法②　iPhone設定を変更する（今後の撮影から適用）</p>
                          <ol className="space-y-0.5 text-xs leading-relaxed text-stone-500 list-decimal list-inside">
                            <li>iPhoneの「設定」アプリを開く</li>
                            <li>「カメラ」をタップ</li>
                            <li>「フォーマット」をタップ</li>
                            <li>「互換性優先」を選択する</li>
                          </ol>
                          <p className="text-[10px] text-stone-400">
                            ※ 設定変更後に撮影した写真はJPEG形式で保存されます
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-orange-600">
                        HEICのままでも読取は実行できます。プレビュー確認が不要な場合はそのまま続けてください。
                      </p>
                    </div>
                  </div>
                )}

                {/* PDFカード */}
                {selectedFile.type === "application/pdf" && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 space-y-1">
                    <p className="text-sm font-bold text-blue-800">PDFファイルが選択されています</p>
                    <p className="text-xs text-blue-600">
                      PDFの中身表示と文字読取は次工程で実装します。
                    </p>
                  </div>
                )}

                {/* 未対応形式 */}
                {!isPreviewableImage(selectedFile) &&
                  !isHeic(selectedFile) &&
                  selectedFile.type !== "application/pdf" && (
                  <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-500">
                    このファイル形式は現在プレビューに対応していません。
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── ファイル未選択時の注意 ── */}
          {noFileWarn && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700 ring-1 ring-red-200">
              先にファイルを選択してください。
            </div>
          )}

          {/* ── 読取ボタン ── */}
          <button
            type="button"
            onClick={handleScan}
            disabled={isOcrLoading}
            className="w-full rounded-2xl bg-[#8B4A3C] py-4 text-base font-bold text-white shadow-sm active:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isOcrLoading ? "読み取り中…" : "画像を読み取る"}
          </button>

          {/* ── OCR 処理中 ── */}
          {isOcrLoading && (
            <div className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-stone-200 border-t-[#8B4A3C]" />
                <div>
                  <p className="text-sm font-bold text-stone-700">画像を読み取っています。</p>
                  <p className="text-xs text-stone-500">文字が多い書類は少し時間がかかります。</p>
                </div>
              </div>
              {ocrProgress > 0 && (
                <div className="space-y-1">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200">
                    <div
                      className="h-2 rounded-full bg-[#8B4A3C] transition-all duration-300"
                      style={{ width: `${ocrProgress}%` }}
                    />
                  </div>
                  <p className="text-right text-xs text-stone-400">{ocrProgress}%</p>
                </div>
              )}
            </div>
          )}

          {/* ── OCR エラー ── */}
          {ocrError && (
            <div className="rounded-xl bg-red-50 px-4 py-3 ring-1 ring-red-200">
              <p className="whitespace-pre-line text-sm font-bold text-red-700">{ocrError}</p>
              <button
                type="button"
                onClick={() => setOcrError("")}
                className="mt-2 text-xs text-red-500 underline"
              >
                閉じる
              </button>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              元請書類 読取結果フォーム
          ══════════════════════════════════════════════════════ */}
          {hasScanned && scanType === "agency" && (
            <div className="rounded-2xl bg-white p-4 shadow-sm space-y-4">
              <h2 className="border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">
                読取結果（元請書類）
              </h2>

              {/* PDF / HEIC 案内 */}
              {scanNote && (
                <div className="rounded-xl bg-blue-50 px-3 py-2.5 text-xs text-blue-700 ring-1 ring-blue-200">
                  {scanNote}
                </div>
              )}

              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-200">
                ⚠️ 読取内容を必ず確認・修正してから案件登録へ進んでください。
              </p>

              {/* OCR 全文 */}
              {ocrText && (
                <OcrTextArea value={ocrText} onChange={setOcrText} />
              )}

              {(
                [
                  { label: "元請名",         name: "clientName",     type: "text" },
                  { label: "担当者",         name: "contactName",    type: "text" },
                  { label: "案件名",         name: "projectName",    type: "text" },
                  { label: "現場住所",       name: "address",        type: "text" },
                  { label: "工事内容",       name: "workContent",    type: "text" },
                  { label: "請負金額（円）", name: "contractAmount", type: "number" },
                  { label: "施工予定日",     name: "sekouDate",      type: "text" },
                  { label: "支払条件",       name: "paymentTerms",   type: "text" },
                  { label: "備考",           name: "memo",           type: "textarea" },
                ] as FieldConfig[]
              ).map((field) => (
                <FormField
                  key={field.name}
                  field={field}
                  value={agencyForm[field.name as keyof typeof agencyForm]}
                  onChange={agencyChange}
                />
              ))}

              {!agencySaved ? (
                <button
                  type="button"
                  onClick={handleAgencySave}
                  className="w-full rounded-2xl bg-[#8B4A3C] py-4 text-base font-bold text-white shadow-sm active:opacity-80"
                >
                  案件下書きとして保存
                </button>
              ) : (
                <PostSaveButtons
                  primaryLabel="案件登録へ進む"
                  primaryHref="/projects/import"
                  secondaryLabel="スキャン下書き一覧を見る"
                  secondaryHref="/scan/drafts"
                />
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              レシート 読取結果フォーム
          ══════════════════════════════════════════════════════ */}
          {hasScanned && scanType === "receipt" && (
            <div className="rounded-2xl bg-white p-4 shadow-sm space-y-4">
              <h2 className="border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">
                読取結果（レシート）
              </h2>

              {scanNote && (
                <div className="rounded-xl bg-blue-50 px-3 py-2.5 text-xs text-blue-700 ring-1 ring-blue-200">
                  {scanNote}
                </div>
              )}

              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-200">
                ⚠️ 読取内容を必ず確認・修正してから支出登録へ進んでください。
              </p>

              {ocrText && (
                <OcrTextArea value={ocrText} onChange={setOcrText} />
              )}

              {(
                [
                  { label: "日付",       name: "date",        type: "text" },
                  { label: "支払先",     name: "payee",       type: "text" },
                  { label: "金額（円）", name: "amount",      type: "number" },
                  { label: "税区分",     name: "taxCategory", type: "text" },
                  { label: "分類",       name: "category",    type: "text" },
                  { label: "案件紐づけ", name: "projectLink", type: "text" },
                  { label: "メモ",       name: "memo",        type: "textarea" },
                ] as FieldConfig[]
              ).map((field) => (
                <FormField
                  key={field.name}
                  field={field}
                  value={receiptForm[field.name as keyof typeof receiptForm]}
                  onChange={receiptChange}
                />
              ))}

              {!receiptSaved ? (
                <button
                  type="button"
                  onClick={handleReceiptSave}
                  className="w-full rounded-2xl bg-[#8B4A3C] py-4 text-base font-bold text-white shadow-sm active:opacity-80"
                >
                  支出下書きとして保存
                </button>
              ) : (
                <PostSaveButtons
                  primaryLabel="月次収支へ進む"
                  primaryHref="/reports/monthly"
                  secondaryLabel="支出下書き一覧を見る"
                  secondaryHref="/reports/monthly"
                />
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              発注書・注文書 読取結果フォーム
          ══════════════════════════════════════════════════════ */}
          {hasScanned && scanType === "order" && (
            <div className="rounded-2xl bg-white p-4 shadow-sm space-y-4">
              <h2 className="border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">
                読取結果（発注書・注文書）
              </h2>

              {scanNote && (
                <div className="rounded-xl bg-blue-50 px-3 py-2.5 text-xs text-blue-700 ring-1 ring-blue-200">
                  {scanNote}
                </div>
              )}

              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-200">
                ⚠️ 読取内容を必ず確認・修正してから発注確認へ進んでください。
              </p>

              {ocrText && (
                <OcrTextArea value={ocrText} onChange={setOcrText} />
              )}

              {(
                [
                  { label: "元請名",         name: "clientName",   type: "text" },
                  { label: "発注日",         name: "orderDate",    type: "text" },
                  { label: "案件名",         name: "projectName",  type: "text" },
                  { label: "工事内容",       name: "workContent",  type: "text" },
                  { label: "発注金額（円）", name: "orderAmount",  type: "number" },
                  { label: "支払条件",       name: "paymentTerms", type: "text" },
                  { label: "備考",           name: "memo",         type: "textarea" },
                ] as FieldConfig[]
              ).map((field) => (
                <FormField
                  key={field.name}
                  field={field}
                  value={orderForm[field.name as keyof typeof orderForm]}
                  onChange={orderChange}
                />
              ))}

              {!orderSaved ? (
                <button
                  type="button"
                  onClick={handleOrderSave}
                  className="w-full rounded-2xl bg-[#8B4A3C] py-4 text-base font-bold text-white shadow-sm active:opacity-80"
                >
                  発注確認下書きとして保存
                </button>
              ) : (
                <PostSaveButtons
                  primaryLabel="材料・発注管理へ進む"
                  primaryHref="/projects/sample/materials"
                  secondaryLabel="発注確認下書き一覧を見る"
                  secondaryHref="/scan/drafts"
                />
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              その他書類 フォーム
          ══════════════════════════════════════════════════════ */}
          {hasScanned && scanType === "other" && (
            <div className="rounded-2xl bg-white p-4 shadow-sm space-y-4">
              <h2 className="border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">
                読取結果（その他書類）
              </h2>

              {scanNote && (
                <div className="rounded-xl bg-blue-50 px-3 py-2.5 text-xs text-blue-700 ring-1 ring-blue-200">
                  {scanNote}
                </div>
              )}

              <p className="rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-500">
                書類名・分類を入力して保存してください。後から一覧で確認できます。
              </p>

              {ocrText && (
                <OcrTextArea value={ocrText} onChange={setOcrText} />
              )}

              <div>
                <label className={labelCls}>書類名</label>
                <input
                  type="text"
                  value={otherForm.documentName}
                  onChange={(e) => otherChange("documentName", e.target.value)}
                  placeholder="例：〇〇マンション 発注書"
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>分類</label>
                <select
                  value={otherForm.category}
                  onChange={(e) => otherChange("category", e.target.value)}
                  className={inputCls}
                >
                  {DOCUMENT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelCls}>関連案件</label>
                <input
                  type="text"
                  value={otherForm.relatedProject}
                  onChange={(e) => otherChange("relatedProject", e.target.value)}
                  placeholder="例：〇〇マンション クロス貼替"
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>メモ</label>
                <textarea
                  value={otherForm.memo}
                  onChange={(e) => otherChange("memo", e.target.value)}
                  rows={4}
                  className={inputCls + " resize-y"}
                />
              </div>

              {!otherSaved ? (
                <button
                  type="button"
                  onClick={handleOtherSave}
                  className="w-full rounded-2xl bg-[#8B4A3C] py-4 text-base font-bold text-white shadow-sm active:opacity-80"
                >
                  書類として保存
                </button>
              ) : (
                <PostSaveButtons
                  primaryLabel="書類一覧を見る"
                  primaryHref="/scan/drafts"
                  secondaryLabel="ホームへ戻る"
                  secondaryHref="/"
                />
              )}
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

          {/* ── スキャン下書き一覧リンク ── */}
          <Link
            href="/scan/drafts"
            className="flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3.5 shadow-sm ring-1 ring-stone-100 active:opacity-75"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#fdf0ec] text-lg">
                📋
              </span>
              <div>
                <p className="text-sm font-bold text-stone-700">スキャン下書き一覧を見る</p>
                <p className="text-xs text-stone-400">保存済みの下書きを確認・登録へ進む</p>
              </div>
            </div>
            <span className="text-stone-300">›</span>
          </Link>

          {/* ── テスト感想入力リンク ── */}
          <div className="flex justify-end pb-2">
            <Link href="/test-feedback" className="text-xs text-stone-400 underline underline-offset-2 hover:text-[#8B4A3C]">
              この画面の感想を書く
            </Link>
          </div>

          <div className="pb-8" />

        </div>
      </div>
    </div>
  );
}
