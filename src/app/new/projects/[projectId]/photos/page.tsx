"use client";

// 03 写真台帳
// 写真の追加・ID自動発行（P-001〜）・サムネイル表示・撮影区分・撮影場所・説明・
// 被害IDとの紐付け・並び替え・削除・差し替えを行う。
//
// 保存設計の注意:
// 画像データが大きいため、この画面は自動下書き（draftキーへの二重保存）を使わず、
// photoRecordsStore へ直接保存する（テキスト編集は debounce、追加・削除・差し替え・
// 並び替えは即時保存）。保存状態は画面上部に常時表示する。
// 写真IDは一度発行したら変更せず、削除しても番号を詰め直さない。

import Link from "next/link";
import PageHeader from "@/app/new/_components/PageHeader";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { projectsStore, type Project } from "@/app/utils/projects";
import {
  photoRecordsStore,
  issuePhotoId,
  getPhotosSorted,
  PHOTO_PHASE_LABELS,
  type PhotoRecord,
  type PhotoPhase,
} from "@/app/utils/photoRecords";
import { damageRecordsStore, type DamageRecord } from "@/app/utils/damageRecords";
import { compressImageFile } from "@/app/utils/imageCompress";
import { getCompanyInfoForPdf } from "@/app/utils/companySettings";
import { photoLedgerPdfFileName } from "@/app/utils/pdfFileName";
import { renderAndDownloadPdf, todaySlash, todayDash } from "@/app/utils/pdfDownload";
import { NuProjectTabs, NuProjectHeader } from "@/app/new/_components/NuProject";
import { StructuredTextInput } from "@/components/StructuredTextInput";
import { nuInput as fldInput, nuSelect as fldSelect, nuLbl as lbl } from "@/app/new/_lib/formStyles";

type PhotoSaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

const QUOTA_HINT =
  "保存に失敗しました。写真の保存容量が上限に達している可能性があります。不要な写真を削除してください。";

