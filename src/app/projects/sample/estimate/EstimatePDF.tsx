// 見積書PDF ドキュメントコンポーネント
// 提出用のみ — 原価・粗利・利益率は一切含まない
//
// ヘッダー・自社情報・明細テーブル・合計のスタイルは共通部品
// （src/components/pdf/PdfCommon.tsx）へ分解した。デザインは分解前と同一。
import React from 'react';
import { Document, Page, Text, View, StyleSheet, type DocumentProps } from '@react-pdf/renderer';
import {
  ACCENT,
  BORDER,
  GRAY,
  toNum,
  fmtYen,
  safePdfUnit,
  pdfPageStyle,
  pdfTableStyle,
  PdfDocumentHeader,
  PdfTaxSummary,
  type CompanyInfoForPDF,
} from '@/components/pdf/PdfCommon';
import { simpleTaxAmount } from '@/app/utils/taxCalculation';

export type { CompanyInfoForPDF };

export type EstimatePDFProps = {
  lines: Array<{
    id: number;
    category: string;
    koujiName: string;
    koujiContent: string;
    location1: string;
    location2: string;
    qty: string;
    unit: string;
    unitPrice: string;
    note: string;
  }>;
  subtotalSum: number;
  taxSum: number;
  totalWithTax: number;
  companyInfo: CompanyInfoForPDF;
  clientName?: string;
  projectName?: string;
  siteAddress?: string;
  /** 見積番号（未指定時は従来どおりのサンプル番号） */
  estimateNo?: string;
  /** 作成日（未指定時は従来どおりのサンプル日付） */
  createdDate?: string;
};

// 列幅（合計 = 100%）
const col = StyleSheet.create({
  cCat:   { width: '9%' },   // 項目
  cName:  { width: '11%' },  // 工事名
  cDesc:  { width: '24%' },  // 工事内容
  cLoc:   { width: '11%' },  // 施工箇所
  cQty:   { width: '5%' },   // 数量
  cUnit:  { width: '5%' },   // 単位
  cPrice: { width: '9%' },   // 単価
  cSub:   { width: '9%' },   // 小計
  cTax:   { width: '9%' },   // 消費税
  cNote:  { width: '8%' },   // 備考
});

// 表示用デフォルト（従来の挙動を維持）
function displayDefaults(p: EstimatePDFProps) {
  return {
    client:  p.clientName  ?? '〇〇工務店 御中',
    project: p.projectName ?? '〇〇マンション クロス貼替',
    address: p.siteAddress ?? '大阪府堺市〇〇区',
    estimateNo: p.estimateNo ?? 'EST-0001',
    createdDate: p.createdDate ?? '2026/05/30',
  };
}

// ─── 見積ヘッダー（3帳票で共通利用） ──────────────────────────
function EstimateHeader({
  title,
  props,
}: {
  title: string;
  props: EstimatePDFProps;
}) {
  const d = displayDefaults(props);
  return (
    <PdfDocumentHeader
      documentTitle={title}
      submitTo={d.client}
      projectName={d.project}
      siteAddress={d.address}
      documentInfo={[
        { label: '見積番号', value: d.estimateNo },
        { label: '作成日', value: d.createdDate },
      ]}
      companyInfo={props.companyInfo}
      totalBox={{ label: '税込見積金額', amount: props.totalWithTax }}
    />
  );
}

