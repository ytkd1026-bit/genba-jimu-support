"use client";

// 05 見積書（案件見積・版管理つき）
// - 新規/編集は現在の WorkItem から作成する
// - 保存済みの版は lineSnapshots / taxBreakdown から再表示・再発行する
//   （現在の WorkItem を自動再読込しない＝過去版の内容は変わらない）
// - 「現在の版を上書き保存」「新しい版として保存」を選べる
// 帳票は案件データから生成する。原価・粗利はPDFへ出さない。

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { projectsStore, advanceProjectStatus, type Project } from "@/app/utils/projects";
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
  snapshotsToSellingLines,
  computeEstimateTotals,
  taxBreakdownFromSnapshots,
  projectDocumentNumber,
  nextEstimateSeq,
} from "@/app/utils/workItemEstimate";
import type { SellingLine } from "@/components/pdf/WorkEstimatePDF";
import { getCompanyInfoForPdf } from "@/app/utils/companySettings";
import { estimatePdfFileName } from "@/app/utils/pdfFileName";
import { renderAndDownloadPdf, todaySlash, todayDash } from "@/app/utils/pdfDownload";
import { ProjectTabs, ProjectHeader } from "@/components/ProjectTabs";
import { TaxTotalsBox } from "@/components/TaxTotalsBox";
import { fldSelect, lbl } from "@/components/formStyles";

// 数値正規化ガード（S-3）: 保存データに null 等が混入していても明細表示でクラッシュしない。
// 正常な有限数では恒等（従来と同一表示）。
function fmtYen(n: number): string {
  return "¥" + (Number.isFinite(n) ? n : 0).toLocaleString("ja-JP");
}

const REVISION_REASONS = [
  "保険会社査定指摘による数量修正",
  "解体後の追加被害反映",
  "施主希望による工事項目変更",
  "材料変更",
  "単価見直し",
  "その他",
];

