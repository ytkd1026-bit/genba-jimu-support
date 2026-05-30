/**
 * PDF ファイル名生成ユーティリティ
 *
 * 元請名・案件名・工事内容・日付・書類種別から安全なファイル名を生成する。
 *
 * TODO: Supabase連携後は案件名・元請名・工事内容・請求日をDBから取得してファイル名を生成する
 * TODO: ユーザー設定でファイル名ルールを変更できるようにする
 * TODO: ファイル名が長すぎる場合の上限文字数を調整する
 */

/**
 * OS で使えない文字を除去・置換し、指定長以内に丸める。
 *
 * 除去する文字：
 *   / \ : * ? " < > |  → _ に置換
 *   ・（中点）、スペース、全角スペース → 除去
 *   連続する _ → 1つに集約
 */
function sanitize(str: string, maxLen = 20): string {
  return str
    .replace(/[/\\:*?"<>|]/g, '_')   // OS禁止文字 → _
    .replace(/[・\s　]+/g, '')    // 中点・スペース → 除去
    .replace(/_+/g, '_')              // 連続 _ → 1つ
    .replace(/^_+|_+$/g, '')          // 前後の _ を除去
    .slice(0, maxLen);                // 上限文字数でカット
}

/**
 * 日付文字列を YYYYMMDD 形式に変換する。
 * 入力: "YYYY-MM-DD" または "YYYY/MM/DD"
 */
function toDateStr(date: string): string {
  return date.replace(/[-/]/g, '').slice(0, 8);
}

/**
 * 期間開始日を "YYYY年MM月分" 形式に変換する（一括請求書用）。
 * 入力: "YYYY-MM-DD" または "YYYY/MM/DD"
 */
function toPeriodStr(fromDate: string): string {
  const d = fromDate.replace(/[-/]/g, '');
  const year  = d.slice(0, 4);
  const month = d.slice(4, 6);
  return `${year}年${month}月分`;
}

// ─── 書類種別ごとのファイル名生成関数 ────────────────────────

/**
 * 見積書PDF
 * 形式: 元請名_案件名_工事内容_日付_見積書.pdf
 */
export function estimatePdfFileName(p: {
  clientName: string;
  projectName: string;
  workContent: string;
  date: string;
}): string {
  const c  = sanitize(p.clientName,   15);
  const pr = sanitize(p.projectName,  20);
  const w  = sanitize(p.workContent,  20);
  const d  = toDateStr(p.date);
  return `${c}_${pr}_${w}_${d}_見積書.pdf`;
}

/**
 * 見積書兼注文書PDF
 * 形式: 元請名_案件名_工事内容_日付_見積書兼注文書.pdf
 */
export function estimateOrderPdfFileName(p: {
  clientName: string;
  projectName: string;
  workContent: string;
  date: string;
}): string {
  const c  = sanitize(p.clientName,   15);
  const pr = sanitize(p.projectName,  20);
  const w  = sanitize(p.workContent,  20);
  const d  = toDateStr(p.date);
  return `${c}_${pr}_${w}_${d}_見積書兼注文書.pdf`;
}

/**
 * 保存用PDF
 * 形式: 元請名_案件名_工事内容_日付_保存用見積.pdf
 */
export function storagePdfFileName(p: {
  clientName: string;
  projectName: string;
  workContent: string;
  date: string;
}): string {
  const c  = sanitize(p.clientName,   15);
  const pr = sanitize(p.projectName,  20);
  const w  = sanitize(p.workContent,  20);
  const d  = toDateStr(p.date);
  return `${c}_${pr}_${w}_${d}_保存用見積.pdf`;
}

/**
 * 単体請求書PDF
 * 形式: 元請名_案件名_工事内容_請求日_請求書.pdf
 */
export function singleInvoicePdfFileName(p: {
  clientName: string;
  projectName: string;
  workContent: string;
  invoiceDate: string;
}): string {
  const c  = sanitize(p.clientName,   15);
  const pr = sanitize(p.projectName,  20);
  const w  = sanitize(p.workContent,  20);
  const d  = toDateStr(p.invoiceDate);
  return `${c}_${pr}_${w}_${d}_請求書.pdf`;
}

/**
 * 一括請求書PDF（複数案件を含むため月単位）
 * 形式: 元請名_対象月_一括請求書_請求日.pdf
 */
export function bulkInvoicePdfFileName(p: {
  clientName: string;
  periodFrom: string;   // "YYYY-MM-DD" 月初日
  invoiceDate: string;
}): string {
  const c      = sanitize(p.clientName, 15);
  const period = toPeriodStr(p.periodFrom);
  const d      = toDateStr(p.invoiceDate);
  return `${c}_${period}_一括請求書_${d}.pdf`;
}
