"use client";

// 新UI 見積・原価入力（/new/projects/[projectId]/estimate）
//
// 1画面で PC（横表）と iPhone（1明細1カード）の両方を出す。
// 表示は CSS のブレークポイントだけで切り替え、state は共有する。
// → PC と iPhone は完全に同じ WorkItem データを編集する。
// → 出し分けを JS で判定しないので hydration mismatch を起こさない。
//
// データ構造・保存処理・自動下書き・原価計算・税計算はすべて既存を再利用する。
// 画面内で同じ計算式を書き直さない（computeWorkItemAmounts / calculateTaxBreakdown へ委譲）。
//
// 提出用（売価）と内部管理（原価・粗利）の分離は従来どおり。内部管理は外部帳票へ出さない。

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "../../../_components/PageHeader";
import { NuProjectTabs } from "../../../_components/NuProject";
import {
  projectsStore,
  advanceProjectStatus,
  type Project,
} from "@/app/utils/projects";
import {
  workItemsStore,
  issueWorkItemId,
  computeWorkItemAmounts,
  migrateLegacyEstimateToWorkItems,
  type WorkItem,
} from "@/app/utils/workItems";
import {
  getSavedEstimates,
  upsertEstimate,
  setSelectedEstimateId,
  type SavedEstimate,
} from "@/app/utils/savedEstimates";
import {
  workItemsToEstimateItems,
  workItemsToSnapshots,
  workItemsToSellingLines,
  computeEstimateTotals,
  projectDocumentNumber,
  nextEstimateSeq,
} from "@/app/utils/workItemEstimate";
import { getCompanyInfoForPdf, getBankSettings } from "@/app/utils/companySettings";
import { singleInvoicePdfFileName } from "@/app/utils/pdfFileName";
import { renderAndDownloadPdf, todaySlash, todayDash } from "@/app/utils/pdfDownload";
import type { SellingLine } from "@/components/pdf/WorkEstimatePDF";
import {
  calculateTaxBreakdown,
  normalizeTaxType,
  normalizeTaxRate,
  TAX_TYPE_LABELS,
  type TaxType,
  type TaxRate,
} from "@/app/utils/taxCalculation";
import { draftKey } from "@/app/utils/draftStorage";
import { useAutoDraft } from "@/hooks/useAutoDraft";
import {
  CROSS_METHODS,
  DEFAULT_LABOR_QUANTITY,
  type CrossMethodId,
} from "../../../_lib/crossEstimate";

// 既存見積画面と同じ選択肢（考え方をそのまま踏襲）
const UNITS = ["m", "㎡", "枚", "式", "人工", "箇所", "本", "ケース", "台"];
const LOCATION2_OPTIONS = ["", "天井", "壁", "床", "共通"];
const CATEGORY_PRESETS = [
  "クロス工事", "内装工事", "床工事", "天井工事", "壁工事", "建具工事", "塗装工事", "解体工事", "諸経費",
];

// 修正理由の選択肢は既存の見積画面（src/app/projects/[projectId]/estimate/page.tsx）と同一にする
const REVISION_REASONS = [
  "保険会社査定指摘による数量修正",
  "解体後の追加被害反映",
  "施主希望による工事項目変更",
  "材料変更",
  "単価見直し",
  "その他",
];

const TAX_COMBO: Record<string, { taxType: TaxType; taxRate: TaxRate }> = {
  taxable_10: { taxType: "taxable", taxRate: 10 },
  taxable_8: { taxType: "taxable", taxRate: 8 },
  taxable_0: { taxType: "taxable", taxRate: 0 },
  non_taxable: { taxType: "non_taxable", taxRate: 0 },
  tax_exempt: { taxType: "tax_exempt", taxRate: 0 },
};
function taxComboValue(taxType: TaxType, taxRate: TaxRate): string {
  if (taxType === "non_taxable") return "non_taxable";
  if (taxType === "tax_exempt") return "tax_exempt";
  if (taxRate === 8) return "taxable_8";
  if (taxRate === 0) return "taxable_0";
  return "taxable_10";
}

// ── 入力スタイル ───────────────────────────────────────────────
const lbl = "mb-1 block text-xs font-medium text-slate-500";
const fld =
  "w-full rounded-xl border border-[var(--nu-border)] bg-white px-3 py-2.5 text-sm text-[var(--nu-text)] outline-none focus:border-[var(--nu-primary)] focus:ring-2 focus:ring-[var(--nu-primary-bg)] min-h-[44px]";
const sel =
  "w-full appearance-none rounded-xl border border-[var(--nu-border)] bg-white px-3 py-2.5 text-sm text-[var(--nu-text)] outline-none focus:border-[var(--nu-primary)] focus:ring-2 focus:ring-[var(--nu-primary-bg)] min-h-[44px]";
const costFld =
  "w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-200/60 min-h-[44px]";
const costLbl = "mb-1 block text-xs font-medium text-amber-700";

// PC表のセル内入力（罫線は表側に持たせ、入力自体は面で見せる）
const cellInput =
  "w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-[var(--nu-text)] outline-none hover:border-slate-200 focus:border-[#1b365d] focus:bg-white focus:ring-1 focus:ring-[#1b365d]";
const cellSelect = `${cellInput} appearance-none pr-5`;
// 内部管理パネルの値ボックス（画像の淡い枠付きボックス）
const panelBox =
  "w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-right text-sm font-semibold text-[var(--nu-text)] outline-none focus:border-[#1b365d] focus:bg-white focus:ring-1 focus:ring-[#1b365d]";
const panelBoxAdopted =
  "w-full rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-right text-sm font-bold text-amber-900 outline-none focus:border-amber-400 focus:bg-white focus:ring-1 focus:ring-amber-300";

type EditableWorkItem = {
  workItemId: string;
  category: string;
  workName: string;
  workDescription: string;
  location1: string;
  location2: string;
  quantity: string;
  unit: string;
  sellingUnitPrice: string;
  note: string;
  taxType: TaxType;
  taxRate: TaxRate;
  materialCost: string;
  laborCost: string;
  subcontractCost: string;
  expenseCost: string;
  otherCost: string;
  relatedDamageIds: string[];
  relatedPhotoIds: string[];
  createdAt: string;
};

type EstimateDraftData = { rows: EditableWorkItem[]; deletedIds: string[] };

function toNum(v: string): number {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}
function fmtYen(n: number): string {
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}
function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("ja-JP");
}

function toEditable(w: WorkItem): EditableWorkItem {
  return {
    workItemId: w.workItemId,
    category: w.category,
    workName: w.workName,
    workDescription: w.workDescription,
    location1: w.location1,
    location2: w.location2,
    quantity: String(w.quantity),
    unit: w.unit,
    sellingUnitPrice: String(w.sellingUnitPrice),
    note: w.note,
    taxType: normalizeTaxType(w.taxType),
    taxRate: normalizeTaxRate(w.taxRate),
    materialCost: String(w.materialCost),
    laborCost: String(w.laborCost),
    subcontractCost: String(w.subcontractCost),
    expenseCost: String(w.expenseCost),
    otherCost: String(w.otherCost),
    relatedDamageIds: w.relatedDamageIds,
    relatedPhotoIds: w.relatedPhotoIds,
    createdAt: w.createdAt,
  };
}

function toWorkItem(row: EditableWorkItem, projectId: string, now: string): WorkItem {
  const quantity = toNum(row.quantity);
  const sellingUnitPrice = toNum(row.sellingUnitPrice);
  const materialCost = toNum(row.materialCost);
  const laborCost = toNum(row.laborCost);
  const subcontractCost = toNum(row.subcontractCost);
  const expenseCost = toNum(row.expenseCost);
  const otherCost = toNum(row.otherCost);
  const amounts = computeWorkItemAmounts({
    quantity, sellingUnitPrice, materialCost, laborCost, subcontractCost, expenseCost, otherCost,
  });
  return {
    workItemId: row.workItemId,
    projectId,
    category: row.category,
    workName: row.workName,
    workDescription: row.workDescription,
    location1: row.location1,
    location2: row.location2,
    quantity,
    unit: row.unit,
    sellingUnitPrice,
    note: row.note,
    taxType: row.taxType,
    taxRate: row.taxType === "taxable" ? row.taxRate : 0,
    materialCost, laborCost, subcontractCost, expenseCost, otherCost,
    relatedDamageIds: row.relatedDamageIds,
    relatedPhotoIds: row.relatedPhotoIds,
    createdAt: row.createdAt,
    updatedAt: now,
    ...amounts,
  };
}

