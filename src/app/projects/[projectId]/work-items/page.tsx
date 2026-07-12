"use client";

// 04 工事項目・原価
// 見積明細（提出用・白系）と原価入力（内部管理・黄系）を1行単位で統合した画面。
// 見積入力と原価入力は別データにせず、同じ WorkItem を参照する。
// 既存の見積（genba_jimu_saved_estimates）からの取り込みにも対応する
// （旧データは読み取りのみで変更しない）。
//
// 提出用帳票には売価のみを出し、原価・粗利は絶対に出さないこと。

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { projectsStore, advanceProjectStatus, type Project } from "@/app/utils/projects";
import {
  workItemsStore,
  issueWorkItemId,
  computeWorkItemAmounts,
  migrateLegacyEstimateToWorkItems,
  type WorkItem,
} from "@/app/utils/workItems";
import { damageRecordsStore } from "@/app/utils/damageRecords";
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
import { SaveStatusBar } from "@/components/SaveStatusBar";
import { ProjectTabs, ProjectHeader } from "@/components/ProjectTabs";
import { TaxTotalsBox } from "@/components/TaxTotalsBox";
import { fldInput, fldSelect, lbl } from "@/components/formStyles";

// 既存見積画面と同じ選択肢
const UNITS = ["m", "㎡", "枚", "式", "人工", "箇所", "本", "ケース", "台"];
const LOCATION2_OPTIONS = ["", "天井", "壁", "床", "共通"];
const CATEGORY_PRESETS = [
  "内装工事", "床工事", "天井工事", "壁工事", "建具工事", "塗装工事", "解体工事", "諸経費",
];

// 税区分・税率の1択マッピング（通常選択肢は 課税10% / 課税8% / 非課税 / 不課税・対象外）
const TAX_COMBO: Record<string, { taxType: TaxType; taxRate: TaxRate }> = {
  taxable_10: { taxType: "taxable", taxRate: 10 },
  taxable_8:  { taxType: "taxable", taxRate: 8 },
  taxable_0:  { taxType: "taxable", taxRate: 0 }, // 詳細設定（課税0%）
  non_taxable: { taxType: "non_taxable", taxRate: 0 },
  tax_exempt:  { taxType: "tax_exempt", taxRate: 0 },
};

function taxComboValue(taxType: TaxType, taxRate: TaxRate): string {
  if (taxType === "non_taxable") return "non_taxable";
  if (taxType === "tax_exempt") return "tax_exempt";
  if (taxRate === 8) return "taxable_8";
  if (taxRate === 0) return "taxable_0";
  return "taxable_10";
}

// 内部管理（黄系）スタイル
const costInput =
  "w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-[1.35] text-stone-800 placeholder:text-stone-300 focus:border-amber-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-300/50 min-h-[44px]";
const costLbl = "mb-0.5 block text-xs leading-[1.35] text-amber-700";

// 入力中の数値は文字列で保持する（既存画面と同じUX。保存時に数値へ変換）
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

type WorkItemsDraftData = {
  rows: EditableWorkItem[];
  deletedIds: string[];
};

function toNum(v: string): number {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function fmtYen(n: number): string {
  return "¥" + n.toLocaleString("ja-JP");
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
    materialCost,
    laborCost,
    subcontractCost,
    expenseCost,
    otherCost,
    relatedDamageIds: row.relatedDamageIds,
    relatedPhotoIds: row.relatedPhotoIds,
    createdAt: row.createdAt,
    updatedAt: now,
    ...amounts,
  };
}

/** 行ごとの金額計算（画面表示用） */
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

