// 生成済みPDF Blob を端末へ提示するだけの責務を持つモジュール。
//
// 既存の pdfDownload.ts は正式側6画面が利用しているため一切変更しない。
// 本ファイルは見積パイロット専用の新経路として追加する。
//
// 提示の優先順（iPhone を主対象とする）:
//   1. Web Share API で PDF File を共有する（共有シートから「ファイルに保存」できる）
//   2. Blob URL を新しいタブで開く（Safari の PDF ビューアで表示される）
//   3. download 属性でダウンロードする（PC 想定）
//
// Blob URL は即時 revoke しない。表示・共有前に無効化されるのを防ぐため、
// 破棄は呼び出し元が releasePdfUrl() で明示的に行う。

import type React from "react";

/** 提示方法の結果。cancelled はユーザーが共有シートを閉じた場合で、失敗ではない。 */
export type PresentKind = "shared" | "opened" | "downloaded" | "cancelled";

/** cancelled になった理由。ログと文言の出し分けに使う。 */
export type CancelReason = "user_abort" | "not_allowed";

export type PresentResult = {
  kind: PresentKind;
  filename: string;
  /** 第2・第3候補で生成した Blob URL。呼び出し元が破棄する。共有経路では null。 */
  url: string | null;
  /**
   * window.open が null を返した（ポップアップブロック等）場合に true。
   * PC ではダウンロードへ落ちて実害がないが、iOS では download 属性が働かないため
   * 「表示できなかった」ことをユーザーへ伝える必要がある。
   */
  popupBlocked?: boolean;
  /** kind === "cancelled" のときの理由 */
  cancelReason?: CancelReason;
};

/** PDFドキュメント要素から Blob を生成する */
export async function renderPdfBlob(element: React.ReactElement): Promise<Blob> {
  const { pdf } = await import("@react-pdf/renderer");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await pdf(element as any).toBlob();
}

/** Web Share で PDF ファイルを共有できる環境かどうか */
export function canSharePdf(blob: Blob, filename: string): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.share !== "function") return false;
  if (typeof navigator.canShare !== "function") return false;
  try {
    const file = new File([blob], filename, { type: "application/pdf" });
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * navigator.share の失敗をどう扱うかを判定する。
 *
 * AbortError      … ユーザーが共有シートを閉じた。明確なキャンセル。
 * NotAllowedError … 共有が許可されなかった。ユーザーの拒否か、ユーザー操作起点が
 *                   失われた場合に出る。区別できないため、ユーザー起因として
 *                   cancelled 扱いにする（勝手に別経路で開き直さない）。
 * SecurityError   … この文脈で共有自体が使えない。ユーザー操作ではないため
 *                   キャンセルとせず、次の候補へフォールバックする。
 * それ以外        … 共有機能の失敗。次の候補へフォールバックする。
 */
type ShareFailure = { treatAs: "cancelled"; reason: CancelReason } | { treatAs: "fallback" };

function classifyShareError(err: unknown): ShareFailure {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "AbortError") return { treatAs: "cancelled", reason: "user_abort" };
  if (name === "NotAllowedError") return { treatAs: "cancelled", reason: "not_allowed" };
  // SecurityError を含むそれ以外は、環境要因とみなして次の候補へ落とす
  return { treatAs: "fallback" };
}

/**
 * PDF を端末へ提示する。
 *
 * 必ずユーザー操作起点（クリックハンドラ内）から呼ぶこと。
 * Web Share はユーザー操作を伴わない呼び出しをブラウザが拒否する。
 */
export async function presentPdf(blob: Blob, filename: string): Promise<PresentResult> {
  // ── 第1候補：Web Share ──────────────────────────────
  if (canSharePdf(blob, filename)) {
    const file = new File([blob], filename, { type: "application/pdf" });
    try {
      await navigator.share({ files: [file], title: filename });
      return { kind: "shared", filename, url: null };
    } catch (err) {
      const decision = classifyShareError(err);
      if (decision.treatAs === "cancelled") {
        // キャンセルは失敗ではない。呼び出し元が再実行できる状態へ戻す。
        return { kind: "cancelled", filename, url: null, cancelReason: decision.reason };
      }
      // 環境要因の失敗。次の候補へ落とす（例外は投げない）
      console.warn("Web Share が使えないため別の方法で開きます:", err);
    }
  }

  // ── 第2候補：新しいタブで開く ────────────────────────
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank");
  if (opened) {
    return { kind: "opened", filename, url };
  }

  // ── 第3候補：ダウンロード ───────────────────────────
  // window.open が null＝ポップアップブロック。PC ではここでダウンロードが成立するが、
  // iOS Safari は download 属性を無視するため「何も起きない」ことがある。
  // そのため popupBlocked を立てて、呼び出し元がその旨を表示できるようにする。
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return { kind: "downloaded", filename, url, popupBlocked: true };
}

/** Blob URL を破棄する。二重呼び出しに耐える。 */
export function releasePdfUrl(url: string | null | undefined): void {
  if (!url) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // 破棄済み。無視してよい。
  }
}
