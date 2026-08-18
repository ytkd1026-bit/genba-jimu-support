"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  presentPdf,
  releasePdfUrl,
  renderPdfBlob,
  type PresentResult,
} from "@/app/utils/pdfPresentation";

// PDF発行の状態。
//   idle       … 待機
//   generating … 本保存とPDF生成
//   sharing    … 端末へ提示中（Web Share の共有シート表示中を含む）
//   completed  … 提示完了
//   cancelled  … ユーザーが共有シートを閉じた。失敗ではない
//   failed     … 生成または提示に失敗
export type PdfPhase =
  | "idle"
  | "generating"
  | "sharing"
  | "completed"
  | "cancelled"
  | "failed";

/** PDF1件分の発行手順。呼び出し元が帳票ごとに用意する。 */
export type PdfJobSpec = {
  /** ボタン種別の識別子。同一画面に複数のPDFボタンがある場合に使う。 */
  kind: string;
  /** 本保存。false を返したらPDF生成へ進まない。 */
  save: () => Promise<boolean> | boolean;
  /** PDFドキュメント要素を作る（動的importを含んでよい） */
  build: () => Promise<React.ReactElement>;
  /** 保存ファイル名 */
  filename: () => string;
};

export type UsePdfJobReturn = {
  phase: PdfPhase;
  /** 実行中・完了したジョブ種別。未実行なら null。 */
  activeKind: string | null;
  /** 生成中または提示中。ボタンの disabled 判定に使う。 */
  busy: boolean;
  /** 提示結果。完了ダイアログの表示に使う。 */
  result: PresentResult | null;
  /** 失敗時のメッセージ */
  errorMessage: string | null;
  run: (spec: PdfJobSpec) => Promise<void>;
  /** 直前のジョブを再実行する（キャンセル後・失敗後の両方で使う） */
  retry: () => Promise<void>;
  /** ダイアログを閉じて待機状態へ戻す */
  dismiss: () => void;
};

/**
 * PDF発行の状態を一元管理する。
 *
 * 設計上の要点：
 * - 表示はこのフックを使う画面のReactツリー内にのみ存在する。
 *   document.body の overflow や pointer-events を書き換えないため、
 *   生成中に画面遷移しても次の画面へ操作不能状態が残らない。
 * - Blob URL は即時破棄しない。破棄は「閉じたとき」「次の生成を始めたとき」
 *   「アンマウント時」の3箇所に限定する。
 * - unmount 後は setState を行わない。
 */
export function usePdfJob(): UsePdfJobReturn {
  const [phase, setPhase] = useState<PdfPhase>("idle");
  const [activeKind, setActiveKind] = useState<string | null>(null);
  const [result, setResult] = useState<PresentResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // unmount 後の setState を避ける
  const aliveRef = useRef(true);
  // 破棄すべき Blob URL
  const urlRef = useRef<string | null>(null);
  // 再実行用に直前のジョブを保持
  const lastSpecRef = useRef<PdfJobSpec | null>(null);
  // 連打・多重起動のガード。state より先に立てる必要があるため ref で持つ。
  const runningRef = useRef(false);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      releasePdfUrl(urlRef.current);
      urlRef.current = null;
    };
  }, []);

  const busy = phase === "generating" || phase === "sharing";

  // 生成中のリロード・タブを閉じる操作に警告を出す
  useEffect(() => {
    if (!busy) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [busy]);

  const run = useCallback(async (spec: PdfJobSpec) => {
    if (runningRef.current) return; // 連打による二重生成を防ぐ
    runningRef.current = true;
    lastSpecRef.current = spec;

    // 前回のPDFが残っていれば破棄してから始める
    releasePdfUrl(urlRef.current);
    urlRef.current = null;

    if (aliveRef.current) {
      setResult(null);
      setErrorMessage(null);
      setActiveKind(spec.kind);
      setPhase("generating");
    }

    try {
      const saved = await spec.save();
      if (!saved) {
        // 保存側でメッセージ表示済み。ダイアログは出さず静かに戻す。
        if (aliveRef.current) {
          setPhase("idle");
          setActiveKind(null);
        }
        return;
      }

      const element = await spec.build();
      const blob = await renderPdfBlob(element);

      if (aliveRef.current) setPhase("sharing");

      const presented = await presentPdf(blob, spec.filename());
      urlRef.current = presented.url;

      if (!aliveRef.current) {
        // 提示中に画面を離れた。URLだけ破棄して終わる。
        releasePdfUrl(presented.url);
        urlRef.current = null;
        return;
      }

      setResult(presented);
      setPhase(presented.kind === "cancelled" ? "cancelled" : "completed");
    } catch (err) {
      console.error("PDF発行エラー:", err);
      if (aliveRef.current) {
        setErrorMessage(
          err instanceof Error && err.message ? err.message : "PDFの発行に失敗しました。",
        );
        setPhase("failed");
      }
    } finally {
      // 成功・キャンセル・失敗・画面破棄のいずれでも必ずガードを解除する
      runningRef.current = false;
    }
  }, []);

  const retry = useCallback(async () => {
    const spec = lastSpecRef.current;
    if (!spec) return;
    await run(spec);
  }, [run]);

  const dismiss = useCallback(() => {
    releasePdfUrl(urlRef.current);
    urlRef.current = null;
    setResult(null);
    setErrorMessage(null);
    setActiveKind(null);
    setPhase("idle");
  }, []);

  return { phase, activeKind, busy, result, errorMessage, run, retry, dismiss };
}
