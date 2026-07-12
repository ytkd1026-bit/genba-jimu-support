// 写真報告台帳 PDF
// 1ページに複数写真（2列×2段 = 4枚）を配置する。
// 表示項目: 写真ID・写真・撮影箇所・撮影区分・説明・関連被害ID・撮影日

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

export type PhotoLedgerItem = {
  photoId: string;
  imageDataUrl?: string;
  location: string;
  phaseLabel: string;
  description: string;
  damageId?: string;
  capturedAt: string;
};

export type PhotoLedgerPDFProps = CommonDocumentProps & {
  photos: PhotoLedgerItem[];
};

// 1ページあたりの写真数（2列×2段）
const PHOTOS_PER_PAGE = 4;

function chunk<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [[]];
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    pages.push(items.slice(i, i + size));
  }
  return pages;
}

const s = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  cell: {
    width: '48.6%',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 3,
    overflow: 'hidden',
  },
  cellHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: ACCENT,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  cellPhotoId: {
    fontSize: 8,
    fontWeight: 700,
    color: '#ffffff',
  },
  cellHeaderRight: {
    fontSize: 6.5,
    color: '#ffffff',
  },
  image: {
    width: '100%',
    height: 130,
    objectFit: 'contain',
    backgroundColor: '#f5f5f4',
  },
  noImage: {
    width: '100%',
    height: 130,
    backgroundColor: '#f5f5f4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noImageText: {
    fontSize: 7,
    color: GRAY,
  },
  metaTable: {
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  metaRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
  },
  metaLabel: {
    width: 56,
    paddingHorizontal: 5,
    paddingVertical: 2.5,
    fontSize: 6.5,
    color: GRAY,
    backgroundColor: '#fafaf9',
  },
  metaValue: {
    flex: 1,
    paddingHorizontal: 5,
    paddingVertical: 2.5,
    fontSize: 7,
  },
});

function PhotoCell({ photo }: { photo: PhotoLedgerItem }) {
  return (
    <View style={s.cell} wrap={false}>
      <View style={s.cellHeader}>
        <Text style={s.cellPhotoId}>{photo.photoId}</Text>
        <Text style={s.cellHeaderRight}>
          {photo.phaseLabel}
          {photo.capturedAt ? `　${photo.capturedAt.replace(/-/g, '/')}` : ''}
        </Text>
      </View>
      {photo.imageDataUrl ? (
        // eslint-disable-next-line jsx-a11y/alt-text
        <Image style={s.image} src={photo.imageDataUrl} />
      ) : (
        <View style={s.noImage}>
          <Text style={s.noImageText}>（画像なし）</Text>
        </View>
      )}
      <View style={s.metaTable}>
        <View style={s.metaRow}>
          <Text style={s.metaLabel}>撮影箇所</Text>
          <Text style={s.metaValue}>{photo.location || '—'}</Text>
        </View>
        <View style={s.metaRow}>
          <Text style={s.metaLabel}>説明</Text>
          <Text style={s.metaValue}>{photo.description || '—'}</Text>
        </View>
        <View style={s.metaRow}>
          <Text style={s.metaLabel}>関連被害ID</Text>
          <Text style={s.metaValue}>{photo.damageId || '—'}</Text>
        </View>
      </View>
    </View>
  );
}

function PhotoLedgerPDFDocument(props: PhotoLedgerPDFProps) {
  const pages = chunk(props.photos, PHOTOS_PER_PAGE);
  return (
    <Document>
      {pages.map((pagePhotos, pageIndex) => (
        <Page key={pageIndex} size="A4" orientation="landscape" style={pdfPageStyle.pageWithFooter}>
          {/* 1ページ目のみフルヘッダー、2ページ目以降は簡略ヘッダー */}
          {pageIndex === 0 ? (
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
          ) : (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: BORDER }}>
              <Text style={{ fontSize: 9, fontWeight: 700, color: ACCENT }}>{props.documentTitle}</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Text style={{ fontSize: 7, color: GRAY }}>案件：{props.projectName}</Text>
                <Text style={{ fontSize: 7, color: GRAY }}>書類番号：{props.documentNumber}</Text>
              </View>
            </View>
          )}

          {pagePhotos.length === 0 ? (
            <Text style={{ fontSize: 8, color: GRAY }}>写真がありません。</Text>
          ) : (
            <View style={s.grid}>
              {pagePhotos.map((photo) => (
                <PhotoCell key={photo.photoId} photo={photo} />
              ))}
            </View>
          )}

          <PdfFooter projectId={props.projectId} documentNumber={props.documentNumber} />
          <PdfPageNumber />
        </Page>
      ))}
    </Document>
  );
}

export function makePhotoLedgerPDF(props: PhotoLedgerPDFProps): React.ReactElement {
  return <PhotoLedgerPDFDocument {...props} />;
}