// ─── 見積明細テーブル（3帳票で共通利用） ───────────────────────
function EstimateLinesTable({ lines }: { lines: EstimatePDFProps['lines'] }) {
  const t = pdfTableStyle;
  return (
    <View style={t.table}>
      {/* ヘッダー行 */}
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

      {/* データ行 */}
      {lines.map((line, i) => {
        const subtotal = toNum(line.qty) * toNum(line.unitPrice);
        // 明細1行の参考税額（全額課税10%の旧フロー）。合計は props の taxSum を表示する
        const tax = simpleTaxAmount(subtotal);
        const location =
          line.location1 && line.location2
            ? `${line.location1} / ${line.location2}`
            : line.location1 || line.location2 || '';
        const rowStyle = i % 2 === 1
          ? [t.tableRow, t.tableRowEven]
          : t.tableRow;

        return (
          <View key={line.id} style={rowStyle}>
            <Text style={[t.td, col.cCat]}>{line.category}</Text>
            <Text style={[t.td, col.cName]}>{line.koujiName}</Text>
            <Text style={[t.td, col.cDesc]}>{line.koujiContent}</Text>
            <Text style={[t.td, col.cLoc]}>{location}</Text>
            <Text style={[t.tdR, col.cQty]}>{line.qty}</Text>
            <Text style={[t.tdC, col.cUnit]}>{safePdfUnit(line.unit)}</Text>
            <Text style={[t.tdR, col.cPrice]}>{fmtYen(toNum(line.unitPrice))}</Text>
            <Text style={[t.tdR, col.cSub]}>{fmtYen(subtotal)}</Text>
            <Text style={[t.tdR, col.cTax]}>{fmtYen(tax)}</Text>
            <Text style={[t.td, col.cNote]}>{line.note}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── 見積書PDF ────────────────────────────────────────────────
function EstimatePDFDocument(props: EstimatePDFProps) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={pdfPageStyle.page}>
        <EstimateHeader title="見積明細書" props={props} />
        <EstimateLinesTable lines={props.lines} />
        <PdfTaxSummary subtotal={props.subtotalSum} tax={props.taxSum} total={props.totalWithTax} />
      </Page>
    </Document>
  );
}

// ページコンポーネントから動的importで呼び出すファクトリ関数
export function makeEstimatePDF(props: EstimatePDFProps): React.ReactElement<DocumentProps> {
  return <EstimatePDFDocument {...props} />;
}

// ─── 発注確認欄スタイル ───────────────────────────────────────
const o = StyleSheet.create({
  // ── 発注確認セクション ──────────────────────────────────────
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: ACCENT,
    marginBottom: 4,
    paddingBottom: 4,
    borderBottomWidth: 1.5,
    borderBottomColor: ACCENT,
  },
  sectionSubText: {
    fontSize: 8,
    color: '#333',
    marginBottom: 10,
  },

  // 発注日
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 4,
  },
  dateLabel: {
    fontSize: 8,
    color: '#333',
    marginRight: 4,
  },
  dateField: {
    fontSize: 8,
    width: 32,
    borderBottomWidth: 1,
    borderBottomColor: '#555',
    paddingBottom: 2,
    textAlign: 'center',
  },
  dateSep: {
    fontSize: 8,
    marginHorizontal: 2,
  },

  // 発注者・受注者 2カラム
  partiesRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  partyBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 3,
    padding: 10,
  },
  partyTitle: {
    fontSize: 9,
    fontWeight: 700,
    color: ACCENT,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  partyFieldRow: {
    flexDirection: 'row',
    marginBottom: 8,
    alignItems: 'flex-end',
  },
  partyFieldLabel: {
    fontSize: 7,
    color: GRAY,
    width: 60,
    flexShrink: 0,
  },
  partyFieldLine: {
    flex: 1,
    borderBottomWidth: 0.8,
    borderBottomColor: '#888',
    paddingBottom: 2,
    minHeight: 14,
  },
  // 署名欄（高さを確保）
  signLabel: {
    fontSize: 7,
    color: GRAY,
    marginBottom: 4,
  },
  signBox: {
    borderWidth: 0.8,
    borderColor: '#aaa',
    borderRadius: 2,
    height: 52,
    backgroundColor: '#fafafa',
    justifyContent: 'flex-end',
    padding: 4,
  },
  signBoxHint: {
    fontSize: 6,
    color: '#ccc',
    textAlign: 'right',
  },

  // 発注条件
  conditionsSection: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  conditionsTitle: {
    fontSize: 8,
    fontWeight: 700,
    color: '#444',
    marginBottom: 4,
  },
  conditionsText: {
    fontSize: 6.5,
    color: '#555',
    lineHeight: 1.6,
  },
});

// ─── 見積書兼注文書 PDF コンポーネント ───────────────────────
function EstimateOrderPDFDocument(props: EstimatePDFProps) {
  const { companyInfo } = props;
  const d = displayDefaults(props);
  return (
    <Document>
      {/* ─── 1ページ目：見積明細（見積書PDFと同内容、タイトルのみ変更） ─── */}
      <Page size="A4" orientation="landscape" style={pdfPageStyle.page}>
        <EstimateHeader title="見積書兼注文書" props={props} />
        <EstimateLinesTable lines={props.lines} />
        <PdfTaxSummary subtotal={props.subtotalSum} tax={props.taxSum} total={props.totalWithTax} />
      </Page>

      {/* ─── 2ページ目：発注確認欄 ─── */}
      <Page size="A4" orientation="landscape" style={pdfPageStyle.page}>

        {/* ページ補足ヘッダー */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: BORDER }}>
          <Text style={{ fontSize: 9, fontWeight: 700, color: ACCENT }}>見積書兼注文書 — 発注確認欄</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Text style={{ fontSize: 7, color: GRAY }}>案件：{d.project}</Text>
            <Text style={{ fontSize: 7, color: GRAY }}>見積番号：{d.estimateNo}</Text>
          </View>
        </View>

        {/* 発注確認セクション */}
        <Text style={o.sectionTitle}>発注確認欄</Text>
        <Text style={o.sectionSubText}>
          上記見積内容・工事条件・支払条件を確認のうえ、発注します。
        </Text>

        {/* 発注日 */}
        <View style={o.dateRow}>
          <Text style={o.dateLabel}>発注日</Text>
          <Text style={o.dateField}>{' '}</Text>
          <Text style={o.dateSep}>年</Text>
          <Text style={o.dateField}>{' '}</Text>
          <Text style={o.dateSep}>月</Text>
          <Text style={o.dateField}>{' '}</Text>
          <Text style={o.dateSep}>日</Text>
        </View>

        {/* 発注者・受注者 2カラム */}
        <View style={o.partiesRow}>
          {/* 発注者 */}
          <View style={o.partyBox}>
            <Text style={o.partyTitle}>発注者</Text>
            <View style={o.partyFieldRow}>
              <Text style={o.partyFieldLabel}>住所</Text>
              <View style={o.partyFieldLine} />
            </View>
            <View style={o.partyFieldRow}>
              <Text style={o.partyFieldLabel}>会社名</Text>
              <View style={o.partyFieldLine} />
            </View>
            <View style={o.partyFieldRow}>
              <Text style={o.partyFieldLabel}>担当者名</Text>
              <View style={o.partyFieldLine} />
            </View>
            <View style={o.partyFieldRow}>
              <Text style={o.partyFieldLabel}>電話番号</Text>
              <View style={o.partyFieldLine} />
            </View>
            <Text style={o.signLabel}>署名または記名押印</Text>
            <View style={o.signBox}>
              <Text style={o.signBoxHint}>（署名・押印）</Text>
            </View>
          </View>

          {/* 受注者（自社情報を表示） */}
          <View style={o.partyBox}>
            <Text style={o.partyTitle}>受注者</Text>
            <View style={o.partyFieldRow}>
              <Text style={o.partyFieldLabel}>屋号</Text>
              <Text style={{ flex: 1, fontSize: 8, fontWeight: 700 }}>{companyInfo.name}</Text>
            </View>
            <View style={o.partyFieldRow}>
              <Text style={o.partyFieldLabel}>住所</Text>
              <Text style={{ flex: 1, fontSize: 7.5 }}>{companyInfo.postalCode} {companyInfo.address}</Text>
            </View>
            <View style={o.partyFieldRow}>
              <Text style={o.partyFieldLabel}>代表者</Text>
              <Text style={{ flex: 1, fontSize: 8 }}>{companyInfo.representative}</Text>
            </View>
            <View style={o.partyFieldRow}>
              <Text style={o.partyFieldLabel}>電話番号</Text>
              <Text style={{ flex: 1, fontSize: 7.5 }}>{companyInfo.tel}</Text>
            </View>
            <View style={o.partyFieldRow}>
              <Text style={o.partyFieldLabel}>登録番号</Text>
              <Text style={{ flex: 1, fontSize: 7, color: ACCENT }}>{companyInfo.invoiceNumber}</Text>
            </View>
          </View>
        </View>

        {/* 発注条件 */}
        <View style={o.conditionsSection}>
          <Text style={o.conditionsTitle}>発注条件</Text>
          <Text style={o.conditionsText}>
            本書に記載の見積内容、工事範囲、金額、支払条件を確認のうえ、発注します。{'\n'}
            追加工事・仕様変更・下地不良等により本見積範囲外の作業が発生する場合は、別途見積または協議のうえ対応します。{'\n'}
            材料発注後のキャンセルについては、発注済材料費および手配済費用をご負担いただく場合があります。
          </Text>
        </View>

      </Page>
    </Document>
  );
}

// ファクトリ関数（見積書兼注文書PDF）
export function makeEstimateOrderPDF(props: EstimatePDFProps): React.ReactElement<DocumentProps> {
  return <EstimateOrderPDFDocument {...props} />;
}

// ─── 保存用PDF 型定義 ────────────────────────────────────────
export type StoragePDFProps = EstimatePDFProps & {
  costs: Array<{
    id: number;
    costCategory: string;
    targetCategory: string;
    targetKouji: string;
    content: string;
    qty: string;
    unit: string;
    costUnitPrice: string;
    note: string;
  }>;
  costSum: number;
  grossProfit: number;
  grossMarginRate: number;
};

// ─── 保存用PDF 内部管理ページ スタイル ───────────────────────
const p = StyleSheet.create({
  page: {
    fontFamily: 'NotoSansJP',
    fontSize: 8,
    padding: 22,
    backgroundColor: '#fffbeb',
    color: '#1a1a1a',
  },
  // 1ページ目（見積明細ページ）の小さな注意文
  page1Notice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    borderLeftWidth: 3,
    borderLeftColor: ACCENT,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 8,
    borderRadius: 2,
    gap: 4,
  },
  page1NoticeText: {
    fontSize: 7,
    color: ACCENT,
  },
  // 2ページ目の警告ボックス
  warningBox: {
    backgroundColor: '#fef3c7',
    borderWidth: 1.5,
    borderColor: '#d97706',
    borderRadius: 3,
    padding: 8,
    marginBottom: 10,
  },
  warningTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: '#92400e',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 8,
    fontWeight: 700,
    color: '#7c2d12',
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: 700,
    color: '#92400e',
    marginBottom: 5,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: '#fcd34d',
  },
  table: {
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#92400e',
  },
  tableRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#fcd34d',
  },
  tableRowEven: {
    backgroundColor: '#fefce8',
  },
  th: {
    paddingVertical: 7,
    paddingHorizontal: 3,
    fontSize: 7,
    fontWeight: 700,
    color: '#fff',
    borderRightWidth: 0.5,
    borderRightColor: 'rgba(255,255,255,0.3)',
    lineHeight: 1.25,
  },
  td: {
    paddingVertical: 6,
    paddingHorizontal: 3,
    fontSize: 7,
    color: '#333',
    borderRightWidth: 0.5,
    borderRightColor: '#fcd34d',
    flexWrap: 'wrap',
    lineHeight: 1.25,
  },
  tdR: {
    paddingVertical: 6,
    paddingHorizontal: 3,
    fontSize: 7,
    color: '#333',
    borderRightWidth: 0.5,
    borderRightColor: '#fcd34d',
    textAlign: 'right',
    lineHeight: 1.25,
  },
  tdC: {
    paddingVertical: 6,
    paddingHorizontal: 3,
    fontSize: 7,
    color: '#333',
    borderRightWidth: 0.5,
    borderRightColor: '#fcd34d',
    textAlign: 'center',
    lineHeight: 1.25,
  },
  summaryOuter: {
    alignItems: 'flex-end',
  },
  summaryBox: {
    width: 220,
    borderWidth: 1.5,
    borderColor: '#d97706',
    borderRadius: 3,
  },
  summaryRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#fcd34d',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  summaryRowBold: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#fef3c7',
  },
  summaryLabel: { flex: 1, fontSize: 8, color: '#78350f' },
  summaryAmt: { fontSize: 8, textAlign: 'right', minWidth: 72, color: '#333' },
  summaryLabelBold: { flex: 1, fontSize: 9, fontWeight: 700, color: '#92400e' },
  summaryAmtBold: { fontSize: 10, fontWeight: 700, color: '#92400e', textAlign: 'right', minWidth: 72 },
});

