"use client";

// 見積書プレビュー（/new/projects/[projectId]/estimate/preview）
//
// 操作順： 見積・原価入力 →「保存して見積書を確認」→ 本保存 → このプレビュー → PDF発行。
// この画面は保存済みの WorkItem だけを読む。未保存の下書きは読まない。
//   → 保存していない内容がPDFになることは無い（保存前のPDF発行を構造的に防ぐ）。
//
// プレビューとPDFは同じ EstimateDocument を消費する。帳票の内容定義は
// src/app/utils/estimateDocument.ts の1か所だけ。原価・粗利はその型に存在しない。

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "../../../../_components/PageHeader";
import { projectsStore, type Project } from "@/app/utils/projects";
import { workItemsStore, type WorkItem } from "@/app/utils/workItems";
import { workItemsToSellingLines, projectDocumentNumber, nextEstimateSeq } from "@/app/utils/workItemEstimate";
import { getSavedEstimates } from "@/app/utils/savedEstimates";
import { getCompanyInfoForPdf, type CompanyInfoForPdf } from "@/app/utils/companySettings";
import { buildEstimateDocument, type EstimateDocument } from "@/app/utils/estimateDocument";
import { isMultiTax } from "@/app/utils/taxCalculation";
import { estimatePdfFileName } from "@/app/utils/pdfFileName";
import { renderAndDownloadPdf, todaySlash, todayDash } from "@/app/utils/pdfDownload";

const MIN_ROWS = 9;

function money(n: number): string {
  return Math.round(n).toLocaleString("ja-JP");
}

