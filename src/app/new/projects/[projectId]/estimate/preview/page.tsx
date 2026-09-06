"use client";

// 見積書プレビュー（/new/projects/[projectId]/estimate/preview?v=<estimateId>）
//
// 操作順： 見積・原価入力 →「保存して見積書を確認」→ WorkItem本保存 → 見積(SavedEstimate)本保存
//          → 明細・税内訳スナップショット → 見積番号・version確定 → このプレビュー → PDF発行。
//
// この画面は保存済みの SavedEstimate（版）だけを読む。現在の WorkItem は読まない。
//   → 保存後に工事項目を変更しても、その版の内容・金額・税内訳は変わらない。
//
// 帳票は2モード。どちらで出すかは職人が選ぶ（REVOが自動で決めない）。
//   single     原状回復・単票型      … 1枚で工事全体が分かる
//   supervised 工事監督・リノベ型    … 表紙 / 工事内訳書 / 工種別内訳明細書
// プレビューとPDFは同じ EstimateDocument・同じ構成・同じ列を描く。
// 原価・粗利・内部管理は EstimateDocument に存在しないため、そもそも渡らない。

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "../../../../_components/PageHeader";
import { projectsStore, type Project } from "@/app/utils/projects";
import { getSavedEstimates, type SavedEstimate } from "@/app/utils/savedEstimates";
import {
  savedEstimateToSellingLines,
  savedEstimateBreakdown,
} from "@/app/utils/workItemEstimate";
import { getCompanyInfoForPdf, type CompanyInfoForPdf } from "@/app/utils/companySettings";
import {
  buildEstimateDocument,
  formatDocumentDate,
  ESTIMATE_FORM_LABELS,
  type EstimateDocument,
  type EstimateDocumentGroup,
  type EstimateFormType,
} from "@/app/utils/estimateDocument";
import { estimatePdfFileName } from "@/app/utils/pdfFileName";
import { todayDash } from "@/app/utils/pdfDownload";
import PdfActionPanel from "../../../../_components/PdfActionPanel";

const SINGLE_MIN_ROWS = 10;
const DETAIL_MIN_ROWS = 2;
const SUMMARY_MIN_ROWS = 8;

// 帳票トークン（PDF 側 RevoPdfBase と同じ考え方・ほぼモノクロ）
const RULE = "#666666";
const RULE_LIGHT = "#b0b0b0";
const HEAD_BG = "#f2f2f2";
const SUB = "#333333";

function money(n: number): string {
  return Math.round(n).toLocaleString("ja-JP");
}
function childLabel(i: number): string {
  return String.fromCharCode(97 + (i % 26));
}

