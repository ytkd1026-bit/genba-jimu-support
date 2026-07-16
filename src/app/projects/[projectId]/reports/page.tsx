"use client";

// 07 作業報告
// 作業日ごとの報告を1件1カードで記録し、作業報告書PDFを出力する。
// PDF出力前に必ず本保存する（保存失敗時はPDFを出さない）。

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { projectsStore, advanceProjectStatus, projectDisplayId, type Project } from "@/app/utils/projects";
import {
  workReportsStore,
  issueWorkReportId,
  createEmptyWorkReport,
  type WorkReport,
} from "@/app/utils/workReports";
import { getPhotosSorted, PHOTO_PHASE_LABELS, type PhotoRecord } from "@/app/utils/photoRecords";
import { getCompanyInfoForPdf } from "@/app/utils/companySettings";
import { workReportPdfFileName } from "@/app/utils/pdfFileName";
import { renderAndDownloadPdf, todaySlash, todayDash } from "@/app/utils/pdfDownload";
import { draftKey } from "@/app/utils/draftStorage";
import { useAutoDraft } from "@/hooks/useAutoDraft";
import { SaveStatusBar } from "@/components/SaveStatusBar";
import { ProjectTabs, ProjectHeader } from "@/components/ProjectTabs";
import { StructuredTextInput } from "@/components/StructuredTextInput";
import { fldInput, lbl } from "@/components/formStyles";

type ReportsDraftData = {
  records: WorkReport[];
  deletedIds: string[];
};

