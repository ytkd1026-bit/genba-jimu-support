// 作業報告書 PDF
// 表示項目: 作業日・作業者・作業内容・完了内容・残作業・問題・原因・対応・
//           顧客確認事項・写真

import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import {
  ACCENT,
  BORDER,
  GRAY,
  pdfPageStyle,
  PdfDocumentHeader,
  PdfFooter,
  PdfPageNumber,
  type CommonDocumentProps,
} from './PdfCommon';

export type WorkReportPhoto = {
  photoId: string;
  imageDataUrl?: string;
  location: string;
  description: string;
};

export type WorkReportPDFProps = CommonDocumentProps & {
  workDate: string;
  workerName: string;
  workSummary: string;
  completedWork: string;
  remainingWork: string;
  issue: string;
  cause: string;
  actionTaken: string;
  customerConfirmation: string;
  photos: WorkReportPhoto[];
};

const s = StyleSheet.create({
  infoRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  infoBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  infoLabel: {
    fontSize: 6.5,
    color: GRAY,
    marginBottom: 1.5,
  },
  infoValue: {
    fontSize: 9,
    fontWeight: 700,
  },
  sectionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sectionBox: {
    width: '49%',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 3,
    overflow: 'hidden',
  },
  sectionBoxWide: {
    width: '100%',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 3,
    overflow: 'hidden',
  },
  sectionLabel: {
    fontSize: 7,
    fontWeight: 700,
    color: ACCENT,
    backgroundColor: '#fdf0ec',
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  sectionText: {
    fontSize: 8,
    lineHeight: 1.5,
    paddingHorizontal: 6,
    paddingVertical: 4,
    minHeight: 22,
  },
  photosTitle: {
    fontSize: 9,
    fontWeight: 700,
    color: ACCENT,
    marginTop: 8,
    marginBottom: 4,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoCell: {
    width: '23.5%',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 3,
    overflow: 'hidden',
  },
  photoImage: {
    width: '100%',
    height: 80,
    objectFit: 'contain',
    backgroundColor: '#f5f5f4',
  },
  photoCaption: {
    fontSize: 6.5,
    paddingHorizontal: 4,
    paddingVertical: 2.5,
    color: '#444',
  },
});

function ReportSection({ label, text, wide = false }: { label: string; text: string; wide?: boolean }) {
  return (
    <View style={wide ? s.sectionBoxWide : s.sectionBox} wrap={false}>
      <Text style={s.sectionLabel}>{label}</Text>
      <Text style={s.sectionText}>{text || '—'}</Text>
    </View>
  );
}

function WorkReportPDFDocument(props: WorkReportPDFProps) {
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

        {/* 作業日・作業者 */}
        <View style={s.infoRow}>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>作業日</Text>
            <Text style={s.infoValue}>{props.workDate ? props.workDate.replace(/-/g, '/') : '—'}</Text>
          </View>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>作業者</Text>
            <Text style={s.infoValue}>{props.workerName || '—'}</Text>
          </View>
        </View>

        {/* 報告セクション */}
        <View style={s.sectionGrid}>
          <ReportSection label="作業内容" text={props.workSummary} wide />
          <ReportSection label="完了内容" text={props.completedWork} />
          <ReportSection label="残作業" text={props.remainingWork} />
          <ReportSection label="問題" text={props.issue} />
          <ReportSection label="原因" text={props.cause} />
          <ReportSection label="対応" text={props.actionTaken} />
          <ReportSection label="顧客確認事項" text={props.customerConfirmation} />
        </View>

        {/* 関連写真 */}
        {props.photos.length > 0 && (
          <>
            <Text style={s.photosTitle}>写真</Text>
            <View style={s.photoGrid}>
              {props.photos.map((photo) => (
                <View key={photo.photoId} style={s.photoCell} wrap={false}>
                  {photo.imageDataUrl ? (
                    // eslint-disable-next-line jsx-a11y/alt-text
                    <Image style={s.photoImage} src={photo.imageDataUrl} />
                  ) : (
                    <View style={[s.photoImage, { alignItems: 'center', justifyContent: 'center' }]}>
                      <Text style={{ fontSize: 6.5, color: GRAY }}>（画像なし）</Text>
                    </View>
                  )}
                  <Text style={s.photoCaption}>
                    {photo.photoId} {photo.location || photo.description || ''}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        <PdfFooter projectId={props.projectId} documentNumber={props.documentNumber} />
        <PdfPageNumber />
      </Page>
    </Document>
  );
}

export function makeWorkReportPDF(props: WorkReportPDFProps): React.ReactElement {
  return <WorkReportPDFDocument {...props} />;
}
