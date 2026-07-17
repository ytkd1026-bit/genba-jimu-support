"use client";

// 案件IDのコピーボタン（S-3 一覧強化）
// 元請への連絡やメモ書きで案件IDをそのまま使えるようにする。
// Link カード内にも置くため、クリック時は遷移を止める。

import { useState } from "react";

export function CopyProjectId({ projectId }: { projectId: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(projectId);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 1500);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={`案件ID ${projectId} をコピー`}
      className="inline-flex min-h-[32px] items-center gap-1 rounded-lg px-1.5 py-0.5 font-mono text-xs text-stone-400 active:bg-stone-100"
    >
      {projectId}
      <span className="text-[11px]">
        {state === "copied" ? "✓ コピー済み" : state === "failed" ? "コピー失敗" : "⧉"}
      </span>
    </button>
  );
}
