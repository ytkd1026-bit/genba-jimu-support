// 得意先別 一括請求書 PDFコンポーネント
// 原価・粗利・利益率は一切含まない
import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

// 日本語フォント（EstimatePDF.tsx と同じCDN）
Font.register({
  family: 'NotoSansJP',
  fonts: [
    {
      src: 'https://cdn.jsdelivr.net/npm/noto-sans-japanese@1.0.0/fonts/NotoSansJP-Regular.woff2',
      fontWeight: 400,
    },
    {
      src: 'https://cdn.jsdelivr.net/npm/noto-sans-japanese@1.0.0/fonts/NotoSansJP-Bold.woff2',
      fontWeight: 700,
    },
  ],
});

// ─── 型定義 ──────────────────────────────────────────────────
export type BulkInvoicePDFProps = {
  invoiceNo: string;
  invoiceDate: string;
  periodFrom: string;
  periodTo: string;
  customer: {
    displayName: string;
    contactName: string;
    closingDay: string;
    paymentTerm: string;
    dueDate: string;
  };
  projects: Array<{
    projectName: string;
    siteAddress: string;
    workSummary: string;
    completedAt: string;
    subtotal: number;
    tax: number;
    total: number;
  }>;
  subtotalSum: number;
  taxSum: number;
  totalWithTax: number;
  bank: {
    bankName: string;
    branchName: string;
    accountType: string;
    accountNumber: string;
    accountHolder: string;
  };
  invoiceNote: string;
};

// ─── ユーティリティ ───────────────────────────────────────────
function fmtDate(s: string): string {
  return s ? s.replace(/-/g, '/') : '';
}
function fmtYen(n: number): string {
  return '¥' + n.toLocaleString('ja-JP');
}

// ─── 定数 ────────────────────────────────────────────────────
const ACCENT = '#8B4A3C';
const ACCENT_BG = '#fdf0ec';
const BORDER = '#e2e2e2';
const GRAY = '#6b7280';

