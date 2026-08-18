"use client";

// 見積明細書の帳票そのもの（PC向け）。
//
// 工種をセクションとして構成し、A4横の用紙を複数枚並べる。
// 工種の分類・並び順・工種小計・全体合計は PDF と同じ処理を使う:
//   groupLinesByCategory（estimateCategoryGroups.ts）
//   computeEstimateTotals（workItemEstimate.ts / 既存）
// 画面側で独自の分類・集計は行わない。
//
// 提出用の画面なので、原価を持つ CategoryProfitSummary は参照しない。
//
// 段3-2B の目的は見た目の確認。保存処理は行わない。

import { SheetCell } from "./SheetCell";
import { ComboBox } from "./ComboBox";
import { ESTIMATE_COLUMNS } from "./estimateSheetColumns";
import { estimateCellValue, locationCell, noteCell } from "./estimateCellAccessors";
import { screenYen } from "./estimateCellFormat";
import { sheetOptions } from "./sheetOptions";
import { groupLinesByCategory } from "./estimateCategoryGroups";
import { paginateSheet, type SheetBlock, type SheetPage } from "./estimateSheetPagination";
import { computeEstimateTotals } from "@/app/utils/workItemEstimate";
import type { SellingLine } from "@/components/pdf/WorkEstimatePDF";
import type { CompanyInfoForPDF } from "@/components/pdf/PdfCommon";

export type EstimateSheetHeader = {
  documentTitle: string;
  submitTo: string;
  projectName: string;
  siteAddress: string;
  documentNumber: string;
  createdDate: string;
  companyInfo: CompanyInfoForPDF;
};

/**
 * そのページに載っている工種名。1ページに複数工種が載ることは無い設計だが、
 * 将来そうなっても壊れないよう「・」で連結する。継続ページは（続き）を添える。
 */
function pageCategoryLabel(page: SheetPage): string {
  if (page.blocks.length === 0) return "";
  return page.blocks
    .map((b) => `【${b.group.categoryLabel}】${b.isContinuation ? "（続き）" : ""}`)
    .join("・");
}

/** 明細セルの編集対象フィールド（列ID → SellingLine のフィールド） */
const FIELD_OF: Record<string, keyof SellingLine> = {
  category: "category",
  workName: "workName",
  workDescription: "workDescription",
  quantity: "quantity",
  unit: "unit",
  unitPrice: "sellingUnitPrice",
  note: "note",
};

