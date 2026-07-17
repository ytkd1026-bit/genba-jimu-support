// 単体請求書 PDFコンポーネント
// 原価・粗利・利益率は一切含まない

import React from 'react';
import { Document, Page, Text, View, StyleSheet, type DocumentProps } from '@react-pdf/renderer';
// フォント登録・会社情報型・金額整形は PdfCommon に一元化している（S-8 PDF統一）。
// PdfCommon を import した時点で NotoSansJP が登録される。
import {
  fmtYen,
  safePdfUnit,
  toNum,
  type CompanyInfoForPDF,
} from '@/components/pdf/PdfCommon';
import { simpleTaxAmount } from '@/app/utils/taxCalculation';

export type { CompanyInfoForPDF };

export type BankInfoForPDF = {
  bankName: string;
  branchName: string;
  accountType: string;
  accountNumber: string;
  accountHolder: string;
};

export type SingleInvoicePDFProps = {
  invoiceNo: string;
  invoiceDate: string;   // "YYYY-MM-DD"
  dueDate: string;       // "YYYY-MM-DD"
  customer: {
    displayName: string;
    contactName: string;
    closingDay: string;
    paymentTerm: string;
  };
  project: {
    projectName: string;
    siteAddress: string;
    workContent: string;
    completedAt: string;
  };
  lines: Array<{
    category: string;
    koujiName: string;
    koujiContent: string;
    location: string;
    qty: string;
    unit: string;
    unitPrice: number;
    note: string;
  }>;
  subtotalSum: number;
  taxSum: number;
  totalWithTax: number;
  bank: BankInfoForPDF;
  invoiceNote: string;
  companyInfo: CompanyInfoForPDF;
};

// ─── ユーティリティ ───────────────────────────────────────────
function fmtDate(s: string): string {
  return s ? s.replace(/-/g, '/') : '';
}

// ─── 定数 ────────────────────────────────────────────────────
const ACCENT    = '#8B4A3C';
const ACCENT_BG = '#fdf0ec';
const BORDER    = '#d1d5db';
const GRAY      = '#6b7280';

