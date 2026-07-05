# 現場の事務サポ：開発コマンド一覧

## 0. このファイルの目的

このファイルは、現場の事務サポプロジェクトで使うコマンドの控えです。

対象プロジェクト：

```bash
/Users/yo/Desktop/genba-jimu-support
```

対象リポジトリ：

```bash
https://github.com/ytkd1026-bit/genba-jimu-support.git
```

主な目的：

- 今まで使ってきたコマンドを残す
- 今後よく使うコマンドを残す
- Claude Code がデスクトップや別フォルダへ移動した時に、正しいプロジェクトへ呼び戻す
- 迷った時に、このファイルだけ見れば作業場所と確認手順がわかるようにする

---

## 1. 最重要：プロジェクトへ移動するコマンド

まず、どこにいても必ずこのコマンドでプロジェクトフォルダへ戻る。

```bash
cd ~/Desktop/genba-jimu-support
```

絶対パスで書く場合：

```bash
cd /Users/yo/Desktop/genba-jimu-support
```

今いる場所を確認する：

```bash
pwd
```

正しく戻れていれば、次のように表示される。

```bash
/Users/yo/Desktop/genba-jimu-support
```

---

## 2. Claude Code が脱走した時の呼び戻しコマンド

Claude Code が Desktop や別フォルダにいる時は、以下を順番に実行する。

```bash
cd ~/Desktop/genba-jimu-support
claude
```

1行で実行する場合：

```bash
cd ~/Desktop/genba-jimu-support && claude
```

正しい場所にいるか確認してから Claude を起動する場合：

```bash
cd ~/Desktop/genba-jimu-support
pwd
claude
```

Claude Code が現在どこで動いているかわからない時：

```bash
pwd
ls
```

`package.json`、`src`、`app`、`docs` などが見えなければ、プロジェクト外にいる可能性が高い。

---

## 3. 開発サーバー起動コマンド

プロジェクトへ移動してから実行する。

```bash
cd ~/Desktop/genba-jimu-support
npm run dev
```

ブラウザで確認するURL：

```bash
http://localhost:3000
```

ポートが変わった場合は、ターミナルに表示されたURLを使う。

---

## 4. 開発サーバー停止コマンド

ターミナルで開発サーバーが動いている画面を選び、以下を押す。

```bash
control + c
```

Mac のキーボードでは `control` キーを押しながら `c`。

---

## 5. 開発サーバーが残っているか確認するコマンド

Next.js の開発サーバーが裏で残っていないか確認する。

```bash
jobs -l
ps aux | grep "next dev\|next-server" | grep -v grep
```

1行で実行する場合：

```bash
jobs -l; ps aux | grep "next dev\|next-server" | grep -v grep
```

何も表示されなければ、基本的には動いていない。

---

## 6. 開発サーバーを強制停止する時のコマンド

`ps aux` で Next.js のプロセス番号を確認する。

```bash
ps aux | grep "next dev\|next-server" | grep -v grep
```

表示された行の中にある PID を使って停止する。

```bash
kill PID番号
```

例：

```bash
kill 12345
```

それでも止まらない時だけ使う。

```bash
kill -9 PID番号
```

※ `kill -9` は最終手段。雑に使うと作業中の処理も切れる。

---

## 7. Next.js のキャッシュ削除

表示がおかしい、古い画面が残る、ビルドが変な時に使う。

```bash
cd ~/Desktop/genba-jimu-support
rm -rf .next/cache
```

キャッシュ削除後に開発サーバーを起動する。

```bash
npm run dev
```

1行で実行する場合：

```bash
cd ~/Desktop/genba-jimu-support && rm -rf .next/cache && npm run dev
```

---

## 8. インストール系コマンド

依存パッケージを入れる。

```bash
cd ~/Desktop/genba-jimu-support
npm install
```

`node_modules` を作り直したい時：

```bash
cd ~/Desktop/genba-jimu-support
rm -rf node_modules package-lock.json
npm install
```

※ `package-lock.json` を消すと依存関係が変わる可能性があるため、基本は Claude Code に確認してから実行する。

---

## 9. ビルド確認コマンド