/** 行の金額は必ず既存の computeWorkItemAmounts で求める（画面側で式を書き直さない） */
function rowAmounts(row: EditableWorkItem) {
  return computeWorkItemAmounts({
    quantity: toNum(row.quantity),
    sellingUnitPrice: toNum(row.sellingUnitPrice),
    materialCost: toNum(row.materialCost),
    laborCost: toNum(row.laborCost),
    subcontractCost: toNum(row.subcontractCost),
    expenseCost: toNum(row.expenseCost),
    otherCost: toNum(row.otherCost),
  });
}

/** 原価内訳のうち材料以外の合計（原価単価の逆算に使う） */
function nonMaterialCost(row: EditableWorkItem): number {
  return (
    toNum(row.laborCost) + toNum(row.subcontractCost) + toNum(row.expenseCost) + toNum(row.otherCost)
  );
}

function emptyRow(id: string): EditableWorkItem {
  return {
    workItemId: id, category: "内装工事", workName: "", workDescription: "",
    location1: "", location2: "", quantity: "1", unit: "式", sellingUnitPrice: "0",
    note: "", taxType: "taxable", taxRate: 10,
    materialCost: "0", laborCost: "0", subcontractCost: "0", expenseCost: "0", otherCost: "0",
    relatedDamageIds: [], relatedPhotoIds: [], createdAt: new Date().toISOString(),
  };
}

