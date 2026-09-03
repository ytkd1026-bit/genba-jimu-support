"use client";

// 新UI（/new）のテーマカラー適用・共有。
// ─────────────────────────────────────────────────────────────
// 設計（重要）:
//  ・テーマ属性は **React が描画する**（data-nu-theme を JSX で出す）。
//    命令的な DOM 書き換え（getElementById + setAttribute）はしない。
//    → React の再描画で属性が失われる事故が起きない。
//  ・初期値はサーバー（layout）が Cookie から解決して initialTheme で渡す。
//    → SSR の HTML に最初から正しいテーマが乗るのでチラつき（FOUC）が無く、
//      サーバー出力とクライアント初回描画が一致するため hydration mismatch も出ない。
//  ・hydration 前の DOM 書き換え・JSX 内の生 script は使わない（禁止事項）。
//  ・保持は Cookie（SSR用）と localStorage（既存互換）の二重書き。
//    既に localStorage だけを持つ端末は初回マウント時に Cookie へ移行する。

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  isThemeId,
  type ThemeId,
} from "../_lib/themeColors";

type ThemeContextValue = {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/** Cookie へ保存（1年・同一サイト）。SSR がこれを読んで初期テーマを決める。 */
function writeThemeCookie(theme: ThemeId) {
  try {
    document.cookie = `${THEME_STORAGE_KEY}=${theme}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    /* Cookie 不可環境でも localStorage 側で動作する */
  }
}

function readThemeCookie(): ThemeId | null {
  try {
    const m = document.cookie.match(
      new RegExp("(?:^|; )" + THEME_STORAGE_KEY + "=([^;]*)"),
    );
    const v = m ? decodeURIComponent(m[1]) : null;
    return isThemeId(v) ? v : null;
  } catch {
    return null;
  }
}

export default function ThemeProvider({
  initialTheme,
  children,
}: {
  /** サーバーが Cookie から解決した初期テーマ */
  initialTheme: ThemeId;
  children: React.ReactNode;
}) {
  const [theme, setThemeState] = useState<ThemeId>(initialTheme);

  // 既存端末の移行のみ:
  // localStorage にテーマがあるのに Cookie が未設定なら、Cookie へ写して反映する。
  // 通常（Cookie あり）の端末では state 変更が起きないため再描画も発生しない。
  useEffect(() => {
    if (readThemeCookie() !== null) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      return;
    }
    if (isThemeId(saved)) {
      writeThemeCookie(saved);
      if (saved !== initialTheme) setThemeState(saved);
    }
  }, [initialTheme]);

  const setTheme = useCallback((t: ThemeId) => {
    setThemeState(t);
    writeThemeCookie(t);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, t);
    } catch {
      /* 保存できなくても表示は切り替える */
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {/* テーマ属性は React が描画する。標準テーマは属性なし（:root 既定を使う） */}
      <div
        id="nu-root"
        className="nu-root min-h-screen"
        data-nu-theme={theme === DEFAULT_THEME ? undefined : theme}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
