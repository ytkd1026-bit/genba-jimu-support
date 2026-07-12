// 写真台帳用の画像圧縮ユーティリティ
//
// 高解像度写真をそのまま localStorage に保存すると容量（約5MB）を
// すぐに使い切るため、画面表示・PDF出力に十分なサイズへ圧縮してから保存する。
// ブラウザ環境専用（canvas を使用）。
//
// TODO: 案件あたりの写真枚数が増えると localStorage の上限に達する。
//       その場合は IndexedDB への移行（保存層 photoRecords.ts の差し替え）を検討する。

/** 長辺の最大ピクセル数（A4写真台帳の1コマ表示に十分な解像度） */
const MAX_LONG_EDGE = 1280;
/** JPEG品質（0〜1） */
const JPEG_QUALITY = 0.72;

export type CompressedImage = {
  dataUrl: string;
  width: number;
  height: number;
  /** 圧縮後のおおよそのバイト数 */
  approxBytes: number;
};

/**
 * 画像ファイルを圧縮して data URL を返す。
 * 読み込めない形式（HEIC非対応ブラウザ等）の場合は null を返す。
 */
export async function compressImageFile(
  file: File,
  maxLongEdge: number = MAX_LONG_EDGE,
  quality: number = JPEG_QUALITY,
): Promise<CompressedImage | null> {
  if (typeof document === "undefined") return null;

  try {
    const bitmap = await createImageBitmap(file);
    const longEdge = Math.max(bitmap.width, bitmap.height);
    const scale = longEdge > maxLongEdge ? maxLongEdge / longEdge : 1;
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return null;
    }

    // JPEG は透過を持てないため白背景で塗ってから描画する（PNG透過対策）
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    // data URL は base64 のため実バイト数は約 3/4
    const approxBytes = Math.round((dataUrl.length - "data:image/jpeg;base64,".length) * 0.75);
    return { dataUrl, width: w, height: h, approxBytes };
  } catch {
    return null;
  }
}
