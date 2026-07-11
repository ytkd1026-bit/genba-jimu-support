"use client";

// 06 請求書（案件請求）
// 対象案件の Project・WorkItem・会社設定から請求書を作成する。
// 請求時に一部の工事項目を除外できる。projectId 付きの SavedInvoice として
// 本保存 → 請求書PDFを発行する。原価・粗利はPDFへ出さない。

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { projectsStore, type Project } from "@/app/utils/projects";
import { workItemsStore, type WorkItem } from "@/app/utils/workItems";
import {
  getSavedInvoices,
  upsertInvoice,
  type SavedInvoice,
} from "@/app/utils/savedInvoices";
import {
  workItemsToSellingLines,
  workItemsToSnapshots,
  computeEstimateTotals,
  projectDocumentNumber,
} from "@/app/utils/workItemEstimate";
import { getCompanyInfoForPdf, getBankSettings } from "@/app/utils/companySettings";
import { singleInvoicePdfFileName } from "@/app/utils/pdfFileName";
import { renderAndDownloadPdf, todaySlash, todayDash } from "@/app/utils/pdfDownload";
import { ProjectTabs, ProjectHeader } from "@/components/ProjectTabs";
import { TaxTotalsBox } from "@/components/TaxTotalsBox";

function fmtYen(n: number): string {
  return "¥" + n.toLocaleString("ja-JP");
}