export function EstimateSheet({
  header,
  lines,
  onHeaderChange,
  onLineChange,
  onAddLine,
}: {
  header: EstimateSheetHeader;
  lines: SellingLine[];
  onHeaderChange: (field: keyof EstimateSheetHeader, v: string) => void;
  /** 元の lines 配列での添字を渡す */
  onLineChange: (index: number, field: keyof SellingLine, v: string) => void;
  onAddLine: (categoryName: string) => void;
}) {
  // PDF と同じ処理で工種セクションを作る
  const groups = groupLinesByCategory(lines);
  const pages = paginateSheet(groups);
  // 全体合計も既存の計算関数へ委譲する
  const totals = computeEstimateTotals(lines);

  // 編集時に元配列の添字へ戻すための対応表
  const indexOf = new Map<string, number>();
  lines.forEach((l, i) => indexOf.set(l.workItemId, i));

  return (
    <div className="sheet-stack">
      {pages.map((page) => (
        <div key={page.pageNumber} className="sheet-paper">
          {page.showHeader && <SheetHeader header={header} total={totals.total} onChange={onHeaderChange} />}

          {page.blocks.map((block, bi) => (
            <SectionBlock
              key={`${block.group.categoryId}-${bi}`}
              block={block}
              indexOf={indexOf}
              onLineChange={onLineChange}
              onAddLine={onAddLine}
            />
          ))}

          {page.showGrandTotal && (
            <div className="sheet-totals">
              <div className="sheet-totals-box">
                <div className="sheet-totals-row">
                  <span>小計</span>
                  <span>{screenYen(totals.subtotal)}</span>
                </div>
                <div className="sheet-totals-row">
                  <span>消費税</span>
                  <span>{screenYen(totals.tax)}</span>
                </div>
                <div className="sheet-totals-row is-grand">
                  <span>税込合計</span>
                  <span>{screenYen(totals.total)}</span>
                </div>
              </div>
            </div>
          )}

          <p className="sheet-footer">
            <span>書類番号：<span className="sheet-mono">{header.documentNumber}</span></span>
            {/* 現在位置が直感的に分かるよう、ページ番号に現在の工種を併記する */}
            <span className="sheet-pageno">
              <span className="sheet-pageno-cat">{pageCategoryLabel(page)}</span>
              <span className="sheet-mono">
                {page.pageNumber} / {pages.length}
              </span>
            </span>
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── 帳票ヘッダー（1ページ目のみ） ─────────────────────────────
function SheetHeader({
  header,
  total,
  onChange,
}: {
  header: EstimateSheetHeader;
  total: number;
  onChange: (field: keyof EstimateSheetHeader, v: string) => void;
}) {
  return (
    <div className="sheet-head">
      <div className="sheet-head-left">
        <h1 className="sheet-title">{header.documentTitle}</h1>
        <dl className="sheet-fields">
          <dt>提出先</dt>
          <dd>
            <input
              value={header.submitTo}
              onChange={(e) => onChange("submitTo", e.target.value)}
              className="sheet-cell-input sheet-field-strong"
            />
          </dd>
          <dt>案件名</dt>
          <dd>
            <input
              value={header.projectName}
              onChange={(e) => onChange("projectName", e.target.value)}
              className="sheet-cell-input"
            />
          </dd>
          <dt>現場住所</dt>
          <dd>
            <input
              value={header.siteAddress}
              onChange={(e) => onChange("siteAddress", e.target.value)}
              className="sheet-cell-input"
            />
          </dd>
        </dl>
      </div>

      <div className="sheet-head-right">
        <dl className="sheet-docinfo">
          <dt>見積番号</dt>
          <dd className="sheet-mono">{header.documentNumber}</dd>
          <dt>作成日</dt>
          <dd>
            <input
              type="date"
              value={header.createdDate}
              onChange={(e) => onChange("createdDate", e.target.value)}
              className="sheet-cell-input sheet-date"
            />
          </dd>
        </dl>

        <div className="sheet-company">
          <p className="sheet-company-name">{header.companyInfo.name}</p>
          <p>{header.companyInfo.postalCode}</p>
          <p>{header.companyInfo.address}</p>
          <p>{header.companyInfo.representative}</p>
          <p>TEL：{header.companyInfo.tel}</p>
          <p className="sheet-invoice-no">登録番号：{header.companyInfo.invoiceNumber}</p>
        </div>

        <div className="sheet-total-box">
          <p className="sheet-total-label">税込見積金額</p>
          <p className="sheet-total-amount">{screenYen(total)}</p>
        </div>
      </div>
    </div>
  );
}

// ─── 工種セクションの1ページ分 ────────────────────────────────
function SectionBlock({
  block,
  indexOf,
  onLineChange,
  onAddLine,
}: {
  block: SheetBlock;
  indexOf: Map<string, number>;
  onLineChange: (index: number, field: keyof SellingLine, v: string) => void;
  onAddLine: (categoryName: string) => void;
}) {
  const { group, lines, isContinuation, showSubtotal } = block;

  return (
    <section className="sheet-section">
      <h2 className="sheet-section-heading">
        【{group.categoryLabel}】{isContinuation && <span className="sheet-cont">（続き）</span>}
      </h2>

      {lines.length > 0 && (
        <table className="sheet-table">
          <colgroup>
            {ESTIMATE_COLUMNS.map((c) => (
              <col key={c.id} style={{ width: c.width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {ESTIMATE_COLUMNS.map((c) => (
                <th key={c.id} style={{ textAlign: c.align }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const idx = indexOf.get(line.workItemId) ?? -1;
              const loc = locationCell(line);
              const note = noteCell(line);
              return (
                <tr key={line.workItemId}>
                  {ESTIMATE_COLUMNS.map((c) => {
                    // 施工箇所：2つの入力部品を同じセル内に並べる
                    if (c.id === "location") {
                      return (
                        <td key={c.id} className="sheet-td sheet-td-split">
                          <ComboBox
                            value={loc.location1}
                            options={sheetOptions("location1")}
                            onChange={(v) => onLineChange(idx, "location1", v)}
                          />
                          <ComboBox
                            value={loc.location2}
                            options={sheetOptions("location2")}
                            onChange={(v) => onLineChange(idx, "location2", v)}
                          />
                        </td>
                      );
                    }
                    // 備考：ユーザー入力と自動表示の税区分を分ける
                    if (c.id === "note") {
                      return (
                        <td key={c.id} className="sheet-td">
                          <SheetCell
                            column={c}
                            value={note.note}
                            editable
                            onChange={(v) => onLineChange(idx, "note", v)}
                          />
                          {note.mark && <span className="sheet-tax-mark">{note.mark}</span>}
                        </td>
                      );
                    }
                    const field = FIELD_OF[c.id];
                    return (
                      <td key={c.id} className="sheet-td">
                        <SheetCell
                          column={c}
                          value={estimateCellValue(line, c.id)}
                          editable={c.control !== "readonly"}
                          onChange={field ? (v) => onLineChange(idx, field, v) : undefined}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {/* 行追加はその工種の最終ページにだけ置く（どの工種へ足すか明確にする） */}
            {showSubtotal && (
              <tr className="sheet-addrow">
                <td colSpan={ESTIMATE_COLUMNS.length}>
                  <button
                    type="button"
                    onClick={() => onAddLine(group.categoryLabel)}
                    className="sheet-addrow-btn"
                  >
                    ＋ {group.categoryLabel}に明細行を追加
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {showSubtotal && (
        <div className="sheet-subtotal">
          <span className="sheet-subtotal-label">{group.categoryLabel} 小計（税込）</span>
          <span className="sheet-subtotal-amount">{screenYen(group.total)}</span>
        </div>
      )}
    </section>
  );
}