本番用にビルドできるか確認する。

```bash
cd ~/Desktop/genba-jimu-support
npm run build
```

エラーが出たら、エラー文をコピーして Claude Code か ChatGPT に渡す。

---

## 10. Lint 確認コマンド

コードの形式やエラー候補を確認する。

```bash
cd ~/Desktop/genba-jimu-support
npm run lint
```

プロジェクトに lint が設定されていない場合は失敗することがある。その場合は `package.json` の scripts を確認する。

---

## 11. package.json の scripts 確認

このプロジェクトで使える npm コマンドを確認する。

```bash
cd ~/Desktop/genba-jimu-support
cat package.json
```

scripts だけ見たい時：

```bash
cat package.json | grep -A 20 '"scripts"'
```

---

## 12. Git 状態確認コマンド

変更されたファイルを確認する。

```bash
cd ~/Desktop/genba-jimu-support
git status
```

短く確認する場合：

```bash
git status --short
```

---

## 13. 差分確認コマンド

変更内容を確認する。

```bash
cd ~/Desktop/genba-jimu-support
git diff
```

ステージ済みの差分を見る場合：

```bash
git diff --staged
```

---

## 14. 差分をファイルに書き出すコマンド

ChatGPT や Claude Code にレビューさせるため、差分をテキスト化する。

```bash
cd ~/Desktop/genba-jimu-support
git diff > change-review.txt
```

Git 状態も保存する。

```bash
git status > change-status.txt
```

ステージ済み差分を保存する。

```bash
git diff --staged > staged-review.txt
```

保存後、Finder で開く。

```bash
open .
```

---

## 15. 特定ファイルを確認用に書き出すコマンド

例：保存済み請求書の共通処理を確認する場合。

```bash
cd ~/Desktop/genba-jimu-support
cat src/app/utils/savedInvoices.ts > savedInvoices-review.txt
```

他のファイルも同じ形で書き出せる。

```bash
cat 確認したいファイルパス > 確認用ファイル名.txt
```

例：

```bash
cat src/app/projects/sample/estimate/page.tsx > estimate-page-review.txt
```

---

## 16. ファイル一覧確認コマンド

今いる場所のファイルを見る。

```bash
ls
```

詳しく見る。

```bash
ls -la
```

src 配下を見る。

```bash
ls src
```

app 配下を見る。

```bash
ls src/app
```

---

## 17. ファイル検索コマンド

ファイル名で探す。

```bash
find . -name "ファイル名"
```

例：

```bash
find . -name "savedInvoices.ts"
```

特定の拡張子を探す。

```bash
find . -name "*.tsx"
```

---

## 18. 文字検索コマンド

コード内の文字を探す。

```bash
grep -R "探したい文字" src
```

例：

```bash
grep -R "請求書" src
```

大文字小文字を無視して探す。

```bash
grep -Ri "invoice" src
```

---

## 19. Git 追加・コミット・プッシュ

変更ファイルを追加する。

```bash
cd ~/Desktop/genba-jimu-support
git add .
```

コミットする。

```bash
git commit -m "変更内容を短く書く"
```

GitHub に送る。

```bash
git push
```

まとめて実行する例：

```bash
git add .
git commit -m "docs: add command cheatsheet"
git push
```

---

## 20. 現在のブランチ確認

```bash
cd ~/Desktop/genba-jimu-support
git branch --show-current
```

全ブランチを見る。

```bash
git branch
```

リモートも含めて見る。

```bash
git branch -a
```

---

## 21. GitHub から最新状態を取得

```bash
cd ~/Desktop/genba-jimu-support
git pull
```

ブランチ指定で取得する場合：

```bash
git pull origin ブランチ名
```

例：

```bash
git pull origin review/draft-save
```

---

## 22. 作業前の安全確認セット

作業前に最低限これを実行する。

```bash
cd ~/Desktop/genba-jimu-support
pwd
git status
npm run build
```

ビルドが重い時は、まずこれだけでもよい。

```bash
cd ~/Desktop/genba-jimu-support
pwd
git status
```

---

## 23. 作業後の確認セット

修正後、レビュー用ファイルを作る。

