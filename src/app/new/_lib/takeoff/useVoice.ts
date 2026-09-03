"use client";

// 拾い出し 音声入力フック（Web Speech API ラッパ）
// ─────────────────────────────────────────────────────────────
// ・ブラウザ標準の SpeechRecognition / webkitSpeechRecognition のみ使用。
//   外部音声認識API・新規パッケージは追加しない（コストゼロ・承認不要の範囲）。
// ・iPhone Safari は iOS 14.5+ で webkitSpeechRecognition が利用可能。
//   未対応環境では supported=false を返し、UI側は手入力のみで完結させる。
// ・認識失敗時は onError を呼び、UI側で「聞き取れませんでした→再入力/手入力」を出す。

import { useCallback, useEffect, useRef, useState } from "react";

// TS標準libに SpeechRecognition 型が無いため最小限をローカル宣言
interface SpeechRecognitionResultLike {
  0: { transcript: string; confidence: number };
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseVoiceOptions {
  /** 確定した発話テキスト（1フレーズごと） */
  onResult: (transcript: string) => void;
  /** 認識エラー（no-speech 含む）。UI側で再入力/手入力の選択を出す */
  onError?: (message: string) => void;
  lang?: string;
}

export interface UseVoiceReturn {
  supported: boolean;
  listening: boolean;
  /** 認識中の暫定テキスト（画面フィードバック用） */
  interim: string;
  start: () => void;
  stop: () => void;
}

const ERROR_LABELS: Record<string, string> = {
  "no-speech": "聞き取れませんでした",
  "audio-capture": "マイクが利用できません",
  "not-allowed": "マイクの使用が許可されていません",
  network: "ネットワークエラーで認識できませんでした",
  aborted: "認識を中断しました",
};

export function useVoice({ onResult, onError, lang = "ja-JP" }: UseVoiceOptions): UseVoiceReturn {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const wantListeningRef = useRef(false);
  // 最新のコールバックを ref 経由で参照（再バインド不要にする）
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    setSupported(getSpeechRecognition() !== null);
    return () => {
      wantListeningRef.current = false;
      recRef.current?.abort();
      recRef.current = null;
    };
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      onErrorRef.current?.("この端末では音声認識が使えません。手入力をご利用ください。");
      return;
    }
    if (recRef.current) recRef.current.abort();

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;       // 連続採寸向け
    rec.interimResults = true;   // 認識途中を画面に出す
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          const t = r[0].transcript.trim();
          if (t) onResultRef.current(t);
        } else {
          interimText += r[0].transcript;
        }
      }
      setInterim(interimText);
    };
    rec.onerror = (e) => {
      setInterim("");
      const label = ERROR_LABELS[e.error] ?? `音声認識エラー（${e.error}）`;
      if (e.error !== "aborted") onErrorRef.current?.(label);
      if (e.error === "not-allowed" || e.error === "audio-capture") {
        wantListeningRef.current = false;
        setListening(false);
      }
    };
    rec.onend = () => {
      setInterim("");
      // iOS Safari は数秒で自動終了することがあるため、停止操作までは自動再開する
      if (wantListeningRef.current && recRef.current === rec) {
        try { rec.start(); } catch { setListening(false); wantListeningRef.current = false; }
      } else if (recRef.current === rec) {
        setListening(false);
      }
    };

    recRef.current = rec;
    wantListeningRef.current = true;
    try {
      rec.start();
      setListening(true);
    } catch {
      wantListeningRef.current = false;
      setListening(false);
      onErrorRef.current?.("音声認識を開始できませんでした。");
    }
  }, [lang]);

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    recRef.current?.stop();
    setListening(false);
    setInterim("");
  }, []);

  return { supported, listening, interim, start, stop };
}
