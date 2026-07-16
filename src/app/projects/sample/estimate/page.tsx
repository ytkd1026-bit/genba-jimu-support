"use client";

import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import {
  estimatePdfFileName,
  estimateOrderPdfFileName,
  storagePdfFileName,
} from "@/app/utils/pdfFileName";
import { upsertEstimate, setSelectedEstimateId, getSavedEstimates, STATUS_LABELS } from "@/app/utils/savedEstimates";
import { getTestMode } from "@/app/utils/testMode";
import { matchesKeyword } from "@/app/utils/search";
import { draftKey } from "@/app/utils/draftStorage";
import { useAutoDraft } from "@/hooks/useAutoDraft";
import { getCompanyInfoForPdf } from "@/app/utils/companySettings";
import { simpleTaxAmount } from "@/app/utils/taxCalculation";
import { SaveStatusBar } from "@/components/SaveStatusBar";

// PDF出力用の案件情報（固定値・将来はDBまたはpropsから取得）
// 注：PDFフォント（Noto Sans JP）は△□◇等の記号グリフを収録していないため、
//     プレースホルダー文言には「〇〇」を使用する（文字化け防止）
const PDF_CLIENT_NAME   = "〇〇工務店";
const PDF_PROJECT_NAME  = "〇〇マンション クロス貼替";
const PDF_WORK_CONTENT  = "洋室クロス貼替・洗面所CF貼替";
const PDF_ESTIMATE_DATE = "2026-05-30";

// 事業者設定との共通キー（settings/company/page.tsx と同じ値を参照）

// ─── 案件検索用型定義・仮データ ──────────────────────────────
type EstSearchProject = {
  id: string;
  date: string;
  projectName: string;
  clientName: string;
  siteAddress: string;
  workContent: string;
  sekouDate: string;
  status: string;
};

const EST_STATUS_STYLE: Record<string, string> = {
  見積中: "bg-amber-100 text-amber-800",
  下書き: "bg-stone-100 text-stone-600",
  提出済み: "bg-blue-100 text-blue-700",
  受注:   "bg-green-100 text-green-700",
};

const EST_SEARCH_PROJECTS: EstSearchProject[] = [
  {
    id: "ep1", date: "2026/06/03",
    projectName: "〇〇マンション クロス貼替", clientName: "〇〇工務店",
    siteAddress: "大阪府堺市〇〇区", workContent: "洋室クロス貼替・洗面所CF貼替",
    sekouDate: "2026/06/03", status: "見積中",
  },
  {
    id: "ep2", date: "2026/06/05",
    projectName: "〇〇店舗 床補修", clientName: "〇〇リフォーム",
    siteAddress: "大阪府大阪市〇〇区", workContent: "店舗床補修",
    sekouDate: "2026/06/05", status: "下書き",
  },
];

type CompanyInfoState = {
  name: string;
  postalCode: string;
  address: string;
  representative: string;
  tel: string;
  email: string;
  invoiceNumber: string;
};

const DEFAULT_COMPANY_INFO: CompanyInfoState = {
  name:           "REVO",
  postalCode:     "〒590-0000",
  address:        "大阪府堺市〇〇区〇〇町",
  representative: "代表　山田 太郎",
  tel:            "090-0000-0000",
  email:          "example@example.com",
  invoiceNumber:  "T0000000000000",
};

// ─── 型定義 ──────────────────────────────────────────────────
type LineItem = {
  id: number;
  category: string;
  koujiName: string;
  koujiContent: string;
  location1: string;
  location2: string;
  qty: string;
  unit: string;
  unitPrice: string;
  note: string;
};

type CostItem = {
  id: number;
  costCategory: string;
  targetCategory: string;
  targetKouji: string;
  content: string;
  qty: string;
  unit: string;
  costUnitPrice: string;
  note: string;
};

// ─── 定数 ────────────────────────────────────────────────────
const UNITS = ["m", "㎡", "枚", "式", "人工", "箇所", "本", "ケース", "台"];
const LOCATION2_OPTIONS = ["天井", "壁", "床", "共通"];
const COST_CATEGORIES = [
  "材料費", "副資材", "施工費", "外注費", "諸経費", "設備機器代", "その他",
];
// 明細の項目（複数選択対応のプリセット）
const PREDEFINED_CATEGORIES = [
  "内装工事", "床工事", "天井工事", "壁工事", "建具工事", "塗装工事", "解体工事", "諸経費",
];

// ─── 初期データ ───────────────────────────────────────────────
const initialLines: LineItem[] = [
  {
    id: 1, category: "内装工事", koujiName: "クロス貼替",
    koujiContent: "既存クロスめくり・下地処理・新規クロス貼り",
    location1: "洋室", location2: "壁", qty: "50", unit: "m", unitPrice: "1200", note: "",
  },
  {
    id: 2, category: "床工事", koujiName: "CF貼替",
    koujiContent: "既存CF撤去・下地調整・新規CF貼り",
    location1: "洗面所", location2: "床", qty: "8", unit: "㎡", unitPrice: "3500", note: "",
  },
  {
    id: 3, category: "諸経費", koujiName: "諸経費",
    koujiContent: "駐車場代・交通費・廃材処分費",
    location1: "現場全体", location2: "共通", qty: "1", unit: "式", unitPrice: "8000", note: "",
  },
];

const initialCosts: CostItem[] = [
  {
    id: 1, costCategory: "材料費", targetCategory: "内装工事", targetKouji: "クロス貼替",
    content: "クロス材料", qty: "50", unit: "m", costUnitPrice: "300", note: "材料仕入れ想定",
  },
  {
    id: 2, costCategory: "副資材", targetCategory: "内装工事", targetKouji: "クロス貼替",
    content: "糊・パテ・副資材", qty: "1", unit: "式", costUnitPrice: "3000", note: "副資材一式",
  },
  {
    id: 3, costCategory: "施工費", targetCategory: "共通", targetKouji: "共通",
    content: "施工人工", qty: "1", unit: "人工", costUnitPrice: "28000", note: "自社人工または外注人工",
  },
  {
    id: 4, costCategory: "材料費", targetCategory: "床工事", targetKouji: "CF貼替",
    content: "CF材料", qty: "8", unit: "㎡", costUnitPrice: "1200", note: "材料仕入れ想定",
  },
  {
    id: 5, costCategory: "諸経費", targetCategory: "共通", targetKouji: "共通",
    content: "駐車場・交通費・廃材処分", qty: "1", unit: "式", costUnitPrice: "8000", note: "現場共通経費",
  },
];