export default function WorkReportsPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = decodeURIComponent(params.projectId);

  const [notFound, setNotFound] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [records, setRecords] = useState<WorkReport[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showRestoreBanner, setShowRestoreBanner] = useState(false);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);

  // ── 読み込み ──────────────────────────────────────────────
  useEffect(() => {
    const p = projectsStore.getById(projectId);
    if (!p) {
      setNotFound(true);
      return;
    }
    setProject(p);
    setRecords(workReportsStore.getByProjectId(projectId));
    setPhotos(getPhotosSorted(projectId));
    setLoaded(true);
  }, [projectId]);

  // ── 自動下書き保存 ────────────────────────────────────────
  const REPORTS_DRAFT_KEY = draftKey("work-reports", projectId);
  const draftData = useMemo<ReportsDraftData>(
    () => ({ records, deletedIds }),
    [records, deletedIds],
  );
  const { saveStatus, savedAt, clearDraft, restoredDraft } = useAutoDraft<ReportsDraftData>(
    REPORTS_DRAFT_KEY, "work-reports", projectId, draftData,
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
    setRecords(restoredDraft.data.records);
    setDeletedIds(restoredDraft.data.deletedIds);
    setShowRestoreBanner(false);
  }

  function handleDiscardDraft() {
    clearDraft();
    setShowRestoreBanner(false);
  }

  // ── カード操作 ────────────────────────────────────────────
  function updateRecord(reportId: string, patch: Partial<WorkReport>) {
    setRecords((prev) =>
      prev.map((r) => (r.reportId === reportId ? { ...r, ...patch } : r)),
    );
  }

  function addRecord() {
    const reportId = issueWorkReportId(projectId);
    const rec = createEmptyWorkReport(projectId, reportId);
    rec.workDate = todayDash();
    setRecords((prev) => [...prev, rec]);
  }

  function duplicateRecord(reportId: string) {
    const src = records.find((r) => r.reportId === reportId);
    if (!src) return;
    const newId = issueWorkReportId(projectId);
    const now = new Date().toISOString();
    const idx = records.findIndex((r) => r.reportId === reportId);
    const dup: WorkReport = { ...src, reportId: newId, createdAt: now, updatedAt: now };
    setRecords((prev) => [...prev.slice(0, idx + 1), dup, ...prev.slice(idx + 1)]);
  }

  function removeRecord(reportId: string) {
    if (!confirm(`${reportId} を削除しますか？`)) return;
    setRecords((prev) => prev.filter((r) => r.reportId !== reportId));
    setDeletedIds((prev) => (prev.includes(reportId) ? prev : [...prev, reportId]));
  }

  function togglePhotoId(reportId: string, photoId: string) {
    setRecords((prev) =>
      prev.map((r) => {
        if (r.reportId !== reportId) return r;
        const list = r.relatedPhotoIds;
        return {
          ...r,
          relatedPhotoIds: list.includes(photoId)
            ? list.filter((x) => x !== photoId)
            : [...list, photoId],
        };
      }),
    );
  }

  // ── 本保存 ────────────────────────────────────────────────
  function saveAll(): boolean {
    const now = new Date().toISOString();
    let allOk = true;
    for (const r of records) {
      if (!workReportsStore.upsert({ ...r, updatedAt: now })) allOk = false;
    }
    for (const id of deletedIds) {
      workReportsStore.remove(id);
    }
    if (allOk) {
      setDeletedIds([]);
      setRecords(workReportsStore.getByProjectId(projectId));
      clearDraft();
      // 作業報告を保存したら「施工中」へ前進（後退はしない）。完工/入金は手動更新
      if (records.length > 0) advanceProjectStatus(projectId, "in_progress");
    }
    return allOk;
  }

  function handleSave() {
    if (saveAll()) {
      setSaveMsg({ ok: true, text: "作業報告を保存しました。" });
    } else {
      setSaveMsg({ ok: false, text: "一部保存に失敗しました。入力内容は下書きとして残っています。" });
    }
    setTimeout(() => setSaveMsg(null), 6000);
  }

  // ── PDF出力（保存 → 生成の順） ─────────────────────────────
  async function handlePdf(reportId: string) {
    if (!project || pdfLoadingId !== null) return;
    const record = records.find((r) => r.reportId === reportId);
    if (!record) return;
    if (record.workSummary.trim() === "" && record.completedWork.trim() === "") {
      alert("作業内容または完了内容を入力してからPDFを発行してください。");
      return;
    }
    // PDF発行前の本保存（失敗したら発行しない）
    if (!saveAll()) {
      alert("保存に失敗しました。PDFは発行していません。");
      return;
    }
    setPdfLoadingId(reportId);
    try {
      const { makeWorkReportPDF } = await import("@/components/pdf/WorkReportPDF");
      const relatedPhotos = photos
        .filter((p) => record.relatedPhotoIds.includes(p.photoId))
        .map((p) => ({
          photoId: p.photoId,
          imageDataUrl: p.imageDataUrl,
          location: p.location,
          description: p.description,
        }));
      const doc = makeWorkReportPDF({
        documentTitle: "作業報告書",
        documentNumber: `${record.reportId}-${projectDisplayId(project)}`,
        createdDate: todaySlash(),
        submitTo: project.submitTo || project.clientName || "",
        projectName: project.projectName,
        siteAddress: project.siteAddress,
        companyInfo: getCompanyInfoForPdf(),
        projectId: projectDisplayId(project),
        workDate: record.workDate,
        workerName: record.workerName,
        workSummary: record.workSummary,
        completedWork: record.completedWork,
        remainingWork: record.remainingWork,
        issue: record.issue,
        cause: record.cause,
        actionTaken: record.actionTaken,
        customerConfirmation: record.customerConfirmation,
        photos: relatedPhotos,
      });
      await renderAndDownloadPdf(
        doc,
        workReportPdfFileName({
          clientName: project.clientName || project.submitTo,
          projectName: project.projectName,
          workDate: record.workDate || todayDash(),
        }),
      );
    } catch (err) {
      console.error("作業報告書PDF生成エラー:", err);
      alert("PDFの生成に失敗しました。もう一度お試しください。");
    } finally {
      setPdfLoadingId(null);
    }
  }

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
          <h1 className="text-xl font-bold text-stone-800">作業報告</h1>
          <p className="mt-1 text-sm text-stone-500">
            作業日ごとに報告を記録し、作業報告書PDFを出せます。
          </p>
        </header>

        <ProjectHeader project={project} />
        <ProjectTabs projectId={projectId} active="reports" />

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

        {/* ── 報告カード一覧 ─────────────────────────────── */}
        <div className="space-y-3">
          {records.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-stone-200 px-4 py-10 text-center">
              <p className="text-sm text-stone-500">まだ作業報告がありません。</p>
              <p className="mt-1.5 text-sm text-stone-500">「作業報告を追加する」から記録を始めてください。</p>
            </div>
          )}

          {records.map((r) => (
            <div key={r.reportId} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-100">
              <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-4 py-2.5">
                <span className="rounded-full bg-[#8B4A3C] px-2 py-0.5 font-mono text-xs font-bold text-white">
                  {r.reportId}
                </span>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => duplicateRecord(r.reportId)}
                    className="min-h-[44px] px-1 text-xs text-stone-400 active:text-stone-600">
                    複製
                  </button>
                  <button type="button" onClick={() => removeRecord(r.reportId)}
                    className="min-h-[44px] px-1 text-xs text-stone-400 active:text-red-500">
                    削除
                  </button>
                </div>
              </div>

              <div className="space-y-3 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={lbl}>作業日</label>
                    <input type="date" value={r.workDate}
                      onChange={(e) => updateRecord(r.reportId, { workDate: e.target.value })}
                      className={fldInput} />
                  </div>
                  <div>
                    <label className={lbl}>作業者</label>
                    <input type="text" value={r.workerName}
                      onChange={(e) => updateRecord(r.reportId, { workerName: e.target.value })}
                      placeholder="山田" className={fldInput} />
                  </div>
                </div>

                <StructuredTextInput
                  label="作業内容"
                  value={r.workSummary}
                  onChange={(v) => updateRecord(r.reportId, { workSummary: v })}
                  placeholder="例：洋室天井の下地ボード交換とクロス貼替"
                  allowFutureVoiceInput
                  required
                />
                <StructuredTextInput
                  label="完了内容"
                  value={r.completedWork}
                  onChange={(v) => updateRecord(r.reportId, { completedWork: v })}
                  placeholder="例：下地交換まで完了"
                  allowFutureVoiceInput
                />
                <StructuredTextInput
                  label="残作業"
                  value={r.remainingWork}
                  onChange={(v) => updateRecord(r.reportId, { remainingWork: v })}
                  placeholder="例：クロス仕上げ（明日予定）"
                  allowFutureVoiceInput
                />
                <StructuredTextInput
                  label="問題"
                  value={r.issue}
                  onChange={(v) => updateRecord(r.reportId, { issue: v })}
                  placeholder="例：想定より下地の傷みが広かった"
                  allowFutureVoiceInput
                />
                <StructuredTextInput
                  label="原因"
                  value={r.cause}
                  onChange={(v) => updateRecord(r.reportId, { cause: v })}
                  placeholder="例：長期間の漏水による腐食"
                  allowFutureVoiceInput
                />
                <StructuredTextInput
                  label="対応"
                  value={r.actionTaken}
                  onChange={(v) => updateRecord(r.reportId, { actionTaken: v })}
                  placeholder="例：交換範囲を1枚追加。追加分は元請へ連絡済み"
                  allowFutureVoiceInput
                />
                <StructuredTextInput
                  label="顧客確認事項"
                  value={r.customerConfirmation}
                  onChange={(v) => updateRecord(r.reportId, { customerConfirmation: v })}
                  placeholder="例：仕上がり色を現地で確認いただいた"
                  allowFutureVoiceInput
                />

                {/* 関連写真 */}
                <div>
                  <label className={lbl}>関連写真</label>
                  {photos.length === 0 ? (
                    <p className="rounded-lg bg-stone-50 px-3 py-2.5 text-xs text-stone-400">
                      この案件の写真はまだありません（「03 写真台帳」で追加できます）。
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {photos.map((p) => {
                        const active = r.relatedPhotoIds.includes(p.photoId);
                        return (
                          <button key={p.photoId} type="button"
                            onClick={() => togglePhotoId(r.reportId, p.photoId)}
                            className={`min-h-[44px] rounded-xl px-3 py-2 text-xs font-bold active:opacity-80 ${
                              active
                                ? "bg-[#8B4A3C] text-white"
                                : "border border-stone-200 bg-white text-stone-500"
                            }`}>
                            {p.photoId} {PHOTO_PHASE_LABELS[p.phase]}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* PDF出力 */}
                <button
                  type="button"
                  disabled={pdfLoadingId !== null}
                  onClick={() => void handlePdf(r.reportId)}
                  className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-[#8B4A3C] bg-white px-3 py-2 text-xs font-bold text-[#8B4A3C] active:opacity-80 disabled:opacity-50"
                >
                  {pdfLoadingId === r.reportId ? "PDF作成中..." : "📄 この報告を作業報告書PDFにする（保存してから発行）"}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* ── 追加・保存 ─────────────────────────────────── */}
        <button
          type="button"
          onClick={addRecord}
          className="mt-3 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#8B4A3C]/40 bg-white px-4 py-3 text-sm font-bold text-[#8B4A3C] active:opacity-80"
        >
          ＋ 作業報告を追加する
        </button>

        {saveMsg && (
          <div className={`mt-3 rounded-xl px-3 py-2 text-xs font-bold ring-1 ${
            saveMsg.ok
              ? "bg-green-50 text-green-700 ring-green-200"
              : "bg-red-50 text-red-600 ring-red-200"
          }`}>
            {saveMsg.text}
          </div>
        )}
        {records.length > 0 && (
          <button
            type="button"
            onClick={handleSave}
            className="mt-3 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-[#8B4A3C] px-4 py-3 text-sm font-bold text-white shadow-sm active:opacity-80"
          >
            作業報告を保存する
          </button>
        )}

      </div>
    </div>
  );
}