export default function EstimatePreviewPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = decodeURIComponent(params.projectId);

  const [loaded, setLoaded] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [versions, setVersions] = useState<SavedEstimate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [company, setCompany] = useState<CompanyInfoForPdf | null>(null);
  const [formType, setFormType] = useState<EstimateFormType | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect --
     localStorage はマウント後にしか読めない（SSR結果との不一致を避けるため）。
     新UIの他画面と同じ読み込み方に揃えている。 */
  useEffect(() => {
    setProject(projectsStore.getById(projectId) ?? null);
    const list = getSavedEstimates()
      .filter((e) => e.projectId === projectId)
      .sort((a, b) => a.version - b.version);
    setVersions(list);
    const q = new URLSearchParams(window.location.search).get("v");
    const picked = (q && list.find((e) => e.id === q)) || list[list.length - 1] || null;
    setSelectedId(picked?.id ?? null);
    setCompany(getCompanyInfoForPdf());
    setLoaded(true);
  }, [projectId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const selected = useMemo(
    () => versions.find((e) => e.id === selectedId) ?? null,
    [versions, selectedId],
  );

  const doc = useMemo<EstimateDocument | null>(() => {
    if (!selected || !company) return null;
    return buildEstimateDocument({
      title: "御見積書",
      estimateNo: selected.estimateNo,
      createdDate: formatDocumentDate(selected.createdAt),
      submitTo: selected.clientName || "",
      projectName: selected.projectName,
      siteAddress: selected.siteAddress,
      projectId: selected.projectId,
      propertyName: project?.propertyName ?? "",
      roomNumber: project?.roomNumber ?? "",
      company,
      // 原価を持たない SellingLine へ復元してから渡す（データ段階で原価を遮断）
      lines: savedEstimateToSellingLines(selected),
      breakdown: savedEstimateBreakdown(selected),
    });
  }, [selected, company, project]);

  /**
   * PDF操作パネルへ「何を作るか」だけを渡す。
   * 生成・保存・印刷・共有の実装は pdfActions.ts / PdfActionPanel に集約している。
   * 渡すのは EstimateDocument（原価・粗利のフィールドを持たない型）だけ。
   */
  async function buildPdf() {
    if (!doc || !formType) throw new Error("見積書の種類が選ばれていません");
    const { makeRevoEstimatePDF } = await import("@/components/pdf/RevoEstimatePDF");
    return {
      element: makeRevoEstimatePDF(doc, formType),
      fileName: estimatePdfFileName({
        clientName: doc.submitTo,
        projectName: doc.projectName,
        workContent: doc.lines[0]?.workName ?? "",
        date: todayDash(),
      }),
    };
  }

  const backHref = `/new/projects/${encodeURIComponent(projectId)}/estimate`;

  if (!loaded) {
    return (
      <div>
        <PageHeader title="見積書プレビュー" back={backHref} />
        <div className="px-4 py-4"><div className="h-40 animate-pulse rounded-2xl bg-white" /></div>
      </div>
    );
  }
  if (!doc || !selected) {
    return (
      <div>
        <PageHeader title="見積書プレビュー" back={backHref} />
        <div className="px-4 py-10 text-center">
          <p className="text-sm font-bold text-[var(--nu-text)]">保存された見積がまだありません。</p>
          <p className="mt-1 text-xs text-slate-500">
            見積・原価入力で「保存して見積書を確認」を押すと、見積書として保存されます。
          </p>
          <Link href={backHref}
            className="mt-4 inline-flex min-h-[48px] items-center justify-center rounded-xl bg-[#1b365d] px-6 text-sm font-bold text-white active:bg-[#16294a]">
            見積・原価入力へ戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div data-nu-wide>
      <PageHeader
        title="見積書プレビュー"
        subtitle={`${doc.estimateNo}・v${selected.version}（保存済みの内容）`}
        back={backHref}
      />

      <div className="px-4 py-4 lg:px-8">
        {/* 版の切り替え。過去版はスナップショットのまま表示され、変更されない。 */}
        {versions.length > 1 && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">版：</span>
            {versions.map((v) => (
              <button key={v.id} type="button" onClick={() => setSelectedId(v.id)}
                className={`min-h-[36px] rounded-lg border px-3 py-1.5 font-mono text-xs font-bold ${
                  v.id === selected.id
                    ? "border-[#1b365d] bg-[#1b365d] text-white"
                    : "border-slate-200 bg-white text-slate-600 active:bg-slate-50"
                }`}>
                {v.estimateNo}（v{v.version}）
              </button>
            ))}
          </div>
        )}
        {selected.revisionReason && (
          <p className="mb-2 text-xs text-slate-500">修正理由：{selected.revisionReason}</p>
        )}

        {/* 見積書の種類。職人が選ぶ（アプリが自動で決めない） */}
        <div className="mb-3 rounded-xl border border-[var(--nu-border)] bg-white p-3">
          <p className="text-xs font-bold text-[var(--nu-text)]">見積書の種類を選んでください</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(["single", "supervised"] as EstimateFormType[]).map((t) => (
              <button key={t} type="button" onClick={() => setFormType(t)}
                className={`min-h-[52px] rounded-xl border px-3 py-2 text-left ${
                  formType === t
                    ? "border-[#1b365d] bg-[#eef4fb]"
                    : "border-slate-200 bg-white active:bg-slate-50"
                }`}>
                <span className="block text-sm font-bold text-[var(--nu-text)]">{ESTIMATE_FORM_LABELS[t]}</span>
                <span className="block text-[11px] text-slate-500">
                  {t === "single"
                    ? "1枚で工事全体が分かる書式（退去修繕・原状回復向け）"
                    : "表紙／工事内訳書／工種別内訳明細書（改修・リノベ向け）"}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            種類は発行のたびに選びます（保存されません）。同じ見積データのまま帳票の見せ方だけが変わります。
          </p>
        </div>

        {formType === null ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
            <p className="text-sm text-slate-500">上で見積書の種類を選ぶと、提出する見積書が表示されます。</p>
          </div>
        ) : (
          <>
            <p className="mb-3 text-xs text-slate-500">
              このプレビューと発行されるPDFは同じ内容です。原価・粗利などの内部管理情報は含まれません。
            </p>
            {/* A4横の用紙。狭い画面ではこの枠の中だけが横スクロールする（ページ自体は横スクロールしない） */}
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-100 p-3">
              <div className="mx-auto w-[1060px] space-y-4">
                {formType === "single" ? (
                  <SingleSheet doc={doc} />
                ) : (
                  <>
                    <CoverSheet doc={doc} />
                    <BreakdownSheet doc={doc} />
                    <DetailSheet doc={doc} />
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* PDF操作（作成 → 保存 / 印刷 / 共有） */}
        <div className="mx-auto mt-4 max-w-lg">
          {/* 版・帳票種別を変えたら作り直すため key で作り直させる */}
          <PdfActionPanel
            key={`${selected.id}:${formType ?? "none"}`}
            build={buildPdf}
            disabled={formType === null}
            disabledLabel="種類を選ぶとPDFを作成できます"
          />
          <Link href={backHref}
            className="mt-2 flex min-h-[52px] w-full items-center justify-center rounded-xl border border-[var(--nu-border)] bg-white px-6 text-sm font-semibold text-slate-600 active:bg-[var(--nu-bg)]">
            見積・原価入力へ戻る
          </Link>
        </div>
      </div>
    </div>
  );
}

// ══════════════ 帳票の共通パーツ（PDF と同じ構成） ══════════════

function Paper({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white p-[30px] text-[10px] leading-normal text-black shadow-sm">
      {children}
    </div>
  );
}

function TitleBar({
  title, leftLabel, leftValue, rightLabel, rightValue,
}: { title: string; leftLabel: string; leftValue: string; rightLabel: string; rightValue: string }) {
  return (
    <div className="mb-4 flex items-start">
      <div className="w-1/4 text-[10.5px]">{leftLabel}：{leftValue}</div>
      <div className="flex flex-1 flex-col items-center">
        <h2 className="text-[21px] font-bold tracking-[0.45em]">{title}</h2>
        <div className="mt-1 w-[210px] border-b border-black" />
      </div>
      <div className="w-1/4 text-right text-[10.5px]">{rightLabel}：{rightValue}</div>
    </div>
  );
}

function Addressee({ name }: { name: string }) {
  return (
    <div className="mb-3 inline-block min-w-[250px] border-b border-black pb-0.5">
      <span className="text-[16px]">{name}</span>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-[3px] flex items-start">
      <span className="w-[78px] shrink-0 text-[10px]" style={{ color: SUB }}>{label}</span>
      <span className="w-[8px] shrink-0 text-[10px]" style={{ color: SUB }}>：</span>
      {value
        ? <span className="flex-1 text-[10.5px]">{value}</span>
        : <span className="mt-2 h-[1px] flex-1" style={{ borderBottom: `1px solid ${RULE_LIGHT}` }} />}
    </div>
  );
}

function CompanyBlock({ doc }: { doc: EstimateDocument }) {
  const c = doc.company;
  return (
    <div>
      <p className="mb-0.5 text-[13.5px] font-bold">{c.name}</p>
      <p className="text-[10px]" style={{ color: SUB }}>{c.postalCode}　{c.address}</p>
      <p className="text-[10px]" style={{ color: SUB }}>{c.representative}</p>
      <p className="text-[10px]" style={{ color: SUB }}>TEL：{c.tel}</p>
      <p className="text-[10px]" style={{ color: SUB }}>MAIL：{c.email}</p>
      <p className="text-[10px]" style={{ color: SUB }}>インボイス登録番号：{c.invoiceNumber}</p>
    </div>
  );
}

function AmountBox({
  label, amount, sub,
}: { label: string; amount: number; sub?: Array<{ label: string; amount: number }> }) {
  return (
    <div className="inline-block border border-black">
      <div className="px-[13px] py-[5px] text-[10.5px]" style={{ background: HEAD_BG, borderBottom: `1px solid ${RULE}` }}>
        {label}
      </div>
      <div className="min-w-[215px] px-[18px] py-[9px] text-right text-[21px] font-bold tabular-nums">
        {money(amount)} 円
      </div>
      {sub?.map((s) => (
        <div key={s.label} className="flex" style={{ borderTop: `1px solid ${RULE_LIGHT}` }}>
          <span className="w-[98px] shrink-0 px-[10px] py-[4px] text-[10px]"
            style={{ color: SUB, borderRight: `1px solid ${RULE_LIGHT}` }}>{s.label}</span>
          <span className="flex-1 px-[10px] py-[4px] text-right text-[10.5px] tabular-nums">{money(s.amount)} 円</span>
        </div>
      ))}
    </div>
  );
}

function TotalsBox({ doc, labels }: { doc: EstimateDocument; labels: { sub: string; tax: string; total: string } }) {
  const b = doc.breakdown;
  const rows: Array<{ label: string; amount: number }> = [];
  if (b.taxable10Subtotal > 0 && b.taxable8Subtotal > 0) {
    rows.push({ label: "10%対象額", amount: b.taxable10Subtotal });
    rows.push({ label: "消費税(10%)", amount: b.taxable10Tax });
    rows.push({ label: "8%対象額", amount: b.taxable8Subtotal });
    rows.push({ label: "消費税(8%)", amount: b.taxable8Tax });
  } else {
    rows.push({ label: labels.sub, amount: b.subtotal });
    rows.push({ label: labels.tax, amount: b.taxTotal });
  }
  if (b.nonTaxableSubtotal > 0) rows.push({ label: "非課税額", amount: b.nonTaxableSubtotal });
  if (b.taxExemptSubtotal > 0) rows.push({ label: "不課税額", amount: b.taxExemptSubtotal });

  return (
    <div className="w-[290px]" style={{ border: `1px solid ${RULE}` }}>
      {rows.map((r) => (
        <div key={r.label} className="flex" style={{ borderBottom: `1px solid ${RULE_LIGHT}` }}>
          <span className="w-[136px] shrink-0 px-[10px] py-[6px] text-[10px]"
            style={{ color: SUB, background: HEAD_BG, borderRight: `1px solid ${RULE_LIGHT}` }}>{r.label}</span>
          <span className="flex-1 px-[10px] py-[6px] text-right text-[10.5px] tabular-nums">{money(r.amount)} 円</span>
        </div>
      ))}
      <div className="flex" style={{ borderTop: `1px solid ${RULE}` }}>
        <span className="w-[136px] shrink-0 px-[10px] py-[8px] text-[11px] font-bold"
          style={{ background: HEAD_BG, borderRight: `1px solid ${RULE_LIGHT}` }}>{labels.total}</span>
        <span className="flex-1 px-[10px] py-[8px] text-right text-[14px] font-bold tabular-nums">{money(b.total)} 円</span>
      </div>
    </div>
  );
}

function NotesAndTotals({ doc, labels }: { doc: EstimateDocument; labels: { sub: string; tax: string; total: string } }) {
  return (
    <div className="mt-3 flex items-start justify-between gap-6">
      <div className="w-[55%]">
        <p className="mb-1 text-[10px]" style={{ color: SUB }}>備考・条件</p>
        <div className="min-h-[62px] p-2" style={{ border: `1px solid ${RULE_LIGHT}` }}>
          {doc.remarks.map((r, i) => (
            <p key={i} className="mb-0.5 text-[9.5px] leading-relaxed" style={{ color: SUB }}>・{r}</p>
          ))}
        </div>
      </div>
      <TotalsBox doc={doc} labels={labels} />
    </div>
  );
}

function Footer({ doc }: { doc: EstimateDocument }) {
  return (
    <div className="mt-4 flex justify-between pt-1 text-[9px]"
      style={{ color: SUB, borderTop: `1px solid ${RULE_LIGHT}` }}>
      <span>見積番号：{doc.estimateNo}</span>
      <span className="text-slate-400">ページ番号はPDFに付きます</span>
    </div>
  );
}

const thCls = "px-1 py-[6px] text-center text-[9.5px] font-normal";
const tdCls = "px-1 py-[5px] text-[9.5px] align-top";

function Th({ w, children }: { w: string; children: React.ReactNode }) {
  return <th className={thCls} style={{ width: w, borderRight: `1px solid ${RULE}` }}>{children}</th>;
}
function Td({ children, align = "left", bold }: { children?: React.ReactNode; align?: "left" | "right" | "center"; bold?: boolean }) {
  return (
    <td className={`${tdCls} ${align === "right" ? "text-right tabular-nums" : align === "center" ? "text-center" : ""} ${bold ? "font-bold" : ""}`}
      style={{ borderRight: `1px solid ${RULE_LIGHT}` }}>{children ?? " "}</td>
  );
}

function Table({ head, children }: { head: React.ReactNode; children: React.ReactNode }) {
  return (
    <table className="w-full table-fixed border-collapse" style={{ border: `1px solid ${RULE}` }}>
      <thead>
        <tr style={{ background: HEAD_BG, borderBottom: `1px solid ${RULE}` }}>{head}</tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function FillerRows({ count, cols }: { count: number; cols: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <tr key={`f-${i}`} style={{ borderBottom: `1px solid ${RULE_LIGHT}` }}>
          {Array.from({ length: cols }, (_, c) => <Td key={c} />)}
        </tr>
      ))}
    </>
  );
}

// ══════════════ 単票型 ══════════════

function SingleSheet({ doc }: { doc: EstimateDocument }) {
  const fillers = Math.max(0, SINGLE_MIN_ROWS - doc.lines.length);
  return (
    <Paper>
      <TitleBar title={doc.title} leftLabel="見積番号" leftValue={doc.estimateNo}
        rightLabel="発行日" rightValue={doc.createdDate} />
      <div className="mb-4 flex justify-between gap-8">
        <div className="w-[56%]">
          <Addressee name={doc.submitTo ? `${doc.submitTo}　御中` : "御中"} />
          <Field label="物件名" value={doc.propertyName || doc.projectName} />
          <Field label="号室" value={doc.roomNumber} />
          <Field label="住所" value={doc.siteAddress} />
          <Field label="件名" value={doc.projectName} />
          <Field label="有効期限" value={doc.validUntil} />
        </div>
        <div className="w-[40%]">
          <CompanyBlock doc={doc} />
          <div className="mt-3 flex justify-end">
            <AmountBox label="御見積総額（税込）" amount={doc.breakdown.total} />
          </div>
        </div>
      </div>

      <Table head={<>
        <Th w="11%">項目</Th><Th w="26%">工事内容</Th><Th w="13%">範囲</Th><Th w="6%">数量</Th>
        <Th w="5%">単位</Th><Th w="9%">単価</Th><Th w="10%">金額</Th><Th w="20%">備考</Th>
      </>}>
        {doc.groups.map((g) =>
          g.lines.map((line, i) => (
            <tr key={line.no} style={{ borderBottom: `1px solid ${RULE_LIGHT}` }}>
              <Td bold={i === 0}>{i === 0 ? g.label : undefined}</Td>
              <Td>{[line.workName, line.workDescription].filter(Boolean).join("　")}</Td>
              <Td>{line.location}</Td>
              <Td align="right">{line.quantity}</Td>
              <Td align="center">{line.unit}</Td>
              <Td align="right">{money(line.unitPrice)}</Td>
              <Td align="right">{money(line.amount)}</Td>
              <Td>{line.note}</Td>
            </tr>
          )),
        )}
        <FillerRows count={fillers} cols={8} />
      </Table>

      <NotesAndTotals doc={doc} labels={{ sub: "税　抜", tax: "消 費 税", total: "総　額" }} />
      <Footer doc={doc} />
    </Paper>
  );
}

// ══════════════ 工事監督・リノベーション型 ══════════════

function CoverSheet({ doc }: { doc: EstimateDocument }) {
  const b = doc.breakdown;
  return (
    <Paper>
      <TitleBar title={doc.title} leftLabel="見積番号" leftValue={doc.estimateNo}
        rightLabel="発行日" rightValue={doc.createdDate} />
      <div className="flex justify-between gap-8">
        <div className="w-[56%]">
          <Addressee name={doc.submitTo ? `${doc.submitTo}　御中` : "御中"} />
          <Field label="工事名称" value={doc.projectName} />
          <Field label="工事場所" value={doc.siteAddress} />
          <Field label="物件名" value={doc.propertyName} />
          <Field label="号室" value={doc.roomNumber} />
          <Field label="工期" value="" />
          <Field label="支払条件" value="" />
          <Field label="有効期限" value={doc.validUntil} />
          <Field label="担当者" value={doc.company.representative} />
          <Field label="備考" value="" />
        </div>
        <div className="w-[40%]">
          <CompanyBlock doc={doc} />
          <div className="mt-3 flex justify-end">
            <AmountBox label="御見積金額（税込）" amount={b.total}
              sub={[{ label: "工事代金", amount: b.subtotal }, { label: "消費税", amount: b.taxTotal }]} />
          </div>
        </div>
      </div>
      <Footer doc={doc} />
    </Paper>
  );
}

function SectionHead({ title, doc }: { title: string; doc: EstimateDocument }) {
  return (
    <div>
      <h3 className="text-center text-[15px] font-bold tracking-[0.3em]">{title}</h3>
      <div className="mx-auto mt-1 w-[150px] border-b border-black" />
      <div className="mt-2 mb-2 flex justify-between text-[10px]" style={{ color: SUB }}>
        <span>工事名称：{doc.projectName}</span>
        <span>見積番号：{doc.estimateNo}　発行日：{doc.createdDate}</span>
      </div>
    </div>
  );
}

function BreakdownSheet({ doc }: { doc: EstimateDocument }) {
  const fillers = Math.max(0, SUMMARY_MIN_ROWS - doc.groups.length);
  return (
    <Paper>
      <SectionHead title="工事内訳書" doc={doc} />
      <Table head={<>
        <Th w="6%">NO</Th><Th w="34%">項目</Th><Th w="7%">数量</Th><Th w="6%">単位</Th>
        <Th w="12%">単価</Th><Th w="13%">金額</Th><Th w="22%">備考</Th>
      </>}>
        {doc.groups.map((g, i) => (
          <tr key={g.code} style={{ borderBottom: `1px solid ${RULE_LIGHT}` }}>
            <Td align="center">{i + 1}</Td>
            <Td>{g.label}</Td>
            <Td align="right">1</Td>
            <Td align="center">式</Td>
            <Td align="right">{money(g.subtotal)}</Td>
            <Td align="right">{money(g.subtotal)}</Td>
            <Td>{`内訳明細書 ${g.code} 参照`}</Td>
          </tr>
        ))}
        <FillerRows count={fillers} cols={7} />
      </Table>
      <NotesAndTotals doc={doc} labels={{ sub: "小　計", tax: "消 費 税", total: "合　計" }} />
      <Footer doc={doc} />
    </Paper>
  );
}

function DetailGroupTable({ group }: { group: EstimateDocumentGroup }) {
  const fillers = Math.max(0, DETAIL_MIN_ROWS - group.lines.length);
  return (
    <Table head={<>
      <Th w="5%">NO</Th><Th w="22%">名称</Th><Th w="26%">仕様・摘要</Th><Th w="7%">数量</Th>
      <Th w="5%">単位</Th><Th w="10%">単価</Th><Th w="11%">金額</Th><Th w="14%">備考</Th>
    </>}>
      <tr style={{ borderBottom: `1px solid ${RULE_LIGHT}` }}>
        <Td align="center" bold>{group.code}</Td>
        <td className={`${tdCls} font-bold`} colSpan={7}>{group.label}</td>
      </tr>
      {group.lines.map((line, i) => (
        <tr key={line.no} style={{ borderBottom: `1px solid ${RULE_LIGHT}` }}>
          <Td align="center">{childLabel(i)}</Td>
          <Td>{line.workName}</Td>
          <Td>{[line.workDescription, line.location].filter(Boolean).join("　/　")}</Td>
          <Td align="right">{line.quantity}</Td>
          <Td align="center">{line.unit}</Td>
          <Td align="right">{money(line.unitPrice)}</Td>
          <Td align="right">{money(line.amount)}</Td>
          <Td>{line.note}</Td>
        </tr>
      ))}
      <FillerRows count={fillers} cols={8} />
      <tr style={{ borderTop: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}` }}>
        <Td />
        <Td bold>{group.label}　計</Td>
        <Td /><Td /><Td /><Td />
        <Td align="right" bold>{money(group.subtotal)}</Td>
        <Td />
      </tr>
    </Table>
  );
}

function DetailSheet({ doc }: { doc: EstimateDocument }) {
  return (
    <Paper>
      <SectionHead title="工種別内訳明細書" doc={doc} />
      <div className="space-y-3">
        {doc.groups.map((g) => <DetailGroupTable key={g.code} group={g} />)}
      </div>
      <Footer doc={doc} />
    </Paper>
  );
}