// ─── スタイル ─────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: 'NotoSansJP',
    fontSize: 8,
    padding: 22,
    backgroundColor: '#ffffff',
    color: '#1a1a1a',
  },

  // ── ドキュメントヘッダー ──────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1.5,
    borderBottomColor: ACCENT,
  },
  headerLeft: {
    flex: 1,
    paddingRight: 16,
  },
  docTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: ACCENT,
    marginBottom: 2,
  },
  docSubTitle: {
    fontSize: 8,
    color: GRAY,
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  infoLabel: {
    width: 56,
    fontSize: 7,
    color: GRAY,
  },
  infoValueBold: {
    fontSize: 9,
    fontWeight: 700,
  },
  infoValue: {
    fontSize: 8,
  },
  headerRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  docMetaRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  docMetaLabel: {
    fontSize: 7,
    color: GRAY,
    marginRight: 6,
  },
  docMetaValue: {
    fontSize: 7,
  },
  // 支払期日ボックス
  dueDateBox: {
    borderWidth: 1.5,
    borderColor: ACCENT,
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: 'center',
    marginTop: 4,
  },
  dueDateLabel: {
    fontSize: 7,
    color: ACCENT,
    marginBottom: 2,
  },
  dueDateValue: {
    fontSize: 11,
    fontWeight: 700,
    color: ACCENT,
  },
  // 税込請求額ボックス
  totalBox: {
    backgroundColor: ACCENT_BG,
    borderWidth: 1.5,
    borderColor: ACCENT,
    borderRadius: 3,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    marginTop: 4,
  },
  totalBoxLabel: {
    fontSize: 7,
    color: ACCENT,
    marginBottom: 3,
  },
  totalBoxAmount: {
    fontSize: 16,
    fontWeight: 700,
    color: ACCENT,
  },

  // ── 案件テーブル ──────────────────────────────────────────────
  sectionTitle: {
    fontSize: 9,
    fontWeight: 700,
    color: ACCENT,
    marginBottom: 5,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: ACCENT,
  },
  table: {
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BORDER,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: ACCENT,
  },
  tableRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  tableRowEven: {
    backgroundColor: '#fdf8f2',
  },
  th: {
    paddingVertical: 5,
    paddingHorizontal: 4,
    fontSize: 7,
    fontWeight: 700,
    color: '#fff',
    borderRightWidth: 0.5,
    borderRightColor: 'rgba(255,255,255,0.25)',
  },
  td: {
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontSize: 7,
    color: '#333',
    borderRightWidth: 0.5,
    borderRightColor: BORDER,
    flexWrap: 'wrap',
  },
  tdR: {
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontSize: 7,
    color: '#333',
    borderRightWidth: 0.5,
    borderRightColor: BORDER,
    textAlign: 'right',
  },
  // 列幅（合計100%）
  cName:      { width: '22%' },
  cAddr:      { width: '18%' },
  cWork:      { width: '28%' },
  cDate:      { width: '10%' },
  cSubtotal:  { width: '8%' },
  cTax:       { width: '7%' },
  cTotal:     { width: '7%' },

  // ── 集計・振込先・備考 ─────────────────────────────────────────
  bottomSection: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
    marginTop: 4,
  },
  summaryBox: {
    width: 200,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  summaryRowTotal: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: ACCENT_BG,
    borderRadius: 2,
  },
  summaryLabel: { flex: 1, fontSize: 8, color: GRAY },
  summaryAmt: { fontSize: 8, textAlign: 'right', minWidth: 70 },
  summaryLabelBold: { flex: 1, fontSize: 10, fontWeight: 700, color: ACCENT },
  summaryAmtBold: { fontSize: 11, fontWeight: 700, color: ACCENT, textAlign: 'right', minWidth: 70 },

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
    marginBottom: 5,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  bankRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  bankLabel: {
    width: 50,
    fontSize: 7,
    color: GRAY,
  },
  bankValue: {
    flex: 1,
    fontSize: 7.5,
  },

  noteSection: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 6,
  },
  noteTitle: {
    fontSize: 8,
    fontWeight: 700,
    color: '#444',
    marginBottom: 3,
  },
  noteText: {
    fontSize: 7.5,
    color: '#555',
    lineHeight: 1.5,
  },
});

