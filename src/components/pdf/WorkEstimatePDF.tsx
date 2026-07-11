// 損害復旧工事見積書 / 見積明細書 PDF（WorkItem から生成）
// 提出用のみ — 原価・粗利は props に含めない設計（型レベルで排除）
//
// 帳票名は案件種別で切り替える:
//   保険案件 → 「損害復旧工事 見積明細書」
//   通常案件 → 「見積明細書」

import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import {
  fmtYen,
  safePdfUnit,
  pdfPageStyle,
  pdfTableStyle,
  PdfDocumentHeader,
  PdfTaxSummary,
  PdfFooter,
  PdfPageNumber,
  type CommonDocumentProps,
} from './PdfCommon';

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
};

export type WorkEstimatePDFProps = CommonDocumentProps & {
  lines: SellingLine[];
  subtotalSum: number;
  taxSum: number;
  totalWithTax: number;
};

const col = StyleSheet.create({
  cCat:   { width: '9%' },
  cName:  { width: '11%' },
  cDesc:  { width: '24%' },
  cLoc:   { width: '11%' },
  cQty:   { width: '5%' },
  cUnit:  { width: '5%' },
  cPrice: { width: '9%' },
  cSub:   { width: '9%' },
  cTax:   { width: '9%' },
  cNote:  { width: '8%' },
});

export function SellingLinesTable({ lines }: { lines: SellingLine[] }) {
  const t = pdfTableStyle;
  return (
    <View style={t.table}>
      <View style={t.tableHeaderRow}>
        <Text style={[t.th, col.cCat]}>項目</Text>
        <Text style={[t.th, col.cName]}>工事名</Text>
        <Text style={[t.th, col.cDesc]}>工事内容</Text>
        <Text style={[t.th, col.cLoc]}>施工箇所</Text>
        <Text style={[t.th, col.cQty, { textAlign: 'right' }]}>数量</Text>
        <Text style={[t.th, col.cUnit, { textAlign: 'center' }]}>単位</Text>
        <Text style={[t.th, col.cPrice, { textAlign: 'right' }]}>単価</Text>
        <Text style={[t.th, col.cSub, { textAlign: 'right' }]}>小計</Text>
        <Text style={[t.th, col.cTax, { textAlign: 'right' }]}>消費税</Text>
        <Text style={[t.th, col.cNote]}>備考</Text>
      </View>
      {lines.map((line, i) => {
        const tax = Math.floor(line.sellingAmount * 0.1);
        const location =
          line.location1 && line.location2
            ? `${line.location1} / ${line.location2}`
            : line.location1 || line.location2 || '';
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
            <Text style={[t.td, col.cNote]}>{line.note}</Text>
          </View>
        );
      })}
    </View>
  );
}

function WorkEstimatePDFDocument(props: WorkEstimatePDFProps) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={pdfPageStyle.pageWithFooter}>
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
        <SellingLinesTable lines={props.lines} />
        <PdfTaxSummary subtotal={props.subtotalSum} tax={props.taxSum} total={props.totalWithTax} />
        <PdfFooter projectId={props.projectId} documentNumber={props.documentNumber} />
        <PdfPageNumber />
      </Page>
    </Document>
  );
}

export function makeWorkEstimatePDF(props: WorkEstimatePDFProps): React.ReactElement {
  return <WorkEstimatePDFDocument {...props} />;
}
