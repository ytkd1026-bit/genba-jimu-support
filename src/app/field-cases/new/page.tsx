"use client";

// 現場事例 アップロード画面（スマホ優先・必須入力ゼロ）
// 写真複数 / 動画 / 音声録音 / テキスト / 案件名(任意) を投入し「解析開始」。
// 解析後は代表者確認画面（/field-cases/[id]/review）へ遷移する。

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { compressImageFile } from "@/app/utils/imageCompress";
import { fldInput, lbl } from "@/components/formStyles";

type Attachment = {
  id: string;
  kind: "photo" | "video" | "audio";
  name: string;
  previewUrl: string;
  dataUrl?: string;        // 写真のみ（圧縮済み base64）
  mimeType: string;
};

export default function FieldCaseNewPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [items, setItems] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  // ── 音声録音 ──
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    return () => items.forEach((it) => URL.revokeObjectURL(it.previewUrl));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    const next: Attachment[] = [];
    for (const file of Array.from(files)) {
      const compressed = await compressImageFile(file);
      next.push({
        id: crypto.randomUUID(),
        kind: "photo",
        name: file.name,
        previewUrl: compressed?.dataUrl ?? URL.createObjectURL(file),
        dataUrl: compressed?.dataUrl,
        mimeType: "image/jpeg",
      });
    }
    setItems((prev) => [...prev, ...next]);
  }

  function addVideo(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      kind: "video" as const,
      name: file.name,
      previewUrl: URL.createObjectURL(file),
      mimeType: file.type || "video/mp4",
    }));
    setItems((prev) => [...prev, ...next]);
  }

  async function toggleRecord() {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setItems((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            kind: "audio",
            name: `録音_${new Date().toLocaleTimeString()}.webm`,
            previewUrl: URL.createObjectURL(blob),
            mimeType: "audio/webm",
          },
        ]);
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch {
      setError("マイクにアクセスできませんでした。");
    }
  }

  function remove(id: string) {
    setItems((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  async function startAnalyze() {
    setBusy(true);
    setError("");
    try {
      const photos = items
        .filter((it) => it.kind === "photo" && it.dataUrl)
        .map((it, i) => ({
          fileName: `${i + 1}.jpg`,
          contentType: it.mimeType,
          base64: it.dataUrl,
        }));
      const inputKinds: string[] = Array.from(new Set(items.map((it) => it.kind)));
      if (text) inputKinds.push("text");

      const res = await fetch("/api/field-cases/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, text, photos, inputKinds }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "解析に失敗しました");
      router.push(json.reviewUrl ?? `/field-cases/${json.caseId}/review`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "解析に失敗しました");
      setBusy(false);
    }
  }

  const canSubmit = items.length > 0 || text.trim() !== "";

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-stone-50 px-4 pb-28 pt-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-stone-800">現場事例をAIに送る</h1>
        <Link href="/field-cases" className="text-sm text-[#8B4A3C]">一覧</Link>
      </header>

      <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-stone-500">
        写真を撮って送るだけ。文字入力は任意です。AIが内容を整理し、代表者の確認画面を作ります。
      </p>

      {/* 案件名（任意） */}
      <label className={lbl}>案件名（任意）</label>
      <input
        className={`${fldInput} mb-3`}
        placeholder="例: ○○様邸 給湯器トラブル"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      {/* テキスト（任意） */}
      <label className={lbl}>現場メモ（任意）</label>
      <textarea
        className={`${fldInput} mb-4 min-h-[88px]`}
        placeholder="例: 給湯器のお湯がぬるい。リモコンにエラー651。水栓から水漏れ。"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      {/* 投入ボタン群 */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => photoRef.current?.click()}
          className="flex min-h-[64px] flex-col items-center justify-center rounded-xl border border-stone-200 bg-white text-xs text-stone-600 active:bg-stone-100"
        >
          📷<span className="mt-1">写真</span>
        </button>
        <button
          type="button"
          onClick={() => videoRef.current?.click()}
          className="flex min-h-[64px] flex-col items-center justify-center rounded-xl border border-stone-200 bg-white text-xs text-stone-600 active:bg-stone-100"
        >
          🎥<span className="mt-1">動画</span>
        </button>
        <button
          type="button"
          onClick={toggleRecord}
          className={`flex min-h-[64px] flex-col items-center justify-center rounded-xl border text-xs active:bg-stone-100 ${
            recording ? "border-red-300 bg-red-50 text-red-600" : "border-stone-200 bg-white text-stone-600"
          }`}
        >
          {recording ? "⏺" : "🎙"}<span className="mt-1">{recording ? "停止" : "録音"}</span>
        </button>
      </div>

      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        className="hidden"
        onChange={(e) => addPhotos(e.target.files)}
      />
      <input
        ref={videoRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => addVideo(e.target.files)}
      />

      {/* 添付プレビュー */}
      {items.length > 0 && (
        <div className="mb-4 grid grid-cols-3 gap-2">
          {items.map((it) => (
            <div key={it.id} className="relative overflow-hidden rounded-lg border border-stone-200 bg-white">
              {it.kind === "photo" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.previewUrl} alt={it.name} className="h-24 w-full object-cover" />
              ) : (
                <div className="flex h-24 w-full items-center justify-center text-2xl">
                  {it.kind === "video" ? "🎥" : "🎙"}
                </div>
              )}
              <button
                type="button"
                onClick={() => remove(it.id)}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-xs text-white"
                aria-label="削除"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {/* 解析開始（固定フッター） */}
      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t border-stone-200 bg-white/95 px-4 py-3 backdrop-blur">
        <button
          type="button"
          disabled={!canSubmit || busy}
          onClick={startAnalyze}
          className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-[#8B4A3C] text-base font-bold text-white disabled:opacity-40"
        >
          {busy ? "AI解析中…" : "解析開始"}
        </button>
      </div>
    </main>
  );
}
