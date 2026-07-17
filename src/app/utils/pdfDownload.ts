// PDF生成・ダウンロードの共通処理
// @react-pdf/renderer はバンドルが大きいため動的importする（各画面で重複していた処理を集約）

import type React from "react";
import type { DocumentProps } from "@react-pdf/renderer";

/** PDFドキュメントを生成してブラウザダウンロードを開始する */
export async function renderAndDownloadPdf(
  element: React.ReactElement,
  filename: string,
): Promise<void> {
  const { pdf } = await import("@react-pdf/renderer");
  // 渡される要素は各 makeXxxPDF が生成する <Document> ルート要素。
  // any を使わず Document 要素型へ絞り込む（型注釈のみ・実行コードは不変）
  const blob = await pdf(element as React.ReactElement<DocumentProps>).toBlob();
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
