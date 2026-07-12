# 03. Git ブランチ・コミット規則

AI棟梁 運用規格 Ver1.0 / 分類：JIMU

## ブランチ命名規則

```
feature/jimu-内容      … 機能追加
fix/jimu-内容          … 不具合修正
```

例：

```
feature/jimu-customer-management
fix/jimu-draft-save
```

### 約束

- プレフィックスは `feature/` または `fix/`。
- 分類コードは**小文字**で `jimu`（ブランチ名は Git 慣習に合わせ小文字ケバブケース）。
  REVO 事業のリポジトリでは `revo`、AIT では `ait` を用いる。
- 「内容」は英小文字・ハイフン区切り（例 `draft-save`）。
- 1ブランチ＝1目的。目的が変わったら新しいブランチを切る。

## 基準ブランチの扱い（厳守）

- 事務サポの現在の統合先は **`review/draft-save`**。
- 基準ブランチへ**勝手に merge しない／直接変更しない**。
- 作業は必ず `feature/jimu-*` または `fix/jimu-*` で行い、
  merge 可否は人間が判断する。

## コミット規則（Conventional Commits 準拠の簡易版）

| プレフィックス | 用途 |
|----------------|------|
| `feat:` | 新機能 |
| `fix:` | 不具合修正 |
| `refactor:` | 挙動を変えない内部改善 |
| `docs:` | ドキュメント・資料 |
| `test:` | テスト・検証 |

例：

```
fix: preserve draft after server restart
feat: add customer management screen
docs: add AI TORYO project standards v1.0
```

### 約束

- 1行目（サマリ）は72文字以内・命令形・現在形。
- 本文が必要なら1行空けて記述（何を・なぜ）。
- 1コミット＝1論理変更。関係ない変更を混ぜない。

## 標準フロー

1. `review/draft-save` を最新化（`git pull --ff-only`）。
2. `feature/jimu-*` / `fix/jimu-*` を切る。
3. 小さくコミット（規則に従う）。
4. `npm run build` と `npx tsc --noEmit` が通ることを確認。
5. push（`git push -u origin <branch>`）。
6. merge は人間が判断（基準ブランチへ勝手に入れない）。
