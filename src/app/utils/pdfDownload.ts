// PDF生成・ダウンロードの共通処理
// @react-pdf/renderer はバンドルが大きいため動的importする（各画面で重複していた処理を集約）

import type React from "react";

/**
 * 生成済みPDF Blob をブラウザ標準のダウンロード（<a download>）で保存する共通処理。
 * 見積書・請求書ともにこの1関数でファイル保存する（帳票ごとに保存処理を分岐させない）。
 * Mac/PC の Safari・Chrome では保存先ダイアログ（またはダウンロードフォルダ）へ保存される。
 */
export function savePdfBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // click 直後の revoke は一部ブラウザで保存を取りこぼすことがあるため少し遅延させる
  setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // 破棄済み。無視してよい。
    }
  }, 4000);
}

/** PDFドキュメントを生成してブラウザダウンロードを開始する */
export async function renderAndDownloadPdf(
  element: React.ReactElement,
  filename: string,
): Promise<void> {
  const { pdf } = await import("@react-pdf/renderer");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = await pdf(element as any).toBlob();
  savePdfBlob(blob, filename);
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
