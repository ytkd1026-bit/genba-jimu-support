// 得意先別 一括請求書 PDFコンポーネント
// 原価・粗利・利益率は一切含まない

// TODO: companyInfo は将来的に事業者設定画面から登録・編集できるようにする
// TODO: customer.address は元請マスタ customers から取得する
// TODO: 郵送用にはA4縦・小窓封筒専用テンプレも追加検討する
// TODO: インボイス登録番号は事業者設定からPDFへ反映する

import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
// フォント登録・会社情報型・金額整形は PdfCommon に一元化している（S-8 PDF統一）。
// PdfCommon を import した時点で NotoSansJP が登録される。
import { fmtYen, type CompanyInfoForPDF } from '@/components/pdf/PdfCommon';

// ─── 型定義 ──────────────────────────────────────────────────
export type CompanyInfo = CompanyInfoForPDF;

export type BulkInvoicePDFProps = {
  invoiceNo: string;
  invoiceDate: string;
  periodFrom: string;
  periodTo: string;
  customer: {
    displayName: string;
    contactName: string;
    postalCode: string;
    address: string;
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
  companyInfo: CompanyInfo;
};

type ProjectRow = BulkInvoicePDFProps['projects'][number];

// ─── ページ分割定数 ─────────────────────────────────────────────
// 1ページ目：フルヘッダーがあるため案件行を少なめに抑える
const FIRST_PAGE_ROWS = 12;
// 2ページ目以降：簡略ヘッダーで多く表示できる
const NEXT_PAGE_ROWS  = 20;

function splitIntoPages<T>(items: T[], first: number, rest: number): T[][] {
  if (items.length === 0) return [[]];
  const pages: T[][] = [items.slice(0, first)];
  let i = first;
  while (i < items.length) {
    pages.push(items.slice(i, i + rest));
    i += rest;
  }
  return pages;
}

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

  // ── ページ番号 ────────────────────────────────────────────────
  pageNumRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 2,
  },
  pageNumText: { fontSize: 7, color: GRAY },

  // ── フルヘッダー（1ページ目） ─────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 4,
  },
  headerDivider: {
    borderBottomWidth: 1.5,
    borderBottomColor: ACCENT,
    marginBottom: 5,
  },

  // 左列：請求先宛名（封筒小窓対応）
  colLeft: {
    width: 160,
    paddingRight: 8,
    borderRightWidth: 0.5,
    borderRightColor: BORDER,
  },
  addressBlock: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#999',
    padding: 6,
  },
  addressPostal:  { fontSize: 6.5, color: GRAY,      marginBottom: 1 },
  addressLine:    { fontSize: 6.5, color: '#1a1a1a', marginBottom: 2, lineHeight: 1.3 },
  addressName:    { fontSize: 10,  fontWeight: 700,  color: '#1a1a1a', marginBottom: 1 },
  addressContact: { fontSize: 6.5, color: GRAY },

  // 中央列：タイトル + 税込請求額
  colCenter: { flex: 1, paddingHorizontal: 8 },
  docTitle:    { fontSize: 14, fontWeight: 700, color: ACCENT, textAlign: 'center', marginBottom: 1 },
  docSubTitle: { fontSize: 7.5, color: GRAY, textAlign: 'center', marginBottom: 3 },
  infoRow:   { flexDirection: 'row', marginBottom: 2 },
  infoLabel: { width: 48, fontSize: 6.5, color: GRAY },
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

  // 右列：弊社情報 + 支払期日
  colRight: {
    width: 160,
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

  // ── 簡略ヘッダー（2ページ目以降） ────────────────────────────
  simpleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1.5,
    borderBottomColor: ACCENT,
    paddingBottom: 4,
    marginBottom: 6,
  },
  simpleHeaderLeft:   { fontSize: 10, fontWeight: 700, color: ACCENT, width: 120 },
  simpleHeaderCenter: { flex: 1, fontSize: 8, color: '#1a1a1a', textAlign: 'center' },
  simpleHeaderRight:  { fontSize: 7, color: GRAY, textAlign: 'right', width: 120 },

  // ── 案件テーブル ──────────────────────────────────────────────
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
  cName:     { width: '22%' },
  cAddr:     { width: '18%' },
  cWork:     { width: '28%' },
  cDate:     { width: '10%' },
  cSubtotal: { width: '8%' },
  cTax:      { width: '7%' },
  cTotal:    { width: '7%' },

  // ── 集計・振込先・備考（最終ページ） ─────────────────────────
  bottomSection: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    marginTop: 4,
  },
  summaryBox: { width: 195, borderWidth: 1, borderColor: BORDER, borderRadius: 2 },
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
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 5,
  },
  noteTitle: { fontSize: 8, fontWeight: 700, color: '#444', marginBottom: 3 },
  noteText:  { fontSize: 7.5, color: '#555', lineHeight: 1.5 },
});

