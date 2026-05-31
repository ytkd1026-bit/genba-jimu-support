import type { LoggerMessage } from "tesseract.js";

export type OcrProgressCallback = (progress: number) => void;

export async function ocrImageFile(
  file: File | Blob,
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
  // ラベル付きパターン（優先）
  const labelPatterns = [
    /(?:税抜発注金額|税込発注金額)[^\d]{0,15}([\d,]+)/,
    /(?:発注金額)[^\d]{0,15}([\d,]+)/,
    /(?:御請求金額|請求金額|請負金額|見積金額|受注金額)[^\d]{0,15}([\d,]+)/,
    /(?:税込合計|合計金額|合計)[^\d]{0,10}([\d,]+)/,
    /(?:小計|金額)[^\d]{0,10}([\d,]+)/,
  ];
  for (const pattern of labelPatterns) {
    const m = text.match(pattern);
    if (m) return m[1].replace(/,/g, "");
  }

  // 通貨記号パターン
  const currencyPatterns = [
    /¥\s*([\d,]+)/,
    /￥\s*([\d,]+)/,
    /([\d,]{4,})\s*円/,
  ];
  for (const pattern of currencyPatterns) {
    const m = text.match(pattern);
    if (m) return m[1].replace(/,/g, "");
  }

  // フォールバック：最も桁数の多い数字
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
    return `${m[1]}/${m[2].padStart(2, "0")}/${m[3].padStart(2, "0")}`;
  }

  const kanji = /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/;
  m = text.match(kanji);
  if (m) {
    return `${m[1]}/${m[2].padStart(2, "0")}/${m[3].padStart(2, "0")}`;
  }

  const reiwa = /令和\s*(\d+)年\s*(\d{1,2})月\s*(\d{1,2})日/;
  m = text.match(reiwa);
  if (m) {
    const y = parseInt(m[1]) + 2018;
    return `${y}/${m[2].padStart(2, "0")}/${m[3].padStart(2, "0")}`;
  }

  return "";
}

export function extractCompanyFromText(text: string): string {
  const keywords = [
    "株式会社", "（株）", "(株)", "合同会社", "有限会社",
    "工務店", "建設", "リフォーム", "内装", "設計事務所", "商店",
  ];
  const lines = text.split(/\n|\r\n|\r/).filter((l) => l.trim());

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.length >= 2 &&
      trimmed.length <= 40 &&
      keywords.some((kw) => trimmed.includes(kw))
    ) {
      return trimmed;
    }
  }
  return "";
}