function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function PhotoLedgerPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = decodeURIComponent(params.projectId);

  const [notFound, setNotFound] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [damages, setDamages] = useState<DamageRecord[]>([]);
  const [status, setStatus] = useState<PhotoSaveStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  // テキスト編集の debounce 保存用
  const dirtyIdsRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const photosRef = useRef<PhotoRecord[]>([]);
  photosRef.current = photos;

  const addInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetRef = useRef<string | null>(null);

  // ── 読み込み ──────────────────────────────────────────────
  useEffect(() => {
    const p = projectsStore.getById(projectId);
    if (!p) {
      setNotFound(true);
      return;
    }
    setProject(p);
    setPhotos(getPhotosSorted(projectId));
    setDamages(damageRecordsStore.getByProjectId(projectId));
  }, [projectId]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // ブラウザ離脱時の未保存警告
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (status === "dirty" || status === "saving") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [status]);

  // ── 保存処理 ──────────────────────────────────────────────
  function syncDirty(): void {
    setStatus("saving");
    let ok = true;
    for (const id of dirtyIdsRef.current) {
      const rec = photosRef.current.find((p) => p.photoId === id);
      if (rec && !photoRecordsStore.upsert(rec)) ok = false;
    }
    dirtyIdsRef.current.clear();
    if (ok) {
      setStatus("saved");
      setErrorMsg("");
    } else {
      setStatus("error");
      setErrorMsg(QUOTA_HINT);
    }
  }

  function scheduleSync(): void {
    setStatus("dirty");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(syncDirty, 800);
  }

  /** テキスト・区分などの編集（debounce保存） */
  function updatePhoto(photoId: string, patch: Partial<PhotoRecord>) {
    setPhotos((prev) =>
      prev.map((p) => (p.photoId === photoId ? { ...p, ...patch } : p)),
    );
    dirtyIdsRef.current.add(photoId);
    scheduleSync();
  }

  /** 構造変更（追加・差し替え・並び替え）の即時保存 */
  function persistNow(records: PhotoRecord[]): boolean {
    setStatus("saving");
    let ok = true;
    for (const rec of records) {
      if (!photoRecordsStore.upsert(rec)) ok = false;
    }
    if (ok) {
      setStatus("saved");
      setErrorMsg("");
    } else {
      setStatus("error");
      setErrorMsg(QUOTA_HINT);
    }
    return ok;
  }

  // ── 写真追加 ──────────────────────────────────────────────
  // 注意: FileList はライブオブジェクトのため、input の value リセットで空になる。
  //       呼び出し側で必ず配列へコピーしてから渡すこと。
  async function handleAddFiles(files: File[]) {
    if (files.length === 0) return;
    setBusy(true);
    setErrorMsg("");
    const added: PhotoRecord[] = [];
    let failedCount = 0;
    const maxOrder = photos.reduce((m, p) => Math.max(m, p.sortOrder ?? 0), 0);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const compressed = await compressImageFile(file);
      if (!compressed) {
        failedCount++;
        continue;
      }
      const photoId = issuePhotoId(projectId);
      added.push({
        photoId,
        projectId,
        phase: "survey",
        location: "",
        description: "",
        fileName: file.name,
        imageDataUrl: compressed.dataUrl,
        capturedAt: file.lastModified
          ? new Date(file.lastModified).toISOString().slice(0, 10)
          : todayStr(),
        createdAt: new Date().toISOString(),
        sortOrder: maxOrder + i + 1,
      });
    }

    if (added.length > 0) {
      const ok = persistNow(added);
      if (ok) {
        setPhotos((prev) => [...prev, ...added]);
      } else {
        // 保存できた分だけ画面へ反映する（ストアを正とする）
        setPhotos(getPhotosSorted(projectId));
      }
    }
    if (failedCount > 0) {
      setErrorMsg(
        `${failedCount}枚の画像を読み込めませんでした。対応形式（JPEG/PNG等）をご確認ください。`,
      );
    }
    setBusy(false);
  }

  // ── 写真差し替え（IDは変更しない） ─────────────────────────
  async function handleReplaceFile(files: File[]) {
    const targetId = replaceTargetRef.current;
    replaceTargetRef.current = null;
    if (files.length === 0 || !targetId) return;
    setBusy(true);
    const compressed = await compressImageFile(files[0]);
    if (!compressed) {
      setErrorMsg("画像を読み込めませんでした。対応形式（JPEG/PNG等）をご確認ください。");
      setBusy(false);
      return;
    }
    const target = photosRef.current.find((p) => p.photoId === targetId);
    if (target) {
      const updated: PhotoRecord = {
        ...target,
        imageDataUrl: compressed.dataUrl,
        fileName: files[0].name,
      };
      if (persistNow([updated])) {
        setPhotos((prev) => prev.map((p) => (p.photoId === targetId ? updated : p)));
      }
    }
    setBusy(false);
  }

  // ── 削除（IDは再利用されない） ─────────────────────────────
  function handleDelete(photoId: string) {
    if (!confirm(`${photoId} を削除しますか？\n（削除した写真番号は再利用されません）`)) return;
    photoRecordsStore.remove(photoId);
    setPhotos((prev) => prev.filter((p) => p.photoId !== photoId));
    setStatus("saved");
  }

  // ── 並び替え（sortOrder を振り直す。photoId は不変） ────────
  function handleMove(photoId: string, dir: -1 | 1) {
    const idx = photos.findIndex((p) => p.photoId === photoId);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= photos.length) return;
    const next = photos.slice();
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    const renumbered = next.map((p, i) => ({ ...p, sortOrder: i + 1 }));
    if (persistNow(renumbered)) {
      setPhotos(renumbered);
    }
  }

  // ── 写真台帳PDF（未保存分を保存してから生成） ───────────────
  async function handleLedgerPdf() {
    if (!project || pdfLoading) return;
    if (photos.length === 0) {
      alert("写真を1枚以上追加してからPDFを発行してください。");
      return;
    }
    // 保存待ちの編集があれば先に保存する（保存失敗時は発行しない）
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (dirtyIdsRef.current.size > 0) {
      syncDirty();
    }
    const stored = getPhotosSorted(projectId);
    if (stored.length === 0) {
      alert("写真の保存に失敗しています。PDFは発行していません。");
      return;
    }
    setPdfLoading(true);
    try {
      const { makePhotoLedgerPDF } = await import("@/components/pdf/PhotoLedgerPDF");
      const doc = makePhotoLedgerPDF({
        documentTitle: "写真報告台帳",
        documentNumber: `PHT-${project.projectId}`,
        createdDate: todaySlash(),
        submitTo: project.submitTo || project.clientName || "",
        projectName: project.projectName,
        siteAddress: project.siteAddress,
        companyInfo: getCompanyInfoForPdf(),
        projectId: project.projectId,
        photos: stored.map((p) => ({
          photoId: p.photoId,
          imageDataUrl: p.imageDataUrl,
          location: p.location,
          phaseLabel: PHOTO_PHASE_LABELS[p.phase],
          description: p.description,
          damageId: p.damageId,
          capturedAt: p.capturedAt,
        })),
      });
      await renderAndDownloadPdf(
        doc,
        photoLedgerPdfFileName({
          clientName: project.clientName || project.submitTo,
          projectName: project.projectName,
          date: todayDash(),
        }),
      );
    } catch (err) {
      console.error("写真台帳PDF生成エラー:", err);
      alert("PDFの生成に失敗しました。もう一度お試しください。");
    } finally {
      setPdfLoading(false);
    }
  }

  // 写真データの合計サイズ（目安表示）
  const approxTotalMb = useMemo(() => {
    const chars = photos.reduce((sum, p) => sum + (p.imageDataUrl?.length ?? 0), 0);
    return (chars * 0.75) / (1024 * 1024);
  }, [photos]);

  // ── 案件が見つからない場合 ────────────────────────────────
  if (notFound) {
    return (
      <div className="">
        <PageHeader title="写真台帳" subtitle="案件が見つかりません" back="/new/projects" />
        <div className="px-4 py-10 text-center">
          <p className="text-sm font-bold text-[var(--nu-text)]">案件が見つかりません。</p>
          <p className="mt-1 font-mono text-xs text-slate-400">{projectId}</p>
          <Link
            href="/new/projects"
            className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[var(--nu-primary)] px-5 py-2.5 text-sm font-bold text-white active:opacity-80"
          >
            案件一覧へ戻る
          </Link>
        </div>
      </div>
    );
  }

  if (!project) {
    return <div className="" />;
  }

  return (
    <div className="pb-4">
      <PageHeader title="写真台帳" subtitle="写真は自動圧縮して保存されます" back={`/new/projects/${encodeURIComponent(projectId)}`} />
      <div className="px-4 py-4">

        <NuProjectHeader project={project} />
        <NuProjectTabs projectId={projectId} active="photos" />

        {/* 保存状態表示 */}
        {status !== "idle" && (
          <div className={`mb-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${
            status === "saved"
              ? "bg-green-50 text-green-600 ring-1 ring-green-200"
              : status === "error"
                ? "bg-red-50 text-red-600 ring-1 ring-red-200"
                : "bg-blue-50 text-blue-500 ring-1 ring-blue-200"
          }`}>
            <span>
              {status === "saved" && "✓ 保存済み"}
              {status === "saving" && "⏳ 保存中..."}
              {status === "dirty" && "✏️ 入力中（自動保存します）"}
              {status === "error" && "⚠️ 保存エラー"}
            </span>
          </div>
        )}
        {errorMsg && (
          <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600 ring-1 ring-red-200">
            {errorMsg}
          </div>
        )}

        {/* 写真追加 */}
        <input
          ref={addInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void handleAddFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <input
          ref={replaceInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void handleReplaceFile(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => addInputRef.current?.click()}
          className="mb-2 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[var(--nu-primary)] px-4 py-3 text-sm font-bold text-white shadow-sm active:opacity-80 disabled:opacity-50"
        >
          {busy ? "写真を処理中..." : "＋ 写真を追加する（複数選択可）"}
        </button>
        <p className="mb-2 text-right text-xs text-slate-400">
          写真データ 約{approxTotalMb.toFixed(1)}MB（目安上限 5MB）
        </p>
        {photos.length > 0 && (
          <button
            type="button"
            disabled={pdfLoading || busy}
            onClick={() => void handleLedgerPdf()}
            className="mb-3 flex min-h-[44px] w-full items-center justify-center rounded-xl border border-[var(--nu-primary)] bg-white px-3 py-2 text-xs font-bold text-[var(--nu-primary)] active:opacity-80 disabled:opacity-50"
          >
            {pdfLoading ? "PDF作成中..." : "📄 写真台帳PDFを作成する（1ページ4枚）"}
          </button>
        )}

        {/* ── 写真カード一覧 ─────────────────────────────── */}
        <div className="space-y-3">
          {photos.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-[var(--nu-border)] px-4 py-10 text-center">
              <p className="text-sm text-slate-500">まだ写真がありません。</p>
              <p className="mt-1.5 text-sm text-slate-500">「写真を追加する」から登録してください。</p>
            </div>
          )}

          {photos.map((photo, index) => (
            <div key={photo.photoId} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-[var(--nu-border-soft)]">
              {/* カードヘッダー */}
              <div className="flex items-center justify-between border-b border-[var(--nu-border-soft)] bg-[var(--nu-bg)] px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[var(--nu-primary)] px-2 py-0.5 font-mono text-xs font-bold text-white">
                    {photo.photoId}
                  </span>
                  <span className="text-xs text-slate-400">{index + 1}枚目</span>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => handleMove(photo.photoId, -1)}
                    disabled={index === 0}
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 active:bg-[var(--nu-bg)] disabled:opacity-25"
                    aria-label="上へ移動">
                    ↑
                  </button>
                  <button type="button" onClick={() => handleMove(photo.photoId, 1)}
                    disabled={index === photos.length - 1}
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 active:bg-[var(--nu-bg)] disabled:opacity-25"
                    aria-label="下へ移動">
                    ↓
                  </button>
                </div>
              </div>

              {/* サムネイル */}
              {photo.imageDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo.imageDataUrl}
                  alt={`${photo.photoId} ${photo.description || photo.fileName}`}
                  className="h-44 w-full bg-[var(--nu-bg)] object-contain"
                />
              ) : (
                <div className="flex h-44 w-full items-center justify-center bg-[var(--nu-bg)] text-xs text-slate-400">
                  画像なし（差し替えで登録できます）
                </div>
              )}

              <div className="space-y-3 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={lbl}>撮影区分</label>
                    <select
                      value={photo.phase}
                      onChange={(e) => updatePhoto(photo.photoId, { phase: e.target.value as PhotoPhase })}
                      className={fldSelect}
                    >
                      {(Object.keys(PHOTO_PHASE_LABELS) as PhotoPhase[]).map((k) => (
                        <option key={k} value={k}>{PHOTO_PHASE_LABELS[k]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>撮影日</label>
                    <input type="date" value={photo.capturedAt}
                      onChange={(e) => updatePhoto(photo.photoId, { capturedAt: e.target.value })}
                      className={fldInput} />
                  </div>
                </div>
                <div>
                  <label className={lbl}>撮影場所</label>
                  <input type="text" value={photo.location}
                    onChange={(e) => updatePhoto(photo.photoId, { location: e.target.value })}
                    placeholder="洗面所 天井" className={fldInput} />
                </div>
                <StructuredTextInput
                  label="説明"
                  value={photo.description}
                  onChange={(v) => updatePhoto(photo.photoId, { description: v })}
                  placeholder="例：天井クロスの水染み。点検口の右側。"
                  allowFutureVoiceInput
                />
                <div>
                  <label className={lbl}>関連する被害ID</label>
                  <select
                    value={photo.damageId ?? ""}
                    onChange={(e) =>
                      updatePhoto(photo.photoId, { damageId: e.target.value || undefined })
                    }
                    className={fldSelect}
                  >
                    <option value="">（紐付けなし）</option>
                    {damages.map((d) => (
                      <option key={d.damageId} value={d.damageId}>
                        {d.damageId} {d.location || "（箇所未入力）"}
                      </option>
                    ))}
                  </select>
                  {damages.length === 0 && (
                    <p className="mt-1 text-xs text-slate-400">
                      被害記録は「02 現地調査」タブで追加できます。
                    </p>
                  )}
                </div>

                <div className="flex gap-2 border-t border-[var(--nu-border-soft)] pt-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      replaceTargetRef.current = photo.photoId;
                      replaceInputRef.current?.click();
                    }}
                    className="min-h-[44px] flex-1 rounded-xl border border-[var(--nu-border)] bg-white px-3 py-2 text-xs font-bold text-slate-600 active:opacity-80 disabled:opacity-50"
                  >
                    写真を差し替える
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(photo.photoId)}
                    className="min-h-[44px] flex-1 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-500 active:opacity-80"
                  >
                    削除する
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