// ─── 保存用PDF コンポーネント ─────────────────────────────────
function StoragePDFDocument(props: StoragePDFProps) {
  const { lines, subtotalSum, taxSum, totalWithTax, costs, costSum, grossProfit, grossMarginRate } = props;

  // 工事別利益サマリーの計算
  const salesByJob = new Map<string, number>();
  lines.forEach((line) => {
    const sub = toNum(line.qty) * toNum(line.unitPrice);
    const key = line.koujiName || '未分類';
    salesByJob.set(key, (salesByJob.get(key) ?? 0) + sub);
  });

  const costByJob = new Map<string, number>();
  costs.forEach((cost) => {
    const cs = toNum(cost.qty) * toNum(cost.costUnitPrice);
    costByJob.set(cost.targetKouji, (costByJob.get(cost.targetKouji) ?? 0) + cs);
  });

  const commonCost = costByJob.get('共通') ?? 0;
  const jobNames = Array.from(salesByJob.keys());
  const jobSummary = jobNames.map((name) => {
    const sales = salesByJob.get(name) ?? 0;
    const cost = costByJob.get(name) ?? 0;
    const profit = sales - cost;
    const margin = sales > 0 ? (profit / sales) * 100 : null;
    return { name, sales, cost, profit, margin };
  });

  return (
    <Document>
      {/* ─── 1ページ目：提出用見積明細（見積書PDFと同内容、タイトルのみ変更） ─── */}
      <Page size="A4" orientation="landscape" style={pdfPageStyle.page}>
        <EstimateHeader title="保存用 見積明細" props={props} />

        {/* 1ページ目 注意文：元請けへの誤提出防止 */}
        <View style={p.page1Notice}>
          <Text style={p.page1NoticeText}>
            ⚠ 保存用PDFです。2ページ目に原価・粗利・粗利率を含みます。元請け・施主には提出しないでください。
          </Text>
        </View>

        <EstimateLinesTable lines={lines} />
        <PdfTaxSummary subtotal={subtotalSum} tax={taxSum} total={totalWithTax} />
      </Page>

      {/* ─── 2ページ目：内部管理（黄色背景） ─── */}
      <Page size="A4" orientation="landscape" style={p.page}>

        {/* 警告ヘッダー */}
        <View style={p.warningBox}>
          <Text style={p.warningTitle}>保存用 内部管理</Text>
          <Text style={p.warningText}>
            注意：このページは保存用です。原価・粗利・粗利率を含むため、元請け・施主へ提出しないでください。
          </Text>
        </View>

        {/* 原価管理表 */}
        <Text style={p.sectionTitle}>原価管理表</Text>
        <View style={p.table}>
          <View style={p.tableHeaderRow}>
            <Text style={[p.th, { width: '10%' }]}>原価区分</Text>
            <Text style={[p.th, { width: '11%' }]}>対象項目</Text>
            <Text style={[p.th, { width: '12%' }]}>対象工事名</Text>
            <Text style={[p.th, { width: '22%' }]}>内容</Text>
            <Text style={[p.th, { width: '6%', textAlign: 'right' }]}>数量</Text>
            <Text style={[p.th, { width: '6%', textAlign: 'center' }]}>単位</Text>
            <Text style={[p.th, { width: '11%', textAlign: 'right' }]}>原価単価</Text>
            <Text style={[p.th, { width: '11%', textAlign: 'right' }]}>原価小計</Text>
            <Text style={[p.th, { width: '11%' }]}>備考</Text>
          </View>
          {costs.map((cost, i) => {
            const cs = toNum(cost.qty) * toNum(cost.costUnitPrice);
            const rowStyle = i % 2 === 1 ? [p.tableRow, p.tableRowEven] : p.tableRow;
            return (
              <View key={cost.id} style={rowStyle}>
                <Text style={[p.td, { width: '10%' }]}>{cost.costCategory}</Text>
                <Text style={[p.td, { width: '11%' }]}>{cost.targetCategory}</Text>
                <Text style={[p.td, { width: '12%' }]}>{cost.targetKouji}</Text>
                <Text style={[p.td, { width: '22%' }]}>{cost.content}</Text>
                <Text style={[p.tdR, { width: '6%' }]}>{cost.qty}</Text>
                <Text style={[p.tdC, { width: '6%' }]}>{safePdfUnit(cost.unit)}</Text>
                <Text style={[p.tdR, { width: '11%' }]}>{fmtYen(toNum(cost.costUnitPrice))}</Text>
                <Text style={[p.tdR, { width: '11%' }]}>{fmtYen(cs)}</Text>
                <Text style={[p.td, { width: '11%' }]}>{cost.note}</Text>
              </View>
            );
          })}
        </View>

        {/* 工事別利益サマリー + 内部管理集計 を横並び */}
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>

          {/* 工事別利益サマリー */}
          <View style={{ flex: 1 }}>
            <Text style={p.sectionTitle}>工事別利益サマリー</Text>
            <View style={p.table}>
              <View style={p.tableHeaderRow}>
                <Text style={[p.th, { width: '25%' }]}>工事名</Text>
                <Text style={[p.th, { width: '19%', textAlign: 'right' }]}>売上</Text>
                <Text style={[p.th, { width: '19%', textAlign: 'right' }]}>原価</Text>
                <Text style={[p.th, { width: '19%', textAlign: 'right' }]}>粗利</Text>
                <Text style={[p.th, { width: '18%', textAlign: 'right' }]}>粗利率</Text>
              </View>
              {jobSummary.map((row, i) => {
                const rowStyle = i % 2 === 1 ? [p.tableRow, p.tableRowEven] : p.tableRow;
                return (
                  <View key={row.name} style={rowStyle}>
                    <Text style={[p.td, { width: '25%' }]}>{row.name}</Text>
                    <Text style={[p.tdR, { width: '19%' }]}>{fmtYen(row.sales)}</Text>
                    <Text style={[p.tdR, { width: '19%' }]}>{fmtYen(row.cost)}</Text>
                    <Text style={[p.tdR, { width: '19%' }]}>{fmtYen(row.profit)}</Text>
                    <Text style={[p.tdR, { width: '18%' }]}>
                      {row.margin !== null ? row.margin.toFixed(1) + '%' : '—'}
                    </Text>
                  </View>
                );
              })}
              {/* 共通原価行 */}
              {commonCost > 0 && (
                <View style={[p.tableRow, { backgroundColor: '#fef9c3' }]}>
                  <Text style={[p.td, { width: '25%' }]}>共通原価</Text>
                  <Text style={[p.tdR, { width: '19%' }]}>—</Text>
                  <Text style={[p.tdR, { width: '19%' }]}>{fmtYen(commonCost)}</Text>
                  <Text style={[p.tdR, { width: '19%' }]}>—</Text>
                  <Text style={[p.tdR, { width: '18%' }]}>—</Text>
                </View>
              )}
            </View>
          </View>

          {/* 内部管理集計 */}
          <View style={{ width: 200 }}>
            <Text style={p.sectionTitle}>内部管理集計</Text>
            <View style={p.summaryBox}>
              <View style={p.summaryRow}>
                <Text style={p.summaryLabel}>見積小計合計</Text>
                <Text style={p.summaryAmt}>{fmtYen(subtotalSum)}</Text>
              </View>
              <View style={p.summaryRow}>
                <Text style={p.summaryLabel}>消費税（10%）</Text>
                <Text style={p.summaryAmt}>{fmtYen(taxSum)}</Text>
              </View>
              <View style={p.summaryRow}>
                <Text style={p.summaryLabel}>税込合計</Text>
                <Text style={p.summaryAmt}>{fmtYen(totalWithTax)}</Text>
              </View>
              <View style={p.summaryRow}>
                <Text style={p.summaryLabel}>原価合計</Text>
                <Text style={p.summaryAmt}>{fmtYen(costSum)}</Text>
              </View>
              <View style={p.summaryRow}>
                <Text style={p.summaryLabel}>粗利</Text>
                <Text style={p.summaryAmt}>{fmtYen(grossProfit)}</Text>
              </View>
              <View style={p.summaryRowBold}>
                <Text style={p.summaryLabelBold}>粗利率</Text>
                <Text style={p.summaryAmtBold}>{grossMarginRate.toFixed(1)}%</Text>
              </View>
            </View>
          </View>

        </View>
      </Page>
    </Document>
  );
}

// ファクトリ関数（保存用PDF）
export function makeStoragePDF(props: StoragePDFProps): React.ReactElement<DocumentProps> {
  return <StoragePDFDocument {...props} />;
}
