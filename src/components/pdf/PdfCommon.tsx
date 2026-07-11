// 提出用PDF帳票の共通部品
//
// 既存の見積書PDF（EstimatePDF.tsx）のデザインを全帳票の親書式とする。
// スタイル値は EstimatePDF.tsx から抽出したものであり、変更しないこと。
// - A4横 / アクセントカラー #8B4A3C / Noto Sans JP（ローカルTTF）
// - 帳票ごとに会社情報・ヘッダーを別管理しない（必ずこの部品を使う）
// - 提出用帳票に原価・粗利を渡さない・表示しない

import React from 'react';
import { Text, View, StyleSheet, Font } from '@react-pdf/renderer';

// フォントは /public/fonts にローカル配置した完全版Noto Sans JPを使用する。
// 旧CDN（noto-sans-japanese@1.0.0）はグリフ収録が不完全で「△」等の記号が文字化けしていたため置き換えた。
Font.register({
  family: 'NotoSansJP',
  fonts: [
    {
      src: '/fonts/NotoSansJP-Regular.ttf',
      fontWeight: 400,
    },
    {
      src: '/fonts/NotoSansJP-Bold.ttf',
      fontWeight: 700,
    },
  ],
});

// ─── 共通カラー ───────────────────────────────────────────────
export const ACCENT = '#8B4A3C';
export const ACCENT_BG = '#fdf0ec';
export const BORDER = '#e2e2e2';
export const GRAY = '#6b7280';
export const ROW_EVEN_BG = '#fdf8f2';

// ─── 共通型 ───────────────────────────────────────────────────
export type CompanyInfoForPDF = {
  name: string;
  postalCode: string;
  address: string;
  representative: string; // "代表　山田 太郎" 形式
  tel: string;
  email: string;
  invoiceNumber: string;
};

export type CommonDocumentProps = {
  documentTitle: string;
  documentNumber: string;
  createdDate: string;
  submitTo: string;
  projectName: string;
  siteAddress: string;
  companyInfo: CompanyInfoForPDF;
  projectId: string;
};

// ─── 共通ユーティリティ ───────────────────────────────────────
export function toNum(v: string): number {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

export function fmtYen(n: number): string {
  return '¥' + n.toLocaleString('ja-JP');
}

// PDF出力時のみ特殊単位を安全な文字列に変換する（画面表示は変更しない）
export function safePdfUnit(unit: string): string {
  return unit
    .replace(/㎡/g, 'm2')
    .replace(/㎥/g, 'm3')
    .replace(/㍍/g, 'm')
    .replace(/㎞/g, 'km')
    .replace(/㎝/g, 'cm')
    .replace(/㎜/g, 'mm')
    .replace(/㎏/g, 'kg')
    .replace(/㍑/g, 'L');
}

// ─── 共通ページスタイル ───────────────────────────────────────
export const pdfPageStyle = StyleSheet.create({
  // 見積書PDFと同一のベースページ（A4横で使用する）
  page: {
    fontFamily: 'NotoSansJP',
    fontSize: 8,
    padding: 22,
    backgroundColor: '#ffffff',
    color: '#1a1a1a',
  },
  // フッター・ページ番号を使う帳票用（下部に余白を確保）
  pageWithFooter: {
    fontFamily: 'NotoSansJP',
    fontSize: 8,
    padding: 22,
    paddingBottom: 30,
    backgroundColor: '#ffffff',
    color: '#1a1a1a',
  },
});

// ─── ヘッダースタイル（EstimatePDF.tsx から抽出・不変） ────────
const hs = StyleSheet.create({
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
    fontSize: 16,
    fontWeight: 700,
    color: ACCENT,
    marginBottom: 7,
  },
  clientRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  clientLabel: {
    width: 52,
    fontSize: 7,
    color: GRAY,
  },
  clientValueLg: {
    fontSize: 9,
    fontWeight: 700,
  },
  clientValue: {
    fontSize: 8,
  },
  headerRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  docInfoRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  docInfoLabel: {
    fontSize: 7,
    color: GRAY,
    marginRight: 6,
  },
  docInfoValue: {
    fontSize: 7,
  },
  totalBox: {
    borderWidth: 1.5,
    borderColor: ACCENT,
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    minWidth: 90,
    marginTop: 4,
  },
  totalBoxLabel: {
    fontSize: 7,
    color: ACCENT,
    marginBottom: 3,
  },
  totalBoxAmount: {
    fontSize: 14,
    fontWeight: 700,
    color: ACCENT,
  },
  companyBlock: {
    alignItems: 'flex-end',
    marginTop: 5,
    paddingTop: 4,
    borderTopWidth: 0.5,
    borderTopColor: BORDER,
    width: '100%',
  },
  companyName: {
    fontSize: 8,
    fontWeight: 700,
    color: '#1a1a1a',
    textAlign: 'right',
    marginBottom: 1,
  },
  companyRow: {
    fontSize: 6.5,
    color: '#444',
    textAlign: 'right',
    marginBottom: 0.8,
  },
  companyInvoiceNo: {
    fontSize: 6.5,
    color: ACCENT,
    fontWeight: 700,
    textAlign: 'right',
    marginTop: 1,
  },
  footer: {
    position: 'absolute',
    bottom: 10,
    left: 22,
    flexDirection: 'row',
    gap: 10,
  },
  footerText: {
    fontSize: 6.5,
    color: GRAY,
  },
  pageNumber: {
    position: 'absolute',
    bottom: 10,
    right: 22,
    fontSize: 6.5,
    color: GRAY,
  },
});

