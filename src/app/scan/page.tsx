"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { saveScanDraft } from "@/app/utils/scanDrafts";
import { saveExpenseDraft } from "@/app/utils/expenses";
import { saveOrderDraft } from "@/app/utils/orderDrafts";
import { saveStoredDocument } from "@/app/utils/documentStorage";
import {
  ocrImageFile,
  extractAmountFromText,
  extractDateFromText,
  extractCompanyFromText,
} from "@/app/utils/scanOcr";
import {
  structureOcrText,
  type AiStructuredResult,
  type AiCandidates,
} from "@/app/utils/aiStructuring";
import { preprocessImageForOcr } from "@/app/utils/imagePreprocess";

// ─── 型定義 ──────────────────────────────────────────────────
type ScanType = "agency" | "receipt" | "order" | "other" | null;

type FieldConfig = {
  label: string;
  name: string;
  type: "text" | "number" | "textarea";
};

type OcrExtracted = { amount: boolean; date: boolean; company: boolean };

type CandidateSelections = {
  clientName: string;
  siteAddress: string;
  orderDate: string;
  buildScheduleDate: string;
  orderAmount: string;
  workDescription: string;
  invoiceNumber: string;
  recipient: string;
};

const EMPTY_SELECTIONS: CandidateSelections = {
  clientName: "", siteAddress: "", orderDate: "", buildScheduleDate: "",
  orderAmount: "", workDescription: "", invoiceNumber: "", recipient: "",
};

// ─── スタイル定数 ─────────────────────────────────────────────
const inputCls =
  "w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-base text-stone-800 placeholder:text-stone-300 focus:border-[#8B4A3C] focus:outline-none focus:ring-2 focus:ring-[#8B4A3C]/20";
const labelCls = "mb-1 block text-sm font-bold text-stone-700";

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
    file.type === "image/heic" || file.type === "image/heif" ||
    file.name.toLowerCase().endsWith(".heic") || file.name.toLowerCase().endsWith(".heif")
  );
}
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function ocrToMemo(text: string, max = 300): string {
  return text.length <= max ? text : "";
}

// ─── 候補選択ボタン ───────────────────────────────────────────
function CandidateSelector({
  title, candidates, selected, onSelect,
}: {
  title: string;
  candidates: string[];
  selected: string;
  onSelect: (v: string) => void;
}) {
  if (candidates.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-bold text-stone-600">{title}</p>
      <div className="space-y-1">
        {candidates.map((c, i) => (
          <button key={i} type="button"
            onClick={() => onSelect(selected === c ? "" : c)}
            className={`w-full rounded-lg px-3 py-2.5 text-left text-sm transition-colors active:opacity-80 ${
              selected === c
                ? "bg-purple-700 font-bold text-white"
                : "border border-stone-200 bg-white text-stone-700"
            }`}>
            {c}
          </button>
        ))}
      </div>
      {selected && (
        <p className="text-xs text-purple-600">✓ 選択中：{selected}</p>
      )}
    </div>
  );
}

// ─── AI整理ボタンカード ────────────────────────────────────────
function AiStructureCard({ onPress }: { onPress: () => void }) {
  return (
    <div className="rounded-xl border border-purple-200 bg-purple-50 p-3 space-y-2">
      <p className="text-sm font-bold text-purple-800">AI整理</p>
      <p className="text-xs leading-relaxed text-purple-700">
        OCR文字をもとに、元請名・住所・金額・日付などを候補として抽出します。
        候補を選んでフォームへ反映できます。
      </p>
      <button type="button" onClick={onPress}
        className="w-full rounded-xl border-2 border-purple-300 bg-white py-2.5 text-sm font-bold text-purple-700 active:opacity-70">
        ✨ AIで整理する（候補を表示）
      </button>
    </div>
  );
}

