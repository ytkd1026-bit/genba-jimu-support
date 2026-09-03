// 新UI共通の上部バー（各画面のタイトル表示）。
// スクロールしても上部に留まる。装飾は最小限・実用重視。

export default function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <header
      className="sticky top-0 z-30 border-b border-[#e6ebeb] bg-white/95 px-4 py-3 backdrop-blur"
      style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold text-[#1f2a2e]">{title}</h1>
          {subtitle && <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
    </header>
  );
}
