// REVO固定提出書式の共通部品
//
// 方針:
// ・提出帳票は「Excelで丁寧に作成された一般的な工事会社の書類」に見せる。
// ・白背景 / 黒文字 / 薄いグレー / 細い罫線 / 十分な余白。ほぼモノクロ。
// ・アプリのテーマ色（--nu-*）には連動させない。ここの色は固定値。
// ・濃い色の大面積、カードUI、バッジ、グラデーション、大きな角丸、装飾アイコンは使わない。
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

// ─── REVO帳票の固定トークン（テーマ非連動・ほぼモノクロ） ─────
export const REVO = {
  text: '#000000',
  textSub: '#333333',
  rule: '#666666',      // 表の外枠・主罫線
  ruleLight: '#b0b0b0', // 表の内側罫線
  headBg: '#f2f2f2',    // 見出し行の薄いグレー
  white: '#ffffff',
} as const;

export function fmtMoney(n: number): string {
  return Math.round(n).toLocaleString('ja-JP');
}

export function fmtQty(n: number): string {
  return String(n);
}

// ─── ページ ───────────────────────────────────────────────────
export const revoPage = StyleSheet.create({
  landscape: {
    fontFamily: 'NotoSansJP',
    fontSize: 8,
    paddingTop: 26,
    paddingHorizontal: 30,
    paddingBottom: 34,
    backgroundColor: REVO.white,
    color: REVO.text,
  },
});

// ─── タイトル ─────────────────────────────────────────────────
const ts = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  side: { width: '25%' },
  sideRight: { width: '25%', alignItems: 'flex-end' },
  sideText: { fontSize: 8.5 },
  center: { flex: 1, alignItems: 'center' },
  title: { fontSize: 17, fontWeight: 700, letterSpacing: 7, color: REVO.text },
  underline: { marginTop: 3, width: 168, borderBottomWidth: 0.8, borderBottomColor: REVO.text },
});

/** 中央タイトル＋左に見積番号・右に発行日（実務帳票と同じ並び） */
export function RevoTitleBar({
  title,
  leftLabel,
  leftValue,
  rightLabel,
  rightValue,
}: {
  title: string;
  leftLabel?: string;
  leftValue?: string;
  rightLabel?: string;
  rightValue?: string;
}) {
  return (
    <View style={ts.bar}>
      <View style={ts.side}>
        {leftValue ? <Text style={ts.sideText}>{leftLabel}：{leftValue}</Text> : null}
      </View>
      <View style={ts.center}>
        <Text style={ts.title}>{title}</Text>
        <View style={ts.underline} />
      </View>
      <View style={ts.sideRight}>
        {rightValue ? <Text style={ts.sideText}>{rightLabel}：{rightValue}</Text> : null}
      </View>
    </View>
  );
}

// ─── 見出し・宛先・会社情報 ───────────────────────────────────
const hs = StyleSheet.create({
  toWrap: { marginBottom: 8, alignSelf: 'flex-start', minWidth: 200 },
  toName: { fontSize: 13, paddingBottom: 2 },
  toRule: { borderBottomWidth: 0.8, borderBottomColor: REVO.text },

  fieldRow: { flexDirection: 'row', marginBottom: 2.5, alignItems: 'flex-start' },
  fieldLabel: { width: 62, fontSize: 8, color: REVO.textSub },
  fieldSep: { width: 6, fontSize: 8, color: REVO.textSub },
  fieldValue: { flex: 1, fontSize: 8.5 },
  fieldBlank: { flex: 1, borderBottomWidth: 0.4, borderBottomColor: REVO.ruleLight, height: 10 },

  company: { alignItems: 'flex-start' },
  companyName: { fontSize: 11, fontWeight: 700, marginBottom: 2 },
  companyLine: { fontSize: 8, color: REVO.textSub, marginBottom: 1.5 },

  amountBox: { borderWidth: 0.8, borderColor: REVO.text, alignSelf: 'flex-start' },
  amountHead: {
    fontSize: 8.5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: REVO.rule,
    backgroundColor: REVO.headBg,
  },
  amountValue: { fontSize: 17, fontWeight: 700, paddingVertical: 7, paddingHorizontal: 14, textAlign: 'right', minWidth: 170 },
  amountSubRow: { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: REVO.ruleLight },
  amountSubLabel: {
    width: 78,
    fontSize: 8,
    color: REVO.textSub,
    paddingVertical: 3.5,
    paddingHorizontal: 8,
    borderRightWidth: 0.5,
    borderRightColor: REVO.ruleLight,
  },
  amountSubValue: { flex: 1, fontSize: 8.5, paddingVertical: 3.5, paddingHorizontal: 8, textAlign: 'right' },
});

export function RevoAddressee({ name }: { name: string }) {
  return (
    <View style={hs.toWrap}>
      <View style={hs.toRule}>
        <Text style={hs.toName}>{name}</Text>
      </View>
    </View>
  );
}

/** ラベル＋値の1行。値が空のときは記入欄の下線だけを引く（Excel帳票と同じ体裁） */
export function RevoField({ label, value }: { label: string; value: string }) {
  return (
    <View style={hs.fieldRow}>
      <Text style={hs.fieldLabel}>{label}</Text>
      <Text style={hs.fieldSep}>：</Text>
      {value ? <Text style={hs.fieldValue}>{value}</Text> : <View style={hs.fieldBlank} />}
    </View>
  );
}