// ─── AI整理結果カード（候補表示版）────────────────────────────
function AiResultCard({
  result, selections, onSelect, onApply,
}: {
  result: AiStructuredResult;
  selections: CandidateSelections;
  onSelect: (field: keyof CandidateSelections, value: string) => void;
  onApply: () => void;
}) {
  const { candidates } = result;
  const hasAny = Object.values(selections).some((v) => !!v);

  return (
    <div className="rounded-xl border border-purple-200 bg-purple-50 p-3 space-y-4">
      <div className="flex items-center gap-2">
        <p className="text-sm font-bold text-purple-800">AI整理結果</p>
        <span className="rounded-full bg-purple-200 px-1.5 py-0.5 text-[10px] font-bold text-purple-700">
          候補選択式
        </span>
      </div>

      {/* 注意 */}
      <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-700 ring-1 ring-amber-200 leading-relaxed">
        AI整理結果は候補です。住所・金額・日付・元請名は必ず原本と照合してください。
        候補が複数ある場合は、正しいものを選択してからフォームへ反映してください。
      </div>

      {/* 書類種別・固定情報 */}
      {(result.documentType || result.customerName) && (
        <div className="divide-y divide-stone-100 overflow-hidden rounded-xl bg-white">
          {result.documentType && (
            <div className="flex items-start gap-2 px-3 py-2">
              <span className="w-24 shrink-0 pt-0.5 text-xs text-stone-400">書類種別</span>
              <span className="text-sm text-stone-800">{result.documentType}</span>
            </div>
          )}
          {result.customerName && (
            <div className="flex items-start gap-2 px-3 py-2">
              <span className="w-24 shrink-0 pt-0.5 text-xs text-stone-400">お客様名</span>
              <span className="text-sm text-stone-800">{result.customerName}</span>
            </div>
          )}
          {result.orderNumber && (
            <div className="flex items-start gap-2 px-3 py-2">
              <span className="w-24 shrink-0 pt-0.5 text-xs text-stone-400">発注番号</span>
              <span className="text-sm text-stone-800">{result.orderNumber}</span>
            </div>
          )}
        </div>
      )}

      {/* 候補選択セクション */}
      <CandidateSelector title="元請名候補" candidates={candidates.companies}
        selected={selections.clientName} onSelect={(v) => onSelect("clientName", v)} />
      <CandidateSelector title="宛先候補" candidates={candidates.recipients}
        selected={selections.recipient} onSelect={(v) => onSelect("recipient", v)} />
      <CandidateSelector title="現場住所候補" candidates={candidates.addresses}
        selected={selections.siteAddress} onSelect={(v) => onSelect("siteAddress", v)} />
      <CandidateSelector title="発注日候補" candidates={candidates.dates}
        selected={selections.orderDate} onSelect={(v) => onSelect("orderDate", v)} />
      <CandidateSelector title="建方予定日候補" candidates={candidates.dates}
        selected={selections.buildScheduleDate} onSelect={(v) => onSelect("buildScheduleDate", v)} />
      <CandidateSelector title="発注金額候補" candidates={candidates.amounts}
        selected={selections.orderAmount} onSelect={(v) => onSelect("orderAmount", v)} />
      <CandidateSelector title="工事内容候補" candidates={candidates.workItems}
        selected={selections.workDescription} onSelect={(v) => onSelect("workDescription", v)} />
      <CandidateSelector title="インボイス登録番号候補" candidates={candidates.invoiceNumbers}
        selected={selections.invoiceNumber} onSelect={(v) => onSelect("invoiceNumber", v)} />

      {/* 警告 */}
      {result.warnings.length > 0 && (
        <div className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200 space-y-1">
          <p className="text-xs font-bold text-amber-700">⚠️ 注意事項</p>
          {result.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-600">• {w}</p>
          ))}
        </div>
      )}

      <button type="button" onClick={onApply} disabled={!hasAny}
        className="w-full rounded-xl bg-purple-700 py-2.5 text-sm font-bold text-white shadow-sm active:opacity-80 disabled:cursor-not-allowed disabled:opacity-40">
        選択した候補をフォームへ反映
      </button>
      {!hasAny && (
        <p className="text-center text-xs text-stone-400">上の候補を1つ以上タップして選択してください</p>
      )}
    </div>
  );
}

// ─── OCR読取文字カード ─────────────────────────────────────────
function OcrTextCard({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label className={labelCls}>OCR読取文字（編集可）</label>
      <p className="text-xs leading-relaxed text-stone-500">
        OCRで画像から抽出した文字です。
        発注書・見積書などの表形式では、文字化けや順番の崩れが起こることがあります。
        金額・日付・住所・元請名は必ず確認してください。
      </p>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={7}
        className="w-full resize-y rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 font-mono text-sm text-stone-700 focus:border-[#8B4A3C] focus:outline-none focus:ring-2 focus:ring-[#8B4A3C]/20" />
    </div>
  );
}

// ─── OCR仮反映バッジ ──────────────────────────────────────────
function OcrExtractedBadge({ extracted }: { extracted: OcrExtracted }) {
  const items = [
    extracted.company && "元請名",
    extracted.amount && "金額",
    extracted.date && "日付",
  ].filter(Boolean) as string[];
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-2 ring-1 ring-blue-100">
      <span className="text-xs font-bold text-blue-700">🔍 OCR仮反映：</span>
      {items.map((item) => (
        <span key={item} className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-600">{item}</span>
      ))}
      <span className="text-xs text-blue-600">を自動入力。必ず確認してください。</span>
    </div>
  );
}

// ─── フォームフィールド ───────────────────────────────────────
function FormField({ field, value, onChange }: {
  field: FieldConfig;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}) {
  return (
    <div>
      <label className={labelCls}>{field.label}</label>
      {field.type === "textarea" ? (
        <textarea name={field.name} value={value} onChange={onChange} rows={4} className={inputCls + " resize-y"} />
      ) : (
        <input type={field.type} name={field.name} value={value} onChange={onChange} className={inputCls} />
      )}
    </div>
  );
}

