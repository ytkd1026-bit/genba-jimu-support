"use client";

// 新UI共通の下部固定ナビゲーション。
// 全 /new 画面に固定表示し、中央の「作成」を強調。iPhone Safe Area 対応。

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = {
  href: string;
  label: string;
  icon: string;
  center?: boolean;
};

const TABS: Tab[] = [
  { href: "/new",          label: "ホーム",  icon: "🏠" },
  { href: "/new/chat",     label: "チャット", icon: "💬" },
  { href: "/new/create",   label: "作成",    icon: "＋", center: true },
  { href: "/new/projects", label: "案件",    icon: "📁" },
  { href: "/new/my",       label: "My",     icon: "👤" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/new") return pathname === "/new";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function BottomNav() {
  const pathname = usePathname() || "/new";

  return (
    <nav
      aria-label="メインナビゲーション"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e6ebeb] bg-white/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-md items-end justify-around px-2 pt-1.5">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href);

          if (tab.center) {
            return (
              <li key={tab.href} className="-mt-5">
                <Link
                  href={tab.href}
                  aria-label={tab.label}
                  aria-current={active ? "page" : undefined}
                  className="flex flex-col items-center gap-0.5"
                >
                  <span
                    className={`flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-light text-white shadow-lg transition-transform active:scale-95 ${
                      active ? "bg-[#0f766e]" : "bg-[#0d9488]"
                    }`}
                  >
                    {tab.icon}
                  </span>
                  <span
                    className={`text-[11px] font-semibold ${
                      active ? "text-[#0f766e]" : "text-[#0d9488]"
                    }`}
                  >
                    {tab.label}
                  </span>
                </Link>
              </li>
            );
          }

          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className="flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 active:bg-[#f1f5f5]"
              >
                <span className={`text-xl leading-none ${active ? "" : "opacity-55"}`}>
                  {tab.icon}
                </span>
                <span
                  className={`text-[11px] ${
                    active ? "font-bold text-[#0f766e]" : "font-medium text-slate-500"
                  }`}
                >
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