function nextInvoiceSeq(saved: SavedInvoice[], projectId: string): number {
  const prefix = `${projectId}-INV-`;
  let max = 0;
  for (const inv of saved) {
    if (!inv.invoiceNo?.startsWith(prefix)) continue;
    const n = parseInt(inv.invoiceNo.slice(prefix.length), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return max + 1;
}

export default function ProjectInvoicePage() {
  const params = useParams<{ projectId: string }>();
  const projectId = decodeURIComponent(params.projectId);

  const [notFound, setNotFound] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [currentInvoiceId, setCurrentInvoiceId] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const p = projectsStore.getById(projectId);
    if (!p) {
      setNotFound(true);
      return;
    }
    setProject(p);
    setWorkItems(workItemsStore.getByProjectId(projectId));
    const existing = getSavedInvoices().find((e) => e.projectId === projectId);
    if (existing) setCurrentInvoiceId(existing.id);
  }, [projectId]);

  const includedItems = useMemo(
    () => workItems.filter((w) => !excluded.has(w.workItemId)),
    [workItems, excluded],
  );
  const sellingLines = useMemo(() => workItemsToSellingLines(includedItems), [includedItems]);
  const totals = useMemo(() => computeEstimateTotals(sellingLines), [sellingLines]);

  const docNumber = useMemo(() => {
    const saved = getSavedInvoices();
    const existing = saved.find((e) => e.projectId === projectId);
    if (existing?.invoiceNo?.startsWith(`${projectId}-INV-`)) return existing.invoiceNo;
    return projectDocumentNumber(projectId, "INV", nextInvoiceSeq(saved, projectId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, workItems]);

  function toggleExclude(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function saveInvoice(): void {
    if (!project) return;
    const now = new Date().toLocaleString("ja-JP");
    const id = currentInvoiceId ?? `inv-${Date.now()}`;
    const existing = currentInvoiceId
      ? getSavedInvoices().find((e) => e.id === currentInvoiceId)
      : null;
    const inv: SavedInvoice = {
      id,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      invoiceNo: docNumber,
      projectId, // 案件と接続
      projectName: project.projectName,
      clientName: project.submitTo || project.clientName,
      invoiceDate: todaySlash(),
      dueDate: "",
      subtotal: totals.subtotal,
      tax: totals.tax, // = taxBreakdown.taxTotal
      total: totals.total,
      status: "draft",
      memo: "",
      // 請求書は保存時点の税情報・明細をスナップショットとして残す
      // （後で WorkItem を変更しても保存済み請求書の税額は変わらない）
      taxBreakdown: totals.breakdown,
      lineSnapshots: workItemsToSnapshots(includedItems),
    };
    upsertInvoice(inv);
    setCurrentInvoiceId(id);
  }

  function handleSave() {
    if (includedItems.length === 0) {
      setMsg({ ok: false, text: "請求対象の工事項目がありません。" });
      setTimeout(() => setMsg(null), 6000);
      return;
    }
    try {
      saveInvoice();
      setMsg({ ok: true, text: `請求書を保存しました（${docNumber}）。` });
    } catch {
      setMsg({ ok: false, text: "保存に失敗しました。" });
    }
    setTimeout(() => setMsg(null), 6000);
  }

  async function handlePdf() {
    if (!project || pdfLoading) return;
    if (includedItems.length === 0) {
      alert("請求対象の工事項目がありません。");
      return;
    }
    try {
      saveInvoice();
    } catch {
      alert("保存に失敗しました。PDFは発行していません。");
      return;
    }
    setPdfLoading(true);
    try {
      const { makeProjectInvoicePDF } = await import("@/components/pdf/ProjectInvoicePDF");
      const doc = makeProjectInvoicePDF({
        documentTitle: "請求書",
        documentNumber: docNumber,
        createdDate: todaySlash(),
        submitTo: project.submitTo || project.clientName || "",
        projectName: project.projectName,
        siteAddress: project.siteAddress,
        companyInfo: getCompanyInfoForPdf(),
        projectId: project.projectId,
        lines: sellingLines,
        subtotalSum: totals.subtotal,
        taxSum: totals.tax,
        totalWithTax: totals.total,
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
          workContent: includedItems[0]?.workName ?? "",
          invoiceDate: todayDash(),
        }),
      );
      setMsg({ ok: true, text: `請求書を保存し、請求書PDFを発行しました（${docNumber}）。` });
      setTimeout(() => setMsg(null), 6000);
    } catch (err) {
      console.error("請求書PDF生成エラー:", err);
      alert("PDFの生成に失敗しました。もう一度お試しください。");
    } finally {
      setPdfLoading(false);
    }
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#fdf8f2]">
        <div className="mx-auto max-w-md px-4 py-10 text-center sm:max-w-lg">
          <p className="text-sm font-bold text-stone-700">案件が見つかりません。</p>
          <p className="mt-1 font-mono text-xs text-stone-400">{projectId}</p>
          <Link href="/projects/list" className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#8B4A3C] px-5 py-2.5 text-sm font-bold text-white active:opacity-80">
            案件一覧へ戻る
          </Link>
        </div>
      </div>
    );
  }

  if (!project) return <div className="min-h-screen bg-[#fdf8f2]" />;

  return (
    <div className="min-h-screen bg-[#fdf8f2] pb-24">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        <header className="mb-3">
          <Link href={`/projects/${encodeURIComponent(projectId)}`} className="mb-2 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← 案件詳細へ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">請求書</h1>
          <p className="mt-1 text-sm text-stone-500">
            工事項目から請求書を作成します。請求しない項目は除外できます。
          </p>
        </header>

        <ProjectHeader project={project} />
        <ProjectTabs projectId={projectId} active="invoice" />

        <div className="mb-3 flex items-center justify-between rounded-xl bg-white px-3 py-2 text-xs ring-1 ring-stone-100">
          <span className="text-stone-400">請求番号</span>
          <span className="font-mono font-bold text-stone-700">{docNumber}</span>
        </div>

        {workItems.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-stone-200 px-4 py-10 text-center">
            <p className="text-sm text-stone-500">工事項目がありません。</p>
            <Link href={`/projects/${encodeURIComponent(projectId)}/work-items`}
              className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#8B4A3C] px-5 py-2.5 text-sm font-bold text-white active:opacity-80">
              工事項目・原価へ
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {workItems.map((w) => {
                const isExcluded = excluded.has(w.workItemId);
                return (
                  <div key={w.workItemId}
                    className={`rounded-xl p-3 shadow-sm ring-1 ${isExcluded ? "bg-stone-100 ring-stone-200 opacity-60" : "bg-white ring-stone-100"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-stone-800">{w.workName || "（工事名未入力）"}</p>
                        <p className="text-xs text-stone-400">{w.quantity} {w.unit} × {fmtYen(w.sellingUnitPrice)}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold text-stone-800">{fmtYen(w.sellingAmount)}</p>
                        <button type="button" onClick={() => toggleExclude(w.workItemId)}
                          className={`mt-1 min-h-[36px] rounded-lg px-2 py-1 text-xs font-bold active:opacity-80 ${isExcluded ? "bg-[#8B4A3C] text-white" : "border border-stone-200 text-stone-500"}`}>
                          {isExcluded ? "請求に含める" : "請求から除外"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-3">
              <TaxTotalsBox breakdown={totals.breakdown} title="請求合計" totalLabel="ご請求金額（税込）" />
            </div>

            {msg && (
              <div className={`mt-3 rounded-xl px-3 py-2 text-xs font-bold ring-1 ${msg.ok ? "bg-green-50 text-green-700 ring-green-200" : "bg-red-50 text-red-600 ring-red-200"}`}>
                {msg.text}
              </div>
            )}

            <button type="button" onClick={handleSave}
              className="mt-3 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-[#8B4A3C] px-4 py-3 text-sm font-bold text-white shadow-sm active:opacity-80">
              請求書を保存する（案件に紐付け）
            </button>
            <button type="button" disabled={pdfLoading} onClick={() => void handlePdf()}
              className="mt-2 flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-[#8B4A3C] bg-white px-4 py-3 text-sm font-bold text-[#8B4A3C] active:opacity-80 disabled:opacity-50">
              {pdfLoading ? "PDF作成中..." : "📄 請求書PDFを作成する（保存してから発行）"}
            </button>
          </>
        )}

      </div>
    </div>
  );
}
