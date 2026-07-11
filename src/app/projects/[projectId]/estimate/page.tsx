"use client";

// 05 見積書（案件見積）
// 対象案件の WorkItem[] を読み込んで提出用の見積を表示し、
// projectId 付きの SavedEstimate として本保存 → 見積書PDFを発行する。
// 帳票は案件データ（WorkItem）から生成する。原価・粗利はPDFへ出さない。

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { projectsStore, type Project } from "@/app/utils/projects";
import { workItemsStore, type WorkItem } from "@/app/utils/workItems";
import {
  getSavedEstimates,
  upsertEstimate,
  setSelectedEstimateId,
  type SavedEstimate,
} from "@/app/utils/savedEstimates";
import {
  workItemsToSellingLines,
  workItemsToEstimateItems,
  workItemsToSnapshots,
  computeEstimateTotals,
  projectDocumentNumber,
  nextEstimateSeq,
} from "@/app/utils/workItemEstimate";
import { getCompanyInfoForPdf } from "@/app/utils/companySettings";
import { estimatePdfFileName } from "@/app/utils/pdfFileName";
import { renderAndDownloadPdf, todaySlash, todayDash } from "@/app/utils/pdfDownload";
import { ProjectTabs, ProjectHeader } from "@/components/ProjectTabs";
import { TaxTotalsBox } from "@/components/TaxTotalsBox";

function fmtYen(n: number): string {
  return "¥" + n.toLocaleString("ja-JP");
}

