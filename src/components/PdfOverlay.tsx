"use client";

import type { PresentResult } from "@/app/utils/pdfPresentation";
import type { PdfPhase } from "@/hooks/usePdfJob";
import type React from "react";

// PDF発行中のローディングと、完了・キャンセル・失敗ダイアログ。
//
// この部品は呼び出し元画面のReactツリー内にのみ描画される。
// document.body や html のスタイルを書き換えないので、発行中に画面遷移しても
// 次の画面へ overlay や pointer-events の無効化が持ち越されることはない。
// 全画面を覆うため、発行中は配下のリンク・タブへのタップも遮断される。

const PANEL = "w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl ring-1 ring-stone-200";
const BACKDROP = "fixed inset-0 z-50 flex items-center justify-center bg-stone-900/45 px-5";
const PRIMARY =
  "flex w-full items-center justify-center rounded-xl bg-[#8B4A3C] py-3.5 text-sm font-bold text-white active:opacity-80";
const SECONDARY =
  "flex w-full items-center justify-center rounded-xl border border-stone-200 bg-white py-3 text-sm font-bold text-stone-600 active:opacity-80";

/** 生成中・提示中の全画面ローディング */
function GeneratingOverlay({ sharing }: { sharing: boolean }) {
  return (
    <div className={BACKDROP} role="alertdialog" aria-busy="true" aria-live="assertive">
      <div className={PANEL}>
        <div className="flex flex-col items-center text-center">
          <span
            aria-hidden="true"
            className="mb-4 h-9 w-9 animate-spin rounded-full border-[3px] border-stone-200 border-t-[#8B4A3C]"
          />
          <p className="text-base font-bold text-stone-800">
            {sharing ? "PDFを開いています" : "PDFを作成しています"}
          </p>
          <p className="mt-1.5 text-sm text-stone-500">この画面を閉じずにお待ちください</p>
          {!sharing && (
            <p className="mt-3 text-xs text-stone-400">
              初回は文字データの読み込みに時間がかかります。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** 提示完了ダイアログ。提示方法によって案内文を変える。 */
function CompletedDialog({
  result,
  onRetry,
  onClose,
}: {
  result: PresentResult;
  onRetry: () => void;
  onClose: () => void;
}) {
  // window.open がブロックされた場合は、PDFが表示できていない可能性がある。
  // iOS Safari は download 属性を無視するため、この経路では何も起きないことがある。
  if (result.popupBlocked) {
    return (
      <div className={BACKDROP} role="alertdialog" aria-modal="true" aria-label="PDF表示がブロックされました">
        <div className={PANEL}>
          <p className="text-base font-bold text-amber-700">
            ブラウザがPDF表示をブロックしました
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-stone-600">
            PDFは作成済みで、見積も保存されています。ブラウザのポップアップ設定を
            許可してから、もう一度お試しください。
          </p>
          <p className="mt-2 break-all text-xs text-stone-400">{result.filename}</p>
          <div className="mt-4 space-y-2.5">
            <button type="button" onClick={onRetry} className={PRIMARY}>
              もう一度PDFを作る
            </button>
            <button type="button" onClick={onClose} className={SECONDARY}>
              元の画面に戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  const guide =
    result.kind === "shared"
      ? "共有画面から「ファイルに保存」を選ぶと本体に保存できます。"
      : result.kind === "opened"
        ? "新しいタブでPDFを開きました。共有ボタンから保存できます。"
        : "ダウンロードフォルダに保存しました。";

  return (
    <div className={BACKDROP} role="dialog" aria-modal="true" aria-label="PDF作成完了">
      <div className={PANEL}>
        <p className="text-base font-bold text-stone-800">PDFを作成しました</p>
        <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{guide}</p>
        <p className="mt-2 break-all text-xs text-stone-400">{result.filename}</p>
        <div className="mt-4">
          <button type="button" onClick={onClose} className={PRIMARY}>
            元の画面に戻る
          </button>
        </div>
      </div>
    </div>
  );
}

/** 共有シートを閉じたとき。失敗ではないので文言を分ける。 */
function CancelledDialog({
  result,
  onRetry,
  onClose,
}: {
  result: PresentResult | null;
  onRetry: () => void;
  onClose: () => void;
}) {
  // not_allowed は「共有が許可されなかった」場合。ユーザーが拒否したか、
  // ユーザー操作起点が失われたかを区別できないため、次の一手を案内する。
  const notAllowed = result?.cancelReason === "not_allowed";
  return (
    <div className={BACKDROP} role="dialog" aria-modal="true" aria-label="PDF共有をキャンセル">
      <div className={PANEL}>
        <p className="text-base font-bold text-stone-800">
          {notAllowed ? "共有が許可されませんでした" : "共有をキャンセルしました"}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-stone-600">
          {notAllowed
            ? "見積は保存されています。もう一度ボタンを押すと共有をやり直せます。"
            : "見積は保存されています。もう一度PDFを作ることができます。"}
        </p>
        <div className="mt-4 space-y-2.5">
          <button type="button" onClick={onRetry} className={PRIMARY}>
            もう一度PDFを作る
          </button>
          <button type="button" onClick={onClose} className={SECONDARY}>
            元の画面に戻る
          </button>
        </div>
      </div>
    </div>
  );
}

/** 失敗ダイアログ。入力が保存済みであることを明示する。 */
function FailedDialog({
  message,
  onRetry,
  onClose,
}: {
  message: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <div className={BACKDROP} role="alertdialog" aria-modal="true" aria-label="PDF作成失敗">
      <div className={PANEL}>
        <p className="text-base font-bold text-red-600">PDFの作成に失敗しました</p>
        <p className="mt-1.5 text-sm leading-relaxed text-stone-600">
          見積は保存されています。もう一度お試しください。
        </p>
        <p className="mt-2 break-all text-xs text-stone-400">{message}</p>
        <div className="mt-4 space-y-2.5">
          <button type="button" onClick={onRetry} className={PRIMARY}>
            再試行
          </button>
          <button type="button" onClick={onClose} className={SECONDARY}>
            元の画面に戻る
          </button>
        </div>
      </div>
    </div>
  );
}

/** phase に応じて適切な表示を1つだけ返す。呼び出し元はこれ1つ置けばよい。 */
export function PdfOverlay({
  phase,
  result,
  errorMessage,
  onRetry,
  onClose,
}: {
  phase: PdfPhase;
  result: PresentResult | null;
  errorMessage: string | null;
  onRetry: () => void;
  onClose: () => void;
}): React.ReactElement | null {
  if (phase === "generating") return <GeneratingOverlay sharing={false} />;
  if (phase === "sharing") return <GeneratingOverlay sharing={true} />;
  if (phase === "completed" && result)
    return <CompletedDialog result={result} onRetry={onRetry} onClose={onClose} />;
  if (phase === "cancelled")
    return <CancelledDialog result={result} onRetry={onRetry} onClose={onClose} />;
  if (phase === "failed")
    return (
      <FailedDialog
        message={errorMessage ?? "原因不明のエラーです。"}
        onRetry={onRetry}
        onClose={onClose}
      />
    );
  return null;
}
