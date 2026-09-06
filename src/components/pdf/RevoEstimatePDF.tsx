// REVO固定提出書式の見積書PDF（2モード）
//
//  single     原状回復・単票型      … 1枚で工事全体が分かる（A4横・明細が多いときのみ続く）
//  supervised 工事監督・リノベ型    … 表紙 / 工事内訳書 / 工種別内訳明細書 の3部構成
//
// ・受け取るのは EstimateDocument のみ。原価・粗利・内部管理の項目は型に存在しない。
// ・見た目は RevoPdfBase の固定トークン（白背景・黒文字・薄いグレー・細罫線）。
//   アプリのテーマ色には連動しない。
// ・見積書プレビュー（HTML）と同じ EstimateDocument・同じ構成を描くので内容は必ず一致する。

import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type {
  EstimateDocument,
  EstimateDocumentGroup,
  EstimateFormType,
} from '@/app/utils/estimateDocument';
import {
  REVO,
  revoPage,
  revoTable,
  revoSummary,
  fmtMoney,
  fmtQty,
  RevoTitleBar,
  RevoAddressee,
  RevoField,
  RevoCompanyBlock,
  RevoAmountBox,
  RevoFooter,
} from './RevoPdfBase';

// ─── 列幅 ─────────────────────────────────────────────────────
// 単票型：項目 / 工事内容 / 範囲 / 数量 / 単位 / 単価 / 金額 / 備考
const cSingle = StyleSheet.create({
  cat:   { width: '11%' },
  desc:  { width: '26%' },
  scope: { width: '13%' },
  qty:   { width: '6%' },
  unit:  { width: '5%' },
  price: { width: '9%' },
  amt:   { width: '10%' },
  note:  { width: '20%' },
});

// 工事内訳書：NO / 項目 / 数量 / 単位 / 単価 / 金額 / 備考
const cSummary = StyleSheet.create({
  no:    { width: '6%' },
  item:  { width: '34%' },
  qty:   { width: '7%' },
  unit:  { width: '6%' },
  price: { width: '12%' },
  amt:   { width: '13%' },
  note:  { width: '22%' },
});

// 工種別内訳明細書：NO / 名称 / 仕様・摘要 / 数量 / 単位 / 単価 / 金額 / 備考
const cDetail = StyleSheet.create({
  no:    { width: '5%' },
  name:  { width: '22%' },
  spec:  { width: '26%' },
  qty:   { width: '7%' },
  unit:  { width: '5%' },
  price: { width: '10%' },
  amt:   { width: '11%' },
  note:  { width: '14%' },
});

const ps = StyleSheet.create({
  headRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  headLeft: { width: '56%' },
  headRight: { width: '40%', alignItems: 'flex-start' },
  amountRight: { alignItems: 'flex-end', marginTop: 10 },
  sectionTitle: { fontSize: 12, fontWeight: 700, letterSpacing: 3, textAlign: 'center', marginBottom: 3 },
  sectionRule: { alignSelf: 'center', width: 120, borderBottomWidth: 0.6, borderBottomColor: REVO.text, marginBottom: 8 },
  sectionMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  metaText: { fontSize: 8, color: REVO.textSub },
  groupHead: { fontSize: 8, fontWeight: 700 },
  spacer: { height: 10 },
});

/** 明細が少ないときに用紙を埋める空行数 */
const SINGLE_MIN_ROWS = 10;
const DETAIL_MIN_ROWS = 2;

function childLabel(i: number): string {
  return String.fromCharCode(97 + (i % 26));
}