export default function ProjectEstimatePage() {
  const params = useParams<{ projectId: string }>();
  const projectId = decodeURIComponent(params.projectId);

  const [notFound, setNotFound] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [currentEstimateId, setCurrentEstimateId] = useState<string | null>(null);
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
    // 既にこの案件で保存済みの見積があれば、その版へ上書きするため id を引き継ぐ
    const existing = getSavedEstimates().find((e) => e.projectId === projectId);
    if (existing) setCurrentEstimateId(existing.id);
  }, [projectId]);

  const sellingLines = useMemo(() => workItemsToSellingLines(workItems), [workItems]);
  const totals = useMemo(() => computeEstimateTotals(sellingLines), [sellingLines]);

  // 内部管理（画面内でのみ確認・PDFには出さない）
  const internal = useMemo(() => {
    const cost = workItems.reduce((a, w) => a + w.totalCost, 0);
    const profit = totals.subtotal - cost;
    const rate = totals.subtotal > 0 ? (profit / totals.subtotal) * 100 : 0;
    return { cost, profit, rate };
  }, [workItems, totals.subtotal]);

  const docNumber = useMemo(() => {
    const saved = getSavedEstimates();
    const existing = saved.find((e) => e.projectId === projectId);
    if (existing?.estimateNo?.startsWith(`${projectId}-EST-`)) return existing.estimateNo;
    return projectDocumentNumber(projectId, "EST", nextEstimateSeq(saved, projectId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, workItems]);

  // ── projectId 付きで本保存（SavedEstimate 互換） ──────────────
  function saveEstimate(): SavedEstimate | null {
    if (!project) return null;
    const now = new Date().toLocaleString("ja-JP");
    const id = currentEstimateId ?? `est-${Date.now()}`;
    const existing = currentEstimateId
      ? getSavedEstimates().find((e) => e.id === currentEstimateId)
      : null;
    const est: SavedEstimate = {
      id,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      estimateNo: docNumber,
      projectId, // 案件と接続（必須）
      projectName: project.projectName,
      clientName: project.submitTo || project.clientName,
      siteAddress: project.siteAddress,
      workDescription: workItems.map((w) => w.workName).filter(Boolean).join("、"),
      estimateItems: workItemsToEstimateItems(workItems),
      subtotal: totals.subtotal,
      tax: totals.tax, // = taxBreakdown.taxTotal
      total: totals.total,
      status: "saved",
      version: 1,
      memo: "",
      taxBreakdown: totals.breakdown,
      lineSnapshots: workItemsToSnapshots(workItems),
    };
    upsertEstimate(est);
    setCurrentEstimateId(id);
    setSelectedEstimateId(id);
    return est;
  }

  function handleSave() {
    try {
      if (workItems.length === 0) {
        setMsg({ ok: false, text: "工事項目がありません。「04 工事項目・原価」で追加してください。" });
        return;
      }
      saveEstimate();
      setMsg({ ok: true, text: `見積を保存しました（${docNumber}）。` });
    } catch {
      setMsg({ ok: false, text: "保存に失敗しました。" });
    }
    setTimeout(() => setMsg(null), 6000);
  }

  // ── 見積書PDF（保存 → 生成の順） ───────────────────────────
  async function handlePdf() {
    if (!project || pdfLoading) return;
    if (workItems.length === 0) {
      alert("工事項目がありません。「04 工事項目・原価」で追加してからPDFを発行してください。");
      return;
    }
    // 本番では固定サンプル番号・日付を使わない（案件IDベースの番号＋当日日付を使用）
    try {
      saveEstimate();
    } catch {
      alert("保存に失敗しました。PDFは発行していません。");
      return;
    }
    setPdfLoading(true);
    try {
      const { makeWorkEstimatePDF } = await import("@/components/pdf/WorkEstimatePDF");
      const title =
        project.projectType === "insurance" ? "損害復旧工事 見積明細書" : "見積明細書";
      const doc = makeWorkEstimatePDF({
        documentTitle: title,
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
      });
      await renderAndDownloadPdf(
        doc,
        estimatePdfFileName({
          clientName: project.clientName || project.submitTo,
          projectName: project.projectName,
          workContent: workItems[0]?.workName ?? "",
          date: todayDash(),
        }),
      );
      setMsg({ ok: true, text: `見積を保存し、見積書PDFを発行しました（${docNumber}）。` });
      setTimeout(() => setMsg(null), 6000);
    } catch (err) {
      console.error("見積書PDF生成エラー:", err);
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
          <h1 className="text-xl font-bold text-stone-800">見積書</h1>
          <p className="mt-1 text-sm text-stone-500">
            工事項目から見積を作成します。原価・粗利は提出PDFに出ません。
          </p>
        </header>

        <ProjectHeader project={project} />
        <ProjectTabs projectId={projectId} active="estimate" />

        <div className="mb-3 flex items-center justify-between rounded-xl bg-white px-3 py-2 text-xs ring-1 ring-stone-100">
          <span className="text-stone-400">見積番号</span>
          <span className="font-mono font-bold text-stone-700">{docNumber}</span>
        </div>

        {/* 提出用明細（WorkItem から生成・読み取り専用プレビュー） */}
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
              {sellingLines.map((l) => (
                <div key={l.workItemId} className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-stone-100">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-stone-800">{l.workName || "（工事名未入力）"}</p>
                      <p className="text-xs text-stone-500">{l.workDescription}</p>
                      <p className="mt-0.5 text-xs text-stone-400">
                        {[l.category, [l.location1, l.location2].filter(Boolean).join(" / ")].filter(Boolean).join("・")}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-stone-400">{l.quantity} {l.unit} × {fmtYen(l.sellingUnitPrice)}</p>
                      <p className="text-sm font-bold text-stone-800">{fmtYen(l.sellingAmount)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* 提出用合計（白・税区分別内訳） */}
            <div className="mt-3">
              <TaxTotalsBox breakdown={totals.breakdown} />
            </div>

            {/* 内部管理（画面のみ・PDF非表示） */}
            <div className="mt-2 rounded-2xl bg-amber-50 p-3 text-xs ring-1 ring-amber-200">
              <p className="font-bold text-amber-800">🔒 内部管理（この画面のみ・PDFには出ません）</p>
              <div className="mt-1 flex justify-between"><span className="text-amber-800">原価合計</span><span className="font-bold text-amber-900">{fmtYen(internal.cost)}</span></div>
              <div className="flex justify-between"><span className="text-amber-800">粗利</span><span className={`font-bold ${internal.profit < 0 ? "text-red-600" : "text-amber-900"}`}>{fmtYen(internal.profit)}（{internal.rate.toFixed(1)}%）</span></div>
            </div>

            {msg && (
              <div className={`mt-3 rounded-xl px-3 py-2 text-xs font-bold ring-1 ${msg.ok ? "bg-green-50 text-green-700 ring-green-200" : "bg-red-50 text-red-600 ring-red-200"}`}>
                {msg.text}
              </div>
            )}

            <button type="button" onClick={handleSave}
              className="mt-3 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-[#8B4A3C] px-4 py-3 text-sm font-bold text-white shadow-sm active:opacity-80">
              見積を保存する（案件に紐付け）
            </button>
            <button type="button" disabled={pdfLoading} onClick={() => void handlePdf()}
              className="mt-2 flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-[#8B4A3C] bg-white px-4 py-3 text-sm font-bold text-[#8B4A3C] active:opacity-80 disabled:opacity-50">
              {pdfLoading ? "PDF作成中..." : `📄 ${project.projectType === "insurance" ? "損害復旧工事 見積明細書" : "見積明細書"}PDFを作成する（保存してから発行）`}
            </button>
            <p className="mt-2 text-center text-xs text-stone-400">
              工事項目の編集は「04 工事項目・原価」で行います。
            </p>
          </>
        )}

      </div>
    </div>
  );
}
