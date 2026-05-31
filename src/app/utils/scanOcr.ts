import type { LoggerMessage } from "tesseract.js";

export type OcrProgressCallback = (progress: number) => void;

export async function ocrImageFile(
  file: File,
  onProgress?: OcrProgressCallback
): Promise<string> {
  const { recognize } = await import("tesseract.js");
  const result = await recognize(file, "jpn+eng", {
    logger: (m: LoggerMessage) => {
      if (m.status === "recognizing text" && onProgress) {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });
  return result.data.text;
}

export function extractAmountFromText(text: string): string {
  const labeled = [
    /(?:税込|合計|請求金額|発注金額|請負金額|御請求金額|小計|金額)[^\d]{0,15}([\d,]+)/,
  ];
  for (const pattern of labeled) {
    const m = text.match(pattern);
    if (m) return m[1].replace(/,/g, "");
  }

  const withYen = [
    /¥\s*([\d,]+)/,
    /￥\s*([\d,]+)/,
    /([\d,]{4,})\s*円/,
  ];
  for (const pattern of withYen) {
    const m = text.match(pattern);
    if (m) return m[1].replace(/,/g, "");
  }

  const nums = text.match(/[\d,]{5,}/g);
  if (nums && nums.length > 0) {
    const sorted = [...nums].sort(
      (a, b) => b.replace(/,/g, "").length - a.replace(/,/g, "").length
    );
    return sorted[0].replace(/,/g, "");
  }

  return "";
}

export function extractDateFromText(text: string): string {
  const slashDash = /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/;
  let m = text.match(slashDash);
  if (m) {
    const mo = m[2].padStart(2, "0");
    const d = m[3].padStart(2, "0");
    return `${m[1]}/${mo}/${d}`;
  }

  const kanji = /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/;
  m = text.match(kanji);
  if (m) {
    const mo = m[2].padStart(2, "0");
    const d = m[3].padStart(2, "0");
    return `${m[1]}/${mo}/${d}`;
  }

  const reiwa = /令和\s*(\d+)年\s*(\d{1,2})月\s*(\d{1,2})日/;
  m = text.match(reiwa);
  if (m) {
    const y = parseInt(m[1]) + 2018;
    const mo = m[2].padStart(2, "0");
    const d = m[3].padStart(2, "0");
    return `${y}/${mo}/${d}`;
  }

  return "";
}
