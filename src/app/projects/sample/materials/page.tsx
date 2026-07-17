"use client";

import Link from "next/link";
import { SampleDeprecationBanner } from "@/components/SampleDeprecationBanner";
import { useState, useMemo, useEffect, useRef } from "react";
import { getTestMode } from "@/app/utils/testMode";
import { matchesKeyword } from "@/app/utils/search";
import {
  getOrderDrafts,
  updateOrderDraft,
  deleteOrderDraft,
  type OrderDraft,
} from "@/app/utils/orderDrafts";
import { draftKey } from "@/app/utils/draftStorage";
import { useAutoDraft } from "@/hooks/useAutoDraft";
import { SaveStatusBar } from "@/components/SaveStatusBar";
import { getSavedMaterialOrders, upsertMaterialOrder } from "@/app/utils/savedMaterialOrders";

// ─── 型定義 ──────────────────────────────────────────────────
type MaterialRow = {
  id: number;
  koujiType: string;
  location1: string;
  location2: string;
  qty: string;
  unit: string;
  lossRate: string;
  unitPrice: string;
  itemName: string;
  orderNote: string;
  supplier: string;
  isSupplied: boolean;
  isOrdered: boolean;
  orderDate: string;
  deliveryDate: string;
  deliveryNote: string;
};

type SearchableProject = {
  id: string;
  date: string;
  projectName: string;
  clientName: string;
  siteAddress: string;
  workContent: string;
  sekouDate: string;
  status: string;
};

type MaterialStatus = "未発注" | "発注済み" | "搬入待ち" | "搬入済み";

// ─── 定数 ────────────────────────────────────────────────────
const KOUJI_TYPES = ["クロス", "クッションフロア", "フロアタイル", "長尺シート", "タイルカーペット", "副資材", "その他"];
const LOCATION2_OPTIONS = ["天井", "壁", "床", "共通"];
const UNITS = ["m", "㎡", "枚", "式", "ケース", "本"];
const FLOOR_TYPES = new Set(["クッションフロア", "フロアタイル", "長尺シート", "タイルカーペット"]);

// ─── 案件検索用仮データ ───────────────────────────────────────
const SEARCH_PROJECTS: SearchableProject[] = [
  {
    id: "sp1", date: "2026/06/03",
    projectName: "〇〇マンション クロス貼替", clientName: "△△工務店",
    siteAddress: "大阪府堺市〇〇区", workContent: "洋室クロス貼替・洗面所CF貼替",
    sekouDate: "2026-06-10", status: "施工前",
  },
  {
    id: "sp2", date: "2026/06/05",
    projectName: "□□店舗 床補修", clientName: "□□リフォーム",
    siteAddress: "大阪府大阪市□□区", workContent: "店舗床補修",
    sekouDate: "2026-06-15", status: "見積済み",
  },
  {
    id: "sp3", date: "2026/06/10",
    projectName: "◇◇マンション 雑工事", clientName: "〇〇建設",
    siteAddress: "大阪府堺市□□区", workContent: "雑工事一式",
    sekouDate: "2026-06-20", status: "材料手配中",
  },
];

// ─── 自動下書き保存設定 ──────────────────────────────────────
const MATERIAL_DRAFT_KEY = draftKey('material-order', 'new');

type MaterialDraftData = {
  orderId?: string;
  selectedProjectId?: string;
  rows: MaterialRow[];
  nextId: number;
};

// ─── ステータス色 ─────────────────────────────────────────────
const MATERIAL_STATUS_STYLE: Record<MaterialStatus, string> = {
  未発注:   "bg-[#8B4A3C]/10 text-[#8B4A3C]",
  発注済み: "bg-yellow-100 text-yellow-700",
  搬入待ち: "bg-blue-100 text-blue-700",
  搬入済み: "bg-green-100 text-green-700",
};

const PROJ_STATUS_STYLE: Record<string, string> = {
  施工前:    "bg-blue-100 text-blue-700",
  見積済み:  "bg-amber-100 text-amber-700",
  材料手配中: "bg-purple-100 text-purple-700",
  施工中:    "bg-green-100 text-green-700",
};

// ─── 初期データ ───────────────────────────────────────────────
const initialRows: MaterialRow[] = [
  {
    id: 1, koujiType: "クロス", location1: "洋室", location2: "壁",
    qty: "50", unit: "m", lossRate: "10", unitPrice: "300",
    itemName: "量産クロス SP-0000", orderNote: "予備分を含めて発注",
    supplier: "〇〇商店", isSupplied: false, isOrdered: false,
    orderDate: "", deliveryDate: "", deliveryNote: "午前着希望",
  },
  {
    id: 2, koujiType: "クッションフロア", location1: "洗面所", location2: "床",
    qty: "8", unit: "㎡", lossRate: "10", unitPrice: "1200",
    itemName: "CFシート HM-0000", orderNote: "巾方向・ジョイント位置確認",
    supplier: "〇〇商店", isSupplied: false, isOrdered: false,
    orderDate: "", deliveryDate: "", deliveryNote: "巾方向確認後に発注",
  },
  {
    id: 3, koujiType: "副資材", location1: "現場全体", location2: "共通",
    qty: "1", unit: "式", lossRate: "0", unitPrice: "3000",
    itemName: "糊・パテ・接着剤など", orderNote: "現場共通副資材",
    supplier: "自社在庫", isSupplied: false, isOrdered: true,
    orderDate: "2026-05-30", deliveryDate: "2026-06-03", deliveryNote: "在庫確認済み",
  },
];

