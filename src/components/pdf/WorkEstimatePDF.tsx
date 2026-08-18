// 損害復旧工事見積書 / 見積明細書 PDF（WorkItem から生成）
// 提出用のみ — 原価・粗利は props に含めない設計（型レベルで排除）
//
// 帳票名は案件種別で切り替える:
//   保険案件 → 「損害復旧工事 見積明細書」
//   通常案件 → 「見積明細書」

import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import {
  ACCENT,
  fmtYen,
  safePdfUnit,
  pdfPageStyle,
  pdfTableStyle,
  PdfDocumentHeader,
  PdfTaxBreakdownSummary,
  PdfFooter,
  PdfPageNumber,
  type CommonDocumentProps,
} from './PdfCommon';
import { groupLinesByCategory } from '@/components/sheets/estimateCategoryGroups';
import {
  taxTypeLabel,
  normalizeTaxType,
  normalizeTaxRate,
  type TaxType,
  type TaxRate,
  type TaxBreakdown,
} from '@/app/utils/taxCalculation';
import { estimateColumn } from '@/components/sheets/estimateSheetColumns';

/** 提出用の明細行（原価・粗利のフィールドを持たない） */
export type SellingLine = {
  workItemId: string;
  category: string;
  workName: string;
  workDescription: string;
  location1: string;
  location2: string;
  quantity: number;
  unit: string;
  sellingUnitPrice: number;
  sellingAmount: number;
  note: string;
  taxType: TaxType;
  taxRate: TaxRate;
};

export type WorkEstimatePDFProps = CommonDocumentProps & {
  lines: SellingLine[];
  subtotalSum: number;
  taxSum: number;
  totalWithTax: number;
  taxBreakdown: TaxBreakdown;
};

/**
 * 明細の消費税列（表示用・その行の税率のみ）。合計は breakdown 側で税率別に集計する。
 * 画面側の帳票表示でも同じ値を出す必要があるため export している（重複実装を避けるため）。
 */
export function lineTaxForDisplay(line: SellingLine): number {
  const type = normalizeTaxType(line.taxType);
  if (type !== 'taxable') return 0;
  const rate = normalizeTaxRate(line.taxRate);
  return Math.floor((line.sellingAmount * rate) / 100);
}

/** 備考へ付ける税区分マーク（課税10%は既定のため付けない） */
function taxNoteMark(line: SellingLine): string {
  const type = normalizeTaxType(line.taxType);
  const rate = normalizeTaxRate(line.taxRate);
  if (type === 'taxable' && rate === 10) return '';
  if (type === 'taxable') return `課税${rate}%`;
  return taxTypeLabel(type);
}

// 列の幅は共通定義（estimateSheetColumns.ts）から取る。
// 見た目を変えないため、StyleSheet へ渡す形と値は改修前と同一にしている。
const col = StyleSheet.create({
  cCat:   { width: estimateColumn('category').width },
  cName:  { width: estimateColumn('workName').width },
  cDesc:  { width: estimateColumn('workDescription').width },
  cLoc:   { width: estimateColumn('location').width },
  cQty:   { width: estimateColumn('quantity').width },
  cUnit:  { width: estimateColumn('unit').width },
  cPrice: { width: estimateColumn('unitPrice').width },
  cSub:   { width: estimateColumn('subtotal').width },
  cTax:   { width: estimateColumn('tax').width },
  cNote:  { width: estimateColumn('note').width },
});

/** 共通定義の align を react-pdf のスタイルへ変換する。left は既定なので空スタイルを返す。 */
function alignStyle(id: string): { textAlign?: 'center' | 'right' } {
  const a = estimateColumn(id).align;
  return a === 'left' ? {} : { textAlign: a };
}