// ══════════════════════════════════════════════════════════════
// 単票型（原状回復）
// ══════════════════════════════════════════════════════════════
function SingleTable({ doc }: { doc: EstimateDocument }) {
  const t = revoTable;
  const used = doc.lines.length + doc.groups.length * 0;
  const fillers = Math.max(0, SINGLE_MIN_ROWS - used);
  return (
    <View style={t.table}>
      <View style={t.headerRow} fixed>
        <Text style={[t.th, cSingle.cat]}>項目</Text>
        <Text style={[t.th, cSingle.desc]}>工事内容</Text>
        <Text style={[t.th, cSingle.scope]}>範囲</Text>
        <Text style={[t.th, cSingle.qty]}>数量</Text>
        <Text style={[t.th, cSingle.unit]}>単位</Text>
        <Text style={[t.th, cSingle.price]}>単価</Text>
        <Text style={[t.th, cSingle.amt]}>金額</Text>
        <Text style={[t.th, cSingle.note]}>備考</Text>
      </View>

      {doc.groups.map((g) =>
        g.lines.map((line, i) => (
          <View key={line.no} style={t.row} wrap={false}>
            {/* 工種は各グループの先頭行にだけ出す（実務帳票と同じ頭出し） */}
            <Text style={[t.td, cSingle.cat, i === 0 ? t.tdBold : {}]}>{i === 0 ? g.label : ''}</Text>
            <Text style={[t.td, cSingle.desc]}>
              {[line.workName, line.workDescription].filter(Boolean).join('　')}
            </Text>
            <Text style={[t.td, cSingle.scope]}>{line.location}</Text>
            <Text style={[t.td, t.tdR, cSingle.qty]}>{fmtQty(line.quantity)}</Text>
            <Text style={[t.td, t.tdC, cSingle.unit]}>{line.unit}</Text>
            <Text style={[t.td, t.tdR, cSingle.price]}>{fmtMoney(line.unitPrice)}</Text>
            <Text style={[t.td, t.tdR, cSingle.amt]}>{fmtMoney(line.amount)}</Text>
            <Text style={[t.td, cSingle.note]}>{line.note}</Text>
          </View>
        )),
      )}

      {Array.from({ length: fillers }, (_, i) => (
        <View key={`f-${i}`} style={t.row} wrap={false}>
          {[cSingle.cat, cSingle.desc, cSingle.scope, cSingle.qty, cSingle.unit, cSingle.price, cSingle.amt, cSingle.note].map(
            (w, c) => <Text key={c} style={[t.td, w]}> </Text>,
          )}
        </View>
      ))}
    </View>
  );
}

function TotalsBox({ doc, labels }: { doc: EstimateDocument; labels: { sub: string; tax: string; total: string } }) {
  const s = revoSummary;
  const b = doc.breakdown;
  const rows: Array<{ label: string; amount: number }> = [];
  if (b.taxable10Subtotal > 0 && b.taxable8Subtotal > 0) {
    rows.push({ label: '10%対象額', amount: b.taxable10Subtotal });
    rows.push({ label: '消費税(10%)', amount: b.taxable10Tax });
    rows.push({ label: '8%対象額', amount: b.taxable8Subtotal });
    rows.push({ label: '消費税(8%)', amount: b.taxable8Tax });
  } else {
    rows.push({ label: labels.sub, amount: b.subtotal });
    rows.push({ label: labels.tax, amount: b.taxTotal });
  }
  if (b.nonTaxableSubtotal > 0) rows.push({ label: '非課税額', amount: b.nonTaxableSubtotal });
  if (b.taxExemptSubtotal > 0) rows.push({ label: '不課税額', amount: b.taxExemptSubtotal });

  return (
    <View style={s.box}>
      {rows.map((r) => (
        <View key={r.label} style={s.row}>
          <Text style={s.label}>{r.label}</Text>
          <Text style={s.amount}>{fmtMoney(r.amount)} 円</Text>
        </View>
      ))}
      <View style={s.rowLast}>
        <Text style={s.labelTotal}>{labels.total}</Text>
        <Text style={s.amountTotal}>{fmtMoney(b.total)} 円</Text>
      </View>
    </View>
  );
}

function NotesAndTotals({ doc, labels }: { doc: EstimateDocument; labels: { sub: string; tax: string; total: string } }) {
  const s = revoSummary;
  return (
    <View style={s.wrap} wrap={false}>
      <View style={s.notes}>
        <Text style={s.notesTitle}>備考・条件</Text>
        <View style={s.notesBox}>
          {doc.remarks.map((r, i) => (
            <Text key={i} style={s.noteLine}>・{r}</Text>
          ))}
        </View>
      </View>
      <TotalsBox doc={doc} labels={labels} />
    </View>
  );
}

function SinglePage({ doc }: { doc: EstimateDocument }) {
  return (
    <Page size="A4" orientation="landscape" style={revoPage.landscape}>
      <RevoTitleBar
        title={doc.title}
        leftLabel="見積番号"
        leftValue={doc.estimateNo}
        rightLabel="発行日"
        rightValue={doc.createdDate}
      />
      <View style={ps.headRow}>
        <View style={ps.headLeft}>
          <RevoAddressee name={doc.submitTo ? `${doc.submitTo}　御中` : '御中'} />
          <RevoField label="物件名" value={doc.propertyName || doc.projectName} />
          <RevoField label="号室" value={doc.roomNumber} />
          <RevoField label="住所" value={doc.siteAddress} />
          <RevoField label="件名" value={doc.projectName} />
          <RevoField label="有効期限" value={doc.validUntil} />
        </View>
        <View style={ps.headRight}>
          <RevoCompanyBlock company={doc.company} />
          <View style={ps.amountRight}>
            <RevoAmountBox label="御見積総額（税込）" amount={doc.breakdown.total} />
          </View>
        </View>
      </View>

      <SingleTable doc={doc} />
      <NotesAndTotals doc={doc} labels={{ sub: '税　抜', tax: '消 費 税', total: '総　額' }} />
      <RevoFooter documentNumber={doc.estimateNo} />
    </Page>
  );
}

