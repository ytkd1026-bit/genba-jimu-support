"use client";

// 新UI（/new）のテーマカラー適用・共有。
// - ルート要素（.nu-root）の data-nu-theme を切り替えるだけの軽量実装。
// - 実際の色は globals.css の CSS 変数で定義（アクセントのみ差し替え）。
// - 保持は localStorage 専用キー（既存ストアには触れない）。

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

// data-nu-theme を .nu-root に反映（標準テーマは属性なし＝:root 既定を使う）。
function applyTheme(el: HTMLElement | null, theme: ThemeId) {
  if (!el) return;
  if (theme === DEFAULT_THEME) el.removeAttribute("data-nu-theme");
  else el.setAttribute("data-nu-theme", theme);
}

// ちらつき防止：ハイドレーション前に localStorage の値を即適用するスクリプト。
export const themeNoFlashScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');var r=document.getElementById('nu-root');if(r&&t&&t!=='${DEFAULT_THEME}'){r.setAttribute('data-nu-theme',t);}}catch(e){}})();`;

export default function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);

  // マウント時に保存済みテーマを読み込む
  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (isThemeId(saved)) {
        setThemeState(saved);
        applyTheme(document.getElementById("nu-root"), saved);
      }
    } catch {
      /* localStorage 不可環境では既定テーマ */
    }
  }, []);

  const setTheme = useCallback((t: ThemeId) => {
    setThemeState(t);
    applyTheme(document.getElementById("nu-root"), t);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, t);
    } catch {
      /* 保存できなくても表示は切り替える */
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