// ─── テーブルヘッダー行（各ページで使い回す） ────────────────────
function TableHead() {
  return (
    <View style={s.tableHeaderRow}>
      <Text style={[s.th, s.cName]}>案件名</Text>
      <Text style={[s.th, s.cAddr]}>現場住所</Text>
      <Text style={[s.th, s.cWork]}>工事内容</Text>
      <Text style={[s.th, s.cDate]}>完了日</Text>
      <Text style={[s.th, s.cSubtotal, { textAlign: 'right' }]}>小計</Text>
      <Text style={[s.th, s.cTax, { textAlign: 'right' }]}>消費税</Text>
      <Text style={[s.th, s.cTotal, { textAlign: 'right' }]}>税込金額</Text>
    </View>
  );
}

// ─── 案件行 ──────────────────────────────────────────────────
function ProjectRowEl({ proj, rowIndex }: { proj: ProjectRow; rowIndex: number }) {
  const isEven = rowIndex % 2 === 1;
  return (
    <View style={isEven ? [s.tableRow, s.tableRowEven] : s.tableRow}>
      <Text style={[s.td, s.cName]}>{proj.projectName}</Text>
      <Text style={[s.td, s.cAddr]}>{proj.siteAddress}</Text>
      <Text style={[s.td, s.cWork]}>{proj.workSummary}</Text>
      <Text style={[s.td, s.cDate]}>{fmtDate(proj.completedAt)}</Text>
      <Text style={[s.tdR, s.cSubtotal]}>{fmtYen(proj.subtotal)}</Text>
      <Text style={[s.tdR, s.cTax]}>{fmtYen(proj.tax)}</Text>
      <Text style={[s.tdR, s.cTotal]}>{fmtYen(proj.total)}</Text>
    </View>
  );
}

// ─── フルヘッダー（1ページ目） ────────────────────────────────
function FullPageHeader({
  customer, invoiceNo, invoiceDate, periodFrom, periodTo, totalWithTax, companyInfo,
}: {
  customer: BulkInvoicePDFProps['customer'];
  invoiceNo: string;
  invoiceDate: string;
  periodFrom: string;
  periodTo: string;
  totalWithTax: number;
  companyInfo: CompanyInfo;
}) {
  return (
    <>
      <View style={s.header}>
        {/* 左列：請求先宛名 */}
        <View style={s.colLeft}>
          <View style={s.addressBlock}>
            <Text style={s.addressPostal}>{customer.postalCode}</Text>
            <Text style={s.addressLine}>{customer.address}</Text>
            <Text style={s.addressName}>{customer.displayName}</Text>
            <Text style={s.addressContact}>担当：{customer.contactName}</Text>
          </View>
        </View>

        {/* 中央列：タイトル + 税込請求額 */}
        <View style={s.colCenter}>
          <Text style={s.docTitle}>請求書</Text>
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
          <View style={s.totalCenterBox}>
            <Text style={s.totalCenterLabel}>税込請求額</Text>
            <Text style={s.totalCenterAmount}>{fmtYen(totalWithTax)}</Text>
          </View>
        </View>

        {/* 右列：弊社情報 + 支払期日 */}
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
            <Text style={s.dueDateValue}>{fmtDate(customer.dueDate)}</Text>
          </View>
        </View>
      </View>
      <View style={s.headerDivider} />
    </>
  );
}