// ══════════════════════════════════════════════════════════════
// 工事監督・リノベーション型
// ══════════════════════════════════════════════════════════════
function CoverPage({ doc }: { doc: EstimateDocument }) {
  const b = doc.breakdown;
  return (
    <Page size="A4" orientation="landscape" style={revoPage.landscape}>
      <RevoTitleBar
        title={doc.title}
        leftLabel="見積番号"
        leftValue={doc.estimateNo}
        rightLabel="発行日"
        rightValue={doc.createdDate}
      />
      <View style={ps.headRow}>
        <View style={ps.headLeft}>
          <RevoAddressee name={doc.submitTo ? `${doc.submitTo}　御中` : '御中'} />
          <RevoField label="工事名称" value={doc.projectName} />
          <RevoField label="工事場所" value={doc.siteAddress} />
          <RevoField label="物件名" value={doc.propertyName} />
          <RevoField label="号室" value={doc.roomNumber} />
          <RevoField label="工期" value="" />
          <RevoField label="支払条件" value="" />
          <RevoField label="有効期限" value={doc.validUntil} />
          <RevoField label="担当者" value={doc.company.representative} />
          <RevoField label="備考" value="" />
        </View>
        <View style={ps.headRight}>
          <RevoCompanyBlock company={doc.company} />
          <View style={ps.amountRight}>
            <RevoAmountBox
              label="御見積金額（税込）"
              amount={b.total}
              sub={[
                { label: '工事代金', amount: b.subtotal },
                { label: '消費税', amount: b.taxTotal },
              ]}
            />
          </View>
        </View>
      </View>
      <RevoFooter documentNumber={doc.estimateNo} />
    </Page>
  );
}

function SectionHead({ title, doc }: { title: string; doc: EstimateDocument }) {
  return (
    <View>
      <Text style={ps.sectionTitle}>{title}</Text>
      <View style={ps.sectionRule} />
      <View style={ps.sectionMeta}>
        <Text style={ps.metaText}>工事名称：{doc.projectName}</Text>
        <Text style={ps.metaText}>見積番号：{doc.estimateNo}　発行日：{doc.createdDate}</Text>
      </View>
    </View>
  );
}

function BreakdownPage({ doc }: { doc: EstimateDocument }) {
  const t = revoTable;
  const fillers = Math.max(0, 8 - doc.groups.length);
  return (
    <Page size="A4" orientation="landscape" style={revoPage.landscape}>
      <SectionHead title="工事内訳書" doc={doc} />
      <View style={t.table}>
        <View style={t.headerRow} fixed>
          <Text style={[t.th, cSummary.no]}>NO</Text>
          <Text style={[t.th, cSummary.item]}>項目</Text>
          <Text style={[t.th, cSummary.qty]}>数量</Text>
          <Text style={[t.th, cSummary.unit]}>単位</Text>
          <Text style={[t.th, cSummary.price]}>単価</Text>
          <Text style={[t.th, cSummary.amt]}>金額</Text>
          <Text style={[t.th, cSummary.note]}>備考</Text>
        </View>
        {doc.groups.map((g, i) => (
          <View key={g.code} style={t.row} wrap={false}>
            <Text style={[t.td, t.tdC, cSummary.no]}>{i + 1}</Text>
            <Text style={[t.td, cSummary.item]}>{g.label}</Text>
            <Text style={[t.td, t.tdR, cSummary.qty]}>1</Text>
            <Text style={[t.td, t.tdC, cSummary.unit]}>式</Text>
            <Text style={[t.td, t.tdR, cSummary.price]}>{fmtMoney(g.subtotal)}</Text>
            <Text style={[t.td, t.tdR, cSummary.amt]}>{fmtMoney(g.subtotal)}</Text>
            <Text style={[t.td, cSummary.note]}>{`内訳明細書 ${g.code} 参照`}</Text>
          </View>
        ))}
        {Array.from({ length: fillers }, (_, i) => (
          <View key={`f-${i}`} style={t.row} wrap={false}>
            {[cSummary.no, cSummary.item, cSummary.qty, cSummary.unit, cSummary.price, cSummary.amt, cSummary.note].map(
              (w, c) => <Text key={c} style={[t.td, w]}> </Text>,
            )}
          </View>
        ))}
      </View>
      <NotesAndTotals doc={doc} labels={{ sub: '小　計', tax: '消 費 税', total: '合　計' }} />
      <RevoFooter documentNumber={doc.estimateNo} />
    </Page>
  );
}

