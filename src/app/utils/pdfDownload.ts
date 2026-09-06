// PDF生成・ダウンロードの共通処理
// @react-pdf/renderer はバンドルが大きいため動的importする（各画面で重複していた処理を集約）

import type React from "react";
import { createPdfBlob, downloadPdf, releasePdfFile } from "./pdfActions";

/**
 * PDFドキュメントを生成してブラウザダウンロードを開始する。
 * 生成とダウンロードの実装は pdfActions.ts に集約している（保存・印刷・共有で共通）。
 * 既存の呼び出し側（各帳票画面）はこの関数のままで動く。
 */
export async function renderAndDownloadPdf(
  element: React.ReactElement,
  filename: string,
): Promise<void> {
  const file = await createPdfBlob(element, filename);
  try {
    downloadPdf(file);
  } finally {
    // ダウンロード開始後に解放する（iOS で表示に切り替わる場合を考え少し待つ）
    setTimeout(() => releasePdfFile(file), 10_000);
  }
}

/** 今日の日付を "YYYY/MM/DD" 形式で返す（帳票の作成日表示用） */
export function todaySlash(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}/${m}/${day}`;
}

/** 今日の日付を "YYYY-MM-DD" 形式で返す（ファイル名用） */
export function todayDash(): string {
  return todaySlash().replace(/\//g, "-");
}
