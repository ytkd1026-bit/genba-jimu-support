// REVO固定提出書式の見積書PDF
//
// ・受け取るのは EstimateDocument のみ。原価・粗利・内部管理の項目は型に存在しない。
// ・見た目は RevoPdfBase の固定トークン（白背景・細罫線・濃紺見出し）。アプリのテーマ色には連動しない。
// ・見積書プレビュー（HTML）と同じ EstimateDocument を消費するため、内容は必ず一致する。

import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { EstimateDocument } from '@/app/utils/estimateDocument';
import { isMultiTax } from '@/app/utils/taxCalculation';
import {
  REVO,
  revoPage,
  revoTable,
  revoSummary,
  fmtMoney,
  fmtQty,
  RevoTitle,
  RevoDocumentHeader,
  RevoFooter,
} from './RevoPdfBase';

// 列幅（合計100%）
const col = StyleSheet.create({
  cCat:   { width: '8%' },
  cName:  { width: '12%' },
  cDesc:  { width: '24%' },
  cLoc:   { width: '11%' },
  cQty:   { width: '5%' },
  cUnit:  { width: '4%' },
  cPrice: { width: '9%' },
  cSub:   { width: '9%' },
  cTax:   { width: '8%' },
  cNote:  { width: '10%' },
});

/** 帳票らしさのため、明細が少ないときは空行で用紙を埋める。
    A4横1ページに「明細＋備考・合計」が収まる行数を上限にする（超えると合計が次ページへ落ちる）。 */
const MIN_ROWS = 9;

function DetailTable({ doc }: { doc: EstimateDocument }) {
  const t = revoTable;
  const fillers = Math.max(0, MIN_ROWS - doc.lines.length);
  return (
    <View style={t.table}>
      <View style={t.headerRow} fixed>
        <Text style={[t.th, col.cCat]}>項目</Text>
        <Text style={[t.th, col.cName]}>工事名</Text>
        <Text style={[t.th, col.cDesc]}>工事内容</Text>
        <Text style={[t.th, col.cLoc]}>施工箇所</Text>
        <Text style={[t.th, col.cQty]}>数量</Text>
        <Text style={[t.th, col.cUnit]}>単位</Text>
        <Text style={[t.th, col.cPrice]}>単価</Text>
        <Text style={[t.th, col.cSub]}>小計</Text>
        <Text style={[t.th, col.cTax]}>消費税</Text>
        <Text style={[t.th, col.cNote]}>備考</Text>
      </View>

      {doc.lines.map((line) => (
        <View key={line.no} style={t.row} wrap={false}>
          <Text style={[t.td, col.cCat]}>{line.category}</Text>
          <Text style={[t.td, col.cName]}>{line.workName}</Text>
          <Text style={[t.td, col.cDesc]}>{line.workDescription}</Text>
          <Text style={[t.td, col.cLoc]}>{line.location}</Text>
          <Text style={[t.td, t.tdR, col.cQty]}>{fmtQty(line.quantity)}</Text>
          <Text style={[t.td, t.tdC, col.cUnit]}>{line.unit}</Text>
          <Text style={[t.td, t.tdR, col.cPrice]}>{fmtMoney(line.unitPrice)}</Text>
          <Text style={[t.td, t.tdR, col.cSub]}>{fmtMoney(line.amount)}</Text>
          <Text style={[t.td, t.tdR, col.cTax]}>{fmtMoney(line.tax)}</Text>
          <Text style={[t.td, col.cNote]}>{line.note}</Text>
        </View>
      ))}

      {Array.from({ length: fillers }, (_, i) => (
        <View key={`filler-${i}`} style={t.row} wrap={false}>
          <Text style={[t.td, col.cCat]}> </Text>
          <Text style={[t.td, col.cName]}> </Text>
          <Text style={[t.td, col.cDesc]}> </Text>
          <Text style={[t.td, col.cLoc]}> </Text>
          <Text style={[t.td, col.cQty]}> </Text>
          <Text style={[t.td, col.cUnit]}> </Text>
          <Text style={[t.td, col.cPrice]}> </Text>
          <Text style={[t.td, col.cSub]}> </Text>
          <Text style={[t.td, col.cTax]}> </Text>
          <Text style={[t.td, col.cNote]}> </Text>
        </View>
      ))}
    </View>
  );
}

function SummaryBlock({ doc }: { doc: EstimateDocument }) {
  const s = revoSummary;
  const b = doc.breakdown;

  const rows: Array<{ label: string; amount: number }> = [];
  if (isMultiTax(b)) {
    if (b.taxable10Subtotal > 0) {
      rows.push({ label: '10%対象額', amount: b.taxable10Subtotal });
      rows.push({ label: '消費税(10%)', amount: b.taxable10Tax });
    }
    if (b.taxable8Subtotal > 0) {
      rows.push({ label: '8%対象額', amount: b.taxable8Subtotal });
      rows.push({ label: '消費税(8%)', amount: b.taxable8Tax });
    }
    if (b.zeroRateSubtotal > 0) rows.push({ label: '0%対象額', amount: b.zeroRateSubtotal });
    if (b.nonTaxableSubtotal > 0) rows.push({ label: '非課税額', amount: b.nonTaxableSubtotal });
    if (b.taxExemptSubtotal > 0) rows.push({ label: '不課税額', amount: b.taxExemptSubtotal });
  } else {
    rows.push({ label: '小計', amount: b.subtotal });
    rows.push({ label: '消費税', amount: b.taxTotal });
  }

  return (
    <View style={s.wrap} wrap={false}>
      <View style={s.remarks}>
        <Text style={s.remarksTitle}>備考・条件</Text>
        <View style={s.remarksBox}>
          {doc.remarks.map((r, i) => (
            <Text key={i} style={s.remarkLine}>・{r}</Text>
          ))}
        </View>
      </View>
      <View style={s.box}>
        {rows.map((r) => (
          <View key={r.label} style={s.row}>
            <Text style={s.label}>{r.label}</Text>
            <Text style={s.amount}>{fmtMoney(r.amount)} 円</Text>
          </View>
        ))}
        <View style={s.rowTotal}>
          <Text style={s.labelTotal}>合計</Text>
          <Text style={s.amountTotal}>{fmtMoney(b.total)} 円</Text>
        </View>
      </View>
    </View>
  );
}

function RevoEstimateDocument({ doc }: { doc: EstimateDocument }) {
  return (
    <Document title={`${doc.title} ${doc.estimateNo}`}>
      <Page size="A4" orientation="landscape" style={revoPage.page}>
        <RevoTitle text={doc.title} />
        <RevoDocumentHeader
          toName={doc.submitTo ? `${doc.submitTo}　御中` : '御中'}
          fields={[
            { label: '件　　名', value: doc.projectName },
            { label: '工事場所', value: doc.siteAddress },
            { label: '有効期限', value: doc.validUntil },
          ]}
          meta={[
            { label: '見積No.', value: doc.estimateNo },
            { label: '作成日', value: doc.createdDate },
            { label: '案件ID', value: doc.projectId },
          ]}
          company={doc.company}
          total={{ label: '御見積金額（税込）', amount: doc.breakdown.total }}
        />
        <DetailTable doc={doc} />
        <SummaryBlock doc={doc} />
        <RevoFooter projectId={doc.projectId} documentNumber={doc.estimateNo} />
      </Page>
    </Document>
  );
}

export function makeRevoEstimatePDF(doc: EstimateDocument): React.ReactElement {
  return <RevoEstimateDocument doc={doc} />;
}

export { REVO };