// ─── 空行テンプレート ─────────────────────────────────────────
function emptyLine(id: number): LineItem {
  return { id, category: "内装工事", koujiName: "", koujiContent: "", location1: "", location2: "壁", qty: "1", unit: "式", unitPrice: "0", note: "" };
}
function emptyCost(id: number): CostItem {
  return { id, costCategory: "材料費", targetCategory: "", targetKouji: "", content: "", qty: "1", unit: "式", costUnitPrice: "0", note: "" };
}

// ─── ユーティリティ ───────────────────────────────────────────
function toNum(v: string): number { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function formatYen(n: number): string { return "¥" + n.toLocaleString("ja-JP"); }

// ─── スタイル定数 ─────────────────────────────────────────────
// 提出用（白エリア）
const fldInput = "w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm leading-[1.35] text-stone-800 placeholder:text-stone-300 focus:border-[#8B4A3C] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#8B4A3C]/30 min-h-[44px] [word-break:keep-all] [overflow-wrap:anywhere]";
const fldSelect = "w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm leading-[1.35] text-stone-800 focus:border-[#8B4A3C] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#8B4A3C]/30 min-h-[44px]";
const lbl = "mb-0.5 block text-xs leading-[1.35] text-stone-400";
// 内部管理（黄エリア）
const costInput = "w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-[1.35] text-stone-800 placeholder:text-stone-300 focus:border-amber-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-300/50 min-h-[44px] [word-break:keep-all] [overflow-wrap:anywhere]";
const costSelect = "w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-[1.35] text-stone-800 focus:border-amber-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-300/50 min-h-[44px]";
const costLbl = "mb-0.5 block text-xs leading-[1.35] text-amber-700";

// ─── 自動下書き保存 設定 ─────────────────────────────────────
const ESTIMATE_DRAFT_KEY = draftKey('estimate', 'new');

type EstimateDraftData = {
  estimateId?: string; // リロード後も同じ見積に上書き保存するためIDを含める
  lines: LineItem[];
  costs: CostItem[];
  nextLineId: number;
  nextCostId: number;
  submitTo: string;
  estProjectName: string;
  estAddress: string;
};

// ─── 見積明細カード（白） ─────────────────────────────────────
function LineCard({ line, index, canDelete, onUpdate, onDelete, onDuplicate }: {
  line: LineItem; index: number; canDelete: boolean;
  onUpdate: (field: keyof LineItem, value: string) => void;
  onDelete: () => void; onDuplicate: () => void;
}) {
  const subtotal = toNum(line.qty) * toNum(line.unitPrice);
  const lineTax = simpleTaxAmount(subtotal);
  const taxIncluded = subtotal + lineTax;
  const pdfLocation = line.location1 && line.location2
    ? `${line.location1} / ${line.location2}`
    : line.location1 || line.location2 || "—";

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-stone-100">
      {/* ヘッダー */}
      <div className="flex items-center justify-between border-b border-stone-100 bg-white px-4 py-2.5">
        <span className="text-xs font-bold text-stone-600">明細 {index + 1}</span>
        <div className="flex items-center gap-3">
          <button type="button" onClick={onDuplicate} className="text-xs text-stone-400 active:text-stone-600">複製</button>
          <button type="button" onClick={() => { if (!canDelete) { alert("明細は最低1行必要です。"); return; } onDelete(); }} className="text-xs text-stone-400 active:text-red-500">削除</button>
        </div>
      </div>

      <div className="space-y-3 p-3">
        <div className="grid grid-cols-2 items-start gap-2">
          <div>
            <label className={lbl}>項目</label>
            <select
              value={PREDEFINED_CATEGORIES.includes(line.category) ? line.category : "その他（自由入力）"}
              onChange={(e) => {
                if (e.target.value === "その他（自由入力）") {
                  onUpdate("category", "");
                } else {
                  onUpdate("category", e.target.value);
                }
              }}
              className={fldSelect}
            >
              {PREDEFINED_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              <option value="その他（自由入力）">その他（自由入力）</option>
            </select>
            {!PREDEFINED_CATEGORIES.includes(line.category) && (
              <input
                type="text"
                value={line.category}
                onChange={(e) => onUpdate("category", e.target.value)}
                placeholder="カテゴリを入力"
                className={fldInput + " mt-1.5"}
              />
            )}
          </div>
          <div><label className={lbl}>工事名</label><input type="text" value={line.koujiName} onChange={(e) => onUpdate("koujiName", e.target.value)} placeholder="クロス貼替" className={fldInput} /></div>
        </div>
        <div><label className={lbl}>工事内容</label><input type="text" value={line.koujiContent} onChange={(e) => onUpdate("koujiContent", e.target.value)} placeholder="既存クロスめくり・下地処理・新規クロス貼り" className={fldInput} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className={lbl}>施工箇所1</label><input type="text" value={line.location1} onChange={(e) => onUpdate("location1", e.target.value)} placeholder="洋室、洗面所" className={fldInput} /></div>
          <div>
            <label className={lbl}>施工箇所2</label>
            <select value={line.location2} onChange={(e) => onUpdate("location2", e.target.value)} className={fldSelect}>
              {LOCATION2_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
        <p className="text-[11px] text-stone-400">PDF表示：<span className="font-medium text-stone-600">{pdfLocation}</span></p>
        <div className="grid grid-cols-3 gap-2">
          <div><label className={lbl}>数量</label><input type="number" inputMode="decimal" value={line.qty} onChange={(e) => onUpdate("qty", e.target.value)} placeholder="50" className={fldInput} /></div>
          <div>
            <label className={lbl}>単位</label>
            <select value={line.unit} onChange={(e) => onUpdate("unit", e.target.value)} className={fldSelect}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div><label className={lbl}>単価</label><input type="number" inputMode="numeric" value={line.unitPrice} onChange={(e) => onUpdate("unitPrice", e.target.value)} placeholder="1200" className={fldInput} /></div>
        </div>
        <div><label className={lbl}>備考</label><input type="text" value={line.note} onChange={(e) => onUpdate("note", e.target.value)} placeholder="色番号、施主支給など" className={fldInput} /></div>
        {/* 金額（書類風） */}
        <div className="divide-y divide-stone-100 rounded-xl border border-stone-100">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs text-stone-500">小計</span>
            <span className="text-sm font-bold text-stone-800">{formatYen(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs text-stone-500">消費税（10%）</span>
            <span className="text-sm font-medium text-stone-600">{formatYen(lineTax)}</span>
          </div>
          <div className="flex items-center justify-between rounded-b-xl bg-[#fdf0ec] px-3 py-2.5">
            <span className="text-xs font-bold text-[#8B4A3C]">税込小計</span>
            <span className="text-base font-bold text-[#8B4A3C]">{formatYen(taxIncluded)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 原価行カード（黄） ───────────────────────────────────────
function CostCard({ cost, index, canDelete, onUpdate, onDelete, onDuplicate }: {
  cost: CostItem; index: number; canDelete: boolean;
  onUpdate: (field: keyof CostItem, value: string) => void;
  onDelete: () => void; onDuplicate: () => void;
}) {
  const costSubtotal = toNum(cost.qty) * toNum(cost.costUnitPrice);
  return (
    <div className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50">
      <div className="flex items-center justify-between border-b border-amber-200 px-3 py-2">
        <span className="text-xs font-bold text-amber-800">原価行 {index + 1}</span>
        <div className="flex items-center gap-3">
          <button type="button" onClick={onDuplicate} className="text-xs text-amber-500 active:text-amber-700">複製</button>
          <button type="button" onClick={() => { if (!canDelete) { alert("原価行は最低1行必要です。"); return; } onDelete(); }} className="text-xs text-amber-400 active:text-red-500">削除</button>
        </div>
      </div>
      <div className="space-y-2.5 p-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={costLbl}>原価区分</label>
            <select value={cost.costCategory} onChange={(e) => onUpdate("costCategory", e.target.value)} className={costSelect}>
              {COST_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div><label className={costLbl}>対象項目</label><input type="text" value={cost.targetCategory} onChange={(e) => onUpdate("targetCategory", e.target.value)} placeholder="内装工事、共通" className={costInput} /></div>
        </div>
        <div><label className={costLbl}>対象工事名</label><input type="text" value={cost.targetKouji} onChange={(e) => onUpdate("targetKouji", e.target.value)} placeholder="クロス貼替、共通" className={costInput} /></div>
        <div><label className={costLbl}>内容</label><input type="text" value={cost.content} onChange={(e) => onUpdate("content", e.target.value)} placeholder="クロス材料、施工人工" className={costInput} /></div>
        <div className="grid grid-cols-3 gap-2">
          <div><label className={costLbl}>数量</label><input type="number" inputMode="decimal" value={cost.qty} onChange={(e) => onUpdate("qty", e.target.value)} placeholder="1" className={costInput} /></div>
          <div>
            <label className={costLbl}>単位</label>
            <select value={cost.unit} onChange={(e) => onUpdate("unit", e.target.value)} className={costSelect}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div><label className={costLbl}>原価単価</label><input type="number" inputMode="numeric" value={cost.costUnitPrice} onChange={(e) => onUpdate("costUnitPrice", e.target.value)} placeholder="0" className={costInput} /></div>
        </div>
        <div><label className={costLbl}>備考</label><input type="text" value={cost.note} onChange={(e) => onUpdate("note", e.target.value)} placeholder="仕入れ単価、外注単価" className={costInput} /></div>
        <div className="flex items-center justify-between rounded-lg border border-amber-300 bg-amber-100 px-3 py-2">
          <span className="text-xs font-bold text-amber-800">原価小計</span>
          <span className="text-sm font-bold text-amber-800">{formatYen(costSubtotal)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── メインページ ─────────────────────────────────────────────
export default function EstimatePage() {
  const [lines, setLines] = useState<LineItem[]>([]);
  const [nextLineId, setNextLineId] = useState(1);
  const [costs, setCosts] = useState<CostItem[]>([]);
  const [nextCostId, setNextCostId] = useState(1);
  const [costSectionOpen, setCostSectionOpen] = useState(false);
  const [summaryInternalOpen, setSummaryInternalOpen] = useState(false);
  // null = 生成中なし / 'estimate' = 見積書 / 'order' = 見積書兼注文書 / 'storage' = 保存用
  const [pdfLoading, setPdfLoading] = useState<null | 'estimate' | 'order' | 'storage'>(null);
  const [draftSavedMsg, setDraftSavedMsg] = useState("");
  const [companyInfo, setCompanyInfo] = useState<CompanyInfoState>(DEFAULT_COMPANY_INFO);
  // 提出先・案件名・現場住所（編集可能・案件検索で自動セット可能）
  const [submitTo,       setSubmitTo]       = useState("");
  const [estProjectName, setEstProjectName] = useState("");
  const [estAddress,     setEstAddress]     = useState("");
  // 案件検索
  const [estSearchDate,    setEstSearchDate]    = useState("");
  const [estSearchProject, setEstSearchProject] = useState("");
  const [estSearchClient,  setEstSearchClient]  = useState("");
  const [estHasSearched,   setEstHasSearched]   = useState(false);
  const [selectedEstProject, setSelectedEstProject] = useState<EstSearchProject | null>(null);

  // ── 自動下書き保存関連 state ──────────────────────────────────
  const [isDemoMode,        setIsDemoMode]        = useState<boolean | null>(null);
  const [showRestoreBanner, setShowRestoreBanner] = useState(false);
  // PDF発行前本保存の進捗（null=未着手 / saving=保存中 / saved=成功 / failed=失敗）
  const [pdfSaveStatus, setPdfSaveStatus] = useState<null | 'saving' | 'saved' | 'failed'>(null);
  // 本保存済みの見積ID（セッション内で維持し、同じ見積への重複登録を防ぐ）
  const [currentEstimateId, setCurrentEstimateId] = useState<string | null>(null);

  // 保存対象データ（useMemo で内容変化のみ追跡）
  // estimateId を含めることでリロード後もドラフト復元時に同じIDで上書き保存できる
  const draftData = useMemo<EstimateDraftData>(() => ({
    estimateId: currentEstimateId ?? undefined,
    lines, costs, nextLineId, nextCostId, submitTo, estProjectName, estAddress,
  }), [currentEstimateId, lines, costs, nextLineId, nextCostId, submitTo, estProjectName, estAddress]);

  const autoDraftEnabled = isDemoMode === false;
  const { saveStatus, savedAt, clearDraft, restoredDraft } = useAutoDraft<EstimateDraftData>(
    ESTIMATE_DRAFT_KEY, 'estimate', 'new', draftData,
    { enabled: autoDraftEnabled, debounceMs: 800 },
  );

  const estFilteredProjects = useMemo(() => {
    if (!estHasSearched) return [];
    const source = getTestMode() === "demo" ? EST_SEARCH_PROJECTS : [];
    return source.filter((p) => {
      const md = estSearchDate    === "" || p.date.includes(estSearchDate.replace(/-/g, "/"));
      const mp = estSearchProject === "" || matchesKeyword([p.projectName, p.siteAddress, p.workContent], estSearchProject);
      const mc = estSearchClient  === "" || matchesKeyword([p.clientName], estSearchClient);
      return md && mp && mc;
    });
  }, [estHasSearched, estSearchDate, estSearchProject, estSearchClient]);

  // 事業者設定を共通ユーティリティから読み込む（genba_settings を直接参照しない）
  useEffect(() => {
    setCompanyInfo(getCompanyInfoForPdf());
  }, []);

  // demo モードだけサンプルデータをセット
  useEffect(() => {
    if (getTestMode() !== "demo") return;
    setSubmitTo(PDF_CLIENT_NAME + " 御中");
    setEstProjectName(PDF_PROJECT_NAME);
    setEstAddress("大阪府堺市〇〇区");
    setLines(initialLines);
    setCosts(initialCosts);
    setNextLineId(initialLines.length + 1);
    setNextCostId(initialCosts.length + 1);
  }, []);

  // デモモードかどうかを検知（自動下書きの有効無効判定に使用）
  useEffect(() => {
    setIsDemoMode(getTestMode() === 'demo');
  }, []);

  // 下書き復元バナー表示（非デモ・実入力データなし・下書きあり の場合）
  useEffect(() => {
    if (isDemoMode !== false) return;
    if (!restoredDraft) return;
    // 空行だけでは「既存データあり」と見なさない。工事名・工事内容・単価のどれかが入っている場合のみ上書きしない
    const hasMeaningfulContent = lines.some(
      (l) => l.koujiName.trim() !== '' || l.koujiContent.trim() !== '' || toNum(l.unitPrice) > 0
    );
    if (hasMeaningfulContent) return;
    setShowRestoreBanner(true);
  }, [isDemoMode, restoredDraft, lines]);

  // ブラウザバック・リロード時の未保存警告
  useEffect(() => {
    if (!autoDraftEnabled) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (saveStatus === 'dirty' && lines.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saveStatus, lines.length, autoDraftEnabled]);

  function updateLine(id: number, field: keyof LineItem, value: string) { setLines((p) => p.map((l) => l.id === id ? { ...l, [field]: value } : l)); }
  function addLine() { setLines((p) => [...p, emptyLine(nextLineId)]); setNextLineId((n) => n + 1); }
  function removeLine(id: number) { setLines((p) => p.filter((l) => l.id !== id)); }
  function duplicateLine(id: number) {
    const src = lines.find((l) => l.id === id); if (!src) return;
    const idx = lines.findIndex((l) => l.id === id);
    const dup = { ...src, id: nextLineId };
    setLines((p) => [...p.slice(0, idx + 1), dup, ...p.slice(idx + 1)]);
    setNextLineId((n) => n + 1);
  }

  function updateCost(id: number, field: keyof CostItem, value: string) { setCosts((p) => p.map((c) => c.id === id ? { ...c, [field]: value } : c)); }
  function addCost() { setCosts((p) => [...p, emptyCost(nextCostId)]); setNextCostId((n) => n + 1); setCostSectionOpen(true); }
  function removeCost(id: number) { setCosts((p) => p.filter((c) => c.id !== id)); }
  function duplicateCost(id: number) {
    const src = costs.find((c) => c.id === id); if (!src) return;
    const idx = costs.findIndex((c) => c.id === id);
    const dup = { ...src, id: nextCostId };
    setCosts((p) => [...p.slice(0, idx + 1), dup, ...p.slice(idx + 1)]);
    setNextCostId((n) => n + 1);
  }

  // ── 下書き復元・破棄 ─────────────────────────────────────────
  function handleRestoreDraft() {
    if (!restoredDraft) return;
    const d = restoredDraft.data;
    // 下書きに estimateId が含まれている場合は復元してリロード後も同じIDで上書き保存する
    if (d.estimateId) setCurrentEstimateId(d.estimateId);
    setLines(d.lines);
    setCosts(d.costs);
    setNextLineId(d.nextLineId);
    setNextCostId(d.nextCostId);
    setSubmitTo(d.submitTo);
    setEstProjectName(d.estProjectName);
    setEstAddress(d.estAddress);
    setShowRestoreBanner(false);
  }

  function handleDiscardDraft() {
    clearDraft();
    setShowRestoreBanner(false);
  }

  const subtotalSum = lines.reduce((acc, l) => acc + toNum(l.qty) * toNum(l.unitPrice), 0);
  // TODO(税区分): この画面は案件に紐づかない単体手入力フロー（LineItem に税区分なし）のため
  //   全額を課税10%として計算する。税区分・税率対応は案件見積 /projects/[projectId]/estimate
  //   （WorkItem＋共通 calculateTaxBreakdown）に実装済み。単体フローの税区分UIは今後対応。
  const taxSum = simpleTaxAmount(subtotalSum);
  const totalWithTax = subtotalSum + taxSum;
  const costSum = costs.reduce((acc, c) => acc + toNum(c.qty) * toNum(c.costUnitPrice), 0);
  const grossProfit = subtotalSum - costSum;
  const grossMarginRate = subtotalSum > 0 ? (grossProfit / subtotalSum) * 100 : 0;

  // ── 下書き保存 ──────────────────────────────────────────────
  function handleDraftSave() {
    const now = new Date().toLocaleString("ja-JP");
    // 既存保存済みIDがある場合は上書き。ない場合のみ新規ID
    const id = currentEstimateId ?? `est-${Date.now()}`;
    const existing = currentEstimateId
      ? getSavedEstimates().find((e) => e.id === currentEstimateId)
      : null;
    upsertEstimate({
      id,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      estimateNo: existing?.estimateNo ?? `EST-${Date.now()}`,
      projectId: selectedEstProject?.id ?? "draft",
      projectName: estProjectName,
      clientName: submitTo,
      siteAddress: estAddress,
      workDescription: lines.map((l) => l.koujiContent).filter(Boolean).join("、"),
      estimateItems: lines,
      subtotal: subtotalSum,
      tax: taxSum,
      total: totalWithTax,
      status: "draft",
      version: 1,
      memo: "",
    });
    setCurrentEstimateId(id);
    setSelectedEstimateId(id);
    setDraftSavedMsg("見積を下書き保存しました。");
    clearDraft(); // 自動下書きを削除（本保存済みのため不要）
    setTimeout(() => setDraftSavedMsg(""), 6000);
  }

  // ── PDF ダウンロード共通処理 ──────────────────────────────────
  async function downloadPdf(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── PDF発行前 本保存共通処理 ──────────────────────────────────
  // 処理順：二重実行ガード → バリデーション → upsertEstimate → clearDraft → true を返す
  // 失敗時は alert を出して false を返し、呼び出し元でPDF生成を中断する
  async function saveBeforePdf(): Promise<boolean> {
    // 保存中・PDF生成中の二重実行を防ぐ
    if (pdfSaveStatus === 'saving' || pdfLoading !== null) return false;

    const hasContent = lines.some(
      (l) => l.koujiName.trim() !== '' || l.koujiContent.trim() !== '' || toNum(l.unitPrice) > 0
    );
    if (lines.length === 0 || !hasContent) {
      alert('見積明細を1件以上入力してからPDFを発行してください。');
      return false;
    }

    setPdfSaveStatus('saving');
    try {
      const now = new Date().toLocaleString('ja-JP');
      // 既存保存済みIDがある場合は上書き。ない場合のみ新規ID（重複登録防止）
      const id = currentEstimateId ?? `est-${Date.now()}`;
      const existing = currentEstimateId
        ? getSavedEstimates().find((e) => e.id === currentEstimateId)
        : null;
      upsertEstimate({
        id,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        estimateNo: existing?.estimateNo ?? `EST-${Date.now()}`,
        projectId: selectedEstProject?.id ?? 'draft',
        projectName: estProjectName,
        clientName: submitTo,
        siteAddress: estAddress,
        workDescription: lines.map((l) => l.koujiContent).filter(Boolean).join('、'),
        estimateItems: lines,
        subtotal: subtotalSum,
        tax: taxSum,
        total: totalWithTax,
        status: 'draft',
        version: 1,
        memo: '',
      });
      setCurrentEstimateId(id);
      setSelectedEstimateId(id);
      clearDraft();
      setPdfSaveStatus('saved');
      return true;
    } catch (err) {
      console.error('PDF発行前保存エラー:', err);
      alert('保存に失敗しました。PDFは発行していません。入力内容は下書きとして残っています。');
      setPdfSaveStatus('failed');
      return false;
    }
  }

  // ── 見積書PDF 生成（提出用のみ・原価非表示） ──────────────────
  // 処理順: 1.本保存 → 2.保存確認 → 3.PDF生成
  async function handleEstimatePDF() {
    if (pdfLoading || pdfSaveStatus === 'saving') return;
    const saved = await saveBeforePdf();
    if (!saved) return;
    setPdfLoading('estimate');
    try {
      const { pdf } = await import('@react-pdf/renderer');
      const { makeEstimatePDF } = await import('./EstimatePDF');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const element: any = makeEstimatePDF({ lines, subtotalSum, taxSum, totalWithTax, companyInfo, clientName: submitTo, projectName: estProjectName, siteAddress: estAddress });
      const blob = await pdf(element).toBlob();
      await downloadPdf(blob, estimatePdfFileName({
        clientName:  submitTo,
        projectName: estProjectName,
        workContent: PDF_WORK_CONTENT,
        date:        PDF_ESTIMATE_DATE,
      }));
      setPdfSaveStatus(null);
    } catch (err) {
      console.error('PDF生成エラー:', err);
      alert('PDFの生成に失敗しました。ネットワーク接続を確認してから再試行してください。');
    } finally {
      setPdfLoading(null);
    }
  }

  // ── 保存用PDF 生成（原価・粗利・粗利率を含む自分用控え） ────────
  // 処理順: 1.本保存 → 2.保存確認 → 3.PDF生成
  async function handleStoragePDF() {
    if (pdfLoading || pdfSaveStatus === 'saving') return;
    const saved = await saveBeforePdf();
    if (!saved) return;
    setPdfLoading('storage');
    try {
      const { pdf } = await import('@react-pdf/renderer');
      const { makeStoragePDF } = await import('./EstimatePDF');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const element: any = makeStoragePDF({
        lines,
        subtotalSum,
        taxSum,
        totalWithTax,
        costs,
        costSum,
        grossProfit,
        grossMarginRate,
        companyInfo,
        clientName:  submitTo,
        projectName: estProjectName,
        siteAddress: estAddress,
      });
      const blob = await pdf(element).toBlob();
      await downloadPdf(blob, storagePdfFileName({
        clientName:  submitTo,
        projectName: estProjectName,
        workContent: PDF_WORK_CONTENT,
        date:        PDF_ESTIMATE_DATE,
      }));
      setPdfSaveStatus(null);
    } catch (err) {
      console.error('PDF生成エラー:', err);
      alert('PDFの生成に失敗しました。ネットワーク接続を確認してから再試行してください。');
    } finally {
      setPdfLoading(null);
    }
  }

  // ── 見積書兼注文書PDF 生成（提出用のみ・原価非表示） ───────────
  // 処理順: 1.本保存 → 2.保存確認 → 3.PDF生成
  async function handleEstimateOrderPDF() {
    if (pdfLoading || pdfSaveStatus === 'saving') return;
    const saved = await saveBeforePdf();
    if (!saved) return;
    setPdfLoading('order');
    try {
      const { pdf } = await import('@react-pdf/renderer');
      const { makeEstimateOrderPDF } = await import('./EstimatePDF');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const element: any = makeEstimateOrderPDF({ lines, subtotalSum, taxSum, totalWithTax, companyInfo, clientName: submitTo, projectName: estProjectName, siteAddress: estAddress });
      const blob = await pdf(element).toBlob();
      await downloadPdf(blob, estimateOrderPdfFileName({
        clientName:  submitTo,
        projectName: estProjectName,
        workContent: PDF_WORK_CONTENT,
        date:        PDF_ESTIMATE_DATE,
      }));
      setPdfSaveStatus(null);
    } catch (err) {
      console.error('PDF生成エラー:', err);
      alert('PDFの生成に失敗しました。ネットワーク接続を確認してから再試行してください。');
    } finally {
      setPdfLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg lg:max-w-4xl">

        {/* ページヘッダー */}
        <header className="mb-4">
          <Link href="/projects/sample" className="mb-3 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← 案件詳細へ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">見積明細書</h1>
          <p className="mt-1 text-sm text-stone-500">
            白い部分は提出用、黄色い部分は保存用の内部管理です。
          </p>
        </header>

        {/* ── この画面でできること ── */}
        <div className="mb-4 rounded-2xl border border-[#8B4A3C]/15 bg-[#fff8f5] p-4 shadow-sm">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#8B4A3C]">
            <span>💡</span>この画面でできること
          </p>
          <p className="text-sm leading-relaxed text-stone-700">
            この画面では、見積明細を入力してPDFを作れます。<br />
            入力内容は自動で下書き保存されます。<br />
            PDFを作る前に見積データを保存します。
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
                <button
                  type="button"
                  onClick={handleRestoreDraft}
                  className="flex-1 rounded-xl bg-amber-600 py-2.5 text-sm font-bold text-white active:opacity-80"
                >
                  下書きを復元する
                </button>
                <button
                  type="button"
                  onClick={handleDiscardDraft}
                  className="flex-1 rounded-xl border border-amber-300 bg-white py-2.5 text-sm font-bold text-amber-700 active:opacity-80"
                >
                  破棄して新しく作る
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── 案件検索 ── */}
        <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm space-y-3">
          <h2 className="border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">案件検索</h2>
          <div className="space-y-2">
            <input type="date" value={estSearchDate} onChange={(e) => setEstSearchDate(e.target.value)}
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-800 focus:border-[#8B4A3C] focus:outline-none focus:ring-1 focus:ring-[#8B4A3C]/30" />
            <input type="text" placeholder="案件名で検索" value={estSearchProject}
              onChange={(e) => setEstSearchProject(e.target.value)}
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-800 placeholder:text-stone-300 focus:border-[#8B4A3C] focus:outline-none focus:ring-1 focus:ring-[#8B4A3C]/30" />
            <input type="text" placeholder="元請名で検索" value={estSearchClient}
              onChange={(e) => setEstSearchClient(e.target.value)}
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-800 placeholder:text-stone-300 focus:border-[#8B4A3C] focus:outline-none focus:ring-1 focus:ring-[#8B4A3C]/30" />
            <button type="button"
              onClick={() => setEstHasSearched(true)}
              className="w-full rounded-xl bg-[#8B4A3C] py-2.5 text-sm font-bold text-white active:opacity-80">
              検索
            </button>
          </div>
          <div className="space-y-2">
            {!estHasSearched ? (
              <p className="py-2 text-center text-xs text-stone-400">
                日付・案件名・元請名を入力して案件を検索してください。
              </p>
            ) : estFilteredProjects.length === 0 ? (
              <p className="py-2 text-center text-xs text-stone-400">該当する案件はありません。</p>
            ) : (
              estFilteredProjects.map((p) => (
                <div key={p.id} className="rounded-xl border border-stone-100 bg-stone-50 p-3 space-y-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-stone-800 leading-tight">{p.projectName}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${EST_STATUS_STYLE[p.status] ?? "bg-stone-100 text-stone-600"}`}>
                        {p.status}
                      </span>
                    </div>
                    <p className="text-xs text-stone-500">{p.clientName}　{p.siteAddress}</p>
                    <p className="text-xs text-stone-400">{p.workContent}</p>
                    <p className="text-xs text-stone-400">施工予定日：{p.sekouDate}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEstProject(p);
                      setSubmitTo(p.clientName + " 御中");
                      setEstProjectName(p.projectName);
                      setEstAddress(p.siteAddress);
                      setEstHasSearched(false);
                      setEstSearchDate(""); setEstSearchProject(""); setEstSearchClient("");
                    }}
                    className="w-full rounded-xl bg-[#8B4A3C] py-2 text-sm font-bold text-white active:opacity-80"
                  >
                    この案件で見積を作成
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── 選択中の案件カード ── */}
        {selectedEstProject && (
          <div className="mb-4 overflow-hidden rounded-2xl border border-[#8B4A3C]/20 bg-[#fff8f5] shadow-sm">
            <div className="flex items-center justify-between border-b border-[#8B4A3C]/10 bg-[#8B4A3C]/5 px-4 py-2.5">
              <span className="text-xs font-bold text-[#8B4A3C]">選択中の案件</span>
              <button type="button"
                onClick={() => setSelectedEstProject(null)}
                className="rounded-lg px-2 py-1 text-xs font-bold text-stone-400 active:opacity-70">
                解除
              </button>
            </div>
            <div className="px-4 py-3 space-y-1">
              <p className="text-sm font-bold text-stone-800">{selectedEstProject.projectName}</p>
              <p className="text-xs text-stone-500">{selectedEstProject.clientName}　{selectedEstProject.siteAddress}</p>
              <p className="text-xs text-stone-400">{selectedEstProject.workContent}</p>
              <p className="text-xs text-stone-400">施工予定日：{selectedEstProject.sekouDate}</p>
              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${EST_STATUS_STYLE[selectedEstProject.status] ?? "bg-stone-100 text-stone-600"}`}>
                {selectedEstProject.status}
              </span>
            </div>
          </div>
        )}

        {/* 案件情報（編集可能） */}
        <div className="mb-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-stone-100 pb-2">
            <span className="text-sm font-bold text-stone-800">案件情報</span>
            <span className="text-xs text-stone-400">EST-0001 · 2026/05/30</span>
          </div>
          <div>
            <label className="mb-0.5 block text-xs text-stone-400">提出先</label>
            <input type="text" value={submitTo} onChange={(e) => setSubmitTo(e.target.value)}
              className={fldInput} />
          </div>
          <div>
            <label className="mb-0.5 block text-xs text-stone-400">案件名</label>
            <input type="text" value={estProjectName} onChange={(e) => setEstProjectName(e.target.value)}
              className={fldInput} />
          </div>
          <div>
            <label className="mb-0.5 block text-xs text-stone-400">現場住所</label>
            <input type="text" value={estAddress} onChange={(e) => setEstAddress(e.target.value)}
              className={fldInput} />
          </div>
        </div>

        {/* 凡例 */}
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-stone-100 bg-white px-4 py-3 shadow-sm">
          <span className="text-xs font-bold text-stone-600">凡例</span>
          <span className="flex items-center gap-1.5 text-xs text-stone-600">
            <span className="inline-block h-3.5 w-3.5 rounded-sm border border-stone-200 bg-white" />
            白：提出用PDFに表示
          </span>
          <span className="flex items-center gap-1.5 text-xs text-amber-700">
            <span className="inline-block h-3.5 w-3.5 rounded-sm border border-amber-300 bg-amber-100" />
            黄：保存用PDFにのみ表示
          </span>
        </div>

        {/* 説明文 */}
        <p className="mb-4 rounded-xl bg-stone-50 px-4 py-3 text-xs text-stone-500">
          提出用の見積明細と、保存用の原価管理は分けて管理します。原価・粗利・利益率は提出用PDFには出しません。
        </p>

        {/* ── PC：2カラム / スマホ：1カラム ── */}
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">

          {/* ──── 左列：提出用見積明細（白） ──── */}
          <section className="mb-4 lg:mb-0">
            {/* セクションヘッダー */}
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-stone-700">提出用見積明細</h2>
                <span className="rounded bg-[#8B4A3C]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#8B4A3C]">
                  提出用PDFに表示
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {lines.length === 0 && (
                <div className="rounded-xl border-2 border-dashed border-stone-200 py-6 text-center">
                  <p className="text-sm text-stone-500">まだ見積明細はありません。</p>
                  <p className="mt-1 text-xs text-stone-400">明細行を追加してください。</p>
                </div>
              )}
              {lines.map((line, index) => (
                <LineCard
                  key={line.id} line={line} index={index} canDelete={lines.length > 1}
                  onUpdate={(field, value) => updateLine(line.id, field, value)}
                  onDelete={() => removeLine(line.id)}
                  onDuplicate={() => duplicateLine(line.id)}
                />
              ))}
              <button type="button" onClick={addLine}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-200 py-3 text-sm font-bold text-stone-500 active:opacity-75">
                <span className="text-base leading-none">＋</span>
                明細行を追加
              </button>
            </div>

            {/* 提出用合計（スマホでは左列の下、PCでも左列の下） */}
            <div className="mt-4 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
                <h2 className="text-sm font-bold text-stone-700">提出用合計</h2>
                <span className="rounded bg-[#8B4A3C]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#8B4A3C]">
                  提出用PDFに表示
                </span>
              </div>
              <div className="divide-y divide-stone-100">
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm text-stone-500">小計合計</span>
                  <span className="text-sm font-medium text-stone-800">{formatYen(subtotalSum)}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm text-stone-500">消費税（10%）</span>
                  <span className="text-sm font-medium text-stone-700">{formatYen(taxSum)}</span>
                </div>
                <div className="flex items-center justify-between bg-[#fdf0ec] px-4 py-3">
                  <span className="font-bold text-[#8B4A3C]">税込合計</span>
                  <span className="text-lg font-bold text-[#8B4A3C]">{formatYen(totalWithTax)}</span>
                </div>
              </div>
            </div>
          </section>

          {/* ──── 右列：内部管理（黄） ──── */}
          <section className="mb-4 lg:mb-0">
            {/* セクションヘッダー */}
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-amber-800">内部管理</h2>
                <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                  保存用PDFにのみ表示
                </span>
              </div>
            </div>

            {/* 原価管理（折りたたみ） */}
            <div className="overflow-hidden rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50">
              {/* 閉じている時 */}
              {!costSectionOpen && (
                <div className="px-4 py-4 space-y-2">
                  <p className="text-xs text-amber-700">
                    原価は提出用明細とは別で管理します。<br />
                    材料費・副資材・施工費・外注費・諸経費をまとめて確認できます。
                  </p>
                  <p className="rounded-lg bg-amber-100 px-3 py-2 text-[11px] text-amber-700">
                    見積書PDF・見積書兼注文書PDFには表示しません。保存用PDFにのみ表示します。
                  </p>
                  <button type="button" onClick={() => setCostSectionOpen(true)}
                    className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-white py-3 text-sm font-bold text-amber-700 active:opacity-75">
                    <span>原価管理を開く</span>
                    <span className="text-amber-400">▼</span>
                  </button>
                </div>
              )}

              {/* 開いている時 */}
              {costSectionOpen && (
                <div className="space-y-3 px-4 pb-4 pt-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-amber-700">原価管理（内部管理）</p>
                    <button type="button" onClick={() => setCostSectionOpen(false)}
                      className="flex items-center gap-1 text-xs font-bold text-amber-600 active:opacity-75">
                      <span>閉じる</span>
                      <span className="text-amber-400">▲</span>
                    </button>
                  </div>

                  {costs.map((cost, index) => (
                    <CostCard
                      key={cost.id} cost={cost} index={index} canDelete={costs.length > 1}
                      onUpdate={(field, value) => updateCost(cost.id, field, value)}
                      onDelete={() => removeCost(cost.id)}
                      onDuplicate={() => duplicateCost(cost.id)}
                    />
                  ))}

                  <button type="button" onClick={addCost}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-amber-300 py-3 text-sm font-bold text-amber-600 active:opacity-75">
                    <span className="text-base leading-none">＋</span>
                    原価行を追加
                  </button>

                  <p className="rounded-lg bg-amber-100 px-3 py-2 text-[11px] text-amber-700">
                    この原価管理は保存用PDFにのみ表示します。見積書PDF・見積書兼注文書PDFには表示しません。
                  </p>
                </div>
              )}
            </div>

            {/* 保存用内部管理（折りたたみ） */}
            <div className="mt-4 overflow-hidden rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50">
              <button type="button" onClick={() => setSummaryInternalOpen((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-left active:opacity-75">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-amber-800">
                    {summaryInternalOpen ? "保存用内部管理を閉じる" : "保存用内部管理を開く"}
                  </span>
                  <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                    保存用PDFにのみ表示
                  </span>
                </div>
                <span className="text-amber-400">{summaryInternalOpen ? "▲" : "▼"}</span>
              </button>

              {summaryInternalOpen && (
                <div className="border-t border-amber-200 px-4 pb-4 pt-3 space-y-3">
                  <div className="divide-y divide-amber-100 rounded-xl border border-amber-200 bg-white">
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <span className="text-sm text-amber-700">原価合計</span>
                      <span className="text-sm font-medium text-stone-700">{formatYen(costSum)}</span>
                    </div>
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <span className="text-sm text-amber-700">粗利</span>
                      <span className="text-sm font-bold text-stone-700">{formatYen(grossProfit)}</span>
                    </div>
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <span className="text-sm text-amber-700">粗利率</span>
                      <span className="text-sm font-bold text-amber-700">{grossMarginRate.toFixed(1)}%</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-amber-600">
                    原価・粗利・粗利率は保存用PDFにのみ表示します。見積書PDF・見積書兼注文書PDFには表示しません。
                  </p>
                </div>
              )}
            </div>
          </section>

        </div>{/* end 2col grid */}

        {/* ── 見積内容確認プレビュー ── */}
        <div className="mt-4 overflow-hidden rounded-2xl shadow-sm ring-2 ring-[#8B4A3C]/20">
          <div className="bg-[#8B4A3C] px-4 py-3">
            <h2 className="text-sm font-bold text-white">見積内容確認プレビュー</h2>
            <p className="mt-0.5 text-xs text-amber-100">
              PDF出力前に、提出先・案件名・明細・税込金額を確認してください。
            </p>
          </div>
          <div className="bg-[#fff8f5] p-4 space-y-3">
            <ul className="space-y-2">
              {[
                { label: "提出先",   value: submitTo },
                { label: "案件名",   value: estProjectName },
                { label: "現場住所", value: estAddress },
                { label: "明細件数", value: `${lines.length}件` },
              ].map((item) => (
                <li key={item.label} className="flex items-start gap-2 text-sm">
                  <span className="w-20 shrink-0 pt-0.5 text-xs text-stone-400">{item.label}</span>
                  <span className="text-stone-800">{item.value}</span>
                </li>
              ))}
            </ul>
            {/* 金額サマリー */}
            <div className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-xs text-stone-500">小計</span>
                <span className="text-sm font-medium text-stone-800">{formatYen(subtotalSum)}</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-xs text-stone-500">消費税（10%）</span>
                <span className="text-sm font-medium text-stone-600">{formatYen(taxSum)}</span>
              </div>
              <div className="flex items-center justify-between rounded-b-xl bg-[#fdf0ec] px-3 py-2.5">
                <span className="text-xs font-bold text-[#8B4A3C]">税込合計</span>
                <span className="text-2xl font-bold text-[#8B4A3C]">{formatYen(totalWithTax)}</span>
              </div>
            </div>
            {/* 出力するPDF種別 */}
            <div className="rounded-xl border border-stone-200 bg-white p-3">
              <p className="mb-2 text-xs font-bold text-stone-600">出力するPDF種別</p>
              <div className="space-y-1.5 text-xs text-stone-600">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-stone-100 px-1.5 py-0.5 font-bold text-stone-600">見積書</span>
                  <span>原価なし・提出用</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-[#8B4A3C] px-1.5 py-0.5 font-bold text-white">兼注文書</span>
                  <span>署名返送で発注確認</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-amber-200 px-1.5 py-0.5 font-bold text-amber-800">保存用</span>
                  <span>原価・粗利あり・自分用</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── PDF出力エリア ── */}
        <div className="mt-4 space-y-3 pb-8">

          {/* PDF発行前本保存ステータス */}
          {pdfSaveStatus === 'saving' && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
              <p className="text-sm font-bold text-blue-700">PDF発行前に見積を保存しています...</p>
            </div>
          )}
          {pdfSaveStatus === 'saved' && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
              <p className="text-sm font-bold text-green-700">保存が完了しました。PDFを発行します。</p>
            </div>
          )}
          {pdfSaveStatus === 'failed' && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm font-bold text-red-700">
                保存に失敗しました。PDFは発行していません。入力内容は下書きとして残っています。
              </p>
            </div>
          )}

          {/* PDF出力の種類 説明カード */}
          <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-bold text-stone-700">PDF出力の種類</h3>
            <ul className="space-y-2 text-xs text-stone-600">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 rounded bg-stone-100 px-1.5 py-0.5 font-bold text-stone-600">見積書</span>
                <span>原価を出さず、元請け・施主へ提出する書類です。</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 rounded bg-[#8B4A3C] px-1.5 py-0.5 font-bold text-white">兼注文書</span>
                <span>署名または押印をもらって発注確認に使います。</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 rounded bg-amber-200 px-1.5 py-0.5 font-bold text-amber-800">保存用</span>
                <span>原価・粗利・利益率を含めた自分用控えです。</span>
              </li>
            </ul>
          </div>

          {/* PDF出力ルール */}
          <div className="rounded-xl border border-stone-100 bg-stone-50 px-4 py-3">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-stone-400">出力ルール</p>
            <ul className="space-y-1 text-[11px] text-stone-500">
              <li className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 shrink-0 rounded-sm border border-stone-200 bg-white" />
                白い部分：提出用PDFに表示
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 shrink-0 rounded-sm border border-amber-300 bg-amber-100" />
                黄色い部分：保存用PDFにのみ表示
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 shrink-0 rounded-sm border border-red-200 bg-red-50" />
                原価・粗利・利益率：提出用PDFには表示しない
              </li>
            </ul>
          </div>

          {/* 見積書PDF：白背景＋赤茶枠 */}
          <button
            type="button"
            onClick={handleEstimatePDF}
            disabled={pdfLoading !== null || pdfSaveStatus === 'saving'}
            className="w-full rounded-2xl border-2 border-[#8B4A3C] bg-white py-3.5 text-[#8B4A3C] shadow-sm active:opacity-80 disabled:opacity-50"
          >
            <span className="block text-base font-bold">
              {pdfLoading === 'estimate' ? '生成中...' : '見積書PDFを作る'}
            </span>
            <span className="block mt-0.5 text-xs font-normal text-[#8B4A3C]/60">
              {pdfLoading === 'estimate' ? 'フォント読み込み中（初回のみ時間がかかります）' : '金額確認用・原価なし'}
            </span>
          </button>

          {/* 見積書兼注文書PDF：赤茶背景＋白文字 */}
          <button
            type="button"
            onClick={handleEstimateOrderPDF}
            disabled={pdfLoading !== null || pdfSaveStatus === 'saving'}
            className="w-full rounded-2xl bg-[#8B4A3C] py-3.5 text-white shadow-sm active:opacity-80 disabled:opacity-50"
          >
            <span className="block text-base font-bold">
              {pdfLoading === 'order' ? '生成中...' : '見積書兼注文書PDFを作る'}
            </span>
            <span className="block mt-0.5 text-xs font-normal text-stone-200">
              {pdfLoading === 'order' ? 'フォント読み込み中（初回のみ時間がかかります）' : '署名返送で発注確認'}
            </span>
          </button>

          {/* 保存用PDF：薄い黄色背景＋黄色枠 */}
          <button
            type="button"
            onClick={handleStoragePDF}
            disabled={pdfLoading !== null || pdfSaveStatus === 'saving'}
            className="w-full rounded-2xl border-2 border-amber-400 bg-amber-50 py-3.5 text-amber-700 shadow-sm active:opacity-80 disabled:opacity-50"
          >
            <span className="block text-base font-bold">
              {pdfLoading === 'storage' ? '生成中...' : '保存用PDFを作る'}
            </span>
            <span className="block mt-0.5 text-xs font-normal text-amber-500">
              {pdfLoading === 'storage' ? 'フォント読み込み中（初回のみ時間がかかります）' : '原価あり・自分用控え'}
            </span>
          </button>

          {/* 下書き保存 */}
          <button
            type="button"
            onClick={handleDraftSave}
            className="w-full rounded-2xl border-2 border-stone-300 bg-white py-4 text-base font-bold text-stone-600 shadow-sm active:opacity-80"
          >
            見積を下書き保存
          </button>

          {/* 下書き保存後メッセージ */}
          {draftSavedMsg && (
            <div className="rounded-xl bg-green-50 px-4 py-3 ring-1 ring-green-200">
              <p className="text-sm font-bold text-green-700">{draftSavedMsg}</p>
              <Link href="/estimates/saved" className="mt-1 block text-xs text-green-600 underline underline-offset-2">
                保存済み見積一覧を見る →
              </Link>
            </div>
          )}

          <Link
            href="/estimates/saved"
            className="flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-white py-3 text-sm font-bold text-stone-500 shadow-sm active:opacity-80"
          >
            保存済み見積一覧へ
          </Link>

          <Link
            href="/projects/sample"
            className="flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-white py-3 text-sm font-bold text-stone-400 shadow-sm active:opacity-80"
          >
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
  );
}
