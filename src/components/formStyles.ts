// 案件管理系画面の共通フォームスタイル
// 既存画面（見積・材料計算）の入力スタイルに合わせている。
// UIルール: 入力欄は高さ44px以上 / 提出用情報は白系 / 内部情報は黄系 /
//           入力箇所と自動表示箇所を色分けする

/** 提出用（白系）テキスト入力 */
export const fldInput =
  "w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm leading-[1.35] text-stone-800 placeholder:text-stone-300 focus:border-[#8B4A3C] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#8B4A3C]/30 min-h-[44px]";

/** 提出用（白系）セレクト */
export const fldSelect =
  "w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm leading-[1.35] text-stone-800 focus:border-[#8B4A3C] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#8B4A3C]/30 min-h-[44px]";

/** 内部管理（黄系）テキスト入力 */
export const costInput =
  "w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-[1.35] text-stone-800 placeholder:text-stone-300 focus:border-amber-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-300/50 min-h-[44px]";

/** 自動表示（読み取り専用）欄。入力欄と区別するためグレー背景 */
export const readOnlyFld =
  "flex min-h-[44px] w-full items-center rounded-lg border border-stone-200 bg-stone-100 px-3 py-2.5 text-sm text-stone-500";

/** 入力ラベル */
export const lbl = "mb-0.5 block text-xs leading-[1.35] text-stone-400";