// ─── 簡略ヘッダー（2ページ目以降） ───────────────────────────
function SimplePageHeader({
  customer, invoiceNo, invoiceDate,
}: {
  customer: BulkInvoicePDFProps['customer'];
  invoiceNo: string;
  invoiceDate: string;
}) {
  return (
    <View style={s.simpleHeader}>
      <Text style={s.simpleHeaderLeft}>請求書（続き）</Text>
      <Text style={s.simpleHeaderCenter}>{customer.displayName}</Text>
      <Text style={s.simpleHeaderRight}>
        {invoiceNo}　請求日：{fmtDate(invoiceDate)}
      </Text>
    </View>
  );
}

// ─── PDFドキュメント本体 ──────────────────────────────────────
function BulkInvoicePDFDocument({
  invoiceNo, invoiceDate, periodFrom, periodTo,
  customer, projects, subtotalSum, taxSum, totalWithTax,
  bank, invoiceNote, companyInfo,
}: BulkInvoicePDFProps) {
  const hasBankInfo = !!(bank.bankName || bank.branchName || bank.accountNumber || bank.accountHolder);

  // ── ページ分割 ──────────────────────────────────────────────
  const pages = splitIntoPages(projects, FIRST_PAGE_ROWS, NEXT_PAGE_ROWS);
  const totalPages = pages.length;

  // 各ページの先頭行が全体リストで何番目かを計算（縞模様の連続性のため）
  const pageStartIndices: number[] = [0];
  for (let i = 1; i < pages.length; i++) {
    pageStartIndices.push(pageStartIndices[i - 1] + pages[i - 1].length);
  }

  return (
    <Document>
      {pages.map((chunk, pageIdx) => {
        const isFirst = pageIdx === 0;
        const isLast  = pageIdx === totalPages - 1;
        const globalStart = pageStartIndices[pageIdx];

        return (
          <Page key={pageIdx} size="A4" orientation="landscape" style={s.page}>

            {/* ページ番号（右上） */}
            <View style={s.pageNumRow}>
              <Text style={s.pageNumText}>{pageIdx + 1} / {totalPages}</Text>
            </View>

            {/* ヘッダー */}
            {isFirst ? (
              <FullPageHeader
                customer={customer}
                invoiceNo={invoiceNo}
                invoiceDate={invoiceDate}
                periodFrom={periodFrom}
                periodTo={periodTo}
                totalWithTax={totalWithTax}
                companyInfo={companyInfo}
              />
            ) : (
              <SimplePageHeader
                customer={customer}
                invoiceNo={invoiceNo}
                invoiceDate={invoiceDate}
              />
            )}

            {/* 案件テーブル */}
            <Text style={s.sectionTitle}>
              {isFirst
                ? `請求対象案件（全${projects.length}件）`
                : `請求対象案件（続き　${globalStart + 1}〜${globalStart + chunk.length}件目）`}
            </Text>
            <View style={s.table}>
              <TableHead />
              {chunk.map((proj, i) => (
                <ProjectRowEl
                  key={i}
                  proj={proj}
                  rowIndex={globalStart + i}
                />
              ))}
            </View>

            {/* 最終ページのみ：集計・振込先・備考 */}
            {isLast && (
              <>
                <View style={s.bottomSection}>
                  {/* 左：請求金額集計 */}
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

                  {/* 右：お振込先 */}
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
                      <Text style={{ fontSize: 7, color: GRAY }}>（振込先未入力）</Text>
                    )}
                  </View>
                </View>

                {/* 備考 */}
                {invoiceNote ? (
                  <View style={s.noteSection}>
                    <Text style={s.noteTitle}>備考</Text>
                    <Text style={s.noteText}>{invoiceNote}</Text>
                  </View>
                ) : null}
              </>
            )}

          </Page>
        );
      })}
    </Document>
  );
}

// ─── ファクトリ関数（動的importで呼び出す） ────────────────────
export function makeBulkInvoicePDF(props: BulkInvoicePDFProps): React.ReactElement {
  return <BulkInvoicePDFDocument {...props} />;
}
