// REVO固定提出書式の共通部品
//
// 方針:
// ・提出帳票は「一般企業がExcelで丁寧に作成した書類」に見せる。
// ・白背景 / 黒〜濃いグレー文字 / 細い罫線 / 濃紺は見出しとタイトルのみ。
// ・アプリのテーマ色（--nu-*）には連動させない。ここの色は固定値。
// ・グラデーション・カードUI・過度な角丸・絵文字は使わない。
// ・原価/粗利/内部管理は、この部品群が受け取る型に存在しない（データ段階で遮断）。
//
// 今回の適用範囲は見積書のみ。請求書・施工報告・完了報告・現調報告・写真台帳へは
// 同じトークンと部品を使って順次展開できるよう、帳票非依存の形にしてある。

import React from 'react';
import { Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import type { CompanyInfoForPdf } from '@/app/utils/companySettings';

// フォントは /public/fonts のローカル完全版 Noto Sans JP（記号の欠落なし）。
Font.register({
  family: 'NotoSansJP',
  fonts: [
    { src: '/fonts/NotoSansJP-Regular.ttf', fontWeight: 400 },
    { src: '/fonts/NotoSansJP-Bold.ttf', fontWeight: 700 },
  ],
});

// ─── REVO帳票の固定トークン（テーマ非連動） ────────────────────
export const REVO = {
  navy: '#1b365d',
  text: '#1a1a1a',
  textSub: '#404040',
  rule: '#9aa3ad',      // 表の主罫線
  ruleLight: '#c8cdd4', // 表の内側罫線
  headBg: '#eef1f5',    // 見出し行の淡いグレー
  white: '#ffffff',
} as const;

export function fmtNum(n: number): string {
  return n.toLocaleString('ja-JP');
}

/** 金額は帳票では記号を使わず「1,234」表記（列見出し側に「円」を出す） */
export function fmtMoney(n: number): string {
  return fmtNum(Math.round(n));
}

/** 数量は小数が無ければ整数表記にする */
export function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n);
}

// 単位の印字用正規化は帳票モデル側（app/utils/estimateDocument.ts の printableUnit）で
// 1回だけ行う。ここでは再実装しない（プレビューとPDFの表記を必ず一致させるため）。

// ─── ページ ───────────────────────────────────────────────────
export const revoPage = StyleSheet.create({
  page: {
    fontFamily: 'NotoSansJP',
    fontSize: 8,
    paddingTop: 24,
    paddingHorizontal: 26,
    paddingBottom: 34,
    backgroundColor: REVO.white,
    color: REVO.text,
  },
});

// ─── タイトル・ヘッダー ───────────────────────────────────────
const hs = StyleSheet.create({
  titleWrap: { alignItems: 'center', marginBottom: 12 },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: REVO.navy,
    letterSpacing: 6,
  },
  titleRule: {
    marginTop: 4,
    width: 150,
    borderBottomWidth: 1,
    borderBottomColor: REVO.navy,
  },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  headLeft: { width: '52%' },
  headRight: { width: '42%', alignItems: 'flex-end' },

  toName: { fontSize: 13, fontWeight: 700, marginBottom: 2 },
  toRule: { borderBottomWidth: 0.8, borderBottomColor: REVO.text, marginBottom: 6, paddingBottom: 2 },

  fieldRow: { flexDirection: 'row', marginBottom: 2.5 },
  fieldLabel: {
    width: 58,
    fontSize: 8,
    color: REVO.textSub,
    borderRightWidth: 0.5,
    borderRightColor: REVO.ruleLight,
    paddingRight: 4,
  },
  fieldValue: { fontSize: 8.5, paddingLeft: 6, flex: 1 },

  metaRow: { flexDirection: 'row', marginBottom: 2 },
  metaLabel: { fontSize: 8, color: REVO.textSub, width: 52, textAlign: 'right', marginRight: 6 },
  metaValue: { fontSize: 8.5, minWidth: 78, textAlign: 'left' },

  companyBox: {
    marginTop: 6,
    paddingTop: 5,
    borderTopWidth: 0.5,
    borderTopColor: REVO.ruleLight,
    alignItems: 'flex-end',
  },
  companyName: { fontSize: 10, fontWeight: 700, marginBottom: 1.5 },
  companyLine: { fontSize: 7.5, color: REVO.textSub, marginBottom: 1 },

  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 0.8,
    borderColor: REVO.navy,
    marginTop: 6,
    marginBottom: 2,
  },
  totalLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: REVO.white,
    backgroundColor: REVO.navy,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  totalValue: {
    fontSize: 13,
    fontWeight: 700,
    paddingVertical: 4,
    paddingHorizontal: 12,
    minWidth: 110,
    textAlign: 'right',
  },
});

/** 中央タイトル（「御見積書」など） */
export function RevoTitle({ text }: { text: string }) {
  return (
    <View style={hs.titleWrap}>
      <Text style={hs.title}>{text}</Text>
      <View style={hs.titleRule} />
    </View>
  );
}

export function RevoField({ label, value }: { label: string; value: string }) {
  return (
    <View style={hs.fieldRow}>
      <Text style={hs.fieldLabel}>{label}</Text>
      <Text style={hs.fieldValue}>{value}</Text>
    </View>
  );
}

export function RevoMeta({ label, value }: { label: string; value: string }) {
  return (
    <View style={hs.metaRow}>
      <Text style={hs.metaLabel}>{label}</Text>
      <Text style={hs.metaValue}>{value}</Text>
    </View>
  );
}