export function SellingLinesTable({ lines }: { lines: SellingLine[] }) {
  const t = pdfTableStyle;
  return (
    <View style={t.table}>
      <View style={t.tableHeaderRow}>
        <Text style={[t.th, col.cCat]}>{estimateColumn('category').label}</Text>
        <Text style={[t.th, col.cName]}>{estimateColumn('workName').label}</Text>
        <Text style={[t.th, col.cDesc]}>{estimateColumn('workDescription').label}</Text>
        <Text style={[t.th, col.cLoc]}>{estimateColumn('location').label}</Text>
        <Text style={[t.th, col.cQty, alignStyle('quantity')]}>{estimateColumn('quantity').label}</Text>
        <Text style={[t.th, col.cUnit, alignStyle('unit')]}>{estimateColumn('unit').label}</Text>
        <Text style={[t.th, col.cPrice, alignStyle('unitPrice')]}>{estimateColumn('unitPrice').label}</Text>
        <Text style={[t.th, col.cSub, alignStyle('subtotal')]}>{estimateColumn('subtotal').label}</Text>
        <Text style={[t.th, col.cTax, alignStyle('tax')]}>{estimateColumn('tax').label}</Text>
        <Text style={[t.th, col.cNote]}>{estimateColumn('note').label}</Text>
      </View>
      {lines.map((line, i) => {
        const tax = lineTaxForDisplay(line);
        const location =
          line.location1 && line.location2
            ? `${line.location1} / ${line.location2}`
            : line.location1 || line.location2 || '';
        const mark = taxNoteMark(line);
        const noteText = [line.note, mark].filter(Boolean).join(mark && line.note ? ' / ' : '');
        const rowStyle = i % 2 === 1 ? [t.tableRow, t.tableRowEven] : t.tableRow;
        return (
          <View key={line.workItemId} style={rowStyle} wrap={false}>
            <Text style={[t.td, col.cCat]}>{line.category}</Text>
            <Text style={[t.td, col.cName]}>{line.workName}</Text>
            <Text style={[t.td, col.cDesc]}>{line.workDescription}</Text>
            <Text style={[t.td, col.cLoc]}>{location}</Text>
            <Text style={[t.tdR, col.cQty]}>{String(line.quantity)}</Text>
            <Text style={[t.tdC, col.cUnit]}>{safePdfUnit(line.unit)}</Text>
            <Text style={[t.tdR, col.cPrice]}>{fmtYen(line.sellingUnitPrice)}</Text>
            <Text style={[t.tdR, col.cSub]}>{fmtYen(line.sellingAmount)}</Text>
            <Text style={[t.tdR, col.cTax]}>{fmtYen(tax)}</Text>
            <Text style={[t.td, col.cNote]}>{noteText}</Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * 工種セクションの見出し。
 * fixed で各ページの先頭に繰り返し、2ページ目以降は「（続き）」を付ける。
 * subPageNumber はその <Page> 要素内での通し番号。
 */
function CategoryHeading({ label }: { label: string }) {
  return (
    <Text
      style={sec.heading}
      fixed
      render={({ subPageNumber }) =>
        subPageNumber && subPageNumber > 1 ? `【${label}】（続き）` : `【${label}】`
      }
    />
  );
}

/** 工種小計。表の直後に置くことで、その工種の最終ページへ自然に流れる。 */
function CategorySubtotal({ label, total }: { label: string; total: number }) {
  return (
    <View style={sec.subtotalRow} wrap={false}>
      <Text style={sec.subtotalLabel}>{label} 小計（税込）</Text>
      <Text style={sec.subtotalAmount}>{fmtYen(total)}</Text>
    </View>
  );
}

const sec = StyleSheet.create({
  heading: {
    fontSize: 11,
    fontFamily: 'NotoSansJP',
    fontWeight: 700,
    color: ACCENT,
    marginBottom: 4,
    paddingTop: 2,
  },
  subtotalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 10,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: ACCENT,
  },
  subtotalLabel: { fontSize: 9, color: ACCENT, marginRight: 12 },
  subtotalAmount: { fontSize: 12, fontWeight: 700, color: ACCENT },
});

function WorkEstimatePDFDocument(props: WorkEstimatePDFProps) {
  // 明細を工種セクションへ分ける。並びはマスタの displayOrder 順（諸経費が最後）。
  const groups = groupLinesByCategory(props.lines);
  // 工種が1つも解決できない場合でも帳票を出せるようにする
  const sections = groups.length > 0 ? groups : [];

  return (
    <Document>
      {sections.map((g, i) => {
        const isLast = i === sections.length - 1;
        return (
          // 1つの <Page> 要素は内容量に応じて複数の物理ページへ自動分割される。
          // つまり「工種＝セクション」であり、1工種が複数ページに渡ってよい。
          <Page
            key={g.categoryId}
            size="A4"
            orientation="landscape"
            style={pdfPageStyle.pageWithFooter}
          >
            {/* 帳票ヘッダーは最初のセクションにのみ全体情報を出す */}
            {i === 0 && (
              <PdfDocumentHeader
                documentTitle={props.documentTitle}
                submitTo={props.submitTo}
                projectName={props.projectName}
                siteAddress={props.siteAddress}
                documentInfo={[
                  { label: '見積番号', value: props.documentNumber },
                  { label: '作成日', value: props.createdDate },
                ]}
                companyInfo={props.companyInfo}
                totalBox={{ label: '税込見積金額', amount: props.totalWithTax }}
              />
            )}

            <CategoryHeading label={g.categoryLabel} />
            <SellingLinesTable lines={g.lines} />
            <CategorySubtotal label={g.categoryLabel} total={g.total} />

            {/* 見積全体の小計・消費税・税込合計は最後のセクションにだけ出す */}
            {isLast && <PdfTaxBreakdownSummary breakdown={props.taxBreakdown} />}

            <PdfFooter projectId={props.projectId} documentNumber={props.documentNumber} />
            <PdfPageNumber />
          </Page>
        );
      })}
    </Document>
  );
}

export function makeWorkEstimatePDF(props: WorkEstimatePDFProps): React.ReactElement {
  return <WorkEstimatePDFDocument {...props} />;
}
