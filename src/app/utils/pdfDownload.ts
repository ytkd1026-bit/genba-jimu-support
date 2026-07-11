// PDF生成・ダウンロードの共通処理
// @react-pdf/renderer はバンドルが大きいため動的importする（各画面で重複していた処理を集約）

import type React from "react";

/** PDFドキュメントを生成してブラウザダウンロードを開始する */
export async function renderAndDownloadPdf(
  element: React.ReactElement,
  filename: string,
): Promise<void> {
  const { pdf } = await import("@react-pdf/renderer");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = await pdf(element as any).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
