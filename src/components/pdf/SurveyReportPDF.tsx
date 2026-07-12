// 現地調査報告書 PDF
// 被害一覧（被害ID・被害箇所・確認した事実・推定原因・必要な復旧工事・根拠写真番号）と
// 事故情報・総括を出力する。金額情報は含まない。

import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import {
  ACCENT,
  BORDER,
  GRAY,
  pdfPageStyle,
  pdfTableStyle,
  PdfDocumentHeader,
  PdfFooter,
  PdfPageNumber,
  type CommonDocumentProps,
} from './PdfCommon';

export type SurveyReportDamageRow = {
  damageId: string;
  location: string;
  confirmedFact: string;
  suspectedCause: string;
  requiredRestoration: string;
  relatedPhotoIds: string[];
};

export type SurveyReportPDFProps = CommonDocumentProps & {
  /** 保険案件の場合のみ設定（通常案件は null） */
  accident: {
    accidentTypeLabel: string;
    suspectedCause: string;
    accidentDate: string;
    surveyDate: string;
  } | null;
  /** 確認者（通常は自社代表者） */
  inspectorName: string;
  damages: SurveyReportDamageRow[];
  /** 総括 */
  summaryText: string;
};

const s = StyleSheet.create({
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 3,
    marginBottom: 8,
  },
  infoCell: {
    width: '25%',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  infoLabel: {
    fontSize: 6.5,
    color: GRAY,
    marginBottom: 1.5,
  },
  infoValue: {
    fontSize: 8,
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: 700,
    color: ACCENT,
    marginBottom: 4,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  summaryBox: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 3,
    padding: 8,
    minHeight: 40,
  },
  summaryText: {
    fontSize: 8,
    lineHeight: 1.6,
  },
});

const col = StyleSheet.create({
  cId:      { width: '7%' },
  cLoc:     { width: '13%' },
  cFact:    { width: '25%' },
  cCause:   { width: '20%' },
  cRestore: { width: '22%' },
  cPhotos:  { width: '13%' },
});

function SurveyReportPDFDocument(props: SurveyReportPDFProps) {
  const t = pdfTableStyle;
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={pdfPageStyle.pageWithFooter}>
        <PdfDocumentHeader
          documentTitle={props.documentTitle}
          submitTo={props.submitTo}
          projectName={props.projectName}
          siteAddress={props.siteAddress}
          documentInfo={[
            { label: '書類番号', value: props.documentNumber },
            { label: '作成日', value: props.createdDate },
          ]}
          companyInfo={props.companyInfo}
        />

        {/* 事故情報・調査情報 */}
        <View style={s.infoGrid}>
          {props.accident && (
            <>
              <View style={s.infoCell}>
                <Text style={s.infoLabel}>事故種別</Text>
                <Text style={s.infoValue}>{props.accident.accidentTypeLabel}</Text>
              </View>
              <View style={s.infoCell}>
                <Text style={s.infoLabel}>発生日</Text>
                <Text style={s.infoValue}>{props.accident.accidentDate || '—'}</Text>
              </View>
              <View style={s.infoCell}>
                <Text style={s.infoLabel}>調査日</Text>
                <Text style={s.infoValue}>{props.accident.surveyDate || '—'}</Text>
              </View>
            </>
          )}
          <View style={s.infoCell}>
            <Text style={s.infoLabel}>確認者</Text>
            <Text style={s.infoValue}>{props.inspectorName}</Text>
          </View>
          {props.accident && props.accident.suspectedCause !== '' && (
            <View style={[s.infoCell, { width: '100%' }]}>
              <Text style={s.infoLabel}>推定原因（全体）</Text>
              <Text style={s.infoValue}>{props.accident.suspectedCause}</Text>
            </View>
          )}
        </View>

        {/* 被害一覧 */}
        <Text style={s.sectionTitle}>被害一覧</Text>
        <View style={t.table}>
          <View style={t.tableHeaderRow}>
            <Text style={[t.th, col.cId]}>被害ID</Text>
            <Text style={[t.th, col.cLoc]}>被害箇所</Text>
            <Text style={[t.th, col.cFact]}>確認した事実</Text>
            <Text style={[t.th, col.cCause]}>推定原因</Text>
            <Text style={[t.th, col.cRestore]}>必要な復旧工事</Text>
            <Text style={[t.th, col.cPhotos]}>根拠写真番号</Text>
          </View>
          {props.damages.map((d, i) => {
            const rowStyle = i % 2 === 1 ? [t.tableRow, t.tableRowEven] : t.tableRow;
            return (
              <View key={d.damageId} style={rowStyle} wrap={false}>
                <Text style={[t.tdC, col.cId]}>{d.damageId}</Text>
                <Text style={[t.td, col.cLoc]}>{d.location}</Text>
                <Text style={[t.td, col.cFact]}>{d.confirmedFact}</Text>
                <Text style={[t.td, col.cCause]}>{d.suspectedCause}</Text>
                <Text style={[t.td, col.cRestore]}>{d.requiredRestoration}</Text>
                <Text style={[t.td, col.cPhotos]}>{d.relatedPhotoIds.join('、')}</Text>
              </View>
            );
          })}
        </View>

        {/* 総括 */}
        <Text style={s.sectionTitle}>総括</Text>
        <View style={s.summaryBox}>
          <Text style={s.summaryText}>{props.summaryText || '　'}</Text>
        </View>

        <PdfFooter projectId={props.projectId} documentNumber={props.documentNumber} />
        <PdfPageNumber />
      </Page>
    </Document>
  );
}

export function makeSurveyReportPDF(props: SurveyReportPDFProps): React.ReactElement {
  return <SurveyReportPDFDocument {...props} />;
}