export default function WorkItemsPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = decodeURIComponent(params.projectId);

  const [notFound, setNotFound] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [rows, setRows] = useState<EditableWorkItem[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showRestoreBanner, setShowRestoreBanner] = useState(false);
  const [openCostIds, setOpenCostIds] = useState<Set<string>>(new Set());
  const [pdfLoading, setPdfLoading] = useState<null | "estimate" | "invoice">(null);

  // 既存見積からの取り込み
  const [legacyEstimates, setLegacyEstimates] = useState<SavedEstimate[]>([]);
  const [showImport, setShowImport] = useState(false);

  // 関連被害の選択肢
  const [damageOptions, setDamageOptions] = useState<Array<{ id: string; caption: string }>>([]);

  // ── 読み込み ──────────────────────────────────────────────
  useEffect(() => {
    const p = projectsStore.getById(projectId);
    if (!p) {
      setNotFound(true);
      return;
    }
    setProject(p);
    setRows(workItemsStore.getByProjectId(projectId).map(toEditable));
    setDamageOptions(
      damageRecordsStore.getByProjectId(projectId).map((d) => ({
        id: d.damageId,
        caption: `${d.damageId} ${d.location || "（箇所未入力）"}`,
      })),
    );
    setLegacyEstimates(getSavedEstimates());
    setLoaded(true);
  }, [projectId]);

  // ── 自動下書き保存 ────────────────────────────────────────
  const WORK_ITEMS_DRAFT_KEY = draftKey("work-items", projectId);
  const draftData = useMemo<WorkItemsDraftData>(
    () => ({ rows, deletedIds }),
    [rows, deletedIds],
  );
  const { saveStatus, savedAt, clearDraft, restoredDraft } = useAutoDraft<WorkItemsDraftData>(
    WORK_ITEMS_DRAFT_KEY, "work-items", projectId, draftData,
    { enabled: loaded, debounceMs: 800 },
  );

  useEffect(() => {
    if (restoredDraft?.data) setShowRestoreBanner(true);
  }, [restoredDraft]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (saveStatus === "dirty") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveStatus]);

  function handleRestoreDraft() {
    if (!restoredDraft?.data) return;
    setRows(restoredDraft.data.rows);
    setDeletedIds(restoredDraft.data.deletedIds);
    setShowRestoreBanner(false);
  }

  function handleDiscardDraft() {
    clearDraft();
    setShowRestoreBanner(false);
  }

  // ── 行操作 ────────────────────────────────────────────────
  function updateRow(workItemId: string, patch: Partial<EditableWorkItem>) {
    setRows((prev) =>
      prev.map((r) => (r.workItemId === workItemId ? { ...r, ...patch } : r)),
    );
  }

  function addRow() {
    const workItemId = issueWorkItemId(projectId);
    setRows((prev) => [
      ...prev,
      {
        workItemId,
        category: "内装工事",
        workName: "",
        workDescription: "",
        location1: "",
        location2: "",
        quantity: "1",
        unit: "式",
        sellingUnitPrice: "0",
        note: "",
        taxType: "taxable",
        taxRate: 10,
        materialCost: "0",
        laborCost: "0",
        subcontractCost: "0",
        expenseCost: "0",
        otherCost: "0",
        relatedDamageIds: [],
        relatedPhotoIds: [],
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  function duplicateRow(workItemId: string) {
    const src = rows.find((r) => r.workItemId === workItemId);
    if (!src) return;
    const newId = issueWorkItemId(projectId);
    const idx = rows.findIndex((r) => r.workItemId === workItemId);
    const dup: EditableWorkItem = { ...src, workItemId: newId, createdAt: new Date().toISOString() };
    setRows((prev) => [...prev.slice(0, idx + 1), dup, ...prev.slice(idx + 1)]);
  }

  function removeRow(workItemId: string) {
    if (rows.length <= 1) {
      alert("工事項目は最低1行必要です。");
      return;
    }
    if (!confirm(`${workItemId} を削除しますか？`)) return;
    setRows((prev) => prev.filter((r) => r.workItemId !== workItemId));
    setDeletedIds((prev) => (prev.includes(workItemId) ? prev : [...prev, workItemId]));
  }

  function toggleCostSection(workItemId: string) {
    setOpenCostIds((prev) => {
      const next = new Set(prev);
      if (next.has(workItemId)) next.delete(workItemId);
      else next.add(workItemId);
      return next;
    });
  }

  function toggleDamageId(workItemId: string, damageId: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.workItemId !== workItemId) return r;
        const list = r.relatedDamageIds;
        return {
          ...r,
          relatedDamageIds: list.includes(damageId)
            ? list.filter((x) => x !== damageId)
            : [...list, damageId],
        };
      }),
    );
  }

  // ── 既存見積からの取り込み ────────────────────────────────
  function handleImportEstimate(estimateId: string) {
    const est = legacyEstimates.find((e) => e.id === estimateId);
    if (!est) return;
    const migrated = migrateLegacyEstimateToWorkItems(est, projectId);
    setRows((prev) => [...prev, ...migrated.map(toEditable)]);
    setShowImport(false);
    setSaveMsg({
      ok: true,
      text: `見積「${est.projectName || est.estimateNo}」から${migrated.length}行を取り込みました。内容を確認して保存してください。`,
    });
    setTimeout(() => setSaveMsg(null), 8000);
  }

  // ── 本保存 ────────────────────────────────────────────────
  function saveAll(): boolean {
    const now = new Date().toISOString();
    let allOk = true;
    for (const row of rows) {
      if (!workItemsStore.upsert(toWorkItem(row, projectId, now))) allOk = false;
    }
    for (const id of deletedIds) {
      workItemsStore.remove(id);
    }
    if (allOk) {
      setDeletedIds([]);
      setRows(workItemsStore.getByProjectId(projectId).map(toEditable));
      clearDraft();
      // 工事項目を登録したら「見積作成中」へ前進（後退はしない）
      if (rows.length > 0) advanceProjectStatus(projectId, "estimating");
    }
    return allOk;
  }

  function handleSave() {
    if (saveAll()) {
      setSaveMsg({ ok: true, text: "工事項目・原価を保存しました。" });
    } else {
      setSaveMsg({ ok: false, text: "一部保存に失敗しました。入力内容は下書きとして残っています。" });
    }
    setTimeout(() => setSaveMsg(null), 6000);
  }

  // ── 提出用PDF（保存 → 生成の順。原価・粗利は一切渡さない） ──
  function buildSellingLines(): SellingLine[] {
    return rows.map((row) => {
      const a = rowAmounts(row);
      return {
        workItemId: row.workItemId,
        category: row.category,
        workName: row.workName,
        workDescription: row.workDescription,
        location1: row.location1,
        location2: row.location2,
        quantity: toNum(row.quantity),
        unit: row.unit,
        sellingUnitPrice: toNum(row.sellingUnitPrice),
        sellingAmount: a.sellingAmount,
        note: row.note,
        taxType: row.taxType,
        taxRate: (row.taxType === "taxable" ? row.taxRate : 0) as TaxRate,
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
    // PDF発行前の本保存（失敗したら発行しない）
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
      // 保険案件は「損害復旧工事 見積明細書」、通常案件は「見積明細書」
      const title =
        project.projectType === "insurance" ? "損害復旧工事 見積明細書" : "見積明細書";
      const doc = makeWorkEstimatePDF({
        documentTitle: title,
        documentNumber: `EST-${project.projectId}`,
        createdDate: todaySlash(),
        submitTo: project.submitTo || project.clientName || "",
        projectName: project.projectName,
        siteAddress: project.siteAddress,
        companyInfo: getCompanyInfoForPdf(),
        projectId: project.projectId,
        lines: buildSellingLines(),
        subtotalSum: totals.selling,
        taxSum: totals.tax,
        totalWithTax: totals.totalWithTax,
        taxBreakdown: totals.breakdown,
      });
      await renderAndDownloadPdf(
        doc,
        estimatePdfFileName({
          clientName: project.clientName || project.submitTo,
          projectName: project.projectName,
          workContent: rows[0]?.workName ?? "",
          date: todayDash(),
        }),
      );
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
        documentTitle: "請求書",
        documentNumber: `INV-${project.projectId}`,
        createdDate: todaySlash(),
        submitTo: project.submitTo || project.clientName || "",
        projectName: project.projectName,
        siteAddress: project.siteAddress,
        companyInfo: getCompanyInfoForPdf(),
        projectId: project.projectId,
        lines: buildSellingLines(),
        subtotalSum: totals.selling,
        taxSum: totals.tax,
        totalWithTax: totals.totalWithTax,
        taxBreakdown: totals.breakdown,
        invoiceDate: todaySlash(),
        dueDate: "",
        bank: getBankSettings(),
        invoiceNote: "お振込み手数料はご負担ください。ご確認よろしくお願いいたします。",
      });
      await renderAndDownloadPdf(
        doc,
        singleInvoicePdfFileName({
          clientName: project.clientName || project.submitTo,
          projectName: project.projectName,
          workContent: rows[0]?.workName ?? "",
          invoiceDate: todayDash(),
        }),
      );
    } catch (err) {
      console.error("請求書PDF生成エラー:", err);
      alert("PDFの生成に失敗しました。もう一度お試しください。");
    } finally {
      setPdfLoading(null);
    }
  }

  // ── 合計（税計算は共通の calculateTaxBreakdown に委譲） ─────
  const totals = useMemo(() => {
    const rowsWithAmounts = rows.map((row) => {
      const a = rowAmounts(row);
      return {
        amount: a.sellingAmount,
        cost: a.totalCost,
        taxType: row.taxType,
        taxRate: (row.taxType === "taxable" ? row.taxRate : 0) as TaxRate,
      };
    });
    const cost = rowsWithAmounts.reduce((s, r) => s + r.cost, 0);
    const breakdown = calculateTaxBreakdown(
      rowsWithAmounts.map((r) => ({ amount: r.amount, taxType: r.taxType, taxRate: r.taxRate })),
    );
    const selling = breakdown.subtotal;
    const grossProfit = selling - cost;
    const grossProfitRate = selling > 0 ? (grossProfit / selling) * 100 : 0;
    return {
      selling,
      tax: breakdown.taxTotal,
      totalWithTax: breakdown.total,
      breakdown,
      cost,
      grossProfit,
      grossProfitRate,
    };
  }, [rows]);

  // ── 案件が見つからない場合 ────────────────────────────────
  if (notFound) {
    return (
      <div className="min-h-screen bg-[#fdf8f2]">
        <div className="mx-auto max-w-md px-4 py-10 text-center sm:max-w-lg">
          <p className="text-sm font-bold text-stone-700">案件が見つかりません。</p>
          <p className="mt-1 font-mono text-xs text-stone-400">{projectId}</p>
          <Link
            href="/projects/list"
            className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#8B4A3C] px-5 py-2.5 text-sm font-bold text-white active:opacity-80"
          >
            案件一覧へ戻る
          </Link>
        </div>
      </div>
    );
  }

  if (!project) {
    return <div className="min-h-screen bg-[#fdf8f2]" />;
  }

  return (
    <div className="min-h-screen bg-[#fdf8f2] pb-24">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        <header className="mb-3">
          <Link href={`/projects/${encodeURIComponent(projectId)}`} className="mb-2 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← 案件詳細へ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">工事項目・原価</h1>
          <p className="mt-1 text-sm text-stone-500">
            白い欄は提出用、黄色い欄は内部管理用です。原価・粗利は提出PDFに出ません。
          </p>
        </header>

        <ProjectHeader project={project} />
        <ProjectTabs projectId={projectId} active="workItems" />

        {/* 下書き復元バナー */}
        {showRestoreBanner && restoredDraft && (
          <div className="mb-3 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
            <p className="text-xs font-bold text-amber-800">保存されていない下書きがあります。</p>
            <p className="mt-0.5 text-xs text-amber-700">
              最終更新：{new Date(restoredDraft.updatedAt).toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" })}
            </p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={handleRestoreDraft}
                className="min-h-[44px] flex-1 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white active:opacity-80">
                下書きを復元する
              </button>
              <button type="button" onClick={handleDiscardDraft}
                className="min-h-[44px] flex-1 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-700 active:opacity-80">
                破棄する
              </button>
            </div>
          </div>
        )}

        <SaveStatusBar status={saveStatus} savedAt={savedAt} />

        {/* 既存見積からの取り込み */}
        {legacyEstimates.length > 0 && (
          <div className="mb-3">
            <button
              type="button"
              onClick={() => setShowImport((v) => !v)}
              className="flex min-h-[44px] w-full items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-bold text-stone-600 active:opacity-80"
            >
              <span>📥 保存済みの見積から取り込む</span>
              <span className="text-stone-300">{showImport ? "▲" : "▼"}</span>
            </button>
            {showImport && (
              <div className="mt-2 space-y-2 rounded-xl bg-white p-3 ring-1 ring-stone-100">
                <p className="text-xs text-stone-400">
                  見積の明細行を工事項目としてコピーします（元の見積は変更されません）。原価は0で取り込まれるため、取り込み後に入力してください。
                </p>
                {legacyEstimates.map((est) => (
                  <button
                    key={est.id}
                    type="button"
                    onClick={() => handleImportEstimate(est.id)}
                    className="flex min-h-[44px] w-full items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-left active:opacity-80"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold text-stone-700">
                        {est.projectName || "（案件名なし）"}
                      </span>
                      <span className="block text-xs text-stone-400">
                        {est.estimateNo}・{est.estimateItems.length}行・{fmtYen(est.total)}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-bold text-[#8B4A3C]">取り込む</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── 工事項目カード一覧 ─────────────────────────── */}
        <div className="space-y-3">
          {rows.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-stone-200 px-4 py-10 text-center">
              <p className="text-sm text-stone-500">まだ工事項目がありません。</p>
              <p className="mt-1.5 text-sm text-stone-500">「工事項目を追加する」から入力を始めてください。</p>
            </div>
          )}

          {rows.map((row, index) => {
            const a = rowAmounts(row);
            const costOpen = openCostIds.has(row.workItemId);
            return (
              <div key={row.workItemId} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-100">
                {/* カードヘッダー */}
                <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-[#8B4A3C] px-2 py-0.5 font-mono text-xs font-bold text-white">
                      {row.workItemId}
                    </span>
                    <span className="text-xs font-bold text-stone-500">項目 {index + 1}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => duplicateRow(row.workItemId)}
                      className="min-h-[44px] px-1 text-xs text-stone-400 active:text-stone-600">
                      複製
                    </button>
                    <button type="button" onClick={() => removeRow(row.workItemId)}
                      className="min-h-[44px] px-1 text-xs text-stone-400 active:text-red-500">
                      削除
                    </button>
                  </div>
                </div>

                {/* ── 提出用（白系） ── */}
                <div className="space-y-3 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={lbl}>分類</label>
                      <input type="text" value={row.category} list={`cat-${row.workItemId}`}
                        onChange={(e) => updateRow(row.workItemId, { category: e.target.value })}
                        placeholder="内装工事" className={fldInput} />
                      <datalist id={`cat-${row.workItemId}`}>
                        {CATEGORY_PRESETS.map((c) => <option key={c} value={c} />)}
                      </datalist>
                    </div>
                    <div>
                      <label className={lbl}>工事名</label>
                      <input type="text" value={row.workName}
                        onChange={(e) => updateRow(row.workItemId, { workName: e.target.value })}
                        placeholder="クロス貼替" className={fldInput} />
                    </div>
                  </div>
                  <div>
                    <label className={lbl}>工事内容</label>
                    <input type="text" value={row.workDescription}
                      onChange={(e) => updateRow(row.workItemId, { workDescription: e.target.value })}
                      placeholder="既存クロスめくり・下地処理・新規クロス貼り" className={fldInput} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={lbl}>施工箇所1</label>
                      <input type="text" value={row.location1}
                        onChange={(e) => updateRow(row.workItemId, { location1: e.target.value })}
                        placeholder="洋室、洗面所" className={fldInput} />
                    </div>
                    <div>
                      <label className={lbl}>施工箇所2</label>
                      <select value={row.location2}
                        onChange={(e) => updateRow(row.workItemId, { location2: e.target.value })}
                        className={fldSelect}>
                        {LOCATION2_OPTIONS.map((o) => (
                          <option key={o} value={o}>{o === "" ? "（なし）" : o}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className={lbl}>数量</label>
                      <input type="text" inputMode="decimal" value={row.quantity}
                        onChange={(e) => updateRow(row.workItemId, { quantity: e.target.value })}
                        className={fldInput} />
                    </div>
                    <div>
                      <label className={lbl}>単位</label>
                      <select value={row.unit}
                        onChange={(e) => updateRow(row.workItemId, { unit: e.target.value })}
                        className={fldSelect}>
                        {(UNITS.includes(row.unit) ? UNITS : [row.unit, ...UNITS]).map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>売価単価</label>
                      <input type="text" inputMode="numeric" value={row.sellingUnitPrice}
                        onChange={(e) => updateRow(row.workItemId, { sellingUnitPrice: e.target.value })}
                        className={fldInput} />
                    </div>
                  </div>
                  {/* 税区分・税率（1つの選択肢に集約。課税0%は詳細設定でのみ表示） */}
                  <div>
                    <label className={lbl}>税区分・税率</label>
                    <select
                      value={taxComboValue(row.taxType, row.taxRate)}
                      onChange={(e) => {
                        const { taxType, taxRate } = TAX_COMBO[e.target.value];
                        updateRow(row.workItemId, { taxType, taxRate });
                      }}
                      className={fldSelect}
                    >
                      {/* 課税0%（詳細）は既にその値のときだけ選択肢に出す */}
                      {row.taxType === "taxable" && row.taxRate === 0 && (
                        <option value="taxable_0">課税0%（詳細）</option>
                      )}
                      <option value="taxable_10">課税10%</option>
                      <option value="taxable_8">課税8%</option>
                      <option value="non_taxable">非課税</option>
                      <option value="tax_exempt">不課税・対象外</option>
                    </select>
                  </div>
                  {/* 自動計算（読み取り専用・色分け） */}
                  <div className="flex items-center justify-between rounded-lg bg-stone-100 px-3 py-2.5">
                    <span className="text-xs text-stone-500">
                      売価金額（自動計算・{row.taxType === "taxable" ? `課税${row.taxRate}%` : TAX_TYPE_LABELS[row.taxType]}）
                    </span>
                    <span className="text-sm font-bold text-stone-800">{fmtYen(a.sellingAmount)}</span>
                  </div>
                  <div>
                    <label className={lbl}>備考</label>
                    <input type="text" value={row.note}
                      onChange={(e) => updateRow(row.workItemId, { note: e.target.value })}
                      placeholder="" className={fldInput} />
                  </div>

                  {/* 関連被害 */}
                  {damageOptions.length > 0 && (
                    <div>
                      <label className={lbl}>関連する被害</label>
                      <div className="flex flex-wrap gap-1.5">
                        {damageOptions.map((opt) => {
                          const active = row.relatedDamageIds.includes(opt.id);
                          return (
                            <button key={opt.id} type="button"
                              onClick={() => toggleDamageId(row.workItemId, opt.id)}
                              className={`min-h-[44px] rounded-xl px-3 py-2 text-xs font-bold active:opacity-80 ${
                                active
                                  ? "bg-[#8B4A3C] text-white"
                                  : "border border-stone-200 bg-white text-stone-500"
                              }`}>
                              {opt.caption}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── 内部管理（黄系・開閉式） ── */}
                <button
                  type="button"
                  onClick={() => toggleCostSection(row.workItemId)}
                  className="flex min-h-[44px] w-full items-center justify-between border-t border-amber-200 bg-amber-50 px-4 py-2.5 active:opacity-80"
                >
                  <span className="text-xs font-bold text-amber-800">
                    🔒 内部管理（原価・粗利）
                  </span>
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
                          onChange={(e) => updateRow(row.workItemId, { materialCost: e.target.value })}
                          className={costInput} />
                      </div>
                      <div>
                        <label className={costLbl}>労務原価</label>
                        <input type="text" inputMode="numeric" value={row.laborCost}
                          onChange={(e) => updateRow(row.workItemId, { laborCost: e.target.value })}
                          className={costInput} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className={costLbl}>外注原価</label>
                        <input type="text" inputMode="numeric" value={row.subcontractCost}
                          onChange={(e) => updateRow(row.workItemId, { subcontractCost: e.target.value })}
                          className={costInput} />
                      </div>
                      <div>
                        <label className={costLbl}>諸経費</label>
                        <input type="text" inputMode="numeric" value={row.expenseCost}
                          onChange={(e) => updateRow(row.workItemId, { expenseCost: e.target.value })}
                          className={costInput} />
                      </div>
                      <div>
                        <label className={costLbl}>その他原価</label>
                        <input type="text" inputMode="numeric" value={row.otherCost}
                          onChange={(e) => updateRow(row.workItemId, { otherCost: e.target.value })}
                          className={costInput} />
                      </div>
                    </div>
                    {/* 自動計算（読み取り専用） */}
                    <div className="space-y-1.5 rounded-lg bg-amber-100/70 px-3 py-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-amber-800">原価合計</span>
                        <span className="text-sm font-bold text-amber-900">{fmtYen(a.totalCost)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-amber-800">粗利</span>
                        <span className={`text-sm font-bold ${a.grossProfit < 0 ? "text-red-600" : "text-amber-900"}`}>
                          {fmtYen(a.grossProfit)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-amber-800">粗利率</span>
                        <span className={`text-sm font-bold ${a.grossProfit < 0 ? "text-red-600" : "text-amber-900"}`}>
                          {(a.grossProfitRate * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── 追加 ───────────────────────────────────────── */}
        <button
          type="button"
          onClick={addRow}
          className="mt-3 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#8B4A3C]/40 bg-white px-4 py-3 text-sm font-bold text-[#8B4A3C] active:opacity-80"
        >
          ＋ 工事項目を追加する
        </button>

        {/* ── 合計（提出用＝白 / 内部管理＝黄） ─────────────── */}
        {rows.length > 0 && (
          <div className="mt-3 space-y-2">
            <TaxTotalsBox breakdown={totals.breakdown} />
            <div className="rounded-2xl bg-amber-50 p-4 shadow-sm ring-1 ring-amber-200">
              <h3 className="mb-2 text-xs font-bold text-amber-800">🔒 内部管理合計（提出PDFに出ません）</h3>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-amber-800">原価合計</span>
                  <span className="font-bold text-amber-900">{fmtYen(totals.cost)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-amber-800">粗利</span>
                  <span className={`font-bold ${totals.grossProfit < 0 ? "text-red-600" : "text-amber-900"}`}>
                    {fmtYen(totals.grossProfit)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-amber-800">粗利率</span>
                  <span className={`font-bold ${totals.grossProfit < 0 ? "text-red-600" : "text-amber-900"}`}>
                    {totals.grossProfitRate.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 保存 ───────────────────────────────────────── */}
        {saveMsg && (
          <div className={`mt-3 rounded-xl px-3 py-2 text-xs font-bold ring-1 ${
            saveMsg.ok
              ? "bg-green-50 text-green-700 ring-green-200"
              : "bg-red-50 text-red-600 ring-red-200"
          }`}>
            {saveMsg.text}
          </div>
        )}
        {rows.length > 0 && (
          <>
            <button
              type="button"
              onClick={handleSave}
              className="mt-3 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-[#8B4A3C] px-4 py-3 text-sm font-bold text-white shadow-sm active:opacity-80"
            >
              工事項目・原価を保存する
            </button>

            {/* 提出用PDF（原価・粗利は出ない） */}
            <div className="mt-3 grid grid-cols-1 gap-2">
              <button
                type="button"
                disabled={pdfLoading !== null}
                onClick={() => void handleEstimatePdf()}
                className="flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-[#8B4A3C] bg-white px-4 py-3 text-sm font-bold text-[#8B4A3C] active:opacity-80 disabled:opacity-50"
              >
                {pdfLoading === "estimate"
                  ? "PDF作成中..."
                  : `📄 ${project.projectType === "insurance" ? "損害復旧工事 見積明細書" : "見積明細書"}PDFを作成する（保存してから発行）`}
              </button>
              <button
                type="button"
                disabled={pdfLoading !== null}
                onClick={() => void handleInvoicePdf()}
                className="flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-[#8B4A3C] bg-white px-4 py-3 text-sm font-bold text-[#8B4A3C] active:opacity-80 disabled:opacity-50"
              >
                {pdfLoading === "invoice" ? "PDF作成中..." : "📄 請求書PDFを作成する（保存してから発行）"}
              </button>
              <p className="text-center text-xs text-stone-400">
                提出用PDFに原価・粗利は表示されません。
              </p>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