export default function NewEstimatePage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const projectId = decodeURIComponent(params.projectId);

  const [notFound, setNotFound] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [rows, setRows] = useState<EditableWorkItem[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openCostIds, setOpenCostIds] = useState<Set<string>>(new Set());
  const [openBreakdownIds, setOpenBreakdownIds] = useState<Set<string>>(new Set());
  const [targetMargin, setTargetMargin] = useState<Record<string, string>>({});
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showRestore, setShowRestore] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [goingPreview, setGoingPreview] = useState(false);
  const [legacyEstimates, setLegacyEstimates] = useState<SavedEstimate[]>([]);
  // この案件の保存済み見積（版）。版管理は既存 SavedEstimate の仕組みをそのまま使う。
  const [savedVersions, setSavedVersions] = useState<SavedEstimate[]>([]);
  const [showVersionChoice, setShowVersionChoice] = useState(false);
  const [revisionReason, setRevisionReason] = useState(REVISION_REASONS[0]);
  const [revisionReasonFree, setRevisionReasonFree] = useState("");
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    const p = projectsStore.getById(projectId);
    if (!p) {
      setNotFound(true);
      setLoaded(true);
      return;
    }
    setProject(p);
    const loadedRows = workItemsStore.getByProjectId(projectId).map(toEditable);
    setRows(loadedRows);
    setSelectedId(loadedRows[0]?.workItemId ?? null);
    const allEstimates = getSavedEstimates();
    // 取り込み候補は他案件の見積のみ（自分の版を自分に取り込むと二重になるため）
    setLegacyEstimates(allEstimates.filter((e) => e.projectId !== projectId));
    setSavedVersions(
      allEstimates.filter((e) => e.projectId === projectId).sort((a, b) => a.version - b.version),
    );
    setLoaded(true);
  }, [projectId]);

  // 自動下書き保存（既存の仕組みを再利用。旧 work-items 画面と同じキーで共有）
  const DRAFT_KEY = draftKey("work-items", projectId);
  const draftData = useMemo<EstimateDraftData>(() => ({ rows, deletedIds }), [rows, deletedIds]);
  const { saveStatus, savedAt, clearDraft, restoredDraft } = useAutoDraft<EstimateDraftData>(
    DRAFT_KEY, "work-items", projectId, draftData, { enabled: loaded, debounceMs: 800 },
  );

  useEffect(() => {
    if (restoredDraft?.data) setShowRestore(true);
  }, [restoredDraft]);

  // ── 行操作 ───────────────────────────────────────────────
  function updateRow(id: string, patch: Partial<EditableWorkItem>) {
    setRows((prev) => prev.map((r) => (r.workItemId === id ? { ...r, ...patch } : r)));
  }
  function appendRows(newRows: EditableWorkItem[]) {
    if (newRows.length === 0) return;
    setRows((prev) => [...prev, ...newRows]);
    setSelectedId(newRows[0].workItemId);
  }
  function addRow() {
    appendRows([emptyRow(issueWorkItemId(projectId))]);
  }
  /** クロス見積の確定3方式から明細行を作る（方式はREVOが自動判別せず職人が選ぶ） */
  function addCrossRows(methodId: CrossMethodId) {
    const method = CROSS_METHODS.find((m) => m.id === methodId);
    if (!method) return;
    const issued: string[] = [];
    const created = method.rows.map((tpl) => {
      // issueWorkItemId は保存済みIDしか見ないため、同時発行ぶんは連番をずらす
      let id = issueWorkItemId(projectId);
      let guard = 0;
      while ((issued.includes(id) || rows.some((r) => r.workItemId === id)) && guard < 500) {
        const n = parseInt(id.replace(/\D/g, ""), 10) + 1;
        id = `W-${String(n).padStart(3, "0")}`;
        guard++;
      }
      issued.push(id);
      const base = emptyRow(id);
      return {
        ...base,
        category: tpl.category,
        workName: tpl.workName,
        unit: tpl.unit,
        quantity: tpl.usesLengthQuantity ? "0" : String(DEFAULT_LABOR_QUANTITY),
      };
    });
    appendRows(created);
    setShowAddMenu(false);
  }
  function duplicateRow(id: string) {
    const src = rows.find((r) => r.workItemId === id);
    if (!src) return;
    const newId = issueWorkItemId(projectId);
    const idx = rows.findIndex((r) => r.workItemId === id);
    const dup: EditableWorkItem = { ...src, workItemId: newId, createdAt: new Date().toISOString() };
    setRows((prev) => [...prev.slice(0, idx + 1), dup, ...prev.slice(idx + 1)]);
    setSelectedId(newId);
  }
  function removeRow(id: string) {
    if (!confirm(`${id} を削除しますか？`)) return;
    setRows((prev) => {
      const next = prev.filter((r) => r.workItemId !== id);
      setSelectedId((cur) => (cur === id ? next[0]?.workItemId ?? null : cur));
      return next;
    });
    setDeletedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }
  function toggleCost(id: string) {
    setOpenCostIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleBreakdown(id: string) {
    setOpenBreakdownIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  /**
   * 原価単価の入力を既存の原価内訳へ書き戻す。
   * 原価合計 = 原価単価 × 数量 になるよう材料原価で調整する（他の内訳は保持）。
   * 原価合計・粗利の計算自体は既存 computeWorkItemAmounts のまま。
   */
  function setCostUnit(id: string, value: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.workItemId !== id) return r;
        const qty = toNum(r.quantity);
        const target = toNum(value) * qty;
        const material = Math.max(0, Math.round(target - nonMaterialCost(r)));
        return { ...r, materialCost: String(material) };
      }),
    );
  }
  function adoptReferencePrice(id: string, refUnitPrice: number) {
    updateRow(id, { sellingUnitPrice: String(Math.round(refUnitPrice)) });
  }

  function handleRestore() {
    if (!restoredDraft?.data) return;
    setRows(restoredDraft.data.rows);
    setDeletedIds(restoredDraft.data.deletedIds);
    setSelectedId(restoredDraft.data.rows[0]?.workItemId ?? null);
    setShowRestore(false);
  }
  function handleDiscardDraft() {
    clearDraft();
    setShowRestore(false);
  }

  function handleImport(estimateId: string) {
    const est = legacyEstimates.find((e) => e.id === estimateId);
    if (!est) return;
    const migrated = migrateLegacyEstimateToWorkItems(est, projectId);
    appendRows(migrated.map(toEditable));
    setShowImport(false);
    setSaveMsg({ ok: true, text: `見積「${est.projectName || est.estimateNo}」から${migrated.length}行を取り込みました。原価を入力して保存してください。` });
    setTimeout(() => setSaveMsg(null), 8000);
  }

  // ── 保存（既存 workItemsStore を再利用） ──────────────────
  function saveAll(): boolean {
    const now = new Date().toISOString();
    let ok = true;
    for (const row of rows) {
      if (!workItemsStore.upsert(toWorkItem(row, projectId, now))) ok = false;
    }
    for (const id of deletedIds) workItemsStore.remove(id);
    if (ok) {
      setDeletedIds([]);
      setRows(workItemsStore.getByProjectId(projectId).map(toEditable));
      clearDraft();
      if (rows.length > 0) advanceProjectStatus(projectId, "estimating");
    }
    return ok;
  }
  function handleSave() {
    if (saveAll()) setSaveMsg({ ok: true, text: "見積・原価を保存しました。" });
    else setSaveMsg({ ok: false, text: "一部保存に失敗しました。入力内容は下書きに残っています。" });
    setTimeout(() => setSaveMsg(null), 6000);
  }

  // ── 合計（税計算は共通ロジックへ委譲） ────────────────────
  const totals = useMemo(() => {
    const withAmounts = rows.map((row) => {
      const a = rowAmounts(row);
      return {
        amount: a.sellingAmount, cost: a.totalCost,
        taxType: row.taxType, taxRate: (row.taxType === "taxable" ? row.taxRate : 0) as TaxRate,
      };
    });
    const cost = withAmounts.reduce((s, r) => s + r.cost, 0);
    const breakdown = calculateTaxBreakdown(
      withAmounts.map((r) => ({ amount: r.amount, taxType: r.taxType, taxRate: r.taxRate })),
    );
    const selling = breakdown.subtotal;
    const grossProfit = selling - cost;
    const grossProfitRate = selling > 0 ? (grossProfit / selling) * 100 : 0;
    return { selling, tax: breakdown.taxTotal, totalWithTax: breakdown.total, breakdown, cost, grossProfit, grossProfitRate };
  }, [rows]);

  // ── 提出用の明細（原価・粗利を含まない型へ変換） ──────────
  function buildSellingLines(): SellingLine[] {
    return rows.map((row) => {
      const a = rowAmounts(row);
      return {
        workItemId: row.workItemId, category: row.category, workName: row.workName,
        workDescription: row.workDescription, location1: row.location1, location2: row.location2,
        quantity: toNum(row.quantity), unit: row.unit, sellingUnitPrice: toNum(row.sellingUnitPrice),
        sellingAmount: a.sellingAmount, note: row.note,
        taxType: row.taxType, taxRate: (row.taxType === "taxable" ? row.taxRate : 0) as TaxRate,
      };
    });
  }
  function hasContent(): boolean {
    return rows.some(
      (r) => r.workName.trim() !== "" || r.workDescription.trim() !== "" || toNum(r.sellingUnitPrice) > 0,
    );
  }

  // ── 見積の本保存（既存 SavedEstimate の版管理をそのまま利用） ──────────
  const effectiveRevisionReason = revisionReason === "その他" ? revisionReasonFree : revisionReason;

  function reloadVersions(): SavedEstimate[] {
    const list = getSavedEstimates()
      .filter((e) => e.projectId === projectId)
      .sort((a, b) => a.version - b.version);
    setSavedVersions(list);
    return list;
  }

  /**
   * 保存済み WorkItem から SavedEstimate（1つの版）を組み立てる。
   * 明細スナップショット（lineSnapshots）と税内訳（taxBreakdown）を保存時点で固定する。
   * 組み立て方は既存の見積画面と同一で、新しい仕組みは作らない。
   */
  function buildEstimateVersion(
    items: WorkItem[],
    base: {
      id: string;
      createdAt: string;
      estimateNo: string;
      version: number;
      previousEstimateId?: string;
      revisionReason?: string;
    },
  ): SavedEstimate {
    const totals = computeEstimateTotals(workItemsToSellingLines(items));
    return {
      id: base.id,
      createdAt: base.createdAt,
      updatedAt: new Date().toLocaleString("ja-JP"),
      estimateNo: base.estimateNo,
      projectId,
      projectName: project!.projectName,
      clientName: project!.submitTo || project!.clientName,
      siteAddress: project!.siteAddress,
      workDescription: items.map((w) => w.workName).filter(Boolean).join("、"),
      estimateItems: workItemsToEstimateItems(items),
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      status: "saved",
      version: base.version,
      memo: "",
      taxBreakdown: totals.breakdown,
      lineSnapshots: workItemsToSnapshots(items),
      previousEstimateId: base.previousEstimateId,
      revisionReason: base.revisionReason,
    };
  }

  /**
   * 見積の本保存。
   * "overwrite" は最新版だけを上書きする。過去版（それより前の版）は触らない。
   * "new" は前版を残したまま新しい版を作る（初回もこちらで v1 / EST-01 になる）。
   */
  function persistEstimateVersion(kind: "overwrite" | "new"): SavedEstimate | null {
    if (!project) return null;
    const items = workItemsStore.getByProjectId(projectId); // 本保存済みの WorkItem を正本にする
    if (items.length === 0) return null;

    const all = getSavedEstimates();
    const mine = all.filter((e) => e.projectId === projectId).sort((a, b) => a.version - b.version);
    const latest = mine.length > 0 ? mine[mine.length - 1] : null;

    const est =
      kind === "overwrite" && latest
        ? buildEstimateVersion(items, {
            id: latest.id,
            createdAt: latest.createdAt,
            estimateNo: latest.estimateNo,
            version: latest.version,
            previousEstimateId: latest.previousEstimateId,
            revisionReason: latest.revisionReason,
          })
        : buildEstimateVersion(items, {
            id: `est-${Date.now()}`,
            createdAt: new Date().toLocaleString("ja-JP"),
            estimateNo: projectDocumentNumber(projectId, "EST", nextEstimateSeq(all, projectId)),
            version: (latest?.version ?? 0) + 1,
            previousEstimateId: latest?.id,
            revisionReason: latest ? effectiveRevisionReason : undefined,
          });

    upsertEstimate(est);
    setSelectedEstimateId(est.id);
    reloadVersions();
    return est;
  }

  function gotoPreview(estimateId: string) {
    router.push(
      `/new/projects/${encodeURIComponent(projectId)}/estimate/preview?v=${encodeURIComponent(estimateId)}`,
    );
  }

  /**
   * 「保存して見積書を確認」
   *   WorkItem本保存 → 見積(SavedEstimate)本保存 → 明細・税内訳スナップショット
   *   → 見積番号・version確定 → プレビュー → PDF発行
   * 保存前のPDF発行は行わない。保存済みの版が既にある場合は、勝手に新版を作らず
   * 「上書き保存」か「新しい版」かを選んでもらう。
   */
  function handleSaveAndPreview() {
    if (goingPreview) return;
    if (rows.length === 0 || !hasContent()) {
      alert("工事項目を1件以上入力してから見積書を確認してください。");
      return;
    }
    setGoingPreview(true);
    if (!saveAll()) {
      setGoingPreview(false);
      alert("本保存に失敗しました。見積書は発行できません。入力内容は下書きに残っています。");
      return;
    }
    const list = reloadVersions();
    if (list.length > 0) {
      // 既存の版がある。上書きか新版かは職人が選ぶ（毎回新版を作らない）。
      setGoingPreview(false);
      setShowVersionChoice(true);
      return;
    }
    const est = persistEstimateVersion("new"); // 初回 = v1 / EST-01
    if (!est) {
      setGoingPreview(false);
      alert("見積の保存に失敗しました。見積書は発行できません。");
      return;
    }
    gotoPreview(est.id);
  }

  function handleChooseOverwrite() {
    const est = persistEstimateVersion("overwrite");
    if (!est) {
      alert("見積の保存に失敗しました。見積書は発行できません。");
      return;
    }
    setShowVersionChoice(false);
    setGoingPreview(true);
    gotoPreview(est.id);
  }

  function handleChooseNewVersion() {
    if (revisionReason === "その他" && revisionReasonFree.trim() === "") {
      alert("修正理由（その他）を入力してください。");
      return;
    }
    const est = persistEstimateVersion("new");
    if (!est) {
      alert("見積の保存に失敗しました。見積書は発行できません。");
      return;
    }
    setShowVersionChoice(false);
    setGoingPreview(true);
    gotoPreview(est.id);
  }

  // 請求書PDF（既存の見積→請求連携。今回デザイン変更の対象外）
  async function handleInvoicePdf() {
    if (!project || invoiceLoading) return;
    if (rows.length === 0 || !hasContent()) {
      alert("工事項目を1件以上入力してからPDFを発行してください。");
      return;
    }
    if (!saveAll()) {
      alert("保存に失敗しました。PDFは発行していません。");
      return;
    }
    setInvoiceLoading(true);
    try {
      const { makeProjectInvoicePDF } = await import("@/components/pdf/ProjectInvoicePDF");
      const doc = makeProjectInvoicePDF({
        documentTitle: "請求書", documentNumber: `INV-${project.projectId}`, createdDate: todaySlash(),
        submitTo: project.submitTo || project.clientName || "", projectName: project.projectName,
        siteAddress: project.siteAddress, companyInfo: getCompanyInfoForPdf(), projectId: project.projectId,
        lines: buildSellingLines(), subtotalSum: totals.selling, taxSum: totals.tax,
        totalWithTax: totals.totalWithTax, taxBreakdown: totals.breakdown,
        invoiceDate: todaySlash(), dueDate: "", bank: getBankSettings(),
        invoiceNote: "お振込み手数料はご負担ください。ご確認よろしくお願いいたします。",
      });
      await renderAndDownloadPdf(doc, singleInvoicePdfFileName({
        clientName: project.clientName || project.submitTo, projectName: project.projectName,
        workContent: rows[0]?.workName ?? "", invoiceDate: todayDash(),
      }));
    } catch (err) {
      console.error("請求書PDF生成エラー:", err);
      alert("PDFの生成に失敗しました。もう一度お試しください。");
    } finally {
      setInvoiceLoading(false);
    }
  }

  const backHref = `/new/projects/${encodeURIComponent(projectId)}`;

  if (loaded && notFound) {
    return (
      <div>
        <PageHeader title="見積・原価入力" back="/new/projects" />
        <div className="px-4 py-10 text-center">
          <p className="text-sm font-bold text-[var(--nu-text)]">案件が見つかりません。</p>
          <p className="mt-1 font-mono text-xs text-slate-400">{projectId}</p>
        </div>
      </div>
    );
  }
  if (!loaded || !project) {
    return (
      <div>
        <PageHeader title="見積・原価入力" back="/new/projects" />
        <div className="px-4 py-4"><div className="h-40 animate-pulse rounded-2xl bg-white" /></div>
      </div>
    );
  }

  const saveStatusLabel =
    saveStatus === "saving" ? "保存中…"
    : saveStatus === "dirty" ? "未保存の変更あり"
    : savedAt ? `自動保存済み ${savedAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`
    : "自動保存済み";

  const selectedRow = rows.find((r) => r.workItemId === selectedId) ?? null;

  return (
    <div data-nu-wide>
      {/* ══ PC：濃紺ヘッダー（lg以上） ══ */}
      <header className="sticky top-0 z-30 hidden bg-[#1b365d] px-6 py-3 text-white lg:block">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3 text-sm">
            <span className="font-bold">現場の事務サポ</span>
            <span className="text-white/30">|</span>
            <nav aria-label="パンくず" className="flex min-w-0 items-center gap-2 text-white/80">
              <Link href="/new/projects" className="hover:text-white">案件</Link>
              <span className="text-white/40">›</span>
              <Link href={backHref} className="max-w-[24rem] truncate hover:text-white">
                {project.projectName || project.projectId}
              </Link>
              <span className="text-white/40">›</span>
              <span className="font-semibold text-white">見積・原価</span>
            </nav>
          </div>
          <span className="shrink-0 rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/20">
            {saveStatus === "dirty" ? "● " : "✓ "}{saveStatusLabel}
          </span>
        </div>
      </header>

      {/* ══ iPhone：既存の新UIヘッダー（lg未満） ══ */}
      <div className="lg:hidden">
        <PageHeader
          title="見積・原価入力"
          subtitle={project.projectName || project.projectId}
          back={backHref}
        />
      </div>

      {/* ══════════════ PC レイアウト ══════════════ */}
      <div className="hidden lg:block">
        <div className="px-8 pt-6">
          <h1 className="text-3xl font-bold tracking-tight text-[var(--nu-text)]">見積・原価入力</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            工事項目と数量を入力すると、見積と内部原価を同時に計算します
          </p>
        </div>

        <div className="flex items-start gap-6 px-8 pb-6 pt-5">
          {/* ── 左：見積明細テーブル ── */}
          <div className="min-w-0 flex-1">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <table className="w-full table-fixed border-collapse text-sm">
                <colgroup>
                  <col className="w-[13%]" /><col className="w-[14%]" /><col className="w-[13%]" />
                  <col className="w-[15%]" /><col className="w-[9%]" /><col className="w-[7%]" />
                  <col className="w-[12%]" /><col className="w-[13%]" /><col className="w-[4%]" />
                </colgroup>
                <thead>
                  <tr className="bg-slate-50 text-xs font-bold text-slate-600">
                    <th className="border-b border-slate-200 px-2 py-3 text-center">工種</th>
                    <th className="border-b border-l border-slate-200 px-2 py-3 text-center">項目名</th>
                    <th className="border-b border-l border-slate-200 px-2 py-3 text-center">材料名</th>
                    <th className="border-b border-l border-slate-200 px-2 py-3 text-center">施工場所</th>
                    <th className="border-b border-l border-slate-200 px-2 py-3 text-center">数量</th>
                    <th className="border-b border-l border-slate-200 px-2 py-3 text-center">単位</th>
                    <th className="border-b border-l border-slate-200 px-2 py-3 text-center">売価単価</th>
                    <th className="border-b border-l border-slate-200 px-2 py-3 text-center">見積金額</th>
                    <th className="border-b border-l border-slate-200 px-2 py-3 text-center"><span className="sr-only">操作</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-400">
                        まだ工事項目がありません。下の「＋ 工事項目を追加」から入力を始めてください。
                      </td>
                    </tr>
                  )}
                  {rows.map((row) => {
                    const a = rowAmounts(row);
                    const active = row.workItemId === selectedId;
                    return (
                      <tr
                        key={row.workItemId}
                        onFocusCapture={() => setSelectedId(row.workItemId)}
                        onClick={() => setSelectedId(row.workItemId)}
                        className={`border-b border-slate-100 ${active ? "bg-[#eef4fb] outline outline-2 -outline-offset-2 outline-[#1b365d]" : "hover:bg-slate-50"}`}
                      >
                        <td className="px-1 py-1">
                          <input type="text" value={row.category} list={`pc-cat-${row.workItemId}`}
                            onChange={(e) => updateRow(row.workItemId, { category: e.target.value })}
                            placeholder="クロス工事" className={cellInput} />
                          <datalist id={`pc-cat-${row.workItemId}`}>
                            {CATEGORY_PRESETS.map((c) => <option key={c} value={c} />)}
                          </datalist>
                        </td>
                        <td className="border-l border-slate-100 px-1 py-1">
                          <input type="text" value={row.workName}
                            onChange={(e) => updateRow(row.workItemId, { workName: e.target.value })}
                            placeholder="クロス材料費" className={cellInput} />
                        </td>
                        <td className="border-l border-slate-100 px-1 py-1">
                          <input type="text" value={row.workDescription}
                            onChange={(e) => updateRow(row.workItemId, { workDescription: e.target.value })}
                            placeholder="SP2525" className={cellInput} />
                        </td>
                        <td className="border-l border-slate-100 px-1 py-1">
                          <div className="flex items-center gap-1">
                            <input type="text" value={row.location1}
                              onChange={(e) => updateRow(row.workItemId, { location1: e.target.value })}
                              placeholder="洋室" className={cellInput} />
                            <select value={row.location2}
                              onChange={(e) => updateRow(row.workItemId, { location2: e.target.value })}
                              aria-label="部位" className={`${cellSelect} w-20 shrink-0`}>
                              {LOCATION2_OPTIONS.map((o) => <option key={o} value={o}>{o === "" ? "—" : o}</option>)}
                            </select>
                          </div>
                        </td>
                        <td className="border-l border-slate-100 px-1 py-1">
                          <input type="text" inputMode="decimal" value={row.quantity}
                            onChange={(e) => updateRow(row.workItemId, { quantity: e.target.value })}
                            aria-label="数量"
                            className={`${cellInput} border-slate-300 bg-white text-right`} />
                        </td>
                        <td className="border-l border-slate-100 px-1 py-1">
                          <select value={row.unit}
                            onChange={(e) => updateRow(row.workItemId, { unit: e.target.value })}
                            aria-label="単位" className={`${cellSelect} text-center`}>
                            {(UNITS.includes(row.unit) ? UNITS : [row.unit, ...UNITS]).map((u) => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </td>
                        <td className="border-l border-slate-100 px-1 py-1">
                          <div className="flex items-center justify-end gap-1 pr-1">
                            <input type="text" inputMode="numeric" value={row.sellingUnitPrice}
                              onChange={(e) => updateRow(row.workItemId, { sellingUnitPrice: e.target.value })}
                              aria-label="売価単価" className={`${cellInput} text-right`} />
                            <span className="shrink-0 text-xs text-slate-500">円</span>
                          </div>
                        </td>
                        <td className="border-l border-slate-100 px-3 py-1 text-right tabular-nums">
                          <span className="font-semibold text-[var(--nu-text)]">{fmtNum(a.sellingAmount)}</span>
                          <span className="ml-1 text-xs text-slate-500">円</span>
                        </td>
                        <td className="border-l border-slate-100 px-0 py-1 text-center">
                          <button type="button" onClick={() => removeRow(row.workItemId)}
                            aria-label={`${row.workItemId} を削除`}
                            className="rounded px-1.5 py-1 text-xs text-slate-300 hover:text-rose-500">✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 追加（通常項目／クロス3方式） */}
            <div className="relative mt-4">
              <button type="button" onClick={() => setShowAddMenu((v) => !v)}
                aria-expanded={showAddMenu}
                className="rounded-lg border-2 border-dashed border-[#1b365d]/40 px-5 py-2.5 text-sm font-bold text-[#1b365d] hover:bg-[#eef4fb]">
                ＋ 工事項目を追加
              </button>
              {showAddMenu && (
                <AddMenu onNormal={() => { addRow(); setShowAddMenu(false); }} onCross={addCrossRows} onClose={() => setShowAddMenu(false)} />
              )}
            </div>

            {/* 保存済み見積からの取り込み（既存機能） */}
            {legacyEstimates.length > 0 && (
              <div className="mt-4">
                <button type="button" onClick={() => setShowImport((v) => !v)}
                  className="text-xs font-semibold text-slate-500 underline-offset-2 hover:underline">
                  保存済みの見積から取り込む {showImport ? "▲" : "▼"}
                </button>
                {showImport && (
                  <div className="mt-2 space-y-1.5 rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-xs text-slate-400">
                      見積明細を工事項目としてコピーします（元の見積は変更されません）。原価は0で取り込まれます。
                    </p>
                    {legacyEstimates.map((est) => (
                      <button key={est.id} type="button" onClick={() => handleImport(est.id)}
                        className="flex w-full items-center justify-between rounded border border-slate-200 px-3 py-2 text-left hover:bg-slate-50">
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-bold text-[var(--nu-text)]">{est.projectName || "（案件名なし）"}</span>
                          <span className="block text-[11px] text-slate-400">{est.estimateNo}・{est.estimateItems.length}行・{fmtYen(est.total)}</span>
                        </span>
                        <span className="shrink-0 text-xs font-bold text-[#1b365d]">取り込む</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {saveMsg && (
              <div className={`mt-4 rounded-md px-3 py-2 text-xs font-bold ring-1 ${saveMsg.ok ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-rose-50 text-rose-600 ring-rose-200"}`}>
                {saveMsg.text}
              </div>
            )}

            <div className="mt-4 flex gap-3">
              <button type="button" onClick={handleSave}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                保存する
              </button>
              <button type="button" disabled={invoiceLoading} onClick={() => void handleInvoicePdf()}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                {invoiceLoading ? "PDF作成中…" : "請求書PDFを作成"}
              </button>
            </div>
          </div>

          {/* ── 右：選択行の内部管理 ── */}
          <aside className="w-[22rem] shrink-0 space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="mb-4 flex items-baseline gap-2">
                <span className="text-lg font-bold text-[var(--nu-text)]">内部管理</span>
                <span className="text-xs font-medium text-slate-500">（外部帳票には表示されません）</span>
              </h2>
              {selectedRow ? (
                <InternalPanel
                  row={selectedRow}
                  targetMargin={targetMargin[selectedRow.workItemId] ?? ""}
                  onTargetMargin={(v) => setTargetMargin((p) => ({ ...p, [selectedRow.workItemId]: v }))}
                  onCostUnit={(v) => setCostUnit(selectedRow.workItemId, v)}
                  onSellingUnitPrice={(v) => updateRow(selectedRow.workItemId, { sellingUnitPrice: v })}
                  onAdopt={(ref) => adoptReferencePrice(selectedRow.workItemId, ref)}
                  breakdownOpen={openBreakdownIds.has(selectedRow.workItemId)}
                  onToggleBreakdown={() => toggleBreakdown(selectedRow.workItemId)}
                  onUpdate={(patch) => updateRow(selectedRow.workItemId, patch)}
                />
              ) : (
                <p className="py-6 text-center text-sm text-slate-400">明細を選択すると内部管理が表示されます。</p>
              )}
            </div>

            {/* 提出用のうち表に出ない項目（税区分・備考）。原価とは明確に分ける */}
            {selectedRow && (
              <div className="rounded-lg border border-slate-200 bg-white p-5">
                <h2 className="mb-3 text-sm font-bold text-[var(--nu-text)]">
                  提出用の詳細<span className="ml-2 text-xs font-medium text-slate-500">（見積書に印字されます）</span>
                </h2>
                <label className="mb-1 block text-xs font-medium text-slate-500">税区分・税率</label>
                <select value={taxComboValue(selectedRow.taxType, selectedRow.taxRate)}
                  onChange={(e) => { const { taxType, taxRate } = TAX_COMBO[e.target.value]; updateRow(selectedRow.workItemId, { taxType, taxRate }); }}
                  className="mb-3 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#1b365d] focus:ring-1 focus:ring-[#1b365d]">
                  {selectedRow.taxType === "taxable" && selectedRow.taxRate === 0 && <option value="taxable_0">課税0%</option>}
                  <option value="taxable_10">課税10%</option>
                  <option value="taxable_8">課税8%</option>
                  <option value="non_taxable">非課税</option>
                  <option value="tax_exempt">不課税・対象外</option>
                </select>
                <label className="mb-1 block text-xs font-medium text-slate-500">備考</label>
                <input type="text" value={selectedRow.note}
                  onChange={(e) => updateRow(selectedRow.workItemId, { note: e.target.value })}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#1b365d] focus:ring-1 focus:ring-[#1b365d]" />
                <button type="button" onClick={() => duplicateRow(selectedRow.workItemId)}
                  className="mt-3 text-xs font-semibold text-slate-500 underline-offset-2 hover:underline">
                  この明細を複製
                </button>
              </div>
            )}

            <VersionList versions={savedVersions} projectId={projectId} />
          </aside>
        </div>

        {/* ── 下部：固定集計 ── */}
        <div
          className="sticky z-20 border-t border-slate-200 bg-slate-50/95 px-8 py-5 backdrop-blur"
          style={{ bottom: "calc(72px + env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-center justify-between gap-6">
            <div className="grid flex-1 grid-cols-4 gap-4">
              <SummaryCard label="見積合計" value={fmtNum(totals.selling)} unit="円" />
              <SummaryCard label="原価合計" value={fmtNum(totals.cost)} unit="円" />
              <SummaryCard label="粗利" value={fmtNum(totals.grossProfit)} unit="円" accent={totals.grossProfit < 0 ? "danger" : "profit"} />
              <SummaryCard label="粗利率" value={totals.grossProfitRate.toFixed(1)} unit="%" accent={totals.grossProfit < 0 ? "danger" : "profit"} />
            </div>
            <button type="button" onClick={handleSaveAndPreview} disabled={goingPreview}
              className="shrink-0 rounded-lg bg-[#1b365d] px-10 py-4 text-base font-bold text-white hover:bg-[#16294a] disabled:opacity-60">
              {goingPreview ? "保存中…" : "保存して見積書を確認"}
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════ iPhone レイアウト（375px基準） ══════════════ */}
      <div className="space-y-3 px-4 py-4 lg:hidden">
        <NuProjectTabs projectId={projectId} active="estimate" />

        <p className="rounded-xl bg-[var(--nu-primary-bg)] px-3 py-2 text-[11px] leading-snug text-[var(--nu-primary-dk)]">
          白い欄は<strong>提出用（見積書に出ます）</strong>、黄色い欄は<strong>内部管理（原価・粗利）</strong>です。
          内部管理は見積書PDFには表示されません。
        </p>

        {showRestore && restoredDraft && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-bold text-amber-800">保存されていない下書きがあります。</p>
            <p className="mt-0.5 text-[11px] text-amber-700">
              最終更新：{new Date(restoredDraft.updatedAt).toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" })}
            </p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={handleRestore}
                className="min-h-[44px] flex-1 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white active:opacity-80">
                復元する
              </button>
              <button type="button" onClick={handleDiscardDraft}
                className="min-h-[44px] flex-1 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-700 active:opacity-80">
                破棄する
              </button>
            </div>
          </div>
        )}

        {legacyEstimates.length > 0 && (
          <div>
            <button type="button" onClick={() => setShowImport((v) => !v)}
              className="flex min-h-[44px] w-full items-center justify-between rounded-2xl border border-[var(--nu-border)] bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm active:bg-[var(--nu-bg)]">
              <span>保存済みの見積から取り込む</span>
              <span className="text-slate-300">{showImport ? "▲" : "▼"}</span>
            </button>
            {showImport && (
              <div className="mt-2 space-y-2 rounded-2xl border border-[var(--nu-border)] bg-white p-3 shadow-sm">
                <p className="text-[11px] text-slate-400">
                  見積明細を工事項目としてコピーします（元の見積は変更されません）。原価は0で取り込まれます。
                </p>
                {legacyEstimates.map((est) => (
                  <button key={est.id} type="button" onClick={() => handleImport(est.id)}
                    className="flex min-h-[44px] w-full items-center justify-between rounded-xl border border-[var(--nu-border)] bg-[var(--nu-bg)] px-3 py-2 text-left active:opacity-80">
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold text-[var(--nu-text)]">{est.projectName || "（案件名なし）"}</span>
                      <span className="block text-[11px] text-slate-400">{est.estimateNo}・{est.estimateItems.length}行・{fmtYen(est.total)}</span>
                    </span>
                    <span className="shrink-0 text-xs font-bold text-[var(--nu-primary-dk)]">取り込む</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="px-1 text-[11px] text-slate-400">{saveStatusLabel}</p>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--nu-border)] bg-white px-4 py-10 text-center">
            <p className="text-sm text-slate-500">まだ工事項目がありません。</p>
            <p className="mt-1 text-sm text-slate-500">下の「＋ 工事項目を追加」から入力を始めてください。</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((row, index) => {
              const a = rowAmounts(row);
              const costOpen = openCostIds.has(row.workItemId);
              const qty = toNum(row.quantity);
              const costUnit = qty > 0 ? a.totalCost / qty : 0;
              const g = toNum(targetMargin[row.workItemId] ?? "");
              const refUnit = g > 0 && g < 100 ? costUnit / (1 - g / 100) : 0;
              return (
                <div key={row.workItemId} className="overflow-hidden rounded-2xl border border-[var(--nu-border)] bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-[var(--nu-border-soft)] bg-[var(--nu-bg)] px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-[var(--nu-primary)] px-2 py-0.5 font-mono text-[11px] font-bold text-white">{row.workItemId}</span>
                      <span className="text-xs font-bold text-slate-500">項目 {index + 1}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => duplicateRow(row.workItemId)}
                        className="rounded-lg px-2 py-1.5 text-xs text-slate-400 active:text-slate-600">複製</button>
                      <button type="button" onClick={() => removeRow(row.workItemId)}
                        className="rounded-lg px-2 py-1.5 text-xs text-slate-400 active:text-rose-500">削除</button>
                    </div>
                  </div>

                  <div className="space-y-3 p-3">
                    {/* 工種・項目 */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={lbl}>工種</label>
                        <input type="text" value={row.category} list={`sp-cat-${row.workItemId}`}
                          onChange={(e) => updateRow(row.workItemId, { category: e.target.value })}
                          placeholder="クロス工事" className={fld} />
                        <datalist id={`sp-cat-${row.workItemId}`}>
                          {CATEGORY_PRESETS.map((c) => <option key={c} value={c} />)}
                        </datalist>
                      </div>
                      <div>
                        <label className={lbl}>項目名</label>
                        <input type="text" value={row.workName}
                          onChange={(e) => updateRow(row.workItemId, { workName: e.target.value })}
                          placeholder="クロス材料費" className={fld} />
                      </div>
                    </div>
                    {/* 材料／工事内容 */}
                    <div>
                      <label className={lbl}>材料名・工事内容</label>
                      <input type="text" value={row.workDescription}
                        onChange={(e) => updateRow(row.workItemId, { workDescription: e.target.value })}
                        placeholder="SP2525／既存めくり・下地処理・新規貼り" className={fld} />
                    </div>
                    {/* 施工場所 */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={lbl}>施工場所</label>
                        <input type="text" value={row.location1}
                          onChange={(e) => updateRow(row.workItemId, { location1: e.target.value })}
                          placeholder="洋室・洗面所" className={fld} />
                      </div>
                      <div>
                        <label className={lbl}>部位</label>
                        <select value={row.location2}
                          onChange={(e) => updateRow(row.workItemId, { location2: e.target.value })} className={sel}>
                          {LOCATION2_OPTIONS.map((o) => <option key={o} value={o}>{o === "" ? "（なし）" : o}</option>)}
                        </select>
                      </div>
                    </div>
                    {/* 数量・単位 */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={lbl}>数量</label>
                        <input type="text" inputMode="decimal" value={row.quantity}
                          onChange={(e) => updateRow(row.workItemId, { quantity: e.target.value })} className={fld} />
                      </div>
                      <div>
                        <label className={lbl}>単位</label>
                        <select value={row.unit}
                          onChange={(e) => updateRow(row.workItemId, { unit: e.target.value })} className={sel}>
                          {(UNITS.includes(row.unit) ? UNITS : [row.unit, ...UNITS]).map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                    </div>
                    {/* 売価単価 */}
                    <div>
                      <label className={lbl}>売価単価</label>
                      <input type="text" inputMode="numeric" value={row.sellingUnitPrice}
                        onChange={(e) => updateRow(row.workItemId, { sellingUnitPrice: e.target.value })} className={fld} />
                    </div>
                    {/* 見積金額 */}
                    <div className="flex items-center justify-between rounded-xl bg-[var(--nu-bg)] px-3 py-2.5">
                      <span className="text-xs text-slate-500">見積金額（自動・{row.taxType === "taxable" ? `課税${row.taxRate}%` : TAX_TYPE_LABELS[row.taxType]}）</span>
                      <span className="text-sm font-bold text-[var(--nu-text)]">{fmtYen(a.sellingAmount)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={lbl}>税区分・税率</label>
                        <select value={taxComboValue(row.taxType, row.taxRate)}
                          onChange={(e) => { const { taxType, taxRate } = TAX_COMBO[e.target.value]; updateRow(row.workItemId, { taxType, taxRate }); }}
                          className={sel}>
                          {row.taxType === "taxable" && row.taxRate === 0 && <option value="taxable_0">課税0%</option>}
                          <option value="taxable_10">課税10%</option>
                          <option value="taxable_8">課税8%</option>
                          <option value="non_taxable">非課税</option>
                          <option value="tax_exempt">不課税・対象外</option>
                        </select>
                      </div>
                      <div>
                        <label className={lbl}>備考</label>
                        <input type="text" value={row.note}
                          onChange={(e) => updateRow(row.workItemId, { note: e.target.value })} className={fld} />
                      </div>
                    </div>
                  </div>

                  {/* 内部管理（開閉） */}
                  <button type="button" onClick={() => toggleCost(row.workItemId)}
                    className="flex min-h-[44px] w-full items-center justify-between border-t border-amber-200 bg-amber-50 px-4 py-2.5 active:opacity-80">
                    <span className="text-left text-xs font-bold text-amber-800">
                      内部管理<span className="ml-1 font-medium">（外部帳票には表示されません）</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-amber-700">
                      <span>{(a.grossProfitRate * 100).toFixed(1)}%</span>
                      <span>{costOpen ? "▲" : "▼"}</span>
                    </span>
                  </button>
                  {costOpen && (
                    <div className="bg-amber-50/60 p-3">
                      <InternalPanel
                        row={row}
                        mobile
                        targetMargin={targetMargin[row.workItemId] ?? ""}
                        onTargetMargin={(v) => setTargetMargin((p) => ({ ...p, [row.workItemId]: v }))}
                        onCostUnit={(v) => setCostUnit(row.workItemId, v)}
                        onSellingUnitPrice={(v) => updateRow(row.workItemId, { sellingUnitPrice: v })}
                        onAdopt={() => adoptReferencePrice(row.workItemId, refUnit)}
                        breakdownOpen={openBreakdownIds.has(row.workItemId)}
                        onToggleBreakdown={() => toggleBreakdown(row.workItemId)}
                        onUpdate={(patch) => updateRow(row.workItemId, patch)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 追加 */}
        <div className="relative">
          <button type="button" onClick={() => setShowAddMenu((v) => !v)} aria-expanded={showAddMenu}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[color:var(--nu-primary)]/40 bg-white px-4 py-3 text-sm font-bold text-[var(--nu-primary-dk)] active:bg-[var(--nu-primary-bg)]">
            ＋ 工事項目を追加
          </button>
          {showAddMenu && (
            <AddMenu mobile onNormal={() => { addRow(); setShowAddMenu(false); }} onCross={addCrossRows} onClose={() => setShowAddMenu(false)} />
          )}
        </div>

        {/* 集計 */}
        {rows.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <SummaryCard label="見積合計" value={fmtNum(totals.selling)} unit="円" mobile />
            <SummaryCard label="原価合計" value={fmtNum(totals.cost)} unit="円" mobile />
            <SummaryCard label="粗利" value={fmtNum(totals.grossProfit)} unit="円" mobile accent={totals.grossProfit < 0 ? "danger" : "profit"} />
            <SummaryCard label="粗利率" value={totals.grossProfitRate.toFixed(1)} unit="%" mobile accent={totals.grossProfit < 0 ? "danger" : "profit"} />
          </div>
        )}

        {saveMsg && (
          <div className={`rounded-xl px-3 py-2 text-xs font-bold ring-1 ${saveMsg.ok ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-rose-50 text-rose-600 ring-rose-200"}`}>
            {saveMsg.text}
          </div>
        )}

        <VersionList versions={savedVersions} projectId={projectId} />

        {rows.length > 0 && (
          <div className="space-y-2">
            <button type="button" onClick={handleSaveAndPreview} disabled={goingPreview}
              className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-[#1b365d] px-4 py-3 text-sm font-bold text-white shadow-sm active:bg-[#16294a] disabled:opacity-60">
              {goingPreview ? "保存中…" : "保存して見積書を確認"}
            </button>
            <button type="button" onClick={handleSave}
              className="flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-[var(--nu-border)] bg-white px-4 py-3 text-sm font-semibold text-slate-600 active:bg-[var(--nu-bg)]">
              保存する
            </button>
            <button type="button" disabled={invoiceLoading} onClick={() => void handleInvoicePdf()}
              className="flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-[var(--nu-border)] bg-white px-4 py-3 text-sm font-semibold text-slate-600 active:bg-[var(--nu-bg)] disabled:opacity-50">
              {invoiceLoading ? "PDF作成中…" : "請求書PDFを作成"}
            </button>
            <p className="text-center text-[11px] text-slate-400">見積書PDFに原価・粗利は表示されません。</p>
            <Link href={backHref} className="block py-2 text-center text-xs font-medium text-[var(--nu-primary-dk)]">← 案件詳細へ戻る</Link>
          </div>
        )}
      </div>

      {/* 見積の本保存：上書き保存 か 新しい版 かを選ぶ（PC・モバイル共通） */}
      {showVersionChoice && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-bold text-[var(--nu-text)]">見積の保存方法を選んでください</h2>
            <p className="mt-1 text-xs text-slate-500">
              工事項目は保存しました。見積書として残す版を選びます。過去の版は変更されません。
            </p>

            {savedVersions.length > 0 && (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                現在の最新版：<span className="font-bold">{savedVersions[savedVersions.length - 1].estimateNo}</span>
                （v{savedVersions[savedVersions.length - 1].version}）
              </p>
            )}

            <button type="button" onClick={handleChooseOverwrite}
              className="mt-4 min-h-[52px] w-full rounded-xl border border-[#1b365d] bg-white px-4 text-sm font-bold text-[#1b365d] active:bg-[#eef4fb]">
              現在の版を上書き保存
              {savedVersions.length > 0 && `（${savedVersions[savedVersions.length - 1].estimateNo}）`}
            </button>

            <div className="mt-4 border-t border-slate-100 pt-3">
              <label className="mb-1 block text-xs font-medium text-slate-500">修正理由（新しい版として保存する場合）</label>
              <select value={revisionReason} onChange={(e) => setRevisionReason(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#1b365d] focus:ring-1 focus:ring-[#1b365d]">
                {REVISION_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              {revisionReason === "その他" && (
                <input type="text" value={revisionReasonFree} onChange={(e) => setRevisionReasonFree(e.target.value)}
                  placeholder="修正理由を入力"
                  className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#1b365d] focus:ring-1 focus:ring-[#1b365d]" />
              )}
              <button type="button" onClick={handleChooseNewVersion}
                className="mt-2 min-h-[52px] w-full rounded-xl bg-[#1b365d] px-4 text-sm font-bold text-white active:bg-[#16294a]">
                新しい版として保存（v{(savedVersions[savedVersions.length - 1]?.version ?? 0) + 1}）
              </button>
            </div>

            <button type="button" onClick={() => setShowVersionChoice(false)}
              className="mt-3 min-h-[44px] w-full rounded-xl text-xs font-semibold text-slate-400 active:bg-slate-50">
              やめる（工事項目の保存は完了しています）
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 保存済みの見積（版）一覧 ─────────────────────────────────
function VersionList({ versions, projectId }: { versions: SavedEstimate[]; projectId: string }) {
  if (versions.length === 0) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-bold text-[var(--nu-text)]">保存済みの見積（版）</h2>
      <ul className="space-y-1.5">
        {versions.map((v) => (
          <li key={v.id}>
            <Link
              href={`/new/projects/${encodeURIComponent(projectId)}/estimate/preview?v=${encodeURIComponent(v.id)}`}
              className="flex min-h-[44px] items-center justify-between rounded-lg border border-slate-200 px-3 py-2 active:bg-slate-50"
            >
              <span className="min-w-0">
                <span className="block truncate font-mono text-xs font-bold text-[var(--nu-text)]">{v.estimateNo}</span>
                <span className="block text-[11px] text-slate-400">
                  v{v.version}・{v.createdAt}
                  {v.revisionReason ? `・${v.revisionReason}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-xs font-bold text-[#1b365d]">見る ›</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── 明細の追加メニュー（通常項目／クロス確定3方式） ─────────────
function AddMenu({
  mobile,
  onNormal,
  onCross,
  onClose,
}: {
  mobile?: boolean;
  onNormal: () => void;
  onCross: (id: CrossMethodId) => void;
  onClose: () => void;
}) {
  return (
    <div
      className={`absolute z-30 mt-2 rounded-xl border border-slate-200 bg-white p-2 shadow-lg ${
        mobile ? "inset-x-0" : "left-0 w-[26rem]"
      }`}
    >
      <button type="button" onClick={onNormal}
        className="flex min-h-[44px] w-full items-center rounded-lg px-3 py-2 text-left text-sm font-semibold text-[var(--nu-text)] hover:bg-slate-50 active:bg-slate-100">
        通常の工事項目を1行追加
      </button>
      <p className="mt-2 border-t border-slate-100 px-3 pt-2 text-[11px] font-bold text-slate-500">
        クロス見積（方式を選んでください）
      </p>
      {CROSS_METHODS.map((m) => (
        <button key={m.id} type="button" onClick={() => onCross(m.id)}
          className="block min-h-[44px] w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50 active:bg-slate-100">
          <span className="block text-sm font-semibold text-[var(--nu-text)]">{m.label}</span>
          <span className="block text-[11px] text-slate-500">{m.formula}</span>
        </button>
      ))}
      <button type="button" onClick={onClose}
        className="mt-1 min-h-[44px] w-full rounded-lg px-3 py-2 text-center text-xs font-semibold text-slate-400 hover:bg-slate-50">
        閉じる
      </button>
    </div>
  );
}

// ─── 内部管理パネル（PC右カラム／モバイル開閉部で共用） ──────────
function InternalPanel({
  row,
  mobile,
  targetMargin,
  onTargetMargin,
  onCostUnit,
  onSellingUnitPrice,
  onAdopt,
  breakdownOpen,
  onToggleBreakdown,
  onUpdate,
}: {
  row: EditableWorkItem;
  mobile?: boolean;
  targetMargin: string;
  onTargetMargin: (v: string) => void;
  onCostUnit: (v: string) => void;
  onSellingUnitPrice: (v: string) => void;
  onAdopt: (refUnitPrice: number) => void;
  breakdownOpen: boolean;
  onToggleBreakdown: () => void;
  onUpdate: (patch: Partial<EditableWorkItem>) => void;
}) {
  const a = rowAmounts(row);
  const qty = toNum(row.quantity);
  const costUnit = qty > 0 ? a.totalCost / qty : 0;
  const g = toNum(targetMargin);
  const refUnit = g > 0 && g < 100 ? costUnit / (1 - g / 100) : 0;
  const boxClass = mobile ? `${panelBox} min-h-[44px]` : panelBox;
  const adoptedClass = mobile ? `${panelBoxAdopted} min-h-[44px]` : panelBoxAdopted;

  return (
    <div className="space-y-2.5">
      <PanelRow label="原価単価">
        <div className="flex items-center gap-1">
          <input type="text" inputMode="numeric" aria-label="原価単価"
            value={qty > 0 ? String(Math.round(costUnit)) : "0"}
            onChange={(e) => onCostUnit(e.target.value)} className={boxClass} />
          <span className="shrink-0 text-xs text-slate-500">円</span>
        </div>
      </PanelRow>
      <PanelRow label="数量">
        <div className={`${boxClass} border-transparent bg-transparent`}>{qty}{row.unit}</div>
      </PanelRow>
      <PanelRow label="原価金額">
        <div className="flex items-center gap-1">
          <div className={boxClass}>{fmtNum(a.totalCost)}</div>
          <span className="shrink-0 text-xs text-slate-500">円</span>
        </div>
      </PanelRow>
      <PanelRow label="目標粗利率">
        <div className="flex items-center gap-1">
          <input type="text" inputMode="decimal" placeholder="25" aria-label="目標粗利率"
            value={targetMargin} onChange={(e) => onTargetMargin(e.target.value)} className={boxClass} />
          <span className="shrink-0 text-xs text-slate-500">%</span>
        </div>
      </PanelRow>

      <div className="!mt-4 border-t border-slate-100 pt-3 space-y-2.5">
        <PanelRow label="参考売価">
          <div className="flex items-center gap-1">
            <div className={boxClass}>{refUnit > 0 ? fmtNum(refUnit) : "—"}</div>
            <span className="shrink-0 text-xs text-slate-500">円</span>
            <button type="button" disabled={refUnit <= 0} onClick={() => onAdopt(refUnit)}
              className={`shrink-0 rounded-md bg-[#1b365d] px-2 text-[11px] font-bold text-white disabled:opacity-30 ${mobile ? "min-h-[44px] px-3" : "py-1.5"}`}>
              採用
            </button>
          </div>
        </PanelRow>
        <PanelRow label="採用売価">
          <div className="flex items-center gap-1">
            <input type="text" inputMode="numeric" aria-label="採用売価"
              value={row.sellingUnitPrice} onChange={(e) => onSellingUnitPrice(e.target.value)}
              className={adoptedClass} />
            <span className="shrink-0 text-xs text-slate-500">円</span>
          </div>
        </PanelRow>
        <PanelRow label="粗利額">
          <div className="flex items-center gap-1">
            <div className={`${boxClass} ${a.grossProfit < 0 ? "text-rose-600" : ""}`}>{fmtNum(a.grossProfit)}</div>
            <span className="shrink-0 text-xs text-slate-500">円</span>
          </div>
        </PanelRow>
        <PanelRow label="実粗利率">
          <div className="flex items-center gap-1">
            <div className={`${boxClass} ${a.grossProfit < 0 ? "text-rose-600" : ""}`}>{(a.grossProfitRate * 100).toFixed(1)}</div>
            <span className="shrink-0 text-xs text-slate-500">%</span>
          </div>
        </PanelRow>
      </div>

      {/* 原価の内訳（既存の5区分。旧データもそのまま編集できる） */}
      <div className="!mt-4 border-t border-slate-100 pt-3">
        <button type="button" onClick={onToggleBreakdown}
          className={`w-full text-left text-xs font-semibold text-slate-500 hover:text-slate-700 ${mobile ? "min-h-[44px]" : ""}`}>
          原価の内訳（材料・労務・外注・諸経費・その他） {breakdownOpen ? "▲" : "▼"}
        </button>
        {breakdownOpen && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <label className={costLbl}>材料原価</label>
              <input type="text" inputMode="numeric" value={row.materialCost}
                onChange={(e) => onUpdate({ materialCost: e.target.value })} className={costFld} />
            </div>
            <div>
              <label className={costLbl}>労務原価</label>
              <input type="text" inputMode="numeric" value={row.laborCost}
                onChange={(e) => onUpdate({ laborCost: e.target.value })} className={costFld} />
            </div>
            <div>
              <label className={costLbl}>外注原価</label>
              <input type="text" inputMode="numeric" value={row.subcontractCost}
                onChange={(e) => onUpdate({ subcontractCost: e.target.value })} className={costFld} />
            </div>
            <div>
              <label className={costLbl}>諸経費</label>
              <input type="text" inputMode="numeric" value={row.expenseCost}
                onChange={(e) => onUpdate({ expenseCost: e.target.value })} className={costFld} />
            </div>
            <div>
              <label className={costLbl}>その他原価</label>
              <input type="text" inputMode="numeric" value={row.otherCost}
                onChange={(e) => onUpdate({ otherCost: e.target.value })} className={costFld} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PanelRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-[5.5rem] shrink-0 text-sm text-slate-600">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  unit,
  accent,
  mobile,
}: {
  label: string;
  value: string;
  unit: string;
  accent?: "profit" | "danger";
  mobile?: boolean;
}) {
  const color =
    accent === "danger" ? "text-rose-600" : accent === "profit" ? "text-teal-700" : "text-[var(--nu-text)]";
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className={`text-xs font-semibold ${accent === "danger" ? "text-rose-600" : accent === "profit" ? "text-teal-700" : "text-slate-500"}`}>
        {label}
      </p>
      <p className={`mt-1 font-bold tabular-nums ${color} ${mobile ? "text-xl" : "text-4xl"}`}>
        {value}
        <span className={`ml-1 font-semibold ${mobile ? "text-xs" : "text-base"}`}>{unit}</span>
      </p>
    </div>
  );
}
