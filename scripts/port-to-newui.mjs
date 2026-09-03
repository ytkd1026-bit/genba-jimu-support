// 旧UI画面 → 新UI画面への機械変換。
// ロジック（hooks/handlers/計算/PDF）は一切書き換えず、className と
// 共有部品の import・内部リンクだけを新UIへ差し替える。
// 変換漏れを検出するため、既知でない旧トークンが残ったら警告する。

import fs from "node:fs";

const [, , src, dest] = process.argv;
if (!src || !dest) { console.error("usage: node port-to-newui.mjs <src> <dest>"); process.exit(1); }
let s = fs.readFileSync(src, "utf8");

const rules = [
  // ── 共有部品を新UI版へ ─────────────────────────────
  [/import \{ ProjectTabs, ProjectHeader \} from "@\/components\/ProjectTabs";/g,
   'import { NuProjectTabs, NuProjectHeader } from "@/app/new/_components/NuProject";'],
  [/import \{ ProjectTabs \} from "@\/components\/ProjectTabs";/g,
   'import { NuProjectTabs } from "@/app/new/_components/NuProject";'],
  [/<ProjectHeader /g, "<NuProjectHeader "],
  [/<ProjectTabs /g, "<NuProjectTabs "],

  // formStyles（旧共有ファイルは変更しない・新UI版へ差し替え）
  [/import \{([^}]+)\} from "@\/components\/formStyles";/g, (_m, names) => {
    const map = { fldInput: "nuInput", fldSelect: "nuSelect", costInput: "nuCostInput",
                  readOnlyFld: "nuReadOnly", lbl: "nuLbl" };
    const list = names.split(",").map(n => n.trim()).filter(Boolean);
    const mapped = list.map(n => `${map[n] ?? n} as ${n}`).join(", ");
    return `import { ${mapped} } from "@/app/new/_lib/formStyles";`;
  }],

  // ── ページ骨格 ────────────────────────────────────
  // 新UIレイアウトが背景・下部ナビ余白を持つのでラッパは無色に
  [/className="min-h-screen bg-\[#fdf8f2\] pb-24"/g, 'className="pb-4"'],
  [/className="min-h-screen bg-\[#fdf8f2\]"/g, 'className=""'],
  [/className="min-h-screen bg-\[#fdf8f2\] ?/g, 'className="'],
  [/mx-auto max-w-md px-4 py-4 sm:max-w-lg/g, "px-4 py-4"],
  [/mx-auto max-w-md px-4 py-10 text-center sm:max-w-lg/g, "px-4 py-10 text-center"],
  [/mx-auto max-w-md ?/g, ""],

  // ── 配色トークン ──────────────────────────────────
  [/#8B4A3C\/(\d+)/g, "var(--nu-primary)"],          // 透過指定は単色へ
  [/#8B4A3C/g, "var(--nu-primary)"],
  [/bg-\[#fdf0ec\]/g, "bg-[var(--nu-primary-bg)]"],
  [/#fdf0ec/g, "var(--nu-primary-bg)"],
  [/bg-\[#fdf8f2\]/g, "bg-[var(--nu-bg)]"],
  [/#fdf8f2/g, "var(--nu-bg)"],
  // stone → 新UI中立色
  [/text-stone-800/g, "text-[var(--nu-text)]"],
  [/text-stone-700/g, "text-[var(--nu-text)]"],
  [/text-stone-600/g, "text-slate-600"],
  [/text-stone-500/g, "text-slate-500"],
  [/text-stone-400/g, "text-slate-400"],
  [/text-stone-300/g, "text-slate-300"],
  [/bg-stone-50/g, "bg-[var(--nu-bg)]"],
  [/bg-stone-100/g, "bg-[var(--nu-bg)]"],
  [/bg-stone-200/g, "bg-[var(--nu-border)]"],
  [/border-stone-200/g, "border-[var(--nu-border)]"],
  [/border-stone-100/g, "border-[var(--nu-border-soft)]"],
  [/ring-stone-200/g, "ring-[var(--nu-border)]"],
  [/ring-stone-100/g, "ring-[var(--nu-border-soft)]"],
  [/divide-stone-200/g, "divide-[var(--nu-border)]"],
  [/divide-stone-100/g, "divide-[var(--nu-border-soft)]"],

  // ── 内部リンクを新UIへ ────────────────────────────
  [/href="\/projects\/list"/g, 'href="/new/projects"'],
  [/href="\/projects\/new"/g, 'href="/new/projects/new"'],
  [/href=\{`\/projects\/\$\{encodeURIComponent\(projectId\)\}/g,
   'href={`/new/projects/${encodeURIComponent(projectId)}'],
  [/href=\{`\/projects\/\$\{projectId\}/g, 'href={`/new/projects/${projectId}'],
];

for (const [re, rep] of rules) s = s.replace(re, rep);

fs.writeFileSync(dest, s);

// 変換漏れ検出
const leftovers = [];
for (const pat of [/#8B4A3C/, /#fdf8f2/, /#fdf0ec/, /stone-\d/, /@\/components\/formStyles/, /@\/components\/ProjectTabs/, /href="\/projects\//, /href=\{`\/projects\//]) {
  const m = s.match(new RegExp(pat.source, "g"));
  if (m) leftovers.push(`${pat.source} × ${m.length}`);
}
console.log(`✔ ${dest}`);
if (leftovers.length) console.log("  ⚠ 未変換:", leftovers.join(" / "));