// ─── スタイル ─────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: 'NotoSansJP',
    fontSize: 8,
    padding: 20,
    backgroundColor: '#ffffff',
    color: '#1a1a1a',
  },

  // ── 上部3カラムヘッダー ───────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 4,
  },
  headerDivider: {
    borderBottomWidth: 1.5,
    borderBottomColor: ACCENT,
    marginBottom: 6,
  },

  // 左列：請求先
  colLeft: {
    width: 185,
    paddingRight: 8,
    borderRightWidth: 0.5,
    borderRightColor: BORDER,
  },
  clientName: {
    fontSize: 12,
    fontWeight: 700,
    color: '#1a1a1a',
    marginBottom: 1,
  },
  clientContact: {
    fontSize: 7,
    color: GRAY,
    marginBottom: 5,
  },
  clientDivider: {
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
    marginBottom: 4,
  },
  clientInfoRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  clientInfoLabel: {
    width: 44,
    fontSize: 6.5,
    color: GRAY,
  },
  clientInfoValue: {
    flex: 1,
    fontSize: 7,
  },

  // 中央列：タイトル + 税込請求額
  colCenter: {
    flex: 1,
    paddingHorizontal: 10,
  },
  docTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: ACCENT,
    textAlign: 'center',
    marginBottom: 1,
  },
  infoRow:   { flexDirection: 'row', marginBottom: 2 },
  infoLabel: { width: 44, fontSize: 6.5, color: GRAY },
  infoValue: { flex: 1, fontSize: 7 },
  totalCenterBox: {
    backgroundColor: ACCENT_BG,
    borderWidth: 1.5,
    borderColor: ACCENT,
    borderRadius: 3,
    paddingVertical: 4,
    paddingHorizontal: 8,
    alignItems: 'center',
    marginTop: 'auto',
  },
  totalCenterLabel:  { fontSize: 7,  color: ACCENT, marginBottom: 2 },
  totalCenterAmount: { fontSize: 14, fontWeight: 700, color: ACCENT },

  // 右列：自社情報 + 支払期日
  colRight: {
    width: 185,
    paddingLeft: 8,
    borderLeftWidth: 0.5,
    borderLeftColor: BORDER,
    alignItems: 'flex-end',
  },
  metaRow:   { flexDirection: 'row', marginBottom: 1, justifyContent: 'flex-end' },
  metaLabel: { fontSize: 6.5, color: GRAY, marginRight: 4 },
  metaValue: { fontSize: 6.5 },
  companyBlock: {
    alignItems: 'flex-end',
    marginTop: 3,
    paddingTop: 2,
    borderTopWidth: 0.5,
    borderTopColor: BORDER,
    width: '100%',
    marginBottom: 2,
  },
  companyBlockLabel: { fontSize: 6,   color: GRAY,     marginBottom: 1, textAlign: 'right' },
  companyName:       { fontSize: 8,   fontWeight: 700, color: '#1a1a1a', marginBottom: 1, textAlign: 'right' },
  companyRow:        { fontSize: 6.5, color: '#444',   textAlign: 'right', marginBottom: 0.8 },
  companyInvoiceNo:  { fontSize: 6.5, color: ACCENT,   fontWeight: 700, textAlign: 'right', marginTop: 1 },
  dueDateBox: {
    borderWidth: 1.5,
    borderColor: ACCENT,
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: 'auto',
  },
  dueDateLabel: { fontSize: 6.5, color: ACCENT, marginBottom: 1 },
  dueDateValue: { fontSize: 9,   fontWeight: 700, color: ACCENT },

  // ── 明細テーブル ──────────────────────────────────────────────
  sectionTitle: {
    fontSize: 8,
    fontWeight: 700,
    color: ACCENT,
    marginBottom: 3,
    paddingBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: ACCENT,
  },
  table:          { marginBottom: 8, borderWidth: 1, borderColor: BORDER },
  tableHeaderRow: { flexDirection: 'row', backgroundColor: ACCENT },
  tableRow:       { flexDirection: 'row', borderTopWidth: 1, borderTopColor: BORDER },
  tableRowEven:   { backgroundColor: '#fdf8f2' },
  th: {
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontSize: 7,
    fontWeight: 700,
    color: '#fff',
    borderRightWidth: 0.5,
    borderRightColor: 'rgba(255,255,255,0.25)',
  },
  td: {
    paddingVertical: 3,
    paddingHorizontal: 4,
    fontSize: 7,
    color: '#333',
    borderRightWidth: 0.5,
    borderRightColor: BORDER,
    flexWrap: 'wrap',
  },
  tdR: {
    paddingVertical: 3,
    paddingHorizontal: 4,
    fontSize: 7,
    color: '#333',
    borderRightWidth: 0.5,
    borderRightColor: BORDER,
    textAlign: 'right',
  },
  tdC: {
    paddingVertical: 3,
    paddingHorizontal: 4,
    fontSize: 7,
    color: '#333',
    borderRightWidth: 0.5,
    borderRightColor: BORDER,
    textAlign: 'center',
  },
  // 列幅（合計100%）
  cCat:   { width: '9%' },
  cName:  { width: '10%' },
  cDesc:  { width: '22%' },
  cLoc:   { width: '10%' },
  cQty:   { width: '5%' },
  cUnit:  { width: '5%' },
  cPrice: { width: '9%' },
  cSub:   { width: '10%' },
  cTax:   { width: '9%' },
  cNote:  { width: '11%' },

  // ── 集計・振込先 ─────────────────────────────────────────────
  bottomSection: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    marginTop: 4,
  },
  summaryBox: {
    width: 195,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  summaryRowTotal: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: ACCENT_BG,
    borderRadius: 2,
  },
  summaryLabel:     { flex: 1, fontSize: 8,  color: GRAY },
  summaryAmt:       { fontSize: 8,  textAlign: 'right', minWidth: 70 },
  summaryLabelBold: { flex: 1, fontSize: 10, fontWeight: 700, color: ACCENT },
  summaryAmtBold:   { fontSize: 11, fontWeight: 700, color: ACCENT, textAlign: 'right', minWidth: 70 },

  bankSection: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 2,
    padding: 8,
  },
  bankTitle: {
    fontSize: 8,
    fontWeight: 700,
    color: ACCENT,
    marginBottom: 4,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  bankRow:   { flexDirection: 'row', marginBottom: 3 },
  bankLabel: { width: 50, fontSize: 7, color: GRAY },
  bankValue: { flex: 1, fontSize: 7.5 },

  noteSection: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 5,
  },
  noteTitle: { fontSize: 8, fontWeight: 700, color: '#444', marginBottom: 3 },
  noteText:  { fontSize: 7.5, color: '#555', lineHeight: 1.5 },
});