function DetailGroup({ group }: { group: EstimateDocumentGroup }) {
  const t = revoTable;
  const fillers = Math.max(0, DETAIL_MIN_ROWS - group.lines.length);
  return (
    <View style={t.table} wrap>
      <View style={t.headerRow} fixed>
        <Text style={[t.th, cDetail.no]}>NO</Text>
        <Text style={[t.th, cDetail.name]}>名称</Text>
        <Text style={[t.th, cDetail.spec]}>仕様・摘要</Text>
        <Text style={[t.th, cDetail.qty]}>数量</Text>
        <Text style={[t.th, cDetail.unit]}>単位</Text>
        <Text style={[t.th, cDetail.price]}>単価</Text>
        <Text style={[t.th, cDetail.amt]}>金額</Text>
        <Text style={[t.th, cDetail.note]}>備考</Text>
      </View>

      <View style={t.groupRow} wrap={false}>
        <Text style={[t.td, t.tdC, t.tdBold, cDetail.no]}>{group.code}</Text>
        <Text style={[t.td, t.tdBold, { width: '95%' }]}>{group.label}</Text>
      </View>

      {group.lines.map((line, i) => (
        <View key={line.no} style={t.row} wrap={false}>
          <Text style={[t.td, t.tdC, cDetail.no]}>{childLabel(i)}</Text>
          <Text style={[t.td, cDetail.name]}>{line.workName}</Text>
          <Text style={[t.td, cDetail.spec]}>
            {[line.workDescription, line.location].filter(Boolean).join('　/　')}
          </Text>
          <Text style={[t.td, t.tdR, cDetail.qty]}>{fmtQty(line.quantity)}</Text>
          <Text style={[t.td, t.tdC, cDetail.unit]}>{line.unit}</Text>
          <Text style={[t.td, t.tdR, cDetail.price]}>{fmtMoney(line.unitPrice)}</Text>
          <Text style={[t.td, t.tdR, cDetail.amt]}>{fmtMoney(line.amount)}</Text>
          <Text style={[t.td, cDetail.note]}>{line.note}</Text>
        </View>
      ))}

      {Array.from({ length: fillers }, (_, i) => (
        <View key={`f-${i}`} style={t.row} wrap={false}>
          {[cDetail.no, cDetail.name, cDetail.spec, cDetail.qty, cDetail.unit, cDetail.price, cDetail.amt, cDetail.note].map(
            (w, c) => <Text key={c} style={[t.td, w]}> </Text>,
          )}
        </View>
      ))}

      <View style={t.subtotalRow} wrap={false}>
        <Text style={[t.td, cDetail.no]}> </Text>
        <Text style={[t.td, t.tdBold, cDetail.name]}>{group.label}　計</Text>
        <Text style={[t.td, cDetail.spec]}> </Text>
        <Text style={[t.td, cDetail.qty]}> </Text>
        <Text style={[t.td, cDetail.unit]}> </Text>
        <Text style={[t.td, cDetail.price]}> </Text>
        <Text style={[t.td, t.tdR, t.tdBold, cDetail.amt]}>{fmtMoney(group.subtotal)}</Text>
        <Text style={[t.td, cDetail.note]}> </Text>
      </View>
    </View>
  );
}

function DetailPages({ doc }: { doc: EstimateDocument }) {
  return (
    <Page size="A4" orientation="landscape" style={revoPage.landscape}>
      <SectionHead title="工種別内訳明細書" doc={doc} />
      {doc.groups.map((g) => (
        <View key={g.code}>
          <DetailGroup group={g} />
          <View style={ps.spacer} />
        </View>
      ))}
      <RevoFooter documentNumber={doc.estimateNo} />
    </Page>
  );
}

// ══════════════════════════════════════════════════════════════
function RevoEstimateDocument({ doc, formType }: { doc: EstimateDocument; formType: EstimateFormType }) {
  return (
    <Document title={`${doc.title} ${doc.estimateNo}`}>
      {formType === 'single' ? (
        <SinglePage doc={doc} />
      ) : (
        <>
          <CoverPage doc={doc} />
          <BreakdownPage doc={doc} />
          <DetailPages doc={doc} />
        </>
      )}
    </Document>
  );
}

export function makeRevoEstimatePDF(
  doc: EstimateDocument,
  formType: EstimateFormType = 'single',
): React.ReactElement {
  return <RevoEstimateDocument doc={doc} formType={formType} />;
}

export { REVO };