export default function EstimatePreviewPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = decodeURIComponent(params.projectId);

  const [loaded, setLoaded] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [items, setItems] = useState<WorkItem[]>([]);
  const [company, setCompany] = useState<CompanyInfoForPdf | null>(null);
  const [estimateNo, setEstimateNo] = useState("");
  const [createdDate, setCreatedDate] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect --
     localStorage はマウント後にしか読めない（SSR結果との不一致を避けるため）。
     新UIの他画面と同じ読み込み方に揃えている。 */
  useEffect(() => {
    const p = projectsStore.getById(projectId);
    setProject(p ?? null);
    setItems(workItemsStore.getByProjectId(projectId));
    setCompany(getCompanyInfoForPdf());
    setEstimateNo(projectDocumentNumber(projectId, "EST", nextEstimateSeq(getSavedEstimates(), projectId)));
    setCreatedDate(todaySlash());
    setLoaded(true);
  }, [projectId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // プレビューとPDFで完全に同じ帳票モデルを使う
  const doc = useMemo<EstimateDocument | null>(() => {
    if (!project || !company || !createdDate) return null;
    return buildEstimateDocument({
      title: project.projectType === "insurance" ? "御見積書（損害復旧工事）" : "御見積書",
      estimateNo,
      createdDate,
      submitTo: project.submitTo || project.clientName || "",
      projectName: project.projectName,
      siteAddress: project.siteAddress,
      projectId: project.projectId,
      company,
      // 原価を持たない SellingLine へ変換してから渡す（データ段階で原価を遮断）
      lines: workItemsToSellingLines(items),
    });
  }, [project, company, items, estimateNo, createdDate]);

  async function handlePdf() {
    if (!doc || pdfLoading) return;
    setPdfLoading(true);
    try {
      const { makeRevoEstimatePDF } = await import("@/components/pdf/RevoEstimatePDF");
      await renderAndDownloadPdf(
        makeRevoEstimatePDF(doc),
        estimatePdfFileName({
          clientName: project?.clientName || project?.submitTo || "",
          projectName: doc.projectName,
          workContent: doc.lines[0]?.workName ?? "",
          date: todayDash(),
        }),
      );
    } catch (err) {
      console.error("見積書PDF生成エラー:", err);
      alert("PDFの生成に失敗しました。もう一度お試しください。");
    } finally {
      setPdfLoading(false);
    }
  }

  const backHref = `/new/projects/${encodeURIComponent(projectId)}/estimate`;

  if (loaded && (!project || !doc)) {
    return (
      <div>
        <PageHeader title="見積書プレビュー" back={backHref} />
        <div className="px-4 py-10 text-center">
          <p className="text-sm font-bold text-[var(--nu-text)]">案件が見つかりません。</p>
          <p className="mt-1 font-mono text-xs text-slate-400">{projectId}</p>
        </div>
      </div>
    );
  }
  if (!loaded || !doc) {
    return (
      <div>
        <PageHeader title="見積書プレビュー" back={backHref} />
        <div className="px-4 py-4"><div className="h-40 animate-pulse rounded-2xl bg-white" /></div>
      </div>
    );
  }

  const b = doc.breakdown;
  const summaryRows: Array<{ label: string; amount: number }> = [];
  if (isMultiTax(b)) {
    if (b.taxable10Subtotal > 0) {
      summaryRows.push({ label: "10%対象額", amount: b.taxable10Subtotal });
      summaryRows.push({ label: "消費税(10%)", amount: b.taxable10Tax });
    }
    if (b.taxable8Subtotal > 0) {
      summaryRows.push({ label: "8%対象額", amount: b.taxable8Subtotal });
      summaryRows.push({ label: "消費税(8%)", amount: b.taxable8Tax });
    }
    if (b.zeroRateSubtotal > 0) summaryRows.push({ label: "0%対象額", amount: b.zeroRateSubtotal });
    if (b.nonTaxableSubtotal > 0) summaryRows.push({ label: "非課税額", amount: b.nonTaxableSubtotal });
    if (b.taxExemptSubtotal > 0) summaryRows.push({ label: "不課税額", amount: b.taxExemptSubtotal });
  } else {
    summaryRows.push({ label: "小計", amount: b.subtotal });
    summaryRows.push({ label: "消費税", amount: b.taxTotal });
  }
  const fillers = Math.max(0, MIN_ROWS - doc.lines.length);

  return (
    <div data-nu-wide>
      <PageHeader
        title="見積書プレビュー"
        subtitle={`${doc.estimateNo}・保存済みの内容です`}
        back={backHref}
      />

      <div className="px-4 py-4 lg:px-8">
        <p className="mb-3 text-xs text-slate-500">
          このプレビューと発行されるPDFは同じ内容です。原価・粗利などの内部管理情報は含まれません。
        </p>

        {/* A4横の用紙。狭い画面ではこの枠の中だけが横スクロールする（ページ自体は横スクロールしない） */}
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-100 p-3">
          <div className="mx-auto w-[1060px] bg-white p-[26px] text-[10px] leading-normal text-[#1a1a1a] shadow-sm">
            {/* タイトル */}
            <div className="flex flex-col items-center pb-3">
              <h2 className="text-[23px] font-bold tracking-[0.4em] text-[#1b365d]">{doc.title}</h2>
              <div className="mt-1 w-[190px] border-b border-[#1b365d]" />
            </div>

            {/* ヘッダー */}
            <div className="flex justify-between gap-8 pb-3">
              <div className="w-[52%]">
                <div className="mb-2 border-b border-[#1a1a1a] pb-1">
                  <p className="text-[16px] font-bold">{doc.submitTo ? `${doc.submitTo}　御中` : "御中"}</p>
                </div>
                {[
                  { label: "件　　名", value: doc.projectName },
                  { label: "工事場所", value: doc.siteAddress },
                  { label: "有効期限", value: doc.validUntil },
                ].map((f) => (
                  <div key={f.label} className="mb-1 flex">
                    <span className="w-[72px] shrink-0 border-r border-[#c8cdd4] pr-1 text-[10px] text-[#404040]">{f.label}</span>
                    <span className="pl-2 text-[10.5px]">{f.value}</span>
                  </div>
                ))}
                <div className="mt-2 flex items-stretch border border-[#1b365d]">
                  <span className="bg-[#1b365d] px-3 py-1.5 text-[11px] font-bold text-white">御見積金額（税込）</span>
                  <span className="flex-1 px-3 py-1 text-right text-[16px] font-bold tabular-nums">{money(b.total)} 円</span>
                </div>
              </div>
              <div className="w-[42%] text-right">
                {[
                  { label: "見積No.", value: doc.estimateNo },
                  { label: "作成日", value: doc.createdDate },
                  { label: "案件ID", value: doc.projectId },
                ].map((m) => (
                  <div key={m.label} className="mb-0.5 flex justify-end">
                    <span className="mr-2 w-[64px] text-right text-[10px] text-[#404040]">{m.label}</span>
                    <span className="min-w-[110px] text-left text-[10.5px]">{m.value}</span>
                  </div>
                ))}
                <div className="mt-2 border-t border-[#c8cdd4] pt-1.5">
                  <p className="text-[12.5px] font-bold">{doc.company.name}</p>
                  <p className="text-[9.5px] text-[#404040]">{doc.company.postalCode}　{doc.company.address}</p>
                  <p className="text-[9.5px] text-[#404040]">{doc.company.representative}</p>
                  <p className="text-[9.5px] text-[#404040]">TEL：{doc.company.tel}　MAIL：{doc.company.email}</p>
                  <p className="text-[9.5px] text-[#404040]">インボイス登録番号：{doc.company.invoiceNumber}</p>
                </div>
              </div>
            </div>

            {/* 明細 */}
            <table className="w-full table-fixed border-collapse border-t border-[#9aa3ad] text-[9.5px]">
              <colgroup>
                <col className="w-[8%]" /><col className="w-[12%]" /><col className="w-[24%]" />
                <col className="w-[11%]" /><col className="w-[5%]" /><col className="w-[4%]" />
                <col className="w-[9%]" /><col className="w-[9%]" /><col className="w-[8%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-[#9aa3ad] bg-[#eef1f5] font-bold text-[#1b365d]">
                  {["項目", "工事名", "工事内容", "施工箇所", "数量", "単位", "単価", "小計", "消費税", "備考"].map((h) => (
                    <th key={h} className="border-l border-[#9aa3ad] px-1 py-1.5 text-center">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {doc.lines.map((line) => (
                  <tr key={line.no} className="border-b border-[#c8cdd4]">
                    <td className="border-l border-[#9aa3ad] px-1 py-1">{line.category}</td>
                    <td className="border-l border-[#c8cdd4] px-1 py-1">{line.workName}</td>
                    <td className="border-l border-[#c8cdd4] px-1 py-1">{line.workDescription}</td>
                    <td className="border-l border-[#c8cdd4] px-1 py-1">{line.location}</td>
                    <td className="border-l border-[#c8cdd4] px-1 py-1 text-right tabular-nums">{line.quantity}</td>
                    <td className="border-l border-[#c8cdd4] px-1 py-1 text-center">{line.unit}</td>
                    <td className="border-l border-[#c8cdd4] px-1 py-1 text-right tabular-nums">{money(line.unitPrice)}</td>
                    <td className="border-l border-[#c8cdd4] px-1 py-1 text-right tabular-nums">{money(line.amount)}</td>
                    <td className="border-l border-[#c8cdd4] px-1 py-1 text-right tabular-nums">{money(line.tax)}</td>
                    <td className="border-l border-r border-[#c8cdd4] px-1 py-1">{line.note}</td>
                  </tr>
                ))}
                {Array.from({ length: fillers }, (_, i) => (
                  <tr key={`f-${i}`} className="border-b border-[#c8cdd4]">
                    {Array.from({ length: 10 }, (_, c) => (
                      <td key={c} className={`px-1 py-1 ${c === 0 ? "border-l border-[#9aa3ad]" : "border-l border-[#c8cdd4]"} ${c === 9 ? "border-r" : ""}`}>&nbsp;</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 合計・備考 */}
            <div className="mt-3 flex justify-between gap-6">
              <div className="w-[55%]">
                <p className="mb-1 text-[10px] font-bold text-[#1b365d]">備考・条件</p>
                <div className="min-h-[66px] border border-[#c8cdd4] p-2">
                  {doc.remarks.map((r, i) => (
                    <p key={i} className="mb-0.5 text-[9.5px] leading-relaxed text-[#404040]">・{r}</p>
                  ))}
                </div>
              </div>
              <div className="w-[265px] border-t border-[#9aa3ad]">
                {summaryRows.map((r) => (
                  <div key={r.label} className="flex border-b border-[#c8cdd4]">
                    <span className="w-[120px] shrink-0 border-l border-r border-[#c8cdd4] bg-[#eef1f5] px-2 py-1.5 text-[10px] text-[#404040]">{r.label}</span>
                    <span className="flex-1 border-r border-[#c8cdd4] px-2 py-1.5 text-right text-[10.5px] tabular-nums">{money(r.amount)} 円</span>
                  </div>
                ))}
                <div className="flex border-b-2 border-t-2 border-[#1b365d]">
                  <span className="w-[120px] shrink-0 border-l border-r border-[#c8cdd4] bg-[#eef1f5] px-2 py-2 text-[11px] font-bold text-[#1b365d]">合計</span>
                  <span className="flex-1 border-r border-[#c8cdd4] px-2 py-2 text-right text-[14px] font-bold tabular-nums">{money(b.total)} 円</span>
                </div>
              </div>
            </div>

            {/* フッター */}
            {/* ページ番号はPDF側が実ページ数で描画する。ここで固定値を出すと不一致になるため出さない。 */}
            <div className="mt-4 border-t border-[#c8cdd4] pt-1 text-[9px] text-[#404040]">
              案件ID：{doc.projectId}　書類番号：{doc.estimateNo}
            </div>
          </div>
        </div>

        {/* 操作 */}
        <div className="mt-4 space-y-2 lg:flex lg:justify-end lg:gap-3 lg:space-y-0">
          <Link href={backHref}
            className="flex min-h-[52px] w-full items-center justify-center rounded-xl border border-[var(--nu-border)] bg-white px-6 text-sm font-semibold text-slate-600 active:bg-[var(--nu-bg)] lg:min-h-0 lg:w-auto lg:py-3">
            見積・原価入力へ戻る
          </Link>
          <button type="button" onClick={() => void handlePdf()} disabled={pdfLoading}
            className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-[#1b365d] px-8 text-sm font-bold text-white active:bg-[#16294a] disabled:opacity-60 lg:min-h-0 lg:w-auto lg:py-3">
            {pdfLoading ? "PDF作成中…" : "PDFを発行する"}
          </button>
        </div>
      </div>
    </div>
  );
}