// ─── PDFドキュメント本体 ──────────────────────────────────────
function SingleInvoicePDFDocument({
  invoiceNo, invoiceDate, dueDate,
  customer, project, lines,
  subtotalSum, taxSum, totalWithTax,
  bank, invoiceNote, companyInfo,
}: SingleInvoicePDFProps) {
  const hasBankInfo = !!(bank.bankName || bank.branchName || bank.accountNumber || bank.accountHolder);

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>

        {/* ─── 上部3カラムヘッダー ─────────────────────────── */}
        <View style={s.header}>

          {/* 左列：請求先 + 案件情報 */}
          <View style={s.colLeft}>
            <Text style={s.clientName}>{customer.displayName}</Text>
            <Text style={s.clientContact}>担当：{customer.contactName}</Text>
            <View style={s.clientDivider} />
            <View style={s.clientInfoRow}>
              <Text style={s.clientInfoLabel}>案件名</Text>
              <Text style={s.clientInfoValue}>{project.projectName}</Text>
            </View>
            <View style={s.clientInfoRow}>
              <Text style={s.clientInfoLabel}>現場住所</Text>
              <Text style={s.clientInfoValue}>{project.siteAddress}</Text>
            </View>
            <View style={s.clientInfoRow}>
              <Text style={s.clientInfoLabel}>完了日</Text>
              <Text style={s.clientInfoValue}>{fmtDate(project.completedAt)}</Text>
            </View>
            <View style={s.clientInfoRow}>
              <Text style={s.clientInfoLabel}>締日</Text>
              <Text style={s.clientInfoValue}>{customer.closingDay}</Text>
            </View>
            <View style={s.clientInfoRow}>
              <Text style={s.clientInfoLabel}>支払条件</Text>
              <Text style={s.clientInfoValue}>{customer.paymentTerm}</Text>
            </View>
          </View>

          {/* 中央列：タイトル + 工事内容 + 税込請求額 */}
          <View style={s.colCenter}>
            <Text style={s.docTitle}>請求書</Text>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>工事内容</Text>
              <Text style={s.infoValue}>{project.workContent}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>請求日</Text>
              <Text style={s.infoValue}>{fmtDate(invoiceDate)}</Text>
            </View>
            <View style={s.totalCenterBox}>
              <Text style={s.totalCenterLabel}>税込請求額</Text>
              <Text style={s.totalCenterAmount}>{fmtYen(totalWithTax)}</Text>
            </View>
          </View>

          {/* 右列：自社情報 + 支払期日 */}
          <View style={s.colRight}>
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>請求番号</Text>
              <Text style={s.metaValue}>{invoiceNo}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>請求日</Text>
              <Text style={s.metaValue}>{fmtDate(invoiceDate)}</Text>
            </View>
            <View style={s.companyBlock}>
              <Text style={s.companyBlockLabel}>請求元</Text>
              <Text style={s.companyName}>{companyInfo.name}</Text>
              <Text style={s.companyRow}>{companyInfo.postalCode}</Text>
              <Text style={s.companyRow}>{companyInfo.address}</Text>
              <Text style={s.companyRow}>{companyInfo.representative}</Text>
              <Text style={s.companyRow}>TEL：{companyInfo.tel}</Text>
              <Text style={s.companyRow}>MAIL：{companyInfo.email}</Text>
              <Text style={s.companyInvoiceNo}>登録番号：{companyInfo.invoiceNumber}</Text>
            </View>
            <View style={s.dueDateBox}>
              <Text style={s.dueDateLabel}>支払期日</Text>
              <Text style={s.dueDateValue}>{fmtDate(dueDate)}</Text>
            </View>
          </View>

        </View>

        {/* 区切り横罫線 */}
        <View style={s.headerDivider} />

        {/* ─── 請求明細テーブル ─────────────────────────────── */}
        <Text style={s.sectionTitle}>請求明細</Text>
        <View style={s.table}>
          <View style={s.tableHeaderRow}>
            <Text style={[s.th, s.cCat]}>項目</Text>
            <Text style={[s.th, s.cName]}>工事名</Text>
            <Text style={[s.th, s.cDesc]}>工事内容</Text>
            <Text style={[s.th, s.cLoc]}>施工箇所</Text>
            <Text style={[s.th, s.cQty,  { textAlign: 'right' }]}>数量</Text>
            <Text style={[s.th, s.cUnit, { textAlign: 'center' }]}>単位</Text>
            <Text style={[s.th, s.cPrice,{ textAlign: 'right' }]}>単価</Text>
            <Text style={[s.th, s.cSub,  { textAlign: 'right' }]}>小計</Text>
            <Text style={[s.th, s.cTax,  { textAlign: 'right' }]}>消費税</Text>
            <Text style={[s.th, s.cNote]}>備考</Text>
          </View>
          {lines.map((line, i) => {
            const sub = toNum(line.unitPrice) * toNum(line.qty);
            // 明細1行の参考税額（全額課税10%の旧フロー）。合計は props の taxSum を表示する
            const tax = simpleTaxAmount(sub);
            const rowStyle = i % 2 === 1 ? [s.tableRow, s.tableRowEven] : s.tableRow;
            return (
              <View key={i} style={rowStyle}>
                <Text style={[s.td,  s.cCat]}>{line.category}</Text>
                <Text style={[s.td,  s.cName]}>{line.koujiName}</Text>
                <Text style={[s.td,  s.cDesc]}>{line.koujiContent}</Text>
                <Text style={[s.td,  s.cLoc]}>{line.location}</Text>
                <Text style={[s.tdR, s.cQty]}>{line.qty}</Text>
                <Text style={[s.tdC, s.cUnit]}>{safePdfUnit(line.unit)}</Text>
                <Text style={[s.tdR, s.cPrice]}>{fmtYen(toNum(line.unitPrice))}</Text>
                <Text style={[s.tdR, s.cSub]}>{fmtYen(sub)}</Text>
                <Text style={[s.tdR, s.cTax]}>{fmtYen(tax)}</Text>
                <Text style={[s.td,  s.cNote]}>{line.note}</Text>
              </View>
            );
          })}
        </View>

        {/* ─── 集計・振込先 ────────────────────────────────── */}
        <View style={s.bottomSection}>

          {/* 左：請求金額集計 */}
          <View style={s.summaryBox}>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>小計合計</Text>
              <Text style={s.summaryAmt}>{fmtYen(subtotalSum)}</Text>
            </View>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>消費税（10%）</Text>
              <Text style={s.summaryAmt}>{fmtYen(taxSum)}</Text>
            </View>
            <View style={s.summaryRowTotal}>
              <Text style={s.summaryLabelBold}>税込請求額</Text>
              <Text style={s.summaryAmtBold}>{fmtYen(totalWithTax)}</Text>
            </View>
          </View>

          {/* 右：振込先 */}
          <View style={s.bankSection}>
            <Text style={s.bankTitle}>お振込先</Text>
            {hasBankInfo ? (
              <>
                <View style={s.bankRow}>
                  <Text style={s.bankLabel}>銀行名</Text>
                  <Text style={s.bankValue}>{bank.bankName || '―'}</Text>
                </View>
                <View style={s.bankRow}>
                  <Text style={s.bankLabel}>支店名</Text>
                  <Text style={s.bankValue}>{bank.branchName || '―'}</Text>
                </View>
                <View style={s.bankRow}>
                  <Text style={s.bankLabel}>口座種別</Text>
                  <Text style={s.bankValue}>{bank.accountType || '―'}</Text>
                </View>
                <View style={s.bankRow}>
                  <Text style={s.bankLabel}>口座番号</Text>
                  <Text style={s.bankValue}>{bank.accountNumber || '―'}</Text>
                </View>
                <View style={s.bankRow}>
                  <Text style={s.bankLabel}>口座名義</Text>
                  <Text style={s.bankValue}>{bank.accountHolder || '―'}</Text>
                </View>
              </>
            ) : (
              <Text style={{ fontSize: 7, color: GRAY }}>（振込先未設定）</Text>
            )}
          </View>

        </View>

        {/* ─── 備考 ─────────────────────────────────────────── */}
        {invoiceNote ? (
          <View style={s.noteSection}>
            <Text style={s.noteTitle}>備考</Text>
            <Text style={s.noteText}>{invoiceNote}</Text>
          </View>
        ) : null}

      </Page>
    </Document>
  );
}

// ─── ファクトリ関数 ───────────────────────────────────────────
export function makeSingleInvoicePDF(props: SingleInvoicePDFProps): React.ReactElement<DocumentProps> {
  return <SingleInvoicePDFDocument {...props} />;
}