/** 自社情報（全帳票で共通・会社情報を帳票ごとに持たせない） */
export function RevoCompanyBlock({ company }: { company: CompanyInfoForPdf }) {
  return (
    <View style={hs.company}>
      <Text style={hs.companyName}>{company.name}</Text>
      <Text style={hs.companyLine}>{company.postalCode}　{company.address}</Text>
      <Text style={hs.companyLine}>{company.representative}</Text>
      <Text style={hs.companyLine}>TEL：{company.tel}</Text>
      <Text style={hs.companyLine}>MAIL：{company.email}</Text>
      <Text style={hs.companyLine}>インボイス登録番号：{company.invoiceNumber}</Text>
    </View>
  );
}

/** 御見積金額の枠。sub に工事代金・消費税を並べられる */
export function RevoAmountBox({
  label,
  amount,
  sub,
}: {
  label: string;
  amount: number;
  sub?: Array<{ label: string; amount: number }>;
}) {
  return (
    <View style={hs.amountBox}>
      <Text style={hs.amountHead}>{label}</Text>
      <Text style={hs.amountValue}>{fmtMoney(amount)} 円</Text>
      {sub?.map((s) => (
        <View key={s.label} style={hs.amountSubRow}>
          <Text style={hs.amountSubLabel}>{s.label}</Text>
          <Text style={hs.amountSubValue}>{fmtMoney(s.amount)} 円</Text>
        </View>
      ))}
    </View>
  );
}

// ─── 明細テーブル（細罫線・見出しは薄いグレー） ────────────────
export const revoTable = StyleSheet.create({
  table: {
    borderTopWidth: 0.8,
    borderTopColor: REVO.rule,
    borderLeftWidth: 0.5,
    borderLeftColor: REVO.rule,
    borderRightWidth: 0.5,
    borderRightColor: REVO.rule,
    borderBottomWidth: 0.8,
    borderBottomColor: REVO.rule,
  },
  headerRow: { flexDirection: 'row', backgroundColor: REVO.headBg, borderBottomWidth: 0.8, borderBottomColor: REVO.rule },
  row: { flexDirection: 'row', borderBottomWidth: 0.4, borderBottomColor: REVO.ruleLight },
  groupRow: { flexDirection: 'row', borderBottomWidth: 0.4, borderBottomColor: REVO.ruleLight },
  subtotalRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: REVO.rule, borderTopWidth: 0.5, borderTopColor: REVO.rule },
  th: {
    paddingVertical: 5,
    paddingHorizontal: 3,
    fontSize: 7.5,
    color: REVO.text,
    textAlign: 'center',
    borderRightWidth: 0.4,
    borderRightColor: REVO.rule,
  },
  td: {
    paddingVertical: 4.5,
    paddingHorizontal: 3,
    fontSize: 7.5,
    color: REVO.text,
    borderRightWidth: 0.4,
    borderRightColor: REVO.ruleLight,
    lineHeight: 1.3,
  },
  tdR: { textAlign: 'right' },
  tdC: { textAlign: 'center' },
  tdBold: { fontWeight: 700 },
});

// ─── 合計欄 ───────────────────────────────────────────────────
export const revoSummary = StyleSheet.create({
  wrap: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, alignItems: 'flex-start' },
  notes: { width: '55%' },
  notesTitle: { fontSize: 8, marginBottom: 3, color: REVO.textSub },
  notesBox: { borderWidth: 0.5, borderColor: REVO.ruleLight, padding: 6, minHeight: 50 },
  noteLine: { fontSize: 7.5, color: REVO.textSub, marginBottom: 2, lineHeight: 1.35 },

  box: { width: 230, borderWidth: 0.5, borderColor: REVO.rule },
  row: { flexDirection: 'row', borderBottomWidth: 0.4, borderBottomColor: REVO.ruleLight },
  rowLast: { flexDirection: 'row', borderTopWidth: 0.8, borderTopColor: REVO.rule },
  label: {
    width: 108,
    paddingVertical: 5,
    paddingHorizontal: 8,
    fontSize: 8,
    color: REVO.textSub,
    backgroundColor: REVO.headBg,
    borderRightWidth: 0.4,
    borderRightColor: REVO.ruleLight,
  },
  labelTotal: {
    width: 108,
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 9,
    fontWeight: 700,
    backgroundColor: REVO.headBg,
    borderRightWidth: 0.4,
    borderRightColor: REVO.ruleLight,
  },
  amount: { flex: 1, paddingVertical: 5, paddingHorizontal: 8, fontSize: 8.5, textAlign: 'right' },
  amountTotal: { flex: 1, paddingVertical: 6, paddingHorizontal: 8, fontSize: 11, fontWeight: 700, textAlign: 'right' },
});

// ─── フッター（見積番号・ページ番号） ──────────────────────────
const fs = StyleSheet.create({
  footer: {
    position: 'absolute',
    bottom: 16,
    left: 30,
    right: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.4,
    borderTopColor: REVO.ruleLight,
    paddingTop: 4,
  },
  text: { fontSize: 7, color: REVO.textSub },
});

export function RevoFooter({ documentNumber }: { documentNumber: string }) {
  return (
    <View style={fs.footer} fixed>
      <Text style={fs.text}>見積番号：{documentNumber}</Text>
      <Text style={fs.text} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}
