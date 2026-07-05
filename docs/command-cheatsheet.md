# 現場の事務サポ：開発コマンド一覧

## 0. このファイルの目的

このファイルは、現場の事務サポプロジェクトで使うコマンドの控えです。

対象プロジェクト：

```bash
/Users/yo/Desktop/genba-jimu-support
```

基本ルール：

- 作業前に必ずプロジェクトフォルダへ移動する
- コマンドは原則 `/Users/yo/Desktop/genba-jimu-support` で実行する
- `/Users/yo` や `Desktop` 直下で実行しない
- Git操作前は必ず `git status` を確認する
- Claude Codeが別フォルダにいる時は、必ずプロジェクトへ戻す

---

## 1. プロジェクトフォルダへ移動

```bash
cd ~/Desktop/genba-jimu-support
```

フルパス版：

```bash
cd /Users/yo/Desktop/genba-jimu-support
```

現在地確認：

```bash
pwd
```

---

## 2. 開発サーバー起動

```bash
cd ~/Desktop/genba-jimu-support
npm run dev
```

ブラウザ確認URL：

```text
http://localhost:3000
```

iPhoneなど同一Wi-Fi確認URL：

```text
http://192.168.3.2:3000
```

---

## 3. Claude Code 脱走呼び戻しコード

Claude Codeがデスクトップ、ホーム、別フォルダへ行った時はこれ。

```bash
cd ~/Desktop/genba-jimu-support
claude
```

最短版：

```bash
cd ~/Desktop/genba-jimu-support && claude
```

もし `claude` が反応しない場合：

```bash
cd ~/Desktop/genba-jimu-support
npx claude
```

または：

```bash
cd ~/Desktop/genba-jimu-support
claude code
```

Claude Code起動後に確認する内容：

```text
現在の作業フォルダが以下になっているか確認してください。
/Users/yo/Desktop/genba-jimu-support

次に以下を確認してください。
1. git branch --show-current
2. git status
3. git log --oneline -3

まだコード修正はしないでください。
現在位置の確認だけお願いします。
```

---

## 4. Claude Codeログイン

ログインエラーが出た時：

```text
/login
```

`API Error 401` が出た時も、まずこれ：

```text
/login
```

---

## 5. Git 状態確認

```bash
cd ~/Desktop/genba-jimu-support
git status
```

短く見る：

```bash
git status --short
```

現在のブランチ確認：

```bash
git branch --show-current
```

直近コミット確認：

```bash
git log --oneline -3
```

---

## 6. 変更内容をレビュー用ファイルに出す

```bash
cd ~/Desktop/genba-jimu-support
git status > change-status.txt
git diff > change-review.txt
open .
```

ステージ済み差分を見る場合：

```bash
git diff --staged > staged-review.txt
git status > change-status.txt
open .
```

最新コミット全文を見る場合：

```bash
git show HEAD > latest-commit-review.txt
open .
```

---

## 7. 確認用ファイルの削除

確認用ファイルはGitに入れない。

削除する時：

```bash
rm change-review.txt change-status.txt latest-commit-review.txt savedInvoices-review.txt staged-review.txt
git status
```

---

## 8. ファイル存在確認

特定ファイルを見る：

```bash
ls src/app/utils
ls src/hooks
```

指定文字列があるか確認：

```bash
grep -n "saveBeforePdf" src/app/projects/sample/estimate/page.tsx
grep -n "useAutoDraft" src/app/projects/sample/estimate/page.tsx
```

請求書保存ユーティリティ全文を確認用に出す：

```bash
cat src/app/utils/savedInvoices.ts > savedInvoices-review.txt
open .
```

---

## 9. Git add

個別に追加する場合：

```bash
git add src/app/projects/sample/estimate/page.tsx
git add src/app/projects/sample/single-invoice/page.tsx
git add src/app/projects/new/page.tsx
git add src/app/projects/sample/materials/page.tsx
git add src/app/utils/savedInvoices.ts
```

追加後に確認：

```bash
git status
```

---

## 10. Git commit

今回使ったコミット：

```bash
git commit -m "見積・請求書の保存安全化と主要入力画面の自動下書き保存を追加" -m "見積はestimateIdを下書きに含め、リロード後の重複保存を抑制。単体請求書はPDF発行前に本保存を実行。案件登録と材料計算行は自動下書き保存・復元まで追加し、正式な本保存機能は未実装として残す。"
```

コミット後確認：

```bash
git status
git log --oneline -3
```

---

## 11. GitHub リモート確認

```bash
git remote -v
```

リモート削除：

```bash
git remote remove origin
```

リモート追加：

```bash
git remote add origin https://github.com/ytkd1026-bit/genba-jimu-support.git
```

リモート確認：

```bash
git remote -v
```

---

## 12. GitHub push

今回のブランチ：

```bash
review/draft-save
```

push：

```bash
git push -u origin review/draft-save
```

成功確認：

```bash
git status
git log --oneline -3
```

成功時の目安：

```text
Your branch is up to date with 'origin/review/draft-save'.
nothing to commit, working tree clean
```

---

## 13. よく使う画面URL

ホーム：

```text
http://localhost:3000
```

見積書作成：

```text
http://localhost:3000/estimates
```

請求書関係：

```text
http://localhost:3000/invoices
```

単体請求書：

```text
http://localhost:3000/projects/sample/single-invoice
```

材料・発注管理：

```text
http://localhost:3000/projects/sample/materials
```

案件登録：

```text
http://localhost:3000/projects/new
```

---

## 14. 動作確認で使うコマンド

開発サーバー起動：

```bash
npm run dev
```

ビルド確認：

```bash
npm run build
```

依存関係インストール：

```bash
npm install
```

---

## 15. 今回の保存安全化で確認する項目

### 見積

- 自動下書き保存される
- リロード後に復元できる
- `estimateId` が復元される
- PDF3種類を発行できる
- PDF発行前に本保存される
- 重複保存されない

### 単体請求書

- 自動下書き保存される
- リロード後に復元できる
- PDF発行前に本保存される
- `invoiceId` が維持される
- 重複保存されない

### 案件登録

- 自動下書き保存される
- リロード後に復元できる
- 旧キー `DRAFT_PROJECT_KEY` と新キー `PROJECT_AUTO_DRAFT_KEY` の役割を混同しない
- 正式な案件本保存はまだ未実装

### 材料・発注管理

- 材料計算行が自動下書き保存される
- リロード後に復元できる
- 材料計算行の正式な本保存はまだ未実装

---

## 16. 今後の実装予定メモ

優先順位：

1. 見積画面と単体請求書の実動作確認
2. 案件登録の正式な `savedProjects` 本保存設計
3. 材料計算行の `savedMaterialOrders` 本保存設計
4. 請求書一覧・保存済み請求書確認画面との連携
5. 一括請求への自動下書き保存展開
6. 月次収支への保存安全化
7. スキャン登録への保存安全化

---

## 17. 絶対にGitへ入れない確認用ファイル

```text
change-review.txt
change-status.txt
latest-commit-review.txt
savedInvoices-review.txt
staged-review.txt
tsconfig.tsbuildinfo
```

---

## 18. トラブル時の最初の確認セット

迷ったらまずこれ。

```bash
cd ~/Desktop/genba-jimu-support
pwd
git branch --show-current
git status
git log --oneline -3
git remote -v
```
