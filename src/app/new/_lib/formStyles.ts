// 新UI用のフォームスタイル。
// 旧 src/components/formStyles.ts は旧UIが使い続けるため変更せず、
// 新UIはテーマ変数（--nu-*）に追従するこちらを使う。
// タップ領域は 44px 以上を維持する（iPhone 実機要件）。

/** 提出用（白系）テキスト入力 */
export const nuInput =
  "w-full rounded-xl border border-[var(--nu-border)] bg-white px-3 py-2.5 text-base leading-[1.4] text-[var(--nu-text)] placeholder:text-slate-300 focus:border-[var(--nu-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-primary)]/20 min-h-[44px]";

/** 提出用（白系）セレクト */
export const nuSelect =
  "w-full rounded-xl border border-[var(--nu-border)] bg-white px-3 py-2.5 text-base leading-[1.4] text-[var(--nu-text)] focus:border-[var(--nu-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-primary)]/20 min-h-[44px]";

/** 内部管理（原価・粗利）用。提出帳票に出ない情報であることを色で示す */
export const nuCostInput =
  "w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-base leading-[1.4] text-[var(--nu-text)] placeholder:text-amber-300 focus:border-amber-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-300/40 min-h-[44px]";

/** 自動表示（読み取り専用） */
export const nuReadOnly =
  "flex min-h-[44px] w-full items-center rounded-xl border border-[var(--nu-border)] bg-[var(--nu-bg)] px-3 py-2.5 text-sm text-slate-500";

/** 入力ラベル */
export const nuLbl = "mb-1 block text-xs font-semibold leading-[1.35] text-slate-500";
