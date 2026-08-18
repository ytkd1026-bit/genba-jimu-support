"use client";

import { useEffect, useRef, useState } from "react";

// 自由入力もできる独自コンボボックス。
// HTML の datalist は iOS Safari で挙動が安定しないため使わない。
//
// 段3-2A では見た目と基本操作のみ。検索・過去実績からの候補生成は行わない。

export function ComboBox({
  value,
  options,
  align = "left",
  placeholder,
  onChange,
}: {
  value: string;
  options: readonly string[];
  align?: "left" | "center" | "right";
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 外側をクリックしたら閉じる
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative flex w-full items-center">
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(false)}
        className="sheet-cell-input flex-1"
        style={{ textAlign: align }}
      />
      {options.length > 0 && (
        <button
          type="button"
          aria-label="候補を開く"
          onClick={() => setOpen((v) => !v)}
          className="sheet-combo-btn"
        >
          ▾
        </button>
      )}
      {open && options.length > 0 && (
        <ul className="sheet-combo-list" role="listbox">
          {options.map((o) => (
            <li key={o}>
              <button
                type="button"
                role="option"
                aria-selected={o === value}
                onClick={() => {
                  onChange(o);
                  setOpen(false);
                }}
                className={`sheet-combo-item ${o === value ? "is-selected" : ""}`}
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
