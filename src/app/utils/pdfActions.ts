// PDF帳票の「作成・保存・印刷・共有」共通処理
//
// 見積書だけでなく、請求書・完了報告書など今後のPDF帳票でも使えるようにここへ集約する。
// 責務:
//   createPdfBlob … @react-pdf/renderer で1回だけ生成し、Blob と Object URL を保持する
//   downloadPdf   … 端末へ保存（既存のダウンロード機構と同じ方式）
//   sharePdf      … OS標準の共有シートへ PDF 本体（File）を渡す
//   printPdf      … 印刷ダイアログへ到達させる
//
// 重要な方針:
// ・一度作った Blob を保存・印刷・共有で使い回す（毎回作り直さない）。
// ・ブラウザ側でできないことを「成功」と偽らない。結果を型で返し、画面が正直に案内する。
// ・共有シートを閉じただけ（キャンセル）はエラーにしない。

import type React from "react";

/** 生成済みPDF。url は Object URL で、不要になったら releasePdfFile で解放する */
export type PdfFile = {
  blob: Blob;
  fileName: string;
  url: string;
};

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS はデスクトップ表示だと MacIntel を名乗るため、タッチ点数でも判定する
  return /iP(hone|ad|od)/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

/**
 * PDFドキュメントを生成して Blob と Object URL を返す。
 * @react-pdf/renderer はバンドルが大きいため動的 import する。
 */
export async function createPdfBlob(
  element: React.ReactElement,
  fileName: string,
): Promise<PdfFile> {
  const { pdf } = await import("@react-pdf/renderer");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await pdf(element as any).toBlob();
  // toBlob() の type が空になる環境があるため application/pdf を明示する
  const blob = raw.type === "application/pdf" ? raw : new Blob([raw], { type: "application/pdf" });
  return { blob, fileName, url: URL.createObjectURL(blob) };
}

/** Object URL を解放する（画面を離れるとき・別のPDFを作り直すとき） */
export function releasePdfFile(file: PdfFile | null): void {
  if (file) URL.revokeObjectURL(file.url);
}

// ─── 保存 ─────────────────────────────────────────────────────

export type DownloadResult =
  /** ブラウザのダウンロードが始まった（Mac / Android など） */
  | "downloaded"
  /** iOS Safari。ダウンロードではなくPDF表示になることがあるため、案内が必要 */
  | "opened_viewer";

/**
 * 端末へ保存する。既存のダウンロード機構（<a download>）をそのまま使う。
 *
 * iOS Safari は download 属性を無視して PDF をその場で開くことがある。
 * その場合でも「保存できた」とは言わず、共有シートの「ファイルに保存」へ誘導する。
 */
export function downloadPdf(file: PdfFile): DownloadResult {
  const a = document.createElement("a");
  a.href = file.url;
  a.download = file.fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return isIOS() ? "opened_viewer" : "downloaded";
}

// ─── 共有 ─────────────────────────────────────────────────────

function toShareFile(file: PdfFile): File {
  return new File([file.blob], file.fileName, { type: "application/pdf" });
}

/** この端末・このブラウザで PDF 本体をファイルとして共有できるか */
export function canSharePdf(file: PdfFile): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.share !== "function") return false;
  if (typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [toShareFile(file)] });
  } catch {
    return false;
  }
}

export type ShareResult =
  /** 共有シートへ渡せた */
  | "shared"
  /** ユーザーが共有シートを閉じた。エラーではない */
  | "cancelled"
  /** このブラウザはファイル共有に対応していない */
  | "unsupported"
  /** 対応しているはずだが失敗した */
  | "failed";

/**
 * OS標準の共有シートへ PDF 本体を渡す。
 * URL ではなくファイルを渡すので、メール・LINE・AirDrop・メッセージ・ファイルに保存 など
 * ユーザーが入れているアプリへそのまま送れる。
 */
export async function sharePdf(file: PdfFile, title?: string): Promise<ShareResult> {
  if (!canSharePdf(file)) return "unsupported";
  try {
    await navigator.share({ files: [toShareFile(file)], title: title ?? file.fileName });
    return "shared";
  } catch (err) {
    // ユーザーが閉じただけ（AbortError）はエラー扱いしない
    if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    // Safari はキャンセルを NotAllowedError で返すことがある
    if (err instanceof DOMException && err.name === "NotAllowedError") return "cancelled";
    console.error("PDF共有エラー:", err);
    return "failed";
  }
}

// ─── 印刷 ─────────────────────────────────────────────────────

export type PrintResult =
  /** 印刷ダイアログを開いた */
  | "printed"
  /** 別タブでPDFを開いた。ユーザーがビューアから印刷する */
  | "opened_viewer"
  /** ポップアップがブロックされ、印刷導線に到達できなかった */
  | "blocked";

/**
 * 印刷する。
 *
 * PC は非表示 iframe に読み込んで print() を呼ぶ（ブラウザの印刷ダイアログへ到達する）。
 * iOS Safari は iframe 内の PDF を print() できないため、別タブでPDFビューアを開き、
 * ユーザーが共有ボタン →「プリント」へ進む導線にする。
 * ポップアップがブロックされた場合は blocked を返し、画面側で共有シートへ案内する。
 */
export async function printPdf(file: PdfFile): Promise<PrintResult> {
  if (isIOS()) {
    const w = window.open(file.url, "_blank");
    return w ? "opened_viewer" : "blocked";
  }

  return await new Promise<PrintResult>((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.src = file.url;

    let settled = false;
    const finish = (result: PrintResult) => {
      if (settled) return;
      settled = true;
      // 印刷ダイアログが閉じる前に外すと印刷できないため、少し待ってから片付ける
      setTimeout(() => iframe.remove(), 60_000);
      resolve(result);
    };

    iframe.onload = () => {
      try {
        const win = iframe.contentWindow;
        if (!win) {
          finish("blocked");
          return;
        }
        win.focus();
        win.print();
        finish("printed");
      } catch {
        // iframe から印刷できない環境（PDFビューアが埋め込みを許さない等）
        const w = window.open(file.url, "_blank");
        finish(w ? "opened_viewer" : "blocked");
      }
    };

    document.body.appendChild(iframe);

    // onload が来ない環境のための保険
    setTimeout(() => {
      if (!settled) {
        const w = window.open(file.url, "_blank");
        finish(w ? "opened_viewer" : "blocked");
      }
    }, 4000);
  });
}
