// 個別請求書 PDF（案件情報・会社情報・工事項目から生成）
// 提出用のみ — 原価・粗利は props に含めない設計（型レベルで排除）

import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import {
  ACCENT,
  BORDER,
  GRAY,
  fmtYen,
  pdfPageStyle,
  PdfDocumentHeader,
  PdfTaxSummary,
  PdfFooter,
  PdfPageNumber,
  type CommonDocumentProps,
} from './PdfCommon';
import { SellingLinesTable, type SellingLine } from './WorkEstimatePDF';

export type BankInfoForPDF = {
  bankName: string;
  branchName: string;
  accountType: string;
  accountNumber: string;
  accountHolder: string;
};

export type ProjectInvoicePDFProps = CommonDocumentProps & {
  lines: SellingLine[];
  subtotalSum: number;
  taxSum: number;
  totalWithTax: number;
  invoiceDate: string;
  dueDate: string; // 未定の場合は空文字
  bank: BankInfoForPDF;
  invoiceNote: string;
};

const s = StyleSheet.create({
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 14,
    marginTop: 4,
  },
  bankBox: {
    flex: 1,
    maxWidth: 300,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 3,
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
  bankRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  bankLabel: {
    width: 52,
    fontSize: 7,
    color: GRAY,
  },
  bankValue: {
    fontSize: 7.5,
  },
  noteText: {
    fontSize: 7,
    color: '#555',
    marginTop: 6,
    lineHeight: 1.5,
  },
});

function ProjectInvoicePDFDocument(props: ProjectInvoicePDFProps) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={pdfPageStyle.pageWithFooter}>
        <PdfDocumentHeader
          documentTitle={props.documentTitle}
          submitTo={props.submitTo}
          projectName={props.projectName}
          siteAddress={props.siteAddress}
          documentInfo={[
            { label: '請求番号', value: props.documentNumber },
            { label: '請求日', value: props.invoiceDate },
            { label: 'お支払期限', value: props.dueDate || '別途ご相談' },
          ]}
          companyInfo={props.companyInfo}
          totalBox={{ label: 'ご請求金額（税込）', amount: props.totalWithTax }}
        />

        <SellingLinesTable lines={props.lines} />

        {/* 振込先（左）と合計（右） */}
        <View style={s.bottomRow}>
          <View style={s.bankBox}>
            <Text style={s.bankTitle}>お振込先</Text>
            <View style={s.bankRow}>
              <Text style={s.bankLabel}>金融機関</Text>
              <Text style={s.bankValue}>{props.bank.bankName} {props.bank.branchName}</Text>
            </View>
            <View style={s.bankRow}>
              <Text style={s.bankLabel}>口座</Text>
              <Text style={s.bankValue}>{props.bank.accountType} {props.bank.accountNumber}</Text>
            </View>
            <View style={s.bankRow}>
              <Text style={s.bankLabel}>名義</Text>
              <Text style={s.bankValue}>{props.bank.accountHolder}</Text>
            </View>
            {props.invoiceNote !== '' && (
              <Text style={s.noteText}>{props.invoiceNote}</Text>
            )}
          </View>
          <PdfTaxSummary
            subtotal={props.subtotalSum}
            tax={props.taxSum}
            total={props.totalWithTax}
            totalLabel="ご請求金額"
          />
        </View>

        <PdfFooter projectId={props.projectId} documentNumber={props.documentNumber} />
        <PdfPageNumber />
      </Page>
    </Document>
  );
}

export function makeProjectInvoicePDF(props: ProjectInvoicePDFProps): React.ReactElement {
  return <ProjectInvoicePDFDocument {...props} />;
}
