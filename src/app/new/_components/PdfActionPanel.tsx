"use client";

// PDF帳票の操作パネル（作成 → 保存 / 印刷 / 共有）
//
// 見積書だけでなく請求書・完了報告書など他のPDF帳票でもそのまま使えるようにしてある。
// 使う側は「どのPDFを作るか」だけを build で渡す。
//
// 方針:
// ・PDFは1回だけ作り、保存・印刷・共有で同じ Blob を使い回す。
// ・版や帳票種別を切り替えたら作り直す。切り替えは呼び出し側が key を変えて行う
//   （React の再マウントに任せる。effect で状態を消すと余分な再描画が起きるため）。
// ・ブラウザ側でできないことを「成功」と表示しない。結果に応じて正直に案内する。
// ・共有シートを閉じただけ（キャンセル）はエラー表示しない。
// ・スマホ最優先。ボタンは44px以上、アイコンだけにせず日本語ラベルを併記する。

import type React from "react";
import { useEffect, useState } from "react";
import {
  createPdfBlob,
  releasePdfFile,
  downloadPdf,
  sharePdf,
  canSharePdf,
  printPdf,
  isIOS,
  type PdfFile,
} from "@/app/utils/pdfActions";

type Notice = { tone: "info" | "error"; text: string } | null;
type Busy = null | "build" | "save" | "print" | "share";

export default function PdfActionPanel({
  build,
  disabled,
  buildLabel = "PDFを作成する",
  disabledLabel,
}: {
  /** PDFの中身とファイル名を返す。押されたときに初めて呼ばれる */
  build: () => Promise<{ element: React.ReactElement; fileName: string }>;
  disabled?: boolean;
  buildLabel?: string;
  disabledLabel?: string;
}) {
  const [file, setFile] = useState<PdfFile | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<Notice>(null);
  // 作り直したとき（前の file）と画面を離れるときに Object URL を解放する。
  // 保存直後に解放するとダウンロードが途切れる端末があるため、少し待ってから解放する。
  useEffect(() => {
    if (!file) return;
    return () => {
      const target = file;
      setTimeout(() => releasePdfFile(target), 30_000);
    };
  }, [file]);

  async function handleBuild() {
    if (busy || disabled) return;
    setBusy("build");
    setNotice(null);
    try {
      const { element, fileName } = await build();
      setFile(await createPdfBlob(element, fileName));
    } catch (err) {
      console.error("PDF生成エラー:", err);
      setNotice({ tone: "error", text: "PDFの作成に失敗しました。もう一度お試しください。" });
    } finally {
      setBusy(null);
    }
  }

  function handleSave() {
    if (!file || busy) return;
    setBusy("save");
    try {
      const result = downloadPdf(file);
      setNotice(
        result === "downloaded"
          ? { tone: "info", text: `保存しました：${file.fileName}` }
          : {
              tone: "info",
              text:
                "PDFを開きました。iPhoneでは表示画面の共有ボタンから「ファイルに保存」を選んでください。" +
                "うまくいかないときは下の「共有」からでも保存できます。",
            },
      );
    } finally {
      setBusy(null);
    }
  }

  async function handlePrint() {
    if (!file || busy) return;
    setBusy("print");
    try {
      const result = await printPdf(file);
      if (result === "printed") {
        setNotice({ tone: "info", text: "印刷ダイアログを開きました。" });
      } else if (result === "opened_viewer") {
        setNotice({
          tone: "info",
          text: "別のタブでPDFを開きました。表示画面の共有ボタンから「プリント」を選んでください。",
        });
      } else {
        setNotice({
          tone: "info",
          text:
            "ブラウザが新しいタブを開けませんでした（ポップアップブロック）。" +
            "下の「共有」から「プリント」を選んでください。",
        });
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleShare() {
    if (!file || busy) return;
    setBusy("share");
    try {
      const result = await sharePdf(file);
      if (result === "shared") {
        setNotice(null);
      } else if (result === "cancelled") {
        // 共有シートを閉じただけ。エラーにしない。
        setNotice(null);
      } else if (result === "unsupported") {
        setNotice({
          tone: "info",
          text: "このブラウザでは直接共有できません。「PDFを保存」してから共有してください。",
        });
      } else {
        setNotice({ tone: "error", text: "共有に失敗しました。もう一度お試しください。" });
      }
    } finally {
      setBusy(null);
    }
  }

  const shareSupported = file ? canSharePdf(file) : false;

  const primaryBtn =
    "flex min-h-[52px] w-full items-center justify-center rounded-xl bg-[#1b365d] px-6 text-sm font-bold text-white active:bg-[#16294a] disabled:opacity-40";
  const actionBtn =
    "flex min-h-[52px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#1b365d] bg-white px-3 text-sm font-bold text-[#1b365d] active:bg-[#eef4fb] disabled:opacity-40";

  if (!file) {
    return (
      <div className="space-y-2">
        <button type="button" onClick={() => void handleBuild()} disabled={!!busy || disabled}
          className={primaryBtn}>
          {busy === "build" ? "PDF作成中…" : disabled && disabledLabel ? disabledLabel : buildLabel}
        </button>
        {notice && <NoticeLine notice={notice} />}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-center text-xs font-semibold text-slate-500">
        PDFを作成しました：<span className="break-all font-mono">{file.fileName}</span>
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={handleSave} disabled={!!busy} className={actionBtn}>
          <span aria-hidden>⤓</span>PDFを保存
        </button>
        <button type="button" onClick={() => void handlePrint()} disabled={!!busy} className={actionBtn}>
          <span aria-hidden>🖶</span>印刷
        </button>
        <button type="button" onClick={() => void handleShare()} disabled={!!busy} className={actionBtn}>
          <span aria-hidden>↗</span>共有
        </button>
      </div>
      {!shareSupported && (
        <p className="text-center text-[11px] text-slate-400">
          このブラウザは共有シートに対応していません。「PDFを保存」してから共有してください。
        </p>
      )}
      {shareSupported && isIOS() && (
        <p className="text-center text-[11px] text-slate-400">
          「共有」からメール・LINE・AirDrop・ファイルに保存・プリントを選べます。
        </p>
      )}
      <button type="button" onClick={() => void handleBuild()} disabled={!!busy}
        className="min-h-[44px] w-full text-xs font-semibold text-slate-400 active:text-slate-600 disabled:opacity-40">
        {busy === "build" ? "PDF作成中…" : "PDFを作り直す"}
      </button>
      {notice && <NoticeLine notice={notice} />}
    </div>
  );
}

function NoticeLine({ notice }: { notice: NonNullable<Notice> }) {
  return (
    <p
      className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
        notice.tone === "error"
          ? "bg-rose-50 text-rose-600 ring-1 ring-rose-200"
          : "bg-slate-50 text-slate-600 ring-1 ring-slate-200"
      }`}
    >
      {notice.text}
    </p>
  );
}
