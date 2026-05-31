/**
 * OCR前の画像前処理
 * - 2.5倍スケールアップ（テキスト拡大でOCR精度向上）
 * - グレースケール変換
 * - コントラスト強調（1.4倍）
 * サーバー側では実行できないため、ブラウザ環境専用
 */
export async function preprocessImageForOcr(file: File): Promise<Blob | null> {
  if (typeof document === "undefined") return null;

  try {
    const bitmap = await createImageBitmap(file);
    const SCALE = 2.5;
    const w = Math.round(bitmap.width * SCALE);
    const h = Math.round(bitmap.height * SCALE);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) { bitmap.close(); return null; }

    // スケールアップして描画
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    // ピクセル処理: グレースケール + コントラスト強調
    const imageData = ctx.getImageData(0, 0, w, h);
    const d = imageData.data;
    const CONTRAST = 1.4;

    for (let i = 0; i < d.length; i += 4) {
      // 輝度加重グレースケール (ITU-R BT.601)
      const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      // コントラスト強調
      const enhanced = Math.min(255, Math.max(0, (gray - 128) * CONTRAST + 128));
      d[i] = d[i + 1] = d[i + 2] = Math.round(enhanced);
      // アルファチャンネルは変更しない
    }

    ctx.putImageData(imageData, 0, 0);

    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/png");
    });
  } catch {
    return null;
  }
}