// ─── PdfDocumentInfo: 書類番号・作成日など ─────────────────────
export function PdfDocumentInfo({
  items,
}: {
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <View>
      {items.map((item) => (
        <View key={item.label} style={hs.docInfoRow}>
          <Text style={hs.docInfoLabel}>{item.label}</Text>
          <Text style={hs.docInfoValue}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── PdfCompanyBlock: 自社情報（全帳票で共通管理） ─────────────
export function PdfCompanyBlock({ companyInfo }: { companyInfo: CompanyInfoForPDF }) {
  return (
    <View style={hs.companyBlock}>
      <Text style={hs.companyName}>{companyInfo.name}</Text>
      <Text style={hs.companyRow}>{companyInfo.postalCode}</Text>
      <Text style={hs.companyRow}>{companyInfo.address}</Text>
      <Text style={hs.companyRow}>{companyInfo.representative}</Text>
      <Text style={hs.companyRow}>TEL：{companyInfo.tel}</Text>
      <Text style={hs.companyRow}>MAIL：{companyInfo.email}</Text>
      <Text style={hs.companyInvoiceNo}>登録番号：{companyInfo.invoiceNumber}</Text>
    </View>
  );
}

// ─── PdfTotalBox: 税込金額の強調ボックス ───────────────────────
export function PdfTotalBox({ label, amount }: { label: string; amount: number }) {
  return (
    <View style={hs.totalBox}>
      <Text style={hs.totalBoxLabel}>{label}</Text>
      <Text style={hs.totalBoxAmount}>{fmtYen(amount)}</Text>
    </View>
  );
}

// ─── PdfDocumentHeader: 帳票共通ヘッダー ───────────────────────
// 左：帳票名・提出先・案件名・現場住所
// 右：書類情報（番号・作成日）・自社情報・（任意で）金額ボックス
export function PdfDocumentHeader({
  documentTitle,
  submitTo,
  projectName,
  siteAddress,
  documentInfo,
  companyInfo,
  totalBox,
}: {
  documentTitle: string;
  submitTo: string;
  projectName: string;
  siteAddress: string;
  documentInfo: Array<{ label: string; value: string }>;
  companyInfo: CompanyInfoForPDF;
  totalBox?: { label: string; amount: number };
}) {
  return (
    <View style={hs.header}>
      <View style={hs.headerLeft}>
        <Text style={hs.docTitle}>{documentTitle}</Text>
        <View style={hs.clientRow}>
          <Text style={hs.clientLabel}>提出先</Text>
          <Text style={hs.clientValueLg}>{submitTo}</Text>
        </View>
        <View style={hs.clientRow}>
          <Text style={hs.clientLabel}>案件名</Text>
          <Text style={hs.clientValue}>{projectName}</Text>
        </View>
        <View style={hs.clientRow}>
          <Text style={hs.clientLabel}>現場住所</Text>
          <Text style={hs.clientValue}>{siteAddress}</Text>
        </View>
      </View>
      <View style={hs.headerRight}>
        <PdfDocumentInfo items={documentInfo} />
        <PdfCompanyBlock companyInfo={companyInfo} />
        {totalBox && <PdfTotalBox label={totalBox.label} amount={totalBox.amount} />}
      </View>
    </View>
  );
}

// ─── PdfFooter: 案件ID・書類番号（固定表示） ────────────────────
export function PdfFooter({
  projectId,
  documentNumber,
}: {
  projectId: string;
  documentNumber: string;
}) {
  return (
    <View style={hs.footer} fixed>
      <Text style={hs.footerText}>案件ID：{projectId}</Text>
      <Text style={hs.footerText}>書類番号：{documentNumber}</Text>
    </View>
  );
}

// ─── PdfPageNumber: ページ番号（固定表示） ──────────────────────
export function PdfPageNumber() {
  return (
    <Text
      style={hs.pageNumber}
      fixed
      render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
    />
  );
}

// ─── 共通明細テーブルスタイル（EstimatePDF.tsx から抽出・不変） ─
export const pdfTableStyle = StyleSheet.create({
  table: {
    marginBottom: 8,
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
    backgroundColor: ROW_EVEN_BG,
  },
  th: {
    paddingVertical: 7,
    paddingHorizontal: 4,
    fontSize: 7,
    fontWeight: 700,
    color: '#ffffff',
    borderRightWidth: 0.5,
    borderRightColor: 'rgba(255,255,255,0.25)',
    lineHeight: 1.25,
  },
  td: {
    paddingVertical: 7,
    paddingHorizontal: 4,
    fontSize: 7,
    color: '#333',
    borderRightWidth: 0.5,
    borderRightColor: BORDER,
    flexWrap: 'wrap',
    lineHeight: 1.25,
  },
  tdR: {
    paddingVertical: 7,
    paddingHorizontal: 4,
    fontSize: 7,
    color: '#333',
    borderRightWidth: 0.5,
    borderRightColor: BORDER,
    textAlign: 'right',
    lineHeight: 1.25,
  },
  tdC: {
    paddingVertical: 7,
    paddingHorizontal: 4,
    fontSize: 7,
    color: '#333',
    borderRightWidth: 0.5,
    borderRightColor: BORDER,
    textAlign: 'center',
    lineHeight: 1.25,
  },
});

// ─── 共通合計ボックススタイル（EstimatePDF.tsx から抽出・不変） ─
export const pdfSummaryStyle = StyleSheet.create({
  summaryOuter: {
    alignItems: 'flex-end',
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
  },
  summaryLabel: {
    flex: 1,
    fontSize: 8,
    color: GRAY,
  },
  summaryAmt: {
    fontSize: 8,
    textAlign: 'right',
    minWidth: 72,
  },
  summaryLabelBold: {
    flex: 1,
    fontSize: 10,
    fontWeight: 700,
    color: ACCENT,
  },
  summaryAmtBold: {
    fontSize: 11,
    fontWeight: 700,
    color: ACCENT,
    textAlign: 'right',
    minWidth: 72,
  },
});

// ─── 税込合計の共通サマリー（小計・消費税・税込合計） ───────────
export function PdfTaxSummary({
  subtotal,
  tax,
  total,
  totalLabel = '税込合計',
}: {
  subtotal: number;
  tax: number;
  total: number;
  totalLabel?: string;
}) {
  const s = pdfSummaryStyle;
  return (
    <View style={s.summaryOuter}>
      <View style={s.summaryBox}>
        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>小計合計</Text>
          <Text style={s.summaryAmt}>{fmtYen(subtotal)}</Text>
        </View>
        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>消費税（10%）</Text>
          <Text style={s.summaryAmt}>{fmtYen(tax)}</Text>
        </View>
        <View style={s.summaryRowTotal}>
          <Text style={s.summaryLabelBold}>{totalLabel}</Text>
          <Text style={s.summaryAmtBold}>{fmtYen(total)}</Text>
        </View>
      </View>
    </View>
  );
}