// ─── 保存後ボタン ─────────────────────────────────────────────
function PostSaveButtons({ primaryLabel, primaryHref, secondaryLabel, secondaryHref }: {
  primaryLabel: string; primaryHref: string;
  secondaryLabel: string; secondaryHref: string;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-green-50 px-4 py-3 ring-1 ring-green-200">
        <p className="text-sm font-bold text-green-700">✓ 保存しました。</p>
      </div>
      <Link href={primaryHref}
        className="flex w-full items-center justify-center rounded-2xl bg-[#8B4A3C] py-4 text-base font-bold text-white shadow-sm active:opacity-80">
        {primaryLabel}
      </Link>
      <Link href={secondaryHref}
        className="flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-white py-3.5 text-sm font-bold text-stone-600 shadow-sm active:opacity-80">
        {secondaryLabel}
      </Link>
    </div>
  );
}

// ─── メインコンポーネント ─────────────────────────────────────
export default function ScanPage() {
  const [scanType,     setScanType]     = useState<ScanType>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl,   setPreviewUrl]   = useState<string | null>(null);
  const [hasScanned,   setHasScanned]   = useState(false);
  const [noFileWarn,   setNoFileWarn]   = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // OCR 状態
  const [isOcrLoading,    setIsOcrLoading]    = useState(false);
  const [ocrProgress,     setOcrProgress]     = useState(0);
  const [ocrText,         setOcrText]         = useState("");
  const [ocrError,        setOcrError]        = useState("");
  const [scanNote,        setScanNote]        = useState("");
  const [ocrPreprocessed, setOcrPreprocessed] = useState(false);
  const [ocrExtracted,    setOcrExtracted]    = useState<OcrExtracted>({ amount: false, date: false, company: false });

  // AI整理状態
  const [aiStructured,   setAiStructured]   = useState<AiStructuredResult | null>(null);
  const [selectedCands,  setSelectedCands]  = useState<CandidateSelections>(EMPTY_SELECTIONS);
  const [aiMsg,          setAiMsg]          = useState("");

  // 保存済みフラグ
  const [agencySaved,  setAgencySaved]  = useState(false);
  const [receiptSaved, setReceiptSaved] = useState(false);
  const [orderSaved,   setOrderSaved]   = useState(false);
  const [otherSaved,   setOtherSaved]   = useState(false);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  // ── フォーム（全て空で初期化） ────────────────────────────────
  const [agencyForm, setAgencyForm] = useState({
    clientName: "", contactName: "", projectName: "", address: "",
    workContent: "", contractAmount: "", sekouDate: "", paymentTerms: "", memo: "",
  });
  const [receiptForm, setReceiptForm] = useState({
    date: "", payee: "", amount: "", taxCategory: "", category: "", projectLink: "", memo: "",
  });
  const [orderForm, setOrderForm] = useState({
    clientName: "", orderDate: "", projectName: "", workContent: "",
    orderAmount: "", paymentTerms: "", memo: "",
  });
  const [otherForm, setOtherForm] = useState({
    documentName: "", category: "その他", relatedProject: "", memo: "",
  });
  const [checks, setChecks] = useState({ amount: false, date: false, address: false, client: false });

  // ── リセット ─────────────────────────────────────────────────
  function resetSavedStates() {
    setAgencySaved(false); setReceiptSaved(false); setOrderSaved(false); setOtherSaved(false);
    setAiMsg(""); setAiStructured(null); setSelectedCands(EMPTY_SELECTIONS);
  }
  function resetForms() {
    setAgencyForm({ clientName: "", contactName: "", projectName: "", address: "", workContent: "", contractAmount: "", sekouDate: "", paymentTerms: "", memo: "" });
    setReceiptForm({ date: "", payee: "", amount: "", taxCategory: "", category: "", projectLink: "", memo: "" });
    setOrderForm({ clientName: "", orderDate: "", projectName: "", workContent: "", orderAmount: "", paymentTerms: "", memo: "" });
    setOtherForm({ documentName: "", category: "その他", relatedProject: "", memo: "" });
    setOcrExtracted({ amount: false, date: false, company: false });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setHasScanned(false); setNoFileWarn(false);
    setOcrText(""); setOcrError(""); setScanNote(""); setOcrPreprocessed(false);
    resetSavedStates(); resetForms();
    setPreviewUrl(file && isPreviewableImage(file) ? URL.createObjectURL(file) : null);
  }

  // ── OCR後フォーム反映 ─────────────────────────────────────────
  function populateFormsFromOcr(text: string, type: ScanType, file: File | null) {
    const amount  = extractAmountFromText(text);
    const date    = extractDateFromText(text);
    const company = extractCompanyFromText(text);
    const memoVal = ocrToMemo(text, 300);
    setOcrExtracted({ amount: !!amount, date: !!date, company: !!company });
    if (type === "agency") {
      setAgencyForm({ clientName: company, contactName: "", projectName: "", address: "", workContent: "", contractAmount: amount, sekouDate: date, paymentTerms: "", memo: memoVal });
    } else if (type === "receipt") {
      setReceiptForm({ date, payee: "", amount, taxCategory: "", category: "", projectLink: "", memo: memoVal });
    } else if (type === "order") {
      setOrderForm({ clientName: company, orderDate: date, projectName: "", workContent: "", orderAmount: amount, paymentTerms: "", memo: memoVal });
    } else if (type === "other") {
      setOtherForm({ documentName: file?.name ?? "", category: "その他", relatedProject: "", memo: memoVal });
    }
  }

  // ── 読取ハンドラ（前処理あり）────────────────────────────────
  async function handleScan() {
    if (!selectedFile) { setNoFileWarn(true); return; }
    if (!scanType) { alert("スキャン種別を選択してください。"); return; }
    setNoFileWarn(false);
    setChecks({ amount: false, date: false, address: false, client: false });
    resetSavedStates(); resetForms();
    setOcrText(""); setOcrError(""); setScanNote(""); setOcrProgress(0); setOcrPreprocessed(false);

    if (selectedFile.type === "application/pdf") {
      setScanNote("PDFの中身読取は次工程で実装します。現在はファイル保存と下書き入力のみ対応しています。");
      if (scanType === "other") setOtherForm((p) => ({ ...p, documentName: selectedFile.name }));
      setHasScanned(true); return;
    }
    if (isHeic(selectedFile)) {
      setScanNote("HEIC形式はブラウザで直接読取できない場合があります。スクリーンショット、またはJPEG/PNGに変換してから読み取ってください。");
      if (scanType === "other") setOtherForm((p) => ({ ...p, documentName: selectedFile.name }));
      setHasScanned(true); return;
    }
    if (!isPreviewableImage(selectedFile)) { setHasScanned(true); return; }

    setIsOcrLoading(true);
    try {
      // 前処理を試みる
      let ocrSource: File | Blob = selectedFile;
      try {
        const preprocessed = await preprocessImageForOcr(selectedFile);
        if (preprocessed) {
          ocrSource = preprocessed;
          setOcrPreprocessed(true);
        }
      } catch {
        // 失敗したらオリジナルで続行
      }

      const text = await ocrImageFile(ocrSource, (p) => setOcrProgress(p));
      setOcrText(text);
      populateFormsFromOcr(text, scanType, selectedFile);
      setHasScanned(true);
    } catch (err) {
      console.error("OCR error:", err);
      setOcrError("画像の読取に失敗しました。\n写真が暗い、文字が小さい、傾いている場合は、撮り直して再度お試しください。");
    } finally {
      setIsOcrLoading(false);
    }
  }

  // ── AI整理ハンドラ ────────────────────────────────────────────
  function handleAiOrganize() {
    if (!ocrText) return;
    const result = structureOcrText(ocrText);
    setAiStructured(result);
    setSelectedCands(EMPTY_SELECTIONS);
    setAiMsg("");
  }

  // ── 選択候補をフォームへ反映 ──────────────────────────────────
  function applyAiToForm() {
    if (!aiStructured) return;
    const s = selectedCands;
    const pick = (old: string, next: string) => next || old;

    if (scanType === "order") {
      setOrderForm((p) => ({
        clientName:   pick(p.clientName,   s.clientName),
        orderDate:    pick(p.orderDate,    s.orderDate),
        projectName:  p.projectName,
        workContent:  pick(p.workContent,  s.workDescription),
        orderAmount:  pick(p.orderAmount,  s.orderAmount.replace(/,/g, "")),
        paymentTerms: p.paymentTerms,
        memo:         pick(p.memo,         aiStructured.warnings.join("\n")),
      }));
    } else if (scanType === "agency") {
      setAgencyForm((p) => ({
        clientName:     pick(p.clientName,     s.clientName),
        contactName:    p.contactName,
        projectName:    p.projectName,
        address:        pick(p.address,        s.siteAddress),
        workContent:    pick(p.workContent,    s.workDescription),
        contractAmount: pick(p.contractAmount, s.orderAmount.replace(/,/g, "")),
        sekouDate:      pick(p.sekouDate,      s.buildScheduleDate || s.orderDate),
        paymentTerms:   p.paymentTerms,
        memo:           pick(p.memo,           aiStructured.warnings.join("\n")),
      }));
    } else if (scanType === "receipt") {
      setReceiptForm((p) => ({
        date:        pick(p.date,    s.orderDate),
        payee:       pick(p.payee,   s.clientName),
        amount:      pick(p.amount,  s.orderAmount.replace(/,/g, "")),
        taxCategory: p.taxCategory,
        category:    p.category,
        projectLink: p.projectLink,
        memo:        p.memo,
      }));
    } else if (scanType === "other") {
      setOtherForm((p) => ({ ...p }));
    }

    setAiMsg("選択した候補をフォームへ反映しました。内容を確認してください。");
    setTimeout(() => setAiMsg(""), 5000);
  }

  // ── フォーム onChange ─────────────────────────────────────────
  function agencyChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setAgencyForm((p) => ({ ...p, [e.target.name]: e.target.value }));
  }
  function receiptChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setReceiptForm((p) => ({ ...p, [e.target.name]: e.target.value }));
  }
  function orderChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setOrderForm((p) => ({ ...p, [e.target.name]: e.target.value }));
  }
  function otherChange(field: string, value: string) {
    setOtherForm((p) => ({ ...p, [field]: value }));
  }

  // ── 保存ハンドラ ─────────────────────────────────────────────
  const aiData = aiStructured ? (aiStructured as unknown as Record<string, unknown>) : null;
  const aiCandidatesData = aiStructured?.candidates
    ? (aiStructured.candidates as unknown as Record<string, unknown>)
    : null;
  const aiSt = aiStructured ? "completed" : "not_started";

  function handleAgencySave() {
    saveScanDraft({
      scanType: "client_document",
      fileName: selectedFile?.name ?? "", fileType: selectedFile?.type ?? "", fileSize: selectedFile?.size ?? 0,
      status: "draft", extractedData: { ...agencyForm }, memo: agencyForm.memo,
      ocrText: ocrText || undefined,
      aiStructuredData: aiData, aiCandidates: aiCandidatesData, aiStatus: aiSt,
    });
    setAgencySaved(true);
  }
  function handleReceiptSave() {
    saveExpenseDraft({
      date: receiptForm.date, vendor: receiptForm.payee, amount: receiptForm.amount,
      taxType: receiptForm.taxCategory, category: receiptForm.category,
      linkedProject: receiptForm.projectLink, memo: receiptForm.memo,
      fileName: selectedFile?.name ?? "", fileType: selectedFile?.type ?? "", fileSize: selectedFile?.size ?? 0,
      status: "draft", ocrText: ocrText || undefined,
      aiStructuredData: aiData, aiCandidates: aiCandidatesData, aiStatus: aiSt,
    });
    setReceiptSaved(true);
  }
  function handleOrderSave() {
    saveOrderDraft({
      clientName: orderForm.clientName, orderDate: orderForm.orderDate,
      projectName: orderForm.projectName, workDescription: orderForm.workContent,
      orderAmount: orderForm.orderAmount, paymentTerm: orderForm.paymentTerms, memo: orderForm.memo,
      fileName: selectedFile?.name ?? "", fileType: selectedFile?.type ?? "", fileSize: selectedFile?.size ?? 0,
      status: "draft", ocrText: ocrText || undefined,
      aiStructuredData: aiData, aiCandidates: aiCandidatesData, aiStatus: aiSt,
    });
    setOrderSaved(true);
  }
  function handleOtherSave() {
    saveStoredDocument({
      documentName: otherForm.documentName || selectedFile?.name || "（無題書類）",
      category: otherForm.category, relatedProject: otherForm.relatedProject, memo: otherForm.memo,
      fileName: selectedFile?.name ?? "", fileType: selectedFile?.type ?? "", fileSize: selectedFile?.size ?? 0,
      ocrText: ocrText || undefined,
      aiStructuredData: aiData, aiCandidates: aiCandidatesData, aiStatus: aiSt,
    });
    setOtherSaved(true);
  }

  // ── OCRセクション描画 ─────────────────────────────────────────
  function renderOcrSection() {
    if (!ocrText) return null;
    return (
      <div className="space-y-3">
        {ocrPreprocessed && (
          <p className="text-xs text-stone-400">✓ OCR前処理（拡大・グレースケール・コントラスト強調）を適用して読み取りました。</p>
        )}
        <OcrTextCard value={ocrText} onChange={setOcrText} />
        {!aiStructured ? (
          <AiStructureCard onPress={handleAiOrganize} />
        ) : (
          <AiResultCard
            result={aiStructured}
            selections={selectedCands}
            onSelect={(field, value) => setSelectedCands((p) => ({ ...p, [field]: value }))}
            onApply={applyAiToForm}
          />
        )}
        {aiMsg && (
          <div className={`rounded-xl px-4 py-3 ring-1 ${aiMsg.includes("反映") ? "bg-green-50 ring-green-200" : "bg-purple-50 ring-purple-200"}`}>
            <p className={`text-sm font-bold ${aiMsg.includes("反映") ? "text-green-700" : "text-purple-700"}`}>{aiMsg}</p>
          </div>
        )}
        <OcrExtractedBadge extracted={ocrExtracted} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        <header className="mb-4">
          <Link href="/" className="mb-3 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">← ホームへ戻る</Link>
          <h1 className="text-xl font-bold text-stone-800">スキャン登録</h1>
          <p className="mt-1 text-sm text-stone-500">PDF・FAX・LINE画像・レシートを読み取り、案件登録や支出登録に使います。</p>
        </header>

        <div className="space-y-4">

          {/* 読取精度カード */}
          <div className="rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-200">
            <h2 className="mb-1.5 text-sm font-bold text-stone-700">読取精度について</h2>
            <p className="text-xs leading-relaxed text-stone-500">
              OCR前処理（拡大・グレースケール・コントラスト強調）を適用します。
              AI整理で候補を複数表示し、正しいものを選択してフォームへ反映できます。
              金額・日付・住所・元請名は必ず原本で確認してください。
            </p>
          </div>

          {/* スキャン種別選択 */}
          <div className="space-y-2">
            <h2 className="px-1 text-sm font-bold text-stone-700">スキャン種別を選んでください</h2>
            {SCAN_TYPES.map((type) => {
              const sel = scanType === type.id;
              return (
                <button key={type.id} type="button"
                  onClick={() => { setScanType(type.id); setHasScanned(false); setOcrText(""); setOcrError(""); setScanNote(""); resetSavedStates(); }}
                  className={`flex w-full items-center gap-4 rounded-2xl p-4 text-left shadow-sm active:opacity-75 transition-colors ${sel ? "bg-[#8B4A3C] ring-2 ring-[#8B4A3C]" : "bg-white ring-1 ring-stone-100"}`}>
                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl ${sel ? "bg-white/10" : "bg-[#fdf0ec]"}`}>{type.icon}</span>
                  <div className="flex flex-col gap-0.5">
                    <span className={`text-sm font-bold ${sel ? "text-white" : "text-stone-800"}`}>{type.title}</span>
                    <span className={`text-xs leading-snug ${sel ? "text-amber-100" : "text-stone-500"}`}>{type.desc}</span>
                  </div>
                  <span className={`ml-auto shrink-0 text-lg ${sel ? "text-white" : "text-stone-300"}`}>{sel ? "✓" : "›"}</span>
                </button>
              );
            })}
          </div>

          {/* ファイル選択 */}
          <div className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
            <h2 className="border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">ファイルを選択</h2>
            <input ref={fileInputRef} type="file" accept="image/*,application/pdf" onChange={handleFileChange} className="hidden" />
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-200 bg-stone-50 py-8 active:opacity-70">
              <span className="text-3xl">📂</span>
              <span className="text-sm font-bold text-stone-600">ファイルを選択</span>
              <span className="text-xs text-stone-400">PDF・画像（JPEG・PNG・WebP）に対応</span>
              <span className="text-xs text-stone-400">iPhone写真（HEIC）はプレビューできない場合があります</span>
            </button>

            {selectedFile && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-stone-700">選択したファイル</h3>
                <div className="rounded-xl border border-stone-100 bg-stone-50 px-4 py-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{selectedFile.type === "application/pdf" ? "📄" : "🖼️"}</span>
                    <p className="text-sm font-bold text-stone-800 leading-tight break-all">{selectedFile.name}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-stone-400">
                    <span className="rounded bg-stone-200 px-1.5 py-0.5 font-bold text-stone-600">{getFileTypeLabel(selectedFile)}</span>
                    <span>{selectedFile.type || "不明"}</span>
                    <span>{formatFileSize(selectedFile.size)}</span>
                  </div>
                </div>
                {isPreviewableImage(selectedFile) && previewUrl && (
                  <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewUrl} alt="プレビュー" className="max-h-[60vh] w-full object-contain" style={{ background: "#fff" }} />
                  </div>
                )}
                {isHeic(selectedFile) && (
                  <div className="overflow-hidden rounded-xl ring-1 ring-orange-300">
                    <div className="flex items-center gap-2 bg-orange-100 px-4 py-2.5">
                      <span className="text-lg">📱</span>
                      <p className="text-sm font-bold text-orange-800">iPhone写真（HEIC形式）が選択されています</p>
                    </div>
                    <div className="bg-orange-50 px-4 py-3 space-y-2">
                      <p className="text-xs leading-relaxed text-orange-700">HEIC形式は一部のブラウザでプレビューできませんが、読取はそのまま続行できます。</p>
                      <div className="rounded-lg bg-white px-3 py-2.5 ring-1 ring-orange-200 space-y-1.5">
                        <p className="text-xs font-bold text-stone-700">スクリーンショットで代替する方法</p>
                        <ol className="text-xs leading-relaxed text-stone-500 list-decimal list-inside space-y-0.5">
                          <li>iPhoneのカメラロールで写真を開く</li>
                          <li>スクリーンショットを撮る（電源ボタン＋音量アップ）</li>
                          <li>撮ったスクリーンショット（JPEG）をアップロードする</li>
                        </ol>
                      </div>
                    </div>
                  </div>
                )}
                {selectedFile.type === "application/pdf" && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 space-y-1">
                    <p className="text-sm font-bold text-blue-800">PDFファイルが選択されています</p>
                    <p className="text-xs text-blue-600">PDFの中身表示と文字読取は次工程で実装します。</p>
                  </div>
                )}
                {!isPreviewableImage(selectedFile) && !isHeic(selectedFile) && selectedFile.type !== "application/pdf" && (
                  <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-500">
                    このファイル形式は現在プレビューに対応していません。
                  </div>
                )}
              </div>
            )}
          </div>

          {noFileWarn && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700 ring-1 ring-red-200">先にファイルを選択してください。</div>
          )}

          {/* 読取ボタン */}
          <button type="button" onClick={handleScan} disabled={isOcrLoading}
            className="w-full rounded-2xl bg-[#8B4A3C] py-4 text-base font-bold text-white shadow-sm active:opacity-80 disabled:cursor-not-allowed disabled:opacity-50">
            {isOcrLoading ? "読み取り中…" : "画像を読み取る"}
          </button>

          {/* OCR処理中 */}
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
                    <div className="h-2 rounded-full bg-[#8B4A3C] transition-all duration-300" style={{ width: `${ocrProgress}%` }} />
                  </div>
                  <p className="text-right text-xs text-stone-400">{ocrProgress}%</p>
                </div>
              )}
            </div>
          )}

          {ocrError && (
            <div className="rounded-xl bg-red-50 px-4 py-3 ring-1 ring-red-200">
              <p className="whitespace-pre-line text-sm font-bold text-red-700">{ocrError}</p>
              <button type="button" onClick={() => setOcrError("")} className="mt-2 text-xs text-red-500 underline">閉じる</button>
            </div>
          )}

          {/* 元請書類フォーム */}
          {hasScanned && scanType === "agency" && (
            <div className="rounded-2xl bg-white p-4 shadow-sm space-y-4">
              <h2 className="border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">読取結果（元請書類）</h2>
              {scanNote && <div className="rounded-xl bg-blue-50 px-3 py-2.5 text-xs text-blue-700 ring-1 ring-blue-200">{scanNote}</div>}
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-200">⚠️ 読取内容を必ず確認・修正してから案件登録へ進んでください。</p>
              {renderOcrSection()}
              {([ { label: "元請名", name: "clientName", type: "text" }, { label: "担当者", name: "contactName", type: "text" }, { label: "案件名", name: "projectName", type: "text" }, { label: "現場住所", name: "address", type: "text" }, { label: "工事内容", name: "workContent", type: "text" }, { label: "請負金額（円）", name: "contractAmount", type: "number" }, { label: "施工予定日", name: "sekouDate", type: "text" }, { label: "支払条件", name: "paymentTerms", type: "text" }, { label: "備考", name: "memo", type: "textarea" }, ] as FieldConfig[]).map((f) => (
                <FormField key={f.name} field={f} value={agencyForm[f.name as keyof typeof agencyForm]} onChange={agencyChange} />
              ))}
              {!agencySaved ? (
                <button type="button" onClick={handleAgencySave} className="w-full rounded-2xl bg-[#8B4A3C] py-4 text-base font-bold text-white shadow-sm active:opacity-80">案件下書きとして保存</button>
              ) : (
                <PostSaveButtons primaryLabel="案件登録へ進む" primaryHref="/projects/import" secondaryLabel="スキャン下書き一覧を見る" secondaryHref="/scan/drafts" />
              )}
            </div>
          )}

          {/* レシートフォーム */}
          {hasScanned && scanType === "receipt" && (
            <div className="rounded-2xl bg-white p-4 shadow-sm space-y-4">
              <h2 className="border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">読取結果（レシート）</h2>
              {scanNote && <div className="rounded-xl bg-blue-50 px-3 py-2.5 text-xs text-blue-700 ring-1 ring-blue-200">{scanNote}</div>}
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-200">⚠️ 読取内容を必ず確認・修正してから支出登録へ進んでください。</p>
              {renderOcrSection()}
              {([ { label: "日付", name: "date", type: "text" }, { label: "支払先", name: "payee", type: "text" }, { label: "金額（円）", name: "amount", type: "number" }, { label: "税区分", name: "taxCategory", type: "text" }, { label: "分類", name: "category", type: "text" }, { label: "案件紐づけ", name: "projectLink", type: "text" }, { label: "メモ", name: "memo", type: "textarea" }, ] as FieldConfig[]).map((f) => (
                <FormField key={f.name} field={f} value={receiptForm[f.name as keyof typeof receiptForm]} onChange={receiptChange} />
              ))}
              {!receiptSaved ? (
                <button type="button" onClick={handleReceiptSave} className="w-full rounded-2xl bg-[#8B4A3C] py-4 text-base font-bold text-white shadow-sm active:opacity-80">支出下書きとして保存</button>
              ) : (
                <PostSaveButtons primaryLabel="月次収支へ進む" primaryHref="/reports/monthly" secondaryLabel="支出下書き一覧を見る" secondaryHref="/reports/monthly" />
              )}
            </div>
          )}

          {/* 発注書・注文書フォーム */}
          {hasScanned && scanType === "order" && (
            <div className="rounded-2xl bg-white p-4 shadow-sm space-y-4">
              <h2 className="border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">読取結果（発注書・注文書）</h2>
              {scanNote && <div className="rounded-xl bg-blue-50 px-3 py-2.5 text-xs text-blue-700 ring-1 ring-blue-200">{scanNote}</div>}
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-200">⚠️ 読取内容を必ず確認・修正してから発注確認へ進んでください。</p>
              {renderOcrSection()}
              {([ { label: "元請名", name: "clientName", type: "text" }, { label: "発注日", name: "orderDate", type: "text" }, { label: "案件名", name: "projectName", type: "text" }, { label: "工事内容", name: "workContent", type: "text" }, { label: "発注金額（円）", name: "orderAmount", type: "number" }, { label: "支払条件", name: "paymentTerms", type: "text" }, { label: "備考", name: "memo", type: "textarea" }, ] as FieldConfig[]).map((f) => (
                <FormField key={f.name} field={f} value={orderForm[f.name as keyof typeof orderForm]} onChange={orderChange} />
              ))}
              {!orderSaved ? (
                <button type="button" onClick={handleOrderSave} className="w-full rounded-2xl bg-[#8B4A3C] py-4 text-base font-bold text-white shadow-sm active:opacity-80">発注確認下書きとして保存</button>
              ) : (
                <PostSaveButtons primaryLabel="材料・発注管理へ進む" primaryHref="/projects/sample/materials" secondaryLabel="発注確認下書き一覧を見る" secondaryHref="/scan/drafts" />
              )}
            </div>
          )}

          {/* その他書類フォーム */}
          {hasScanned && scanType === "other" && (
            <div className="rounded-2xl bg-white p-4 shadow-sm space-y-4">
              <h2 className="border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">読取結果（その他書類）</h2>
              {scanNote && <div className="rounded-xl bg-blue-50 px-3 py-2.5 text-xs text-blue-700 ring-1 ring-blue-200">{scanNote}</div>}
              <p className="rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-500">書類名・分類を入力して保存してください。後から一覧で確認できます。</p>
              {renderOcrSection()}
              <div>
                <label className={labelCls}>書類名</label>
                <input type="text" value={otherForm.documentName} onChange={(e) => otherChange("documentName", e.target.value)} placeholder="例：〇〇マンション 発注書" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>分類</label>
                <select value={otherForm.category} onChange={(e) => otherChange("category", e.target.value)} className={inputCls}>
                  {DOCUMENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>関連案件</label>
                <input type="text" value={otherForm.relatedProject} onChange={(e) => otherChange("relatedProject", e.target.value)} placeholder="例：〇〇マンション クロス貼替" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>メモ</label>
                <textarea value={otherForm.memo} onChange={(e) => otherChange("memo", e.target.value)} rows={4} className={inputCls + " resize-y"} />
              </div>
              {!otherSaved ? (
                <button type="button" onClick={handleOtherSave} className="w-full rounded-2xl bg-[#8B4A3C] py-4 text-base font-bold text-white shadow-sm active:opacity-80">書類として保存</button>
              ) : (
                <PostSaveButtons primaryLabel="書類一覧を見る" primaryHref="/scan/drafts" secondaryLabel="ホームへ戻る" secondaryHref="/" />
              )}
            </div>
          )}

          {/* 読取内容確認カード */}
          {hasScanned && (
            <div className="rounded-2xl bg-amber-50 p-4 shadow-sm ring-1 ring-amber-200 space-y-3">
              <h3 className="text-sm font-bold text-amber-800">読取内容確認</h3>
              <p className="text-xs text-amber-700 leading-relaxed">金額・日付・住所・元請名は必ず確認してください。</p>
              <div className="space-y-2.5">
                {[ { key: "amount", label: "金額を確認した" }, { key: "date", label: "日付を確認した" }, { key: "address", label: "住所を確認した" }, { key: "client", label: "元請名・支払先を確認した" } ].map(({ key, label }) => {
                  const checked = checks[key as keyof typeof checks];
                  return (
                    <label key={key} className="flex cursor-pointer items-center gap-3">
                      <input type="checkbox" checked={checked}
                        onChange={(e) => setChecks((p) => ({ ...p, [key]: e.target.checked }))}
                        className="h-5 w-5 rounded border-amber-300 accent-[#8B4A3C]" />
                      <span className={`text-sm ${checked ? "text-green-700 line-through" : "text-amber-800"}`}>{label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* スキャン下書き一覧リンク */}
          <Link href="/scan/drafts"
            className="flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3.5 shadow-sm ring-1 ring-stone-100 active:opacity-75">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#fdf0ec] text-lg">📋</span>
              <div>
                <p className="text-sm font-bold text-stone-700">スキャン下書き一覧を見る</p>
                <p className="text-xs text-stone-400">保存済みの下書きを確認・登録へ進む</p>
              </div>
            </div>
            <span className="text-stone-300">›</span>
          </Link>

          <div className="flex justify-end pb-2">
            <Link href="/test-feedback" className="text-xs text-stone-400 underline underline-offset-2 hover:text-[#8B4A3C]">この画面の感想を書く</Link>
          </div>
          <div className="pb-8" />
        </div>
      </div>
    </div>
  );
}
