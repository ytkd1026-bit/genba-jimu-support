# PDF用フォント

## ファイル構成

- `NotoSansJP-Regular.ttf`（weight 400）
- `NotoSansJP-Bold.ttf`（weight 700）

PDF生成（`@react-pdf/renderer`）専用のフォントで、この2ファイルのみで足ります。
アプリの画面表示（ブラウザ側のCSS）はTailwindの既定フォントを使用しており、
このフォントとは無関係です。woff2は現在どこからも参照されていないため置いていません。

## 取得元・ライセンス

- フォント本体：Google Fonts「Noto Sans JP」
- 配布元：`@fontsource/noto-sans-jp`（npm）の japanese subset, weight 400/700 の woff2
- ライセンス：SIL Open Font License 1.1（OFL-1.1）— 商用利用・再配布可、フォント単体での再販売は不可
- ライセンス全文：https://openfontlicense.org/open-font-license-official-text/
  （`@fontsource/noto-sans-jp` パッケージ内 `LICENSE` にも同文が同梱される）

## 用途

`src/app/projects/sample/estimate/EstimatePDF.tsx`、
`src/app/projects/sample/single-invoice/SingleInvoicePDF.tsx`、
`src/app/projects/sample/invoice/BulkInvoicePDF.tsx` の `Font.register` から
`/fonts/NotoSansJP-Regular.ttf` / `/fonts/NotoSansJP-Bold.ttf` として参照している。

## 経緯

- 旧実装は `https://cdn.jsdelivr.net/npm/noto-sans-japanese@1.0.0/...`（サードパーティ配布のCDN）を
  参照していたが、このフォントはグリフ収録が不完全で「△」等の記号が文字化けしていた。
- `@fontsource/noto-sans-jp` の woff2 をそのまま `/public/fonts/` に配置して
  `Font.register` から参照したところ、`@react-pdf/renderer` のブラウザ内フォント処理が
  この woff2 を正しく解釈できず、**PDF内の文字が一切描画されない**（空白になる）事象が発生した。
- fonttools で woff2 → TTF（無圧縮）に変換したところ解消したため、TTFを採用した。
- なお `△` `□` `◇` 等の幾何学記号（Geometric Shapes ブロック）はこのフォントに収録されておらず、
  使用すると文字化けする。プレースホルダー文言には `〇`（U+3007、IDEOGRAPHIC NUMBER ZERO）を使うこと。

## 更新する場合

```bash
npm install @fontsource/noto-sans-jp
pip3 install fonttools brotli
python3 -c "
from fontTools.ttLib import TTFont
for w in ['400-normal', '700-normal']:
    f = TTFont(f'node_modules/@fontsource/noto-sans-jp/files/noto-sans-jp-japanese-{w}.woff2')
    f.flavor = None
    out = 'Regular' if w == '400-normal' else 'Bold'
    f.save(f'public/fonts/NotoSansJP-{out}.ttf')
"
npm uninstall @fontsource/noto-sans-jp
```

## Gitに含めるべきファイル

- `NotoSansJP-Regular.ttf` / `NotoSansJP-Bold.ttf` / この `README.md` の3つをコミット対象とする
  （バイナリだがサイズは計2ファイルで約4.7MB、PDF生成に必須のため許容）
- woff2やその他中間生成物はコミットしない