/** 自社情報ブロック（全帳票で共通・会社情報を帳票ごとに持たせない） */
export function RevoCompanyBlock({ company }: { company: CompanyInfoForPdf }) {
  return (
    <View style={hs.companyBox}>
      <Text style={hs.companyName}>{company.name}</Text>
      <Text style={hs.companyLine}>{company.postalCode}　{company.address}</Text>
      <Text style={hs.companyLine}>{company.representative}</Text>
      <Text style={hs.companyLine}>TEL：{company.tel}　MAIL：{company.email}</Text>
      <Text style={hs.companyLine}>インボイス登録番号：{company.invoiceNumber}</Text>
    </View>
  );
}

/** 帳票共通ヘッダー：左に宛先・件名等、右に書類情報・自社情報・合計 */
export function RevoDocumentHeader({
  toName,
  fields,
  meta,
  company,
  total,
}: {
  toName: string;
  fields: Array<{ label: string; value: string }>;
  meta: Array<{ label: string; value: string }>;
  company: CompanyInfoForPdf;
  total?: { label: string; amount: number };
}) {
  return (
    <View style={hs.headRow}>
      <View style={hs.headLeft}>
        <View style={hs.toRule}>
          <Text style={hs.toName}>{toName}</Text>
        </View>
        {fields.map((f) => (
          <RevoField key={f.label} label={f.label} value={f.value} />
        ))}
        {total && (
          <View style={hs.totalRow}>
            <Text style={hs.totalLabel}>{total.label}</Text>
            <Text style={hs.totalValue}>{fmtMoney(total.amount)} 円</Text>
          </View>
        )}
      </View>
      <View style={hs.headRight}>
        {meta.map((m) => (
          <RevoMeta key={m.label} label={m.label} value={m.value} />
        ))}
        <RevoCompanyBlock company={company} />
      </View>
    </View>
  );
}

// ─── 明細テーブル（細罫線・見出しは淡いグレー） ────────────────
export const revoTable = StyleSheet.create({
  table: { borderTopWidth: 0.8, borderTopColor: REVO.rule, borderLeftWidth: 0.5, borderLeftColor: REVO.rule },
  headerRow: { flexDirection: 'row', backgroundColor: REVO.headBg, borderBottomWidth: 0.8, borderBottomColor: REVO.rule },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: REVO.ruleLight },
  th: {
    paddingVertical: 5,
    paddingHorizontal: 3,
    fontSize: 7.5,
    fontWeight: 700,
    color: REVO.navy,
    textAlign: 'center',
    borderRightWidth: 0.5,
    borderRightColor: REVO.rule,
  },
  td: {
    paddingVertical: 4.5,
    paddingHorizontal: 3,
    fontSize: 7.5,
    color: REVO.text,
    borderRightWidth: 0.5,
    borderRightColor: REVO.ruleLight,
    lineHeight: 1.3,
  },
  tdR: { textAlign: 'right' },
  tdC: { textAlign: 'center' },
});

// ─── 合計欄 ───────────────────────────────────────────────────
export const revoSummary = StyleSheet.create({
  wrap: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  remarks: { width: '55%' },
  remarksTitle: { fontSize: 8, fontWeight: 700, color: REVO.navy, marginBottom: 3 },
  remarksBox: {
    borderWidth: 0.5,
    borderColor: REVO.ruleLight,
    padding: 6,
    minHeight: 52,
  },
  remarkLine: { fontSize: 7.5, color: REVO.textSub, marginBottom: 2, lineHeight: 1.35 },

  box: { width: 210, borderTopWidth: 0.8, borderTopColor: REVO.rule, borderLeftWidth: 0.5, borderLeftColor: REVO.rule },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: REVO.ruleLight },
  rowTotal: { flexDirection: 'row', borderBottomWidth: 0.8, borderBottomColor: REVO.navy, borderTopWidth: 0.8, borderTopColor: REVO.navy },
  label: {
    width: 96,
    paddingVertical: 5,
    paddingHorizontal: 8,
    fontSize: 8,
    color: REVO.textSub,
    backgroundColor: REVO.headBg,
    borderRightWidth: 0.5,
    borderRightColor: REVO.ruleLight,
  },
  labelTotal: {
    width: 96,
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 9,
    fontWeight: 700,
    color: REVO.navy,
    backgroundColor: REVO.headBg,
    borderRightWidth: 0.5,
    borderRightColor: REVO.ruleLight,
  },
  amount: {
    flex: 1,
    paddingVertical: 5,
    paddingHorizontal: 8,
    fontSize: 8.5,
    textAlign: 'right',
    borderRightWidth: 0.5,
    borderRightColor: REVO.ruleLight,
  },
  amountTotal: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 11,
    fontWeight: 700,
    textAlign: 'right',
    borderRightWidth: 0.5,
    borderRightColor: REVO.ruleLight,
  },
});

// ─── フッター（案件ID・書類番号・ページ番号） ──────────────────
const fs = StyleSheet.create({
  footer: {
    position: 'absolute',
    bottom: 14,
    left: 26,
    right: 26,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: REVO.ruleLight,
    paddingTop: 4,
  },
  text: { fontSize: 7, color: REVO.textSub },
});

export function RevoFooter({
  projectId,
  documentNumber,
}: {
  projectId: string;
  documentNumber: string;
}) {
  return (
    <View style={fs.footer} fixed>
      <Text style={fs.text}>案件ID：{projectId}　書類番号：{documentNumber}</Text>
      <Text style={fs.text} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}