// ─── PDFドキュメント本体 ──────────────────────────────────────
function BulkInvoicePDFDocument({
  invoiceNo, invoiceDate, periodFrom, periodTo,
  customer, projects, subtotalSum, taxSum, totalWithTax,
  bank, invoiceNote,
}: BulkInvoicePDFProps) {
  const bankDesc = [
    bank.bankName && `${bank.bankName}`,
    bank.branchName && `${bank.branchName}`,
    bank.accountType && `${bank.accountType}`,
    bank.accountNumber && `${bank.accountNumber}`,
  ].filter(Boolean).join(' ');

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>

        {/* ─── ドキュメントヘッダー ─────────────────────────── */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={s.docTitle}>請求書</Text>
            <Text style={s.docSubTitle}>得意先別 一括請求書</Text>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>請求先</Text>
              <Text style={s.infoValueBold}>{customer.displayName}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>担当者</Text>
              <Text style={s.infoValue}>{customer.contactName}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>対象期間</Text>
              <Text style={s.infoValue}>{fmtDate(periodFrom)}〜{fmtDate(periodTo)}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>締日</Text>
              <Text style={s.infoValue}>{customer.closingDay}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>支払条件</Text>
              <Text style={s.infoValue}>{customer.paymentTerm}</Text>
            </View>
          </View>
          <View style={s.headerRight}>
            <View>
              <View style={s.docMetaRow}>
                <Text style={s.docMetaLabel}>請求番号</Text>
                <Text style={s.docMetaValue}>{invoiceNo}</Text>
              </View>
              <View style={s.docMetaRow}>
                <Text style={s.docMetaLabel}>請求日</Text>
                <Text style={s.docMetaValue}>{fmtDate(invoiceDate)}</Text>
              </View>
            </View>
            <View style={s.dueDateBox}>
              <Text style={s.dueDateLabel}>支払期日</Text>
              <Text style={s.dueDateValue}>{fmtDate(customer.dueDate)}</Text>
            </View>
            <View style={s.totalBox}>
              <Text style={s.totalBoxLabel}>税込請求額</Text>
              <Text style={s.totalBoxAmount}>{fmtYen(totalWithTax)}</Text>
            </View>
          </View>
        </View>

        {/* ─── 請求対象案件リスト ───────────────────────────── */}
        <Text style={s.sectionTitle}>請求対象案件（{projects.length}件）</Text>
        <View style={s.table}>
          {/* ヘッダー行 */}
          <View style={s.tableHeaderRow}>
            <Text style={[s.th, s.cName]}>案件名</Text>
            <Text style={[s.th, s.cAddr]}>現場住所</Text>
            <Text style={[s.th, s.cWork]}>工事内容</Text>
            <Text style={[s.th, s.cDate]}>完了日</Text>
            <Text style={[s.th, s.cSubtotal, { textAlign: 'right' }]}>小計</Text>
            <Text style={[s.th, s.cTax, { textAlign: 'right' }]}>消費税</Text>
            <Text style={[s.th, s.cTotal, { textAlign: 'right' }]}>税込金額</Text>
          </View>
          {/* データ行 */}
          {projects.map((proj, i) => (
            <View key={i} style={i % 2 === 1 ? [s.tableRow, s.tableRowEven] : s.tableRow}>
              <Text style={[s.td, s.cName]}>{proj.projectName}</Text>
              <Text style={[s.td, s.cAddr]}>{proj.siteAddress}</Text>
              <Text style={[s.td, s.cWork]}>{proj.workSummary}</Text>
              <Text style={[s.td, s.cDate]}>{fmtDate(proj.completedAt)}</Text>
              <Text style={[s.tdR, s.cSubtotal]}>{fmtYen(proj.subtotal)}</Text>
              <Text style={[s.tdR, s.cTax]}>{fmtYen(proj.tax)}</Text>
              <Text style={[s.tdR, s.cTotal]}>{fmtYen(proj.total)}</Text>
            </View>
          ))}
        </View>

        {/* ─── 集計・振込先・備考 ──────────────────────────── */}
        <View style={s.bottomSection}>

          {/* 集計 */}
          <View style={s.summaryBox}>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>対象案件数</Text>
              <Text style={s.summaryAmt}>{projects.length}件</Text>
            </View>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>小計合計</Text>
              <Text style={s.summaryAmt}>{fmtYen(subtotalSum)}</Text>
            </View>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>消費税合計</Text>
              <Text style={s.summaryAmt}>{fmtYen(taxSum)}</Text>
            </View>
            <View style={s.summaryRowTotal}>
              <Text style={s.summaryLabelBold}>税込請求額</Text>
              <Text style={s.summaryAmtBold}>{fmtYen(totalWithTax)}</Text>
            </View>
          </View>

          {/* 振込先 */}
          <View style={s.bankSection}>
            <Text style={s.bankTitle}>お振込先</Text>
            {bankDesc ? (
              <>
                <View style={s.bankRow}>
                  <Text style={s.bankLabel}>金融機関</Text>
                  <Text style={s.bankValue}>{bankDesc}</Text>
                </View>
                {bank.accountHolder ? (
                  <View style={s.bankRow}>
                    <Text style={s.bankLabel}>口座名義</Text>
                    <Text style={s.bankValue}>{bank.accountHolder}</Text>
                  </View>
                ) : null}
              </>
            ) : (
              <Text style={{ fontSize: 7, color: GRAY }}>（振込先未入力）</Text>
            )}
            {/* 備考 */}
            {invoiceNote ? (
              <View style={s.noteSection}>
                <Text style={s.noteTitle}>備考</Text>
                <Text style={s.noteText}>{invoiceNote}</Text>
              </View>
            ) : null}
          </View>

        </View>
      </Page>
    </Document>
  );
}

// ─── ファクトリ関数（動的importで呼び出す） ────────────────────
export function makeBulkInvoicePDF(props: BulkInvoicePDFProps): React.ReactElement {
  return <BulkInvoicePDFDocument {...props} />;
}
