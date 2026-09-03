// 新UI共通の上部バー（各画面のタイトル表示）。
// スクロールしても上部に留まる。装飾は最小限・実用重視。
// back を渡すと先頭に戻るリンク（新UIトーン）を表示する。

import Link from "next/link";

export default function PageHeader({
  title,
  subtitle,
  right,
  back,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  /** 戻り先の href。指定時は先頭に「←」ボタンを表示 */
  back?: string;
}) {
  return (
    <header
      className="sticky top-0 z-30 border-b border-[#e6ebeb] bg-white/95 px-4 py-3 backdrop-blur"
      style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {back && (
            <Link
              href={back}
              aria-label="戻る"
              className="-ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg text-[var(--nu-primary-dk)] active:bg-[var(--nu-primary-bg)]"
            >
              ‹
            </Link>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold text-[#1f2a2e]">{title}</h1>
            {subtitle && <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>}
          </div>
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
    </header>
  );
}
