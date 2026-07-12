This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## 実機（Mac + iPhone Safari）開発環境

このプロジェクトの開発サーバーは **Webpack** で起動します（Turbopack は使いません）。
Next.js 16 では Turbopack が既定ですが、実機開発中に Turbopack のキャッシュ破損
（`.next/dev/cache/turbopack` の `ENOENT`、`app-paths-manifest.json` /
`pages-manifest.json` の欠落）で dev サーバーが 500 を返す事象があったため、
`npm run dev` は `next dev --webpack` を実行します。本番ビルド（`npm run build`）の設定は変更していません。

### Mac と iPhone を同一 Wi-Fi でつないで確認する

```bash
npm run dev -- --hostname 0.0.0.0
```

- Mac から: `http://localhost:3000`
- iPhone から: `http://192.168.3.2:3000`（Mac の LAN IP。環境に合わせて読み替え）

LAN からのアクセスで Next.js の cross-origin 警告が出ないよう、`next.config.ts` の
`allowedDevOrigins` に `localhost` / `127.0.0.1` / `192.168.3.2` を**開発時のみ**許可しています。
別の LAN IP を使う場合は環境変数で追加できます（本番設定には埋め込まれません）:

```bash
NEXT_DEV_ORIGINS="192.168.10.5,192.168.10.6" npm run dev -- --hostname 0.0.0.0
```

### キャッシュ破損時の復旧手順

dev サーバーが `TurbopackInternalError` / `ENOENT` / manifest 欠落などで
500 を返す、または画面が更新されなくなった場合は、`.next` を消して再起動します。

```bash
npm run clean       # .next を削除するだけ
npm run dev:clean   # .next を削除して dev サーバー（Webpack）を起動
```

> Windows で `rm -rf` が使えない場合は、`.next` フォルダを手動削除するか、
> PowerShell で `Remove-Item -Recurse -Force .next` を実行してください。
> 現状 Mac が主開発環境のため、依存を増やさない方針で `rimraf` は導入していません。

### 入力データの保護（下書き）

案件登録・現地調査・工事項目などの入力は、`useAutoDraft` により
入力の 800ms 後に localStorage へ自動下書き保存されます。さらに、画面が隠れる・
離脱するタイミング（`visibilitychange`(hidden) / `pagehide` / `beforeunload`）で
**同期的に**最新入力を localStorage へ書き込むため、Safari のバックグラウンド移行や
dev サーバーの 500・再読込が起きても、ブラウザ側の下書きは失われません。
再度画面を開くと「前回入力途中の下書きがあります」バナーから復元できます。

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
