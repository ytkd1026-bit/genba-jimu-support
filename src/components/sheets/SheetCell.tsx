"use client";

// 帳票の1セル。列定義の control に応じて入力部品を出し分ける。
//
// 通常時は帳票の文字として見え、フォーカス時だけ編集中であることが分かる。
// レイアウトを動かさないため、枠線は outline で描き、box-shadow で強調する。

import { useState } from "react";
import { ComboBox } from "./ComboBox";
import { formatForScreen } from "./estimateCellFormat";
import { sheetOptions } from "./sheetOptions";
import type { EstimateColumn } from "./estimateSheetColumns";

export function SheetCell({
  column,
  value,
  editable,
  onChange,
}: {
  column: EstimateColumn;
  value: string | number;
  editable: boolean;
  onChange?: (v: string) => void;
}) {
  const align = column.align;
  const set = (v: string) => onChange?.(v);

  // 金額セルは、編集していないときは帳票の書式（¥1,200）で見せる。
  // フォーカス中だけ生の数値にして入力しやすくする。
  const [editing, setEditing] = useState(false);
  const isCurrency = column.value === "currency";
  const shown = isCurrency && !editing ? formatForScreen(value, "currency") : String(value ?? "");

  // 自動計算値。編集させず、帳票の文字として出す。
  if (column.control === "readonly" || !editable) {
    return (
      <span className="sheet-cell-static" style={{ textAlign: align }}>
        {formatForScreen(value, column.value)}
      </span>
    );
  }

  switch (column.control) {
    case "textarea":
      return (
        <textarea
          value={String(value ?? "")}
          onChange={(e) => set(e.target.value)}
          rows={1}
          className="sheet-cell-input sheet-cell-textarea"
          style={{ textAlign: align }}
        />
      );

    case "number":
      return (
        <input
          type="text"
          inputMode="decimal"
          value={shown}
          onFocus={() => setEditing(true)}
          onBlur={() => setEditing(false)}
          onChange={(e) => set(e.target.value)}
          className="sheet-cell-input"
          style={{ textAlign: align }}
        />
      );

    case "dropdown":
      return (
        <select
          value={String(value ?? "")}
          onChange={(e) => set(e.target.value)}
          className="sheet-cell-input sheet-cell-select"
          style={{ textAlign: align }}
        >
          <option value=""></option>
          {sheetOptions(column.optionsKey).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );

    case "dropdown-free":
      return (
        <ComboBox
          value={String(value ?? "")}
          options={sheetOptions(column.optionsKey)}
          align={align}
          onChange={set}
        />
      );

    case "text":
    default:
      return (
        <input
          type="text"
          value={String(value ?? "")}
          onChange={(e) => set(e.target.value)}
          className="sheet-cell-input"
          style={{ textAlign: align }}
        />
      );
  }
}
