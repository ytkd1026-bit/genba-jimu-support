# AI棟梁 運用規格 Ver1.0 — 開発者向け運用ガイド

このディレクトリは、事務サポ（現場の事務サポ）を中心とした
REVO / AIT / JIMU 3事業の**開発・資料作成・不具合対応・事業計画**に共通する
命名規則と管理規格を固定化したものです。ChatGPT・Claude・将来の AI棟梁 が
同じルールで情報を扱えるようにするための「共通言語」です。

> 今回整備したのは**開発運用基盤**であり、アプリのコード挙動は変更していません。

## この規格の全体像

| # | ファイル | 内容 |
|---|---------|------|
| 01 | [01-project-classification.md](./01-project-classification.md) | 分類コード（REVO / AIT / JIMU） |
| 02 | [02-file-naming-rule.md](./02-file-naming-rule.md) | ファイル命名規則 |
| 03 | [03-branch-rule.md](./03-branch-rule.md) | Git ブランチ・コミット規則 |
| 04 | [04-priority-rule.md](./04-priority-rule.md) | 優先度（S/A/B/C/X） |
| 05 | [05-status-rule.md](./05-status-rule.md) | 状態（TODO/DOING/HOLD/DONE） |
| 06 | [06-release-rule.md](./06-release-rule.md) | リリース・バージョン規則 |
| 07 | [07-ai-toryo-data-gap-analysis.md](./07-ai-toryo-data-gap-analysis.md) | 共通DB / AI棟梁 連携のためのデータ不足調査 |
| 08 | [08-chat-classification-rule.md](./08-chat-classification-rule.md) | チャット・情報分類規格（Ver1.1・JIMU/REVO/AIT/KNOW） |
| 09 | [09-chat-classification-changelog.md](./09-chat-classification-changelog.md) | 情報管理標準 変更履歴 |
| 10 | [10-project-classification-rule.md](./10-project-classification-rule.md) | 案件分類規格 Ver1.0（多軸・保険種別含む） |
| 11 | [11-photo-classification-rule.md](./11-photo-classification-rule.md) | 写真分類規格 Ver1.0（9区分・安全含む） |
| 12 | [12-ai-toryo-db-structure.md](./12-ai-toryo-db-structure.md) | AI棟梁DB 構造案 Ver1.0（横断検索） |
| — | [OPERATING-RULES-1page.md](./OPERATING-RULES-1page.md) | 今後守る運用ルール（1ページ） |

関連：[../roadmap/JIMU-Roadmap-v1.0.md](../roadmap/JIMU-Roadmap-v1.0.md)（事務サポ専用ロードマップ） /
[../../verification/project-standardization/06-chat-classification-example.csv](../../verification/project-standardization/06-chat-classification-example.csv)（分類CSVサンプル）

---

## 1. 分類方法

すべての成果物（資料・タスク・ブランチ・ドキュメント）は、まず3つの事業分類の
いずれかに属させます。

- **REVO** … 経営・事業計画・単価表・保険修繕
- **AIT** … AI棟梁・施工ノウハウ・現場DB
- **JIMU** … 現場の事務サポ開発

判断に迷う場合は「その成果物が最終的にどの事業の価値になるか」で決めます。
詳細は 01 を参照。

## 2. 命名方法

`分類-YYYYMMDD-内容-v版数.拡張子`

例：`JIMU-20260712-下書き保存-v1.0.md`

詳細・例外は 02 を参照。

## 3. 優先度定義

`S`(最優先) / `A`(高) / `B`(中) / `C`(低) / `X`(廃止候補)

詳細は 04 を参照。

## 4. 状態定義

`TODO` → `DOING` → `DONE`（保留は `HOLD`）

詳細は 05 を参照。

## 5. ブランチ規則

- 機能追加：`feature/jimu-内容`
- 不具合修正：`fix/jimu-内容`

例：`feature/jimu-customer-management` / `fix/jimu-draft-save`

基準ブランチ（`review/draft-save`）へは勝手に merge しない。詳細は 03 を参照。

## 6. コミット規則

`feat:` / `fix:` / `refactor:` / `docs:` / `test:`

例：`fix: preserve draft after server restart`

詳細は 03 を参照。

## 7. リリース規則

`vメジャー.マイナー`（例 v1.0）。事務サポは Phase1 完成まで内部リリースのみ。
詳細は 06 を参照。

---

## AI棟梁に関する厳守事項（重要）

AI棟梁は**未公開**です。以下を厳守します。

- UI へ表示しない
- メニューへ表示しない
- β版表示もしない
- 事務サポを**先に完成**させる
- AI棟梁は**案件1000件以降**に内部評価
- **案件3000件**で精度検証
- **案件5000件**で公開可否判断

データ設計（07）は将来の AI棟梁 連携を見据えて先行整備しますが、
機能・導線としては一切露出させません。