function emptyRow(id: number): MaterialRow {
  return {
    id, koujiType: "その他", location1: "", location2: "壁",
    qty: "1", unit: "m", lossRate: "10", unitPrice: "0",
    itemName: "", orderNote: "",
    supplier: "", isSupplied: false, isOrdered: false,
    orderDate: "", deliveryDate: "", deliveryNote: "",
  };
}

// ─── ユーティリティ ───────────────────────────────────────────
function toNum(v: string): number { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function calcOrderQty(qty: string, lossRate: string): number {
  return toNum(qty) * (1 + toNum(lossRate) / 100);
}
function fmtQty(n: number, unit: string): string {
  return (unit === "m" || unit === "㎡") ? n.toFixed(2) : Math.ceil(n).toString();
}
function fmtYen(n: number): string { return "¥" + Math.floor(n).toLocaleString("ja-JP"); }

// ─── スタイル定数 ─────────────────────────────────────────────
const fi = "w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800 placeholder:text-stone-300 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-400/40";
const fs = "w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-400/40";
const lbl = "mb-0.5 block text-xs text-stone-400";
const searchInputCls = "w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-800 placeholder:text-stone-300 focus:border-[#8B4A3C] focus:outline-none focus:ring-1 focus:ring-[#8B4A3C]/30";

// ─── 材料行カード ─────────────────────────────────────────────
function MaterialCard({
  row, index, canDelete, onUpdate, onDelete, onDuplicate,
}: {
  row: MaterialRow; index: number; canDelete: boolean;
  onUpdate: (updates: Partial<MaterialRow>) => void;
  onDelete: () => void; onDuplicate: () => void;
}) {
  const orderQty = calcOrderQty(row.qty, row.lossRate);
  const refCost = orderQty * toNum(row.unitPrice);
  const effectiveCost = row.isSupplied ? 0 : refCost;

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-teal-100">
      <div className="flex items-center justify-between border-b border-teal-50 bg-teal-50 px-4 py-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-teal-700">材料行 {index + 1}</span>
          <span className="rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-bold text-teal-700">
            {row.koujiType || "未設定"}
          </span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
            row.isOrdered ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
          }`}>
            {row.isOrdered ? "発注済み" : "未発注"}
          </span>
          {row.isSupplied && (
            <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold text-stone-500">支給材</span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button type="button" onClick={onDuplicate} className="text-xs text-stone-400 active:text-stone-600">複製</button>
          <button type="button"
            onClick={onDelete}
            disabled={!canDelete}
            title={!canDelete ? "材料行は最低1行必要です" : undefined}
            className={`text-xs ${canDelete ? "text-stone-400 active:text-red-500" : "cursor-not-allowed text-stone-200"}`}>
            削除
          </button>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>工種</label>
            <select value={row.koujiType} onChange={(e) => onUpdate({ koujiType: e.target.value })} className={fs}>
              {KOUJI_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>施工箇所1</label>
            <input type="text" value={row.location1} onChange={(e) => onUpdate({ location1: e.target.value })} placeholder="例：洋室" className={fi} />
          </div>
        </div>
        <div>
          <label className={lbl}>施工箇所2</label>
          <select value={row.location2} onChange={(e) => onUpdate({ location2: e.target.value })} className={fs}>
            {LOCATION2_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={lbl}>見積数量</label>
            <input type="number" inputMode="decimal" value={row.qty} onChange={(e) => onUpdate({ qty: e.target.value })} placeholder="50" className={fi} />
          </div>
          <div>
            <label className={lbl}>単位</label>
            <select value={row.unit} onChange={(e) => onUpdate({ unit: e.target.value })} className={fs}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>ロス率（%）</label>
            <input type="number" inputMode="decimal" value={row.lossRate} onChange={(e) => onUpdate({ lossRate: e.target.value })} placeholder="10" className={fi} />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-teal-50 px-3 py-2.5">
          <span className="text-xs font-bold text-teal-700">発注数量</span>
          <span className="text-base font-bold text-teal-700">{fmtQty(orderQty, row.unit)} {row.unit}</span>
        </div>
        <div>
          <label className={lbl}>材料単価（円）</label>
          <input type="number" inputMode="numeric" value={row.unitPrice} onChange={(e) => onUpdate({ unitPrice: e.target.value })} placeholder="300" className={fi} />
        </div>
        {row.isSupplied ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-xl bg-stone-100 px-3 py-2.5">
              <span className="text-xs font-bold text-stone-500">参考材料費</span>
              <span className="text-base font-bold text-stone-500">{fmtYen(refCost)}</span>
            </div>
            <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">支給材のため、材料費合計には含めません。</div>
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-xl bg-[#fdf0ec] px-3 py-2.5">
            <span className="text-xs font-bold text-[#8B4A3C]">材料費</span>
            <span className="text-base font-bold text-[#8B4A3C]">{fmtYen(effectiveCost)}</span>
          </div>
        )}
        <div>
          <label className={lbl}>品番・材料名</label>
          <input type="text" value={row.itemName} onChange={(e) => onUpdate({ itemName: e.target.value })} placeholder="例：量産クロス SP-0000" className={fi} />
        </div>
        <div>
          <label className={lbl}>仕入先</label>
          <input type="text" value={row.supplier} onChange={(e) => onUpdate({ supplier: e.target.value })} placeholder="例：〇〇商店、サンゲツ、元請け支給など" className={fi} />
        </div>
        <div className="rounded-xl border border-stone-100 bg-stone-50 p-3 space-y-3">
          <p className="text-xs font-bold text-stone-500">発注管理</p>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={row.isSupplied} onChange={(e) => onUpdate({ isSupplied: e.target.checked })} className="h-4 w-4 rounded border-stone-300 accent-amber-500" />
              <span className="text-sm text-stone-700">支給材</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={row.isOrdered} onChange={(e) => onUpdate({ isOrdered: e.target.checked })} className="h-4 w-4 rounded border-stone-300 accent-green-600" />
              <span className="text-sm text-stone-700">発注済み</span>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl}>発注日</label>
              <input type="date" value={row.orderDate} onChange={(e) => onUpdate({ orderDate: e.target.value })} className={fi} />
            </div>
            <div>
              <label className={lbl}>搬入予定日</label>
              <input type="date" value={row.deliveryDate} onChange={(e) => onUpdate({ deliveryDate: e.target.value })} className={fi} />
            </div>
          </div>
          <div>
            <label className={lbl}>納期メモ</label>
            <input type="text" value={row.deliveryNote} onChange={(e) => onUpdate({ deliveryNote: e.target.value })} placeholder="例：午前着、分納、欠品注意、現場直送など" className={fi} />
          </div>
        </div>
        <div>
          <label className={lbl}>発注メモ</label>
          <textarea value={row.orderNote} onChange={(e) => onUpdate({ orderNote: e.target.value })}
            placeholder="例：予備分を含めて発注" rows={2} className={fi + " resize-none"} />
        </div>
      </div>
    </div>
  );
}

// ─── メインページ ─────────────────────────────────────────────
export default function MaterialsPage() {
  const [isDemo, setIsDemo] = useState(false);
  const [rows, setRows]   = useState<MaterialRow[]>([]);
  const [nextId, setNextId] = useState(1);

  // 発注確認下書き
  const [orderDrafts,   setOrderDrafts]   = useState<OrderDraft[]>([]);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editOrderForm,  setEditOrderForm]  = useState<Partial<OrderDraft>>({});

  // ── 自動下書き保存関連 state ──────────────────────────────────
  const [currentOrderId,    setCurrentOrderId]   = useState<string | null>(null);
  const [showRestoreBanner, setShowRestoreBanner] = useState(false);
  const [selectedProject,   setSelectedProject]  = useState<SearchableProject | null>(null);

  // セッション内で一貫した orderId を持つための ref
  // currentOrderId が null（新規セッション）の場合にフォールバックとして使用する
  // 下書き復元時は handleRestoreMaterialDraft() で currentOrderId に引き継がれる
  const stableOrderIdRef = useRef<string>(`mat-${Date.now()}`);

  const draftData = useMemo<MaterialDraftData>(() => ({
    // currentOrderId があれば使用（復元済み）、なければセッション固有の安定IDを使用
    orderId: currentOrderId ?? stableOrderIdRef.current,
    selectedProjectId: selectedProject?.id,
    rows,
    nextId,
  }), [currentOrderId, selectedProject?.id, rows, nextId]);

  // demo モードでは自動下書き保存を無効化
  const autoDraftEnabled = !isDemo;
  const { saveStatus, savedAt, clearDraft, restoredDraft } = useAutoDraft<MaterialDraftData>(
    MATERIAL_DRAFT_KEY, 'material-order', 'new', draftData,
    { enabled: autoDraftEnabled, debounceMs: 800 },
  );

  // demo モードだけサンプル行をセット
  useEffect(() => {
    const demo = getTestMode() === "demo";
    setIsDemo(demo);
    if (demo) {
      setRows(initialRows);
      setNextId(initialRows.length + 1);
    }
    setOrderDrafts(getOrderDrafts());
  }, []);

  // 下書き復元バナー（非デモ・実データあり・下書きあり の場合）
  useEffect(() => {
    if (isDemo || !restoredDraft) return;
    const hasContent = restoredDraft.data.rows.some((r) => r.itemName.trim() !== '' || r.location1.trim() !== '');
    if (!hasContent) return;
    setShowRestoreBanner(true);
  }, [isDemo, restoredDraft]);

  // beforeunload 警告
  useEffect(() => {
    if (!autoDraftEnabled) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (saveStatus === 'dirty' && rows.length > 0) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saveStatus, rows.length, autoDraftEnabled]);

  function handleRestoreMaterialDraft() {
    if (!restoredDraft) return;
    const d = restoredDraft.data;
    if (d.orderId) setCurrentOrderId(d.orderId);
    setRows(d.rows);
    setNextId(d.nextId);
    if (d.selectedProjectId) {
      const found = SEARCH_PROJECTS.find((p) => p.id === d.selectedProjectId);
      if (found) setSelectedProject(found);
    }
    setShowRestoreBanner(false);
  }

  function handleDiscardMaterialDraft() {
    clearDraft();
    setShowRestoreBanner(false);
  }

  // ─── 材料計算行の本保存（savedMaterialOrders） ─────────────────
  // 既存IDがある場合は同じIDで上書き保存する（重複登録防止）
  function handleSaveMaterialOrder() {
    const hasContent = rows.some((r) => r.itemName.trim() !== '' || r.location1.trim() !== '');
    if (rows.length === 0 || !hasContent) {
      alert('材料行を1件以上入力してから保存してください。');
      return;
    }
    try {
      const now = new Date().toLocaleString('ja-JP');
      const id = currentOrderId ?? stableOrderIdRef.current;
      const existing = getSavedMaterialOrders().find((o) => o.id === id);
      upsertMaterialOrder({
        id,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        projectId: selectedProject?.id,
        projectName: displayProject.projectName,
        rows,
        totalMaterialCost,
      });
      setCurrentOrderId(id);
      clearDraft(); // 自動下書きを削除（本保存済みのため不要）
      setShowSavedOrderLink(true);
      setInfoMsg('材料計算を保存しました。');
      setTimeout(() => setInfoMsg(''), 4000);
    } catch {
      setShowSavedOrderLink(false);
      setInfoMsg('保存に失敗しました。');
    }
  }

  function reloadOrderDrafts() {
    setOrderDrafts(getOrderDrafts());
  }

  function handleOrderConfirm(id: string) {
    updateOrderDraft(id, { status: "confirmed" });
    reloadOrderDrafts();
  }

  function handleOrderEditStart(d: OrderDraft) {
    setEditingOrderId(d.id);
    setEditOrderForm({ ...d });
  }

  function handleOrderEditSave() {
    if (!editingOrderId) return;
    updateOrderDraft(editingOrderId, editOrderForm);
    setEditingOrderId(null);
    setEditOrderForm({});
    reloadOrderDrafts();
  }

  function handleOrderEditCancel() {
    setEditingOrderId(null);
    setEditOrderForm({});
  }

  function handleOrderDelete(id: string) {
    if (!confirm("この発注確認下書きを削除しますか？")) return;
    deleteOrderDraft(id);
    reloadOrderDrafts();
  }

  function orderEditChange(field: string, value: string) {
    setEditOrderForm((prev) => ({ ...prev, [field]: value }));
  }

  // 案件検索（selectedProject は上のauto-draft stateで定義済みのため重複を除去）
  const [searchDate,    setSearchDate]    = useState("");
  const [searchProject, setSearchProject] = useState("");
  const [searchClient,  setSearchClient]  = useState("");
  const [hasSearched,   setHasSearched]   = useState(false);
  const [infoMsg, setInfoMsg] = useState("");
  const [showSavedOrderLink, setShowSavedOrderLink] = useState(false);

  function updateRow(id: number, updates: Partial<MaterialRow>) {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...updates } : r));
  }
  function addRow() {
    setRows((prev) => [...prev, emptyRow(nextId)]);
    setNextId((n) => n + 1);
  }
  function removeRow(id: number) { setRows((prev) => prev.filter((r) => r.id !== id)); }
  function duplicateRow(id: number) {
    const src = rows.find((r) => r.id === id);
    if (!src) return;
    const idx = rows.findIndex((r) => r.id === id);
    setRows((prev) => [...prev.slice(0, idx + 1), { ...src, id: nextId }, ...prev.slice(idx + 1)]);
    setNextId((n) => n + 1);
  }

  // 集計
  function rowCost(r: MaterialRow): number {
    return r.isSupplied ? 0 : calcOrderQty(r.qty, r.lossRate) * toNum(r.unitPrice);
  }
  function rowRefCost(r: MaterialRow): number {
    return calcOrderQty(r.qty, r.lossRate) * toNum(r.unitPrice);
  }
  const totalMaterialCost = rows.reduce((acc, r) => acc + rowCost(r), 0);
  const refMaterialCost   = rows.reduce((acc, r) => acc + rowRefCost(r), 0);
  const crossCost       = rows.filter((r) => r.koujiType === "クロス").reduce((acc, r) => acc + rowCost(r), 0);
  const floorCost       = rows.filter((r) => FLOOR_TYPES.has(r.koujiType)).reduce((acc, r) => acc + rowCost(r), 0);
  const subMaterialCost = rows.filter((r) => r.koujiType === "副資材").reduce((acc, r) => acc + rowCost(r), 0);
  const orderedCount    = rows.filter((r) => r.isOrdered).length;
  const unorderedCount  = rows.filter((r) => !r.isOrdered).length;
  const suppliedCount   = rows.filter((r) => r.isSupplied).length;

  // 材料ステータス（案件レベル）
  const nonSuppliedRows = rows.filter((r) => !r.isSupplied);
  const caseStatus: MaterialStatus =
    nonSuppliedRows.some((r) => !r.isOrdered) ? "未発注" :
    nonSuppliedRows.some((r) => r.deliveryDate) ? "搬入待ち" :
    "発注済み";

  // 表示用の案件情報（demo モードだけサンプル値を使用）
  const displayProject = selectedProject ?? (isDemo ? {
    projectName: "〇〇マンション クロス貼替",
    siteAddress: "大阪府堺市〇〇区",
    workContent: "クロス・床",
    sekouDate:   "2026-06-10",
  } : {
    projectName: "（案件未選択）",
    siteAddress: "",
    workContent: "",
    sekouDate:   "",
  });

  // 検索絞り込み（ボタン押下後のみ表示・demoモード限定）
  const filteredProjects = useMemo(() => {
    if (!hasSearched) return [];
    const source = isDemo ? SEARCH_PROJECTS : [];
    return source.filter((p) => {
      const md = searchDate    === "" || p.date.includes(searchDate.replace(/-/g, "/"));
      const mp = searchProject === "" || matchesKeyword([p.projectName, p.siteAddress, p.workContent], searchProject);
      const mc = searchClient  === "" || matchesKeyword([p.clientName], searchClient);
      return md && mp && mc;
    });
  }, [hasSearched, searchDate, searchProject, searchClient, isDemo]);

  return (
    <div className="min-h-screen bg-[#fdf8f2]">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        {/* ヘッダー */}
        <header className="mb-4">
          <Link href="/materials" className="mb-3 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← 材料・発注管理へ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">材料計算</h1>
          <p className="mt-1 text-sm text-stone-500">
            見積数量から、ロス率を含めた発注数量と材料費を確認します。
          </p>
        </header>

        <SampleDeprecationBanner note="材料計算は今後「案件管理」へ統合予定です。保存済みの材料計算はそのまま残ります。" />

        {/* ── この画面でできること ── */}
        <div className="mb-4 rounded-2xl border border-[#8B4A3C]/15 bg-[#fff8f5] p-4 shadow-sm">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[#8B4A3C]">
            <span>💡</span>この画面でできること
          </p>
          <p className="text-sm leading-relaxed text-stone-700">
            この画面では、材料の数量を計算できます。<br />
            入力途中の内容は自動で下書き保存されます。<br />
            「材料計算を保存」を押すと、保存済み材料計算一覧に登録されます。
          </p>
        </div>

        {/* ── 自動下書き保存ステータスバー ── */}
        {!isDemo && <SaveStatusBar status={saveStatus} savedAt={savedAt} />}

        {/* ── 下書き復元バナー ── */}
        {showRestoreBanner && restoredDraft && (
          <div className="mb-4 overflow-hidden rounded-2xl border border-teal-300 bg-teal-50 shadow-sm">
            <div className="border-b border-teal-200 bg-teal-100 px-4 py-2.5">
              <p className="text-sm font-bold text-teal-800">前回入力途中の下書きがあります</p>
            </div>
            <div className="space-y-2 px-4 py-3">
              <p className="text-xs text-teal-700">
                最終更新：{new Date(restoredDraft.updatedAt).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={handleRestoreMaterialDraft}
                  className="flex-1 rounded-xl bg-teal-600 py-2.5 text-sm font-bold text-white active:opacity-80">
                  下書きを復元する
                </button>
                <button type="button" onClick={handleDiscardMaterialDraft}
                  className="flex-1 rounded-xl border border-teal-300 bg-white py-2.5 text-sm font-bold text-teal-700 active:opacity-80">
                  破棄して新しく作る
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── 案件検索 ── */}
        <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm space-y-3">
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

          <div className="space-y-2">
            {!hasSearched ? (
              <p className="py-2 text-center text-xs text-stone-400">
                日付・案件名・元請名を入力して検索してください。
              </p>
            ) : filteredProjects.length === 0 ? (
              <p className="py-2 text-center text-xs text-stone-400">該当する案件はありません。</p>
            ) : (
              filteredProjects.map((p) => (
                <div key={p.id} className="rounded-xl border border-stone-100 bg-stone-50 p-3 space-y-1.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-stone-800 leading-tight">{p.projectName}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${PROJ_STATUS_STYLE[p.status] ?? "bg-stone-100 text-stone-600"}`}>
                          {p.status}
                        </span>
                      </div>
                      <p className="text-xs text-stone-500">{p.clientName}　{p.siteAddress}</p>
                      <p className="text-xs text-stone-400">{p.workContent}</p>
                      <p className="text-xs text-stone-400">施工予定日：{p.sekouDate.replace(/-/g, "/")}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProject(p);
                      setHasSearched(false);
                      setSearchDate(""); setSearchProject(""); setSearchClient("");
                    }}
                    className="w-full rounded-xl bg-[#8B4A3C] py-2 text-sm font-bold text-white active:opacity-80"
                  >
                    この案件で材料計算する
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 案件情報カード（ステータスバッジ付き） */}
        <div className="mb-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-stone-800">{displayProject.projectName}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${MATERIAL_STATUS_STYLE[caseStatus]}`}>
                {caseStatus}
              </span>
            </div>
            <span className="text-xs text-stone-400">EST-0001</span>
          </div>
          <ul className="space-y-1.5">
            {[
              { label: "現場住所", value: displayProject.siteAddress },
              { label: "工事種別", value: displayProject.workContent },
              { label: "施工予定日", value: displayProject.sekouDate.replace(/-/g, "/") },
            ].map((item) => (
              <li key={item.label} className="flex items-start gap-2 text-sm">
                <span className="w-20 shrink-0 text-stone-400">{item.label}</span>
                <span className="font-medium text-stone-800">{item.value}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* 材料発注チェック 注意カード */}
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-1.5 text-sm font-bold text-amber-800">材料発注チェック</p>
          <p className="text-xs text-amber-700 leading-relaxed">
            発注数量だけでなく、発注済み・搬入予定日・支給材も確認してください。<br />
            支給材は材料費合計には含めません。
          </p>
        </div>

        {/* ── 発注書・注文書 読取下書き ── */}
        <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-stone-100 pb-2">
            <h2 className="text-sm font-bold text-stone-700">発注書・注文書 読取下書き</h2>
            {orderDrafts.length > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                {orderDrafts.filter((d) => d.status === "draft").length}件 未確認
              </span>
            )}
          </div>

          {orderDrafts.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-sm text-stone-500">発注書・注文書の読取下書きはありません。</p>
              <Link href="/scan" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#8B4A3C]">
                スキャン登録から発注書を読み取る →
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {orderDrafts.map((d) => (
                <div key={d.id} className="overflow-hidden rounded-xl border border-stone-100">
                  {editingOrderId === d.id ? (
                    <div className="space-y-2 p-3">
                      <p className="text-xs font-bold text-stone-600">発注確認を編集</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="mb-0.5 text-xs text-stone-400">元請名</p>
                          <input
                            type="text"
                            value={editOrderForm.clientName ?? ""}
                            onChange={(e) => orderEditChange("clientName", e.target.value)}
                            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <p className="mb-0.5 text-xs text-stone-400">発注日</p>
                          <input
                            type="text"
                            value={editOrderForm.orderDate ?? ""}
                            onChange={(e) => orderEditChange("orderDate", e.target.value)}
                            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <p className="mb-0.5 text-xs text-stone-400">案件名</p>
                        <input
                          type="text"
                          value={editOrderForm.projectName ?? ""}
                          onChange={(e) => orderEditChange("projectName", e.target.value)}
                          className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <p className="mb-0.5 text-xs text-stone-400">工事内容</p>
                        <input
                          type="text"
                          value={editOrderForm.workDescription ?? ""}
                          onChange={(e) => orderEditChange("workDescription", e.target.value)}
                          className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="mb-0.5 text-xs text-stone-400">発注金額（円）</p>
                          <input
                            type="number"
                            value={editOrderForm.orderAmount ?? ""}
                            onChange={(e) => orderEditChange("orderAmount", e.target.value)}
                            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <p className="mb-0.5 text-xs text-stone-400">支払条件</p>
                          <input
                            type="text"
                            value={editOrderForm.paymentTerm ?? ""}
                            onChange={(e) => orderEditChange("paymentTerm", e.target.value)}
                            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <p className="mb-0.5 text-xs text-stone-400">備考</p>
                        <input
                          type="text"
                          value={editOrderForm.memo ?? ""}
                          onChange={(e) => orderEditChange("memo", e.target.value)}
                          className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                        />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={handleOrderEditSave}
                          className="flex-1 rounded-xl bg-[#8B4A3C] py-2 text-sm font-bold text-white active:opacity-80"
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          onClick={handleOrderEditCancel}
                          className="flex-1 rounded-xl border border-stone-200 py-2 text-sm font-bold text-stone-500 active:opacity-70"
                        >
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-stone-800 leading-tight">
                            {d.projectName || "（案件名未入力）"}
                          </p>
                          <p className="mt-0.5 text-xs text-stone-500">{d.clientName}</p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            d.status === "confirmed"
                              ? "bg-green-100 text-green-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {d.status === "confirmed" ? "確認済み" : "未確認"}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-stone-500">
                        {d.orderDate && <span>発注日：{d.orderDate}</span>}
                        {d.workDescription && <span>🔨 {d.workDescription}</span>}
                        {d.orderAmount && (
                          <span>💴 ¥{Number(d.orderAmount).toLocaleString("ja-JP")}</span>
                        )}
                        {d.paymentTerm && <span>支払：{d.paymentTerm}</span>}
                        {d.memo && <span>備考：{d.memo}</span>}
                      </div>
                      <div className="flex gap-2 pt-0.5">
                        {d.status !== "confirmed" && (
                          <button
                            type="button"
                            onClick={() => handleOrderConfirm(d.id)}
                            className="flex-1 rounded-xl bg-green-600 py-2 text-xs font-bold text-white active:opacity-80"
                          >
                            発注確認済みにする
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOrderEditStart(d)}
                          className="rounded-xl border border-stone-200 px-3 py-2 text-xs font-bold text-stone-500 active:opacity-70"
                        >
                          修正
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOrderDelete(d.id)}
                          className="rounded-xl border border-red-100 px-3 py-2 text-xs font-bold text-red-400 active:opacity-70"
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 材料行リスト */}
        <section className="mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-stone-700">材料一覧</h2>
            <div className="flex items-center gap-1.5">
              {unorderedCount > 0 && (
                <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                  未発注 {unorderedCount}件
                </span>
              )}
              <span className="rounded bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-700">
                全{rows.length}行
              </span>
            </div>
          </div>

          {rows.length === 0 && (
            <div className="rounded-xl border-2 border-dashed border-teal-200 py-8 text-center">
              <p className="text-sm text-stone-500">まだ材料計算する明細はありません。</p>
              <p className="mt-1.5 text-xs text-stone-400">
                案件検索、または見積作成から材料計算を始めてください。
              </p>
            </div>
          )}
          {rows.map((row, index) => (
            <MaterialCard
              key={row.id} row={row} index={index} canDelete={rows.length > 1}
              onUpdate={(updates) => updateRow(row.id, updates)}
              onDelete={() => removeRow(row.id)}
              onDuplicate={() => duplicateRow(row.id)}
            />
          ))}

          <button type="button" onClick={addRow}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-teal-200 py-3.5 text-sm font-bold text-teal-600 active:opacity-75">
            <span className="text-base leading-none">＋</span>
            材料行を追加
          </button>
        </section>

        {/* 集計カード */}
        <div className="mb-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">集計</h2>
          <ul className="space-y-2">
            <li className="flex items-center justify-between">
              <span className="text-sm font-bold text-stone-800">材料費合計（支給材除く）</span>
              <span className="text-lg font-bold text-[#8B4A3C]">{fmtYen(totalMaterialCost)}</span>
            </li>
            <li className="flex items-center justify-between border-t border-stone-50 pt-2 text-sm">
              <span className="text-stone-500">参考材料費合計（全行）</span>
              <span className="font-medium text-stone-600">{fmtYen(refMaterialCost)}</span>
            </li>
            <li className="flex items-center justify-between text-sm">
              <span className="text-stone-500">クロス材料費</span>
              <span className="font-medium text-stone-800">{fmtYen(crossCost)}</span>
            </li>
            <li className="flex items-center justify-between text-sm">
              <span className="text-stone-500">床材材料費</span>
              <span className="font-medium text-stone-800">{fmtYen(floorCost)}</span>
            </li>
            <li className="flex items-center justify-between text-sm">
              <span className="text-stone-500">副資材費</span>
              <span className="font-medium text-stone-800">{fmtYen(subMaterialCost)}</span>
            </li>
            <li className="mt-1 border-t border-stone-100 pt-2 flex items-center justify-between text-sm">
              <span className="text-stone-500">発注行数</span>
              <span className="font-medium text-stone-800">{rows.length}行</span>
            </li>
            <li className="flex items-center justify-between text-sm">
              <span className="font-bold text-amber-700">未発注件数</span>
              <span className={`font-bold ${unorderedCount > 0 ? "text-amber-700" : "text-stone-400"}`}>{unorderedCount}件</span>
            </li>
            <li className="flex items-center justify-between text-sm">
              <span className="text-green-700">発注済み件数</span>
              <span className="font-bold text-green-700">{orderedCount}件</span>
            </li>
            {suppliedCount > 0 && (
              <li className="flex items-center justify-between text-sm">
                <span className="text-stone-500">支給材件数</span>
                <span className="font-medium text-stone-500">{suppliedCount}件</span>
              </li>
            )}
          </ul>
        </div>

        {/* ── 材料発注確認プレビュー ── */}
        {/* TODO: @react-pdf/renderer で材料発注PDFを生成する */}
        {/* TODO: PDFには案件名・工種・施工箇所・材料名・発注数量・搬入予定日・発注メモを表示する */}
        {/* TODO: 発注先ごとにPDFを分ける */}
        <div className="mb-4 overflow-hidden rounded-2xl shadow-sm ring-2 ring-[#8B4A3C]/20">
          <div className="bg-[#8B4A3C] px-4 py-3">
            <h2 className="text-sm font-bold text-white">材料発注確認プレビュー</h2>
            <p className="mt-0.5 text-xs text-amber-100">
              発注前に、数量・ロス率・発注状態・搬入予定日を確認してください。
            </p>
          </div>
          <div className="bg-[#fff8f5] p-4 space-y-2">
            <div className="mb-2 text-xs text-stone-500">
              案件名：<span className="font-bold text-stone-700">{displayProject.projectName}</span>
            </div>
            {rows.map((row, i) => {
              const oQty = calcOrderQty(row.qty, row.lossRate);
              const cost = row.isSupplied ? 0 : oQty * toNum(row.unitPrice);
              return (
                <div key={row.id} className="rounded-xl border border-stone-200 bg-white p-3 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-stone-700">材料行{i + 1}：{row.koujiType}</span>
                    {row.location1 && <span className="text-xs text-stone-500">{row.location1} / {row.location2}</span>}
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${row.isOrdered ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                      {row.isOrdered ? "発注済み" : "未発注"}
                    </span>
                    {row.isSupplied && <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold text-stone-500">支給材</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 text-xs text-stone-500">
                    <span>見積：{row.qty}{row.unit}　→　発注：{fmtQty(oQty, row.unit)}{row.unit}</span>
                    <span>ロス率：{row.lossRate}%</span>
                    <span>材料費：{fmtYen(cost)}</span>
                    <span>搬入予定：{row.deliveryDate.replace(/-/g, "/") || "未定"}</span>
                  </div>
                  {row.orderNote && <p className="text-xs text-stone-400">メモ：{row.orderNote}</p>}
                </div>
              );
            })}
            <div className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-xs text-stone-500">未発注件数</span>
                <span className={`text-sm font-bold ${unorderedCount > 0 ? "text-amber-700" : "text-stone-400"}`}>{unorderedCount}件</span>
              </div>
              <div className="flex items-center justify-between rounded-b-xl bg-[#fdf0ec] px-3 py-2.5">
                <span className="text-xs font-bold text-[#8B4A3C]">材料費合計（支給材除く）</span>
                <span className="text-xl font-bold text-[#8B4A3C]">{fmtYen(totalMaterialCost)}</span>
              </div>
            </div>
          </div>

          {/* 材料発注PDFを作るボタン */}
          <div className="bg-[#fff8f5] px-4 pb-4">
            <button
              type="button"
              onClick={() => { setShowSavedOrderLink(false); setInfoMsg("材料発注PDF出力は次工程で実装します。"); setTimeout(() => setInfoMsg(""), 4000); }}
              className="w-full rounded-2xl border-2 border-[#8B4A3C] bg-white py-3.5 text-base font-bold text-[#8B4A3C] shadow-sm active:opacity-80"
            >
              材料発注PDFを作る
            </button>
          </div>
        </div>

        {/* 材料発注PDF一覧確認 */}
        {/* TODO: 将来的に /materials/orders で材料発注PDF一覧を作る。 */}
        <div className="mb-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 border-b border-stone-100 pb-2 text-sm font-bold text-stone-700">
            材料発注PDF一覧確認
          </h2>
          <p className="py-3 text-center text-xs text-stone-400">
            作成済みの材料発注PDFはまだありません。
          </p>
          <Link
            href="/schedule"
            className="flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-stone-50 py-3 text-sm font-bold text-stone-500 active:opacity-80"
          >
            材料発注一覧確認
          </Link>
        </div>

        {/* ボタン群 */}
        <div className="space-y-3 pb-8">
          {infoMsg && (
            <div className="rounded-xl bg-stone-50 px-4 py-3 ring-1 ring-stone-200">
              <p className="text-sm text-stone-600">{infoMsg}</p>
              {showSavedOrderLink && (
                <Link href="/materials/saved" className="mt-1 block text-xs text-[#8B4A3C] underline underline-offset-2">
                  保存済み材料計算一覧を見る →
                </Link>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={handleSaveMaterialOrder}
            className="w-full rounded-2xl bg-[#8B4A3C] py-4 text-base font-bold text-white shadow-sm active:opacity-80"
          >
            材料計算を保存
          </button>
          <Link
            href="/projects/sample"
            className="flex w-full items-center justify-center rounded-2xl border border-stone-200 bg-white py-4 text-base font-bold text-stone-600 shadow-sm active:opacity-80"
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