```bash
cd ~/Desktop/genba-jimu-support
git status > change-status.txt
git diff > change-review.txt
open .
```

ビルド確認まで行う場合：

```bash
npm run build
git status > change-status.txt
git diff > change-review.txt
open .
```

---

## 24. よく見る画面URL

開発サーバー起動後に確認する。

```bash
http://localhost:3000
```

案件登録：

```bash
http://localhost:3000/projects/register
```

新規案件：

```bash
http://localhost:3000/projects/new
```

サンプル見積：

```bash
http://localhost:3000/projects/sample/estimate
```

保存済み見積：

```bash
http://localhost:3000/estimates/saved
```

材料・発注管理：

```bash
http://localhost:3000/projects/sample/materials
```

単体請求書：

```bash
http://localhost:3000/projects/sample/single-invoice
```

請求書関係：

```bash
http://localhost:3000/invoices
```

---

## 25. Hydration mismatch が出た時の確認

ターミナルに以下のような警告が出ることがある。

```text
A tree hydrated but some attributes of the server rendered HTML didn't match the client properties.
```

主な原因：

- サーバー側とブラウザ側で表示内容が変わっている
- `Date.now()` や `Math.random()` のような毎回変わる値を初期表示に使っている
- ブラウザ拡張機能がHTMLを書き換えている
- 日付や時刻の表示がサーバーとブラウザで違う
- `window` がある時だけ処理するコードが初期表示に影響している

まず試すこと：

```bash
cd ~/Desktop/genba-jimu-support
rm -rf .next/cache
npm run dev
```

それでも続く場合は、表示された警告文を `change-review.txt` などと一緒に ChatGPT / Claude Code に渡す。

---

## 26. Claude Code に許可してよい可能性が高い確認コマンド

以下は基本的に確認だけなので、許可してよいことが多い。

```bash
pwd
ls
ls -la
git status
git status --short
git diff
git diff --staged
cat package.json
jobs -l
ps aux | grep "next dev\|next-server" | grep -v grep
```

ただし、削除・上書き・送信系は内容を見てから許可する。

---

## 27. 注意が必要なコマンド

以下は影響が大きいので、実行前に確認する。

```bash
rm -rf ファイル名またはフォルダ名
kill -9 PID番号
git reset --hard
git clean -fd
git push --force
```

特に危険：

```bash
git reset --hard
git clean -fd
git push --force
```

これらは作業内容が消える可能性がある。職人で言えば、仕上げ後に養生ごと全部剥がすような雑さ。

---

## 28. 最短復旧セット

画面がおかしい、Claude が迷子、サーバーも怪しい時の最短セット。

```bash
cd ~/Desktop/genba-jimu-support
pwd
git status
rm -rf .next/cache
npm run dev
```

別ターミナルで Claude Code を起動する場合：

```bash
cd ~/Desktop/genba-jimu-support
claude
```

---

## 29. ChatGPT に渡す時の定番セット

修正後にレビューしてもらうためのファイルを作る。

```bash
cd ~/Desktop/genba-jimu-support
git status > change-status.txt
git diff > change-review.txt
open .
```

必要に応じて、対象ファイルも書き出す。

```bash
cat 対象ファイルパス > 対象ファイル-review.txt
```

例：

```bash
cat src/app/utils/savedInvoices.ts > savedInvoices-review.txt
```

---

## 30. 迷った時の基本手順

1. まずプロジェクトへ戻る

```bash
cd ~/Desktop/genba-jimu-support
```

2. 今いる場所を確認する

```bash
pwd
```

3. Git 状態を見る

```bash
git status
```

4. 開発サーバーを起動する

```bash
npm run dev
```

5. Claude Code を呼ぶ

```bash
claude
```

---

## 31. 最重要コマンドだけ再掲

```bash
cd ~/Desktop/genba-jimu-support
claude
```

```bash
cd ~/Desktop/genba-jimu-support
npm run dev
```

```bash
cd ~/Desktop/genba-jimu-support
git status
git diff
```

```bash
cd ~/Desktop/genba-jimu-support
git status > change-status.txt
git diff > change-review.txt
open .
```
