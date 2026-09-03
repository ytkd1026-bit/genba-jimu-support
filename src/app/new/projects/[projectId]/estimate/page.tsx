"use client";

// 新UI 見積・原価入力（/new/projects/[projectId]/estimate）
// 「以前の方式」（工事項目を1行ずつ・提出用売価と内部管理用原価を同じ WorkItem で管理）を
// 新UIデザインで再構成した画面。データ構造・保存ロジック・PDF生成は既存を再利用する。
//
// ・提出用（外部帳票）＝売価のみ。原価・粗利は絶対に出さない。
// ・内部管理（原価・粗利）＝この画面内だけで確認。折りたたみで表示。
// ・目標粗利率→参考売価→採用 の補助計算は画面内のみ（DB項目は追加しない）。

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "../../../_components/PageHeader";
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
import { getSavedEstimates, type SavedEstimate } from "@/app/utils/savedEstimates";
import { getCompanyInfoForPdf, getBankSettings } from "@/app/utils/companySettings";
import { estimatePdfFileName, singleInvoicePdfFileName } from "@/app/utils/pdfFileName";
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

// 既存見積画面と同じ選択肢（考え方をそのまま踏襲）
const UNITS = ["m", "㎡", "枚", "式", "人工", "箇所", "本", "ケース", "台"];
const LOCATION2_OPTIONS = ["", "天井", "壁", "床", "共通"];
const CATEGORY_PRESETS = [
  "内装工事", "床工事", "天井工事", "壁工事", "建具工事", "塗装工事", "解体工事", "諸経費",
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

// ── 新UI 入力スタイル ──────────────────────────────────────────
const lbl = "mb-1 block text-xs font-medium text-slate-500";
const fld =
  "w-full rounded-xl border border-[#e6ebeb] bg-white px-3 py-2.5 text-sm text-[#1f2a2e] outline-none focus:border-[var(--nu-primary)] focus:ring-2 focus:ring-[var(--nu-primary-bg)] min-h-[44px]";
const sel =
  "w-full appearance-none rounded-xl border border-[#e6ebeb] bg-white px-3 py-2.5 text-sm text-[#1f2a2e] outline-none focus:border-[var(--nu-primary)] focus:ring-2 focus:ring-[var(--nu-primary-bg)] min-h-[44px]";
// 内部管理（原価）＝黄系で「外部帳票には出ない」ことを明示
const costFld =
  "w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-200/60 min-h-[44px]";
const costLbl = "mb-1 block text-xs font-medium text-amber-700";

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

export default function NewEstimatePage() {
  const params = useParams<{ projectId: string }>();
  const projectId = decodeURIComponent(params.projectId);

  const [notFound, setNotFound] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [rows, setRows] = useState<EditableWorkItem[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [openCostIds, setOpenCostIds] = useState<Set<string>>(new Set());
  const [targetMargin, setTargetMargin] = useState<Record<string, string>>({});
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showRestore, setShowRestore] = useState(false);
  const [pdfLoading, setPdfLoading] = useState<null | "estimate" | "invoice">(null);
  const [legacyEstimates, setLegacyEstimates] = useState<SavedEstimate[]>([]);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    const p = projectsStore.getById(projectId);
    if (!p) {
      setNotFound(true);
      setLoaded(true);
      return;
    }
    setProject(p);
    setRows(workItemsStore.getByProjectId(projectId).map(toEditable));
    setLegacyEstimates(getSavedEstimates());
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
  function addRow() {
    const id = issueWorkItemId(projectId);
    setRows((prev) => [
      ...prev,
      {
        workItemId: id, category: "内装工事", workName: "", workDescription: "",
        location1: "", location2: "", quantity: "1", unit: "式", sellingUnitPrice: "0",
        note: "", taxType: "taxable", taxRate: 10,
        materialCost: "0", laborCost: "0", subcontractCost: "0", expenseCost: "0", otherCost: "0",
        relatedDamageIds: [], relatedPhotoIds: [], createdAt: new Date().toISOString(),
      },
    ]);
  }
  function duplicateRow(id: string) {
    const src = rows.find((r) => r.workItemId === id);
    if (!src) return;
    const newId = issueWorkItemId(projectId);
    const idx = rows.findIndex((r) => r.workItemId === id);
    const dup: EditableWorkItem = { ...src, workItemId: newId, createdAt: new Date().toISOString() };
    setRows((prev) => [...prev.slice(0, idx + 1), dup, ...prev.slice(idx + 1)]);
  }
  function removeRow(id: string) {
    if (!confirm(`${id} を削除しますか？`)) return;
    setRows((prev) => prev.filter((r) => r.workItemId !== id));
    setDeletedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }
  function toggleCost(id: string) {
    setOpenCostIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  // 目標粗利率 → 参考売価単価を売価へ採用
  function adoptReferencePrice(id: string, refUnitPrice: number) {
    updateRow(id, { sellingUnitPrice: String(Math.round(refUnitPrice)) });
  }

  function handleRestore() {
    if (!restoredDraft?.data) return;
    setRows(restoredDraft.data.rows);
    setDeletedIds(restoredDraft.data.deletedIds);
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
    setRows((prev) => [...prev, ...migrated.map(toEditable)]);
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

  // ── 提出用PDF（原価・粗利は渡さない） ─────────────────────
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
  function validateBeforePdf(): boolean {
    const hasContent = rows.some(
      (r) => r.workName.trim() !== "" || r.workDescription.trim() !== "" || toNum(r.sellingUnitPrice) > 0,
    );
    if (rows.length === 0 || !hasContent) {
      alert("工事項目を1件以上入力してからPDFを発行してください。");
      return false;
    }
    if (!saveAll()) {
      alert("保存に失敗しました。PDFは発行していません。");
      return false;
    }
    return true;
  }
  async function handleEstimatePdf() {
    if (!project || pdfLoading !== null) return;
    if (!validateBeforePdf()) return;
    setPdfLoading("estimate");
    try {
      const { makeWorkEstimatePDF } = await import("@/components/pdf/WorkEstimatePDF");
      const title = project.projectType === "insurance" ? "損害復旧工事 見積明細書" : "見積明細書";
      const doc = makeWorkEstimatePDF({
        documentTitle: title, documentNumber: `EST-${project.projectId}`, createdDate: todaySlash(),
        submitTo: project.submitTo || project.clientName || "", projectName: project.projectName,
        siteAddress: project.siteAddress, companyInfo: getCompanyInfoForPdf(), projectId: project.projectId,
        lines: buildSellingLines(), subtotalSum: totals.selling, taxSum: totals.tax,
        totalWithTax: totals.totalWithTax, taxBreakdown: totals.breakdown,
      });
      await renderAndDownloadPdf(doc, estimatePdfFileName({
        clientName: project.clientName || project.submitTo, projectName: project.projectName,
        workContent: rows[0]?.workName ?? "", date: todayDash(),
      }));
    } catch (err) {
      console.error("見積書PDF生成エラー:", err);
      alert("PDFの生成に失敗しました。もう一度お試しください。");
    } finally {
      setPdfLoading(null);
    }
  }
  async function handleInvoicePdf() {
    if (!project || pdfLoading !== null) return;
    if (!validateBeforePdf()) return;
    setPdfLoading("invoice");
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
      setPdfLoading(null);
    }
  }

  const backHref = `/new/projects/${encodeURIComponent(projectId)}`;

  if (loaded && notFound) {
    return (
      <div>
        <PageHeader title="見積・原価入力" back="/new/projects" />
        <div className="px-4 py-10 text-center">
          <p className="text-sm font-bold text-[#1f2a2e]">案件が見つかりません。</p>
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
    : savedAt ? `下書き保存済み ${savedAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`
    : "";

  return (
    <div>
      <PageHeader
        title="見積・原価入力"
        subtitle={project.projectName || project.projectId}
        back={backHref}
      />

      <div className="space-y-3 px-4 py-4">
        {/* 説明 */}
        <p className="rounded-xl bg-[var(--nu-primary-bg)] px-3 py-2 text-[11px] leading-snug text-[var(--nu-primary-dk)]">
          白い欄は<strong>提出用（外部帳票）</strong>、黄色い欄は<strong>内部管理（原価・粗利）</strong>です。
          原価・粗利は見積書・請求書PDFには表示されません。
        </p>

        {/* 下書き復元 */}
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

        {/* 保存済み見積からの取り込み */}
        {legacyEstimates.length > 0 && (
          <div>
            <button type="button" onClick={() => setShowImport((v) => !v)}
              className="flex min-h-[44px] w-full items-center justify-between rounded-2xl border border-[#e6ebeb] bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm active:bg-[#f6f8f8]">
              <span>📥 保存済みの見積から取り込む</span>
              <span className="text-slate-300">{showImport ? "▲" : "▼"}</span>
            </button>
            {showImport && (
              <div className="mt-2 space-y-2 rounded-2xl border border-[#e6ebeb] bg-white p-3 shadow-sm">
                <p className="text-[11px] text-slate-400">
                  見積明細を工事項目としてコピーします（元の見積は変更されません）。原価は0で取り込まれます。
                </p>
                {legacyEstimates.map((est) => (
                  <button key={est.id} type="button" onClick={() => handleImport(est.id)}
                    className="flex min-h-[44px] w-full items-center justify-between rounded-xl border border-[#e6ebeb] bg-[#f6f8f8] px-3 py-2 text-left active:opacity-80">
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold text-[#1f2a2e]">{est.projectName || "（案件名なし）"}</span>
                      <span className="block text-[11px] text-slate-400">{est.estimateNo}・{est.estimateItems.length}行・{fmtYen(est.total)}</span>
                    </span>
                    <span className="shrink-0 text-xs font-bold text-[var(--nu-primary-dk)]">取り込む</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 保存ステータス */}
        {saveStatusLabel && (
          <p className="px-1 text-[11px] text-slate-400">{saveStatusLabel}</p>
        )}

        {/* 工事項目カード */}
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#cfdad8] bg-white px-4 py-10 text-center">
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
                <div key={row.workItemId} className="overflow-hidden rounded-2xl border border-[#e6ebeb] bg-white shadow-sm">
                  {/* ヘッダー */}
                  <div className="flex items-center justify-between border-b border-[#f0f3f3] bg-[#f6f8f8] px-4 py-2.5">
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

                  {/* 提出用（白） */}
                  <div className="space-y-3 p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={lbl}>工種</label>
                        <input type="text" value={row.category} list={`cat-${row.workItemId}`}
                          onChange={(e) => updateRow(row.workItemId, { category: e.target.value })}
                          placeholder="内装工事" className={fld} />
                        <datalist id={`cat-${row.workItemId}`}>
                          {CATEGORY_PRESETS.map((c) => <option key={c} value={c} />)}
                        </datalist>
                      </div>
                      <div>
                        <label className={lbl}>項目名（工事名）</label>
                        <input type="text" value={row.workName}
                          onChange={(e) => updateRow(row.workItemId, { workName: e.target.value })}
                          placeholder="クロス貼替" className={fld} />
                      </div>
                    </div>
                    <div>
                      <label className={lbl}>材料名・工事内容</label>
                      <input type="text" value={row.workDescription}
                        onChange={(e) => updateRow(row.workItemId, { workDescription: e.target.value })}
                        placeholder="量産クロス／既存めくり・下地処理・新規貼り" className={fld} />
                    </div>
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
                    <div className="grid grid-cols-3 gap-2">
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
                      <div>
                        <label className={lbl}>売単価</label>
                        <input type="text" inputMode="numeric" value={row.sellingUnitPrice}
                          onChange={(e) => updateRow(row.workItemId, { sellingUnitPrice: e.target.value })} className={fld} />
                      </div>
                    </div>
                    <div>
                      <label className={lbl}>税区分・税率</label>
                      <select value={taxComboValue(row.taxType, row.taxRate)}
                        onChange={(e) => { const { taxType, taxRate } = TAX_COMBO[e.target.value]; updateRow(row.workItemId, { taxType, taxRate }); }}
                        className={sel}>
                        {row.taxType === "taxable" && row.taxRate === 0 && <option value="taxable_0">課税0%（詳細）</option>}
                        <option value="taxable_10">課税10%</option>
                        <option value="taxable_8">課税8%</option>
                        <option value="non_taxable">非課税</option>
                        <option value="tax_exempt">不課税・対象外</option>
                      </select>
                    </div>
                    {/* 見積金額（自動） */}
                    <div className="flex items-center justify-between rounded-xl bg-[#f6f8f8] px-3 py-2.5">
                      <span className="text-xs text-slate-500">見積金額（自動・{row.taxType === "taxable" ? `課税${row.taxRate}%` : TAX_TYPE_LABELS[row.taxType]}）</span>
                      <span className="text-sm font-bold text-[#1f2a2e]">{fmtYen(a.sellingAmount)}</span>
                    </div>
                    <div>
                      <label className={lbl}>備考</label>
                      <input type="text" value={row.note}
                        onChange={(e) => updateRow(row.workItemId, { note: e.target.value })} className={fld} />
                    </div>
                  </div>

                  {/* 内部管理（黄・開閉） */}
                  <button type="button" onClick={() => toggleCost(row.workItemId)}
                    className="flex min-h-[44px] w-full items-center justify-between border-t border-amber-200 bg-amber-50 px-4 py-2.5 active:opacity-80">
                    <span className="text-xs font-bold text-amber-800">🔒 内部管理（外部帳票には表示されません）</span>
                    <span className="flex items-center gap-2 text-xs text-amber-700">
                      <span>粗利 {fmtYen(a.grossProfit)}（{(a.grossProfitRate * 100).toFixed(1)}%）</span>
                      <span>{costOpen ? "▲" : "▼"}</span>
                    </span>
                  </button>
                  {costOpen && (
                    <div className="space-y-3 bg-amber-50/60 p-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className={costLbl}>材料原価</label>
                          <input type="text" inputMode="numeric" value={row.materialCost}
                            onChange={(e) => updateRow(row.workItemId, { materialCost: e.target.value })} className={costFld} />
                        </div>
                        <div>
                          <label className={costLbl}>労務原価</label>
                          <input type="text" inputMode="numeric" value={row.laborCost}
                            onChange={(e) => updateRow(row.workItemId, { laborCost: e.target.value })} className={costFld} />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className={costLbl}>外注原価</label>
                          <input type="text" inputMode="numeric" value={row.subcontractCost}
                            onChange={(e) => updateRow(row.workItemId, { subcontractCost: e.target.value })} className={costFld} />
                        </div>
                        <div>
                          <label className={costLbl}>諸経費</label>
                          <input type="text" inputMode="numeric" value={row.expenseCost}
                            onChange={(e) => updateRow(row.workItemId, { expenseCost: e.target.value })} className={costFld} />
                        </div>
                        <div>
                          <label className={costLbl}>その他原価</label>
                          <input type="text" inputMode="numeric" value={row.otherCost}
                            onChange={(e) => updateRow(row.workItemId, { otherCost: e.target.value })} className={costFld} />
                        </div>
                      </div>

                      {/* 原価単価・目標粗利率→参考売価→採用 */}
                      <div className="rounded-xl bg-amber-100/70 p-3">
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                          <Kv label="原価単価" value={fmtYen(costUnit)} />
                          <Kv label="原価金額" value={fmtYen(a.totalCost)} />
                        </div>
                        <div className="mt-2 flex items-end gap-2">
                          <div className="flex-1">
                            <label className={costLbl}>目標粗利率(%)</label>
                            <input type="text" inputMode="decimal" placeholder="例：25"
                              value={targetMargin[row.workItemId] ?? ""}
                              onChange={(e) => setTargetMargin((prev) => ({ ...prev, [row.workItemId]: e.target.value }))}
                              className={costFld} />
                          </div>
                          <div className="flex-1">
                            <p className={costLbl}>参考売単価</p>
                            <div className="flex min-h-[44px] items-center rounded-xl border border-amber-200 bg-white px-3 text-sm font-bold text-amber-900">
                              {refUnit > 0 ? fmtYen(refUnit) : "—"}
                            </div>
                          </div>
                          <button type="button" disabled={refUnit <= 0}
                            onClick={() => adoptReferencePrice(row.workItemId, refUnit)}
                            className="min-h-[44px] shrink-0 rounded-xl bg-amber-600 px-3 text-xs font-bold text-white active:opacity-80 disabled:opacity-40">
                            採用
                          </button>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                          <Kv label="採用売価(単価)" value={fmtYen(toNum(row.sellingUnitPrice))} />
                          <Kv label="粗利額" value={fmtYen(a.grossProfit)} danger={a.grossProfit < 0} />
                          <Kv label="実粗利率" value={`${(a.grossProfitRate * 100).toFixed(1)}%`} danger={a.grossProfit < 0} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 追加 */}
        <button type="button" onClick={addRow}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[color:var(--nu-primary)]/40 bg-white px-4 py-3 text-sm font-bold text-[var(--nu-primary-dk)] active:bg-[var(--nu-primary-bg)]">
          ＋ 工事項目を追加
        </button>

        {/* 集計 */}
        {rows.length > 0 && (
          <div className="space-y-2">
            <div className="rounded-2xl border border-[#e6ebeb] bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-bold text-[#1f2a2e]">見積合計（提出用）</h3>
              <div className="space-y-1 text-sm">
                <Line label="小計（税抜）" value={fmtYen(totals.selling)} />
                <Line label="消費税" value={fmtYen(totals.tax)} />
                <div className="flex justify-between border-t border-[#f0f3f3] pt-1.5">
                  <span className="font-bold text-[#1f2a2e]">見積合計（税込）</span>
                  <span className="text-base font-bold text-[var(--nu-primary-dk)]">{fmtYen(totals.totalWithTax)}</span>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="mb-2 text-xs font-bold text-amber-800">🔒 内部管理合計（提出PDFに出ません）</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-amber-800">原価合計</span><span className="font-bold text-amber-900">{fmtYen(totals.cost)}</span></div>
                <div className="flex justify-between"><span className="text-amber-800">粗利</span><span className={`font-bold ${totals.grossProfit < 0 ? "text-rose-600" : "text-amber-900"}`}>{fmtYen(totals.grossProfit)}</span></div>
                <div className="flex justify-between"><span className="text-amber-800">粗利率</span><span className={`font-bold ${totals.grossProfit < 0 ? "text-rose-600" : "text-amber-900"}`}>{totals.grossProfitRate.toFixed(1)}%</span></div>
              </div>
            </div>
          </div>
        )}

        {/* メッセージ */}
        {saveMsg && (
          <div className={`rounded-xl px-3 py-2 text-xs font-bold ring-1 ${saveMsg.ok ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-rose-50 text-rose-600 ring-rose-200"}`}>
            {saveMsg.text}
          </div>
        )}

        {/* 保存・PDF */}
        {rows.length > 0 && (
          <div className="space-y-2">
            <button type="button" onClick={handleSave}
              className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-[var(--nu-primary)] px-4 py-3 text-sm font-bold text-white shadow-sm active:bg-[var(--nu-primary-dk)]">
              保存する
            </button>
            <button type="button" disabled={pdfLoading !== null} onClick={() => void handleEstimatePdf()}
              className="flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-[var(--nu-primary)] bg-white px-4 py-3 text-sm font-bold text-[var(--nu-primary-dk)] active:bg-[var(--nu-primary-bg)] disabled:opacity-50">
              {pdfLoading === "estimate" ? "PDF作成中…" : "💾 保存して見積書を確認（PDF）"}
            </button>
            <button type="button" disabled={pdfLoading !== null} onClick={() => void handleInvoicePdf()}
              className="flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-[#e6ebeb] bg-white px-4 py-3 text-sm font-semibold text-slate-600 active:bg-[#f6f8f8] disabled:opacity-50">
              {pdfLoading === "invoice" ? "PDF作成中…" : "📄 請求書PDFを作成"}
            </button>
            <p className="text-center text-[11px] text-slate-400">提出用PDFに原価・粗利は表示されません。</p>
            <Link href={backHref} className="block py-2 text-center text-xs font-medium text-[var(--nu-primary-dk)]">← 案件詳細へ戻る</Link>
          </div>
        )}
      </div>
    </div>
  );
}

function Kv({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-amber-800">{label}</span>
      <span className={`font-bold ${danger ? "text-rose-600" : "text-amber-900"}`}>{value}</span>
    </div>
  );
}
function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-[#1f2a2e]">{value}</span>
    </div>
  );
}