export default function ProjectEstimatePage() {
  const params = useParams<{ projectId: string }>();
  const projectId = decodeURIComponent(params.projectId);

  const [notFound, setNotFound] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [savedList, setSavedList] = useState<SavedEstimate[]>([]);
  // viewingId: 表示中の保存済み版ID。null のとき「現在の工事項目から作成」モード
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "edit">("edit");
  const [revisionReason, setRevisionReason] = useState(REVISION_REASONS[0]);
  const [revisionReasonFree, setRevisionReasonFree] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function reloadSaved(): SavedEstimate[] {
    const list = getSavedEstimates()
      .filter((e) => e.projectId === projectId)
      .sort((a, b) => a.version - b.version);
    setSavedList(list);
    return list;
  }

  useEffect(() => {
    const p = projectsStore.getById(projectId);
    if (!p) {
      setNotFound(true);
      return;
    }
    setProject(p);
    setWorkItems(workItemsStore.getByProjectId(projectId));
    const list = reloadSaved();
    // 保存済み版があれば最新版を表示（スナップショット再表示）、無ければ現在のWorkItemで作成
    if (list.length > 0) {
      setViewingId(list[list.length - 1].id);
      setMode("view");
    } else {
      setViewingId(null);
      setMode("edit");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const viewing = useMemo(
    () => savedList.find((e) => e.id === viewingId) ?? null,
    [savedList, viewingId],
  );
  const latest = savedList.length > 0 ? savedList[savedList.length - 1] : null;

  // 表示する明細・内訳: view モードはスナップショット、edit モードは現在の WorkItem
  const sellingLines: SellingLine[] = useMemo(() => {
    if (mode === "view" && viewing?.lineSnapshots) {
      return snapshotsToSellingLines(viewing.lineSnapshots);
    }
    return workItemsToSellingLines(workItems);
  }, [mode, viewing, workItems]);

  const breakdown = useMemo(() => {
    if (mode === "view" && viewing) {
      return viewing.taxBreakdown ?? taxBreakdownFromSnapshots(viewing.lineSnapshots ?? []);
    }
    return computeEstimateTotals(sellingLines).breakdown;
  }, [mode, viewing, sellingLines]);

  // 内部管理（画面のみ・PDF非表示）。view モードは原価情報を持たないため edit 時のみ表示
  const internal = useMemo(() => {
    if (mode !== "edit") return null;
    const cost = workItems.reduce((a, w) => a + w.totalCost, 0);
    const profit = breakdown.subtotal - cost;
    const rate = breakdown.subtotal > 0 ? (profit / breakdown.subtotal) * 100 : 0;
    return { cost, profit, rate };
  }, [mode, workItems, breakdown.subtotal]);

  const effectiveRevisionReason = revisionReason === "その他" ? revisionReasonFree : revisionReason;

  // ── 保存処理 ──────────────────────────────────────────────
  function buildEstimate(base: {
    id: string;
    createdAt: string;
    estimateNo: string;
    version: number;
    previousEstimateId?: string;
    revisionReason?: string;
  }): SavedEstimate {
    const totals = computeEstimateTotals(sellingLines);
    return {
      id: base.id,
      createdAt: base.createdAt,
      updatedAt: new Date().toLocaleString("ja-JP"),
      estimateNo: base.estimateNo,
      projectId,
      projectName: project!.projectName,
      clientName: project!.submitTo || project!.clientName,
      siteAddress: project!.siteAddress,
      workDescription: workItems.map((w) => w.workName).filter(Boolean).join("、"),
      estimateItems: workItemsToEstimateItems(workItems),
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      status: "saved",
      version: base.version,
      memo: "",
      taxBreakdown: totals.breakdown,
      lineSnapshots: workItemsToSnapshots(workItems),
      previousEstimateId: base.previousEstimateId,
      revisionReason: base.revisionReason,
    };
  }

  function hasContent(): boolean {
    return workItems.length > 0;
  }

  // 現在の版（latest）を現在の WorkItem で上書き保存
  function overwriteLatest(): SavedEstimate | null {
    if (!latest) return null;
    const est = buildEstimate({
      id: latest.id,
      createdAt: latest.createdAt,
      estimateNo: latest.estimateNo,
      version: latest.version,
      previousEstimateId: latest.previousEstimateId,
      revisionReason: latest.revisionReason,
    });
    upsertEstimate(est);
    setSelectedEstimateId(est.id);
    return est;
  }

  // 新しい版として保存（前版は残す）
  function saveNewVersion(): SavedEstimate | null {
    const saved = getSavedEstimates();
    const version = (latest?.version ?? 0) + 1;
    const seq = nextEstimateSeq(saved, projectId);
    const est = buildEstimate({
      id: `est-${Date.now()}`,
      createdAt: new Date().toLocaleString("ja-JP"),
      estimateNo: projectDocumentNumber(projectId, "EST", seq),
      version,
      previousEstimateId: latest?.id,
      revisionReason: latest ? effectiveRevisionReason : undefined,
    });
    upsertEstimate(est);
    setSelectedEstimateId(est.id);
    return est;
  }

  function afterSave(est: SavedEstimate, text: string) {
    const list = reloadSaved();
    setViewingId(est.id);
    setMode("view");
    void list;
    setMsg({ ok: true, text });
    setTimeout(() => setMsg(null), 6000);
  }

  function handleSaveFirst() {
    if (!hasContent()) {
      setMsg({ ok: false, text: "工事項目がありません。「04 工事項目・原価」で追加してください。" });
      return;
    }
    const est = saveNewVersion(); // 初回は v01
    if (est) afterSave(est, `見積を保存しました（${est.estimateNo}）。`);
  }

  function handleOverwrite() {
    if (!hasContent() || !latest) return;
    const est = overwriteLatest();
    if (est) afterSave(est, `現在の版を上書き保存しました（${est.estimateNo}）。`);
  }

  function handleNewVersion() {
    if (!hasContent()) return;
    if (revisionReason === "その他" && revisionReasonFree.trim() === "") {
      setMsg({ ok: false, text: "修正理由（その他）を入力してください。" });
      return;
    }
    const est = saveNewVersion();
    if (est) afterSave(est, `新しい版として保存しました（${est.estimateNo}・v${est.version}）。`);
  }

  // 現在の工事項目から新しい版を作成モードへ
  function enterEditFromWorkItems() {
    if (
      latest &&
      !confirm(
        "現在の工事項目から新しい見積内容を作成します。\n保存するまで既存の版は変更されません。続けますか？",
      )
    ) {
      return;
    }
    setWorkItems(workItemsStore.getByProjectId(projectId));
    setMode("edit");
    setViewingId(null);
  }

  // ── PDF（表示中の内容で発行。edit モードは現在WorkItemを保存してから） ──
  async function handlePdf() {
    if (!project || pdfLoading) return;
    let docNumber = viewing?.estimateNo ?? "";
    let lines = sellingLines;
    let bd = breakdown;

    if (mode === "edit") {
      if (!hasContent()) {
        alert("工事項目がありません。「04 工事項目・原価」で追加してからPDFを発行してください。");
        return;
      }
      // 発行前に保存（v01 または新しい版）。過去版は残す（非破壊）。
      const est = saveNewVersion();
      if (!est) {
        alert("保存に失敗しました。PDFは発行していません。");
        return;
      }
      docNumber = est.estimateNo;
      lines = snapshotsToSellingLines(est.lineSnapshots ?? []);
      bd = est.taxBreakdown ?? breakdown;
      reloadSaved();
      setViewingId(est.id);
      setMode("view");
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
        lines,
        subtotalSum: bd.subtotal,
        taxSum: bd.taxTotal,
        totalWithTax: bd.total,
        taxBreakdown: bd,
      });
      await renderAndDownloadPdf(
        doc,
        estimatePdfFileName({
          clientName: project.clientName || project.submitTo,
          projectName: project.projectName,
          workContent: (lines[0]?.workName) ?? "",
          date: todayDash(),
        }),
      );
      // 見積PDF発行で案件ステータスを「見積提出済み」へ前進（後退はしない）
      advanceProjectStatus(projectId, "submitted");
      setMsg({ ok: true, text: `見積書PDFを発行しました（${docNumber}）。` });
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

  const displayDocNo =
    mode === "view"
      ? viewing?.estimateNo ?? ""
      : projectDocumentNumber(projectId, "EST", nextEstimateSeq(getSavedEstimates(), projectId));

  return (
    <div className="min-h-screen bg-[#fdf8f2] pb-24">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">

        <header className="mb-3">
          <Link href={`/projects/${encodeURIComponent(projectId)}`} className="mb-2 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← 案件詳細へ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">見積書</h1>
          <p className="mt-1 text-sm text-stone-500">
            工事項目から見積を作成します。過去の版は保存時点の内容で残ります。
          </p>
        </header>

        <ProjectHeader project={project} />
        <ProjectTabs projectId={projectId} active="estimate" />

        {/* 版セレクタ（保存済み版がある場合） */}
        {savedList.length > 0 && (
          <div className="mb-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-stone-100">
            <label className={lbl}>表示する版</label>
            <select
              value={mode === "view" ? (viewingId ?? "") : "__edit__"}
              onChange={(e) => {
                if (e.target.value === "__edit__") {
                  enterEditFromWorkItems();
                } else {
                  setViewingId(e.target.value);
                  setMode("view");
                }
              }}
              className={fldSelect}
            >
              {savedList.map((e) => (
                <option key={e.id} value={e.id}>
                  v{String(e.version).padStart(2, "0")}　{e.estimateNo}　{fmtYen(e.total)}
                </option>
              ))}
              <option value="__edit__">＋ 現在の工事項目から新しい版を作成</option>
            </select>
            {mode === "view" && viewing?.revisionReason && (
              <p className="mt-1 text-xs text-stone-400">修正理由：{viewing.revisionReason}</p>
            )}
            {mode === "view" && (
              <p className="mt-1 text-xs text-amber-600">
                ※ 保存時点の内容を表示中（現在の工事項目とは独立）
              </p>
            )}
          </div>
        )}

        <div className="mb-3 flex items-center justify-between rounded-xl bg-white px-3 py-2 text-xs ring-1 ring-stone-100">
          <span className="text-stone-400">見積番号</span>
          <span className="font-mono font-bold text-stone-700">{displayDocNo}</span>
        </div>

        {/* 明細プレビュー */}
        {sellingLines.length === 0 ? (
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
                      {l.workDescription && <p className="text-xs text-stone-500">{l.workDescription}</p>}
                      <p className="mt-0.5 text-xs text-stone-400">
                        {l.taxType === "taxable" ? `課税${l.taxRate}%` : l.taxType === "non_taxable" ? "非課税" : "不課税・対象外"}
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

            <div className="mt-3">
              <TaxTotalsBox breakdown={breakdown} />
            </div>

            {internal && (
              <div className="mt-2 rounded-2xl bg-amber-50 p-3 text-xs ring-1 ring-amber-200">
                <p className="font-bold text-amber-800">🔒 内部管理（この画面のみ・PDFには出ません）</p>
                <div className="mt-1 flex justify-between"><span className="text-amber-800">原価合計</span><span className="font-bold text-amber-900">{fmtYen(internal.cost)}</span></div>
                <div className="flex justify-between"><span className="text-amber-800">粗利</span><span className={`font-bold ${internal.profit < 0 ? "text-red-600" : "text-amber-900"}`}>{fmtYen(internal.profit)}（{internal.rate.toFixed(1)}%）</span></div>
              </div>
            )}

            {msg && (
              <div className={`mt-3 rounded-xl px-3 py-2 text-xs font-bold ring-1 ${msg.ok ? "bg-green-50 text-green-700 ring-green-200" : "bg-red-50 text-red-600 ring-red-200"}`}>
                {msg.text}
              </div>
            )}

            {/* 保存ボタン群 */}
            {mode === "edit" ? (
              <div className="mt-3 space-y-2">
                {latest ? (
                  <>
                    {/* 修正理由（新しい版として保存する場合） */}
                    <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-stone-100">
                      <label className={lbl}>修正理由（新しい版として保存する場合）</label>
                      <select value={revisionReason} onChange={(e) => setRevisionReason(e.target.value)} className={fldSelect}>
                        {REVISION_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                      {revisionReason === "その他" && (
                        <input type="text" value={revisionReasonFree} onChange={(e) => setRevisionReasonFree(e.target.value)}
                          placeholder="修正理由を入力" className="mt-2 min-h-[44px] w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm" />
                      )}
                    </div>
                    <button type="button" onClick={handleNewVersion}
                      className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-[#8B4A3C] px-4 py-3 text-sm font-bold text-white shadow-sm active:opacity-80">
                      新しい版として保存（v{(latest.version) + 1}）
                    </button>
                    <button type="button" onClick={handleOverwrite}
                      className="flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm font-bold text-stone-600 active:opacity-80">
                      現在の版を上書き保存（v{latest.version}）
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={handleSaveFirst}
                    className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-[#8B4A3C] px-4 py-3 text-sm font-bold text-white shadow-sm active:opacity-80">
                    見積を保存する（v01）
                  </button>
                )}
                <button type="button" disabled={pdfLoading} onClick={() => void handlePdf()}
                  className="flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-[#8B4A3C] bg-white px-4 py-3 text-sm font-bold text-[#8B4A3C] active:opacity-80 disabled:opacity-50">
                  {pdfLoading ? "PDF作成中..." : `📄 ${project.projectType === "insurance" ? "損害復旧工事 見積明細書" : "見積明細書"}PDFを保存して発行`}
                </button>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                <button type="button" disabled={pdfLoading} onClick={() => void handlePdf()}
                  className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-[#8B4A3C] px-4 py-3 text-sm font-bold text-white shadow-sm active:opacity-80 disabled:opacity-50">
                  {pdfLoading ? "PDF作成中..." : "📄 この版の見積書PDFを再発行"}
                </button>
                <button type="button" onClick={enterEditFromWorkItems}
                  className="flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-[#8B4A3C] bg-white px-4 py-3 text-sm font-bold text-[#8B4A3C] active:opacity-80">
                  現在の工事項目から新しい版を作成
                </button>
              </div>
            )}
            <p className="mt-2 text-center text-xs text-stone-400">
              工事項目の編集は「04 工事項目・原価」で行います。
            </p>
          </>
        )}

      </div>
    </div>
  );
}
