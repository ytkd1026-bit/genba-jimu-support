"use client";

// 段3-2A：PC向け 帳票直接入力モック（見た目確認用）
//
// この画面は見た目を確認するための一時的なプレビュー。
//   - 保存処理を行わない（行データはローカル state のみ）
//   - 既存の見積画面（../page.tsx）には一切手を触れていない
//   - 既存の保存済みデータは読み取りのみ
// 段3-2B で本来の見積画面へ統合したあと、この画面は削除する。

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useParams } from "next/navigation";
import { projectsStore, type Project } from "@/app/utils/projects";
import { workItemsStore } from "@/app/utils/workItems";
import { workItemsToSellingLines, projectDocumentNumber, nextEstimateSeq } from "@/app/utils/workItemEstimate";
import { getSavedEstimates } from "@/app/utils/savedEstimates";
import { getCompanyInfoForPdf } from "@/app/utils/companySettings";
import { todayDash } from "@/app/utils/pdfDownload";
import type { SellingLine } from "@/components/pdf/WorkEstimatePDF";
import { EstimateSheet, type EstimateSheetHeader } from "@/components/sheets/EstimateSheet";
import "@/components/sheets/sheet.css";

/** 表示倍率。ページ幅に合わせる場合は fit。 */
type Zoom = "fit" | 1 | 0.9 | 0.8;

/** クライアント判定用。購読対象がないため何もしない。 */
const subscribeNoop = () => () => {};

export default function EstimateSheetPreviewPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = decodeURIComponent(params.projectId);

  // localStorage はサーバ側に存在しないため、クライアントで描画されたかを判定する。
  // effect 内 setState を避けるため useSyncExternalStore を使う
  // （サーバは false、クライアントは true を返す）。
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);

  const loaded = useMemo(() => {
    if (!mounted) return null;
    const p = projectsStore.getById(projectId);
    if (!p) return null;
    const seq = nextEstimateSeq(getSavedEstimates(), projectId);
    const head: EstimateSheetHeader = {
      documentTitle: p.projectType === "insurance" ? "損害復旧工事 見積明細書" : "見積明細書",
      submitTo: p.submitTo || p.clientName || "",
      projectName: p.projectName,
      siteAddress: p.siteAddress,
      documentNumber: projectDocumentNumber(projectId, "EST", seq),
      createdDate: todayDash(),
      companyInfo: getCompanyInfoForPdf(),
    };
    return {
      project: p,
      header: head,
      lines: workItemsToSellingLines(workItemsStore.getByProjectId(projectId)),
    };
  }, [mounted, projectId]);

  // 編集用の上書き。null のうちは読み込み値をそのまま見せる。
  const [editedLines, setEditedLines] = useState<SellingLine[] | null>(null);
  const [editedHeader, setEditedHeader] = useState<EstimateSheetHeader | null>(null);
  const [zoom, setZoom] = useState<Zoom>("fit");

  const project: Project | null = loaded?.project ?? null;
  const header: EstimateSheetHeader | null = editedHeader ?? loaded?.header ?? null;
  const lines: SellingLine[] = editedLines ?? loaded?.lines ?? [];
  const setLines = (fn: (prev: SellingLine[]) => SellingLine[]) =>
    setEditedLines((prev) => fn(prev ?? loaded?.lines ?? []));
  const setHeader = (fn: (prev: EstimateSheetHeader | null) => EstimateSheetHeader | null) =>
    setEditedHeader((prev) => fn(prev ?? loaded?.header ?? null));

  const nextLineId = useMemo(() => `MOCK-${lines.length + 1}`, [lines.length]);

  function handleHeaderChange(field: keyof EstimateSheetHeader, v: string) {
    setHeader((h) => (h ? { ...h, [field]: v } : h));
  }

  function handleLineChange(index: number, field: keyof SellingLine, v: string) {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l;
        // 数量・単価は数値へ。小計はその場で再計算する（計算式は既存と同じ 数量×単価）
        if (field === "quantity" || field === "sellingUnitPrice") {
          const num = Number(v.replace(/,/g, "")) || 0;
          const next = { ...l, [field]: num };
          return { ...next, sellingAmount: next.quantity * next.sellingUnitPrice };
        }
        return { ...l, [field]: v };
      }),
    );
  }

  function handleAddLine(categoryName: string) {
    setLines((prev) => [
      ...prev,
      {
        workItemId: nextLineId,
        category: categoryName,
        workName: "",
        workDescription: "",
        location1: "",
        location2: "",
        quantity: 0,
        unit: "",
        sellingUnitPrice: 0,
        sellingAmount: 0,
        note: "",
        taxType: "taxable",
        taxRate: 10,
      },
    ]);
  }

  if (!project || !header) {
    return (
      <div className="min-h-screen" style={{ background: "#6b6560" }}>
        <div className="mx-auto max-w-5xl px-6 py-10 text-sm text-stone-200">
          案件を読み込んでいます…（<span className="font-mono">{projectId}</span>）
        </div>
      </div>
    );
  }

  const paperWidth = zoom === "fit" ? "100%" : `${1123 * zoom}px`;

  return (
    // 事務所の作業台を思わせる中立色。装飾は置かない。
    <div className="min-h-screen" style={{ background: "#6b6560" }}>
      <div className="mx-auto max-w-[1180px] px-6 py-6">

        {/* ── 帳票外の操作領域 ── */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href={`/projects/${encodeURIComponent(projectId)}/estimate`}
              className="text-sm text-stone-200 underline underline-offset-4 hover:text-white"
            >
              ← 見積画面へ戻る
            </Link>
            <span className="rounded bg-black/25 px-2 py-0.5 text-xs text-stone-200">
              段3-2A 見た目確認用モック（保存しません）
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {(["fit", 1, 0.9, 0.8] as const).map((z) => (
              <button
                key={String(z)}
                type="button"
                onClick={() => setZoom(z)}
                className={`rounded px-2.5 py-1 text-xs font-bold ${
                  zoom === z ? "bg-white text-stone-800" : "bg-black/25 text-stone-200 hover:bg-black/35"
                }`}
              >
                {z === "fit" ? "ページ幅" : `${z * 100}%`}
              </button>
            ))}
          </div>
        </div>

        {/* ── 帳票 ── */}
        <div style={{ overflowX: "auto" }}>
          <div style={{ width: paperWidth, minWidth: zoom === "fit" ? undefined : paperWidth }}>
            <EstimateSheet
              header={header}
              lines={lines}
              onHeaderChange={handleHeaderChange}
              onLineChange={handleLineChange}
              onAddLine={handleAddLine}
            />
          </div>
        </div>

        {/* ── 帳票外の操作ボタン ── */}
        <div className="mt-4 flex flex-wrap gap-2.5">
          <button type="button" disabled className="rounded-lg bg-white/90 px-4 py-2 text-sm font-bold text-stone-800 opacity-60">
            保存する（モックでは動作しません）
          </button>
          <button type="button" disabled className="rounded-lg border border-white/40 px-4 py-2 text-sm font-bold text-stone-100 opacity-60">
            PDFプレビュー
          </button>
          <button type="button" disabled className="rounded-lg border border-white/40 px-4 py-2 text-sm font-bold text-stone-100 opacity-60">
            PDFを発行
          </button>
        </div>

      </div>
    </div>
  );
}
