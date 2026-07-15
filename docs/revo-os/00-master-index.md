# REVO OS マスターインデックス

REVO の業務・開発ナレッジ（過去ワーク・資料・SOP・設計書）を一元管理するインデックス。
新しいドキュメントを追加したら、必ずこのインデックスに登録する。

最終更新: 2026-07-15（REVO OS 統合作業・初版）

## フォルダ構成

```text
docs/revo-os/
├── 00-master-index.md          ← 本ファイル（マスターインデックス）
├── 01-past-work/               ← 過去ワーク（開発履歴・検証記録・残TODO）
│   ├── development-history.md
│   ├── 10-remaining-todos.txt
│   └── verification-2026-07-12/   （統合マージ前の検証一式 01〜17）
├── 02-materials/               ← 資料（帳票サンプル・証拠画像）
│   └── pdf-samples/               （PDF目視確認の証拠画像 01〜09）
├── 03-sop/                     ← SOP（標準作業手順）
│   └── command-cheatsheet.md
└── 04-design/                  ← 設計書（仕様・設計判断・依存関係）
    ├── 08-migration-notes.txt
    ├── 09-existing-feature-impact.txt
    ├── 11-tax-calculation-spec.txt
    └── dependency-map.md
```

## 01 過去ワーク

| ドキュメント | 内容 | 参照先 |
|---|---|---|
| [development-history.md](./01-past-work/development-history.md) | 全開発履歴（第1期〜第4期）の時系列まとめ | 設計書・検証記録・残TODO |
| [10-remaining-todos.txt](./01-past-work/10-remaining-todos.txt) | 統合マージ時点の残TODO（準備中画面・版管理の発展余地・Supabase移行等） | 将来タスクの起点 |
| [verification-2026-07-12/](./01-past-work/verification-2026-07-12/) | 統合マージ前の検証一式（下記詳細） | 証拠画像は 02-materials |

verification-2026-07-12 の内訳:

| ファイル | 種別 |
|---|---|
| 01-status / 02-diff-stat / 03-diff-full / 04-untracked-files / 05-new-files-content | 変更内容の記録（03 と 05 は同じ新規ファイル内容を差分形式・全文形式で重複収録。履歴証拠のため両方保持） |
| 06-build-result / 07-lint-result | build・lint 結果 |
| 12-tax-test-result | 税計算テスト（→ 仕様は 04-design/11） |
| 13-end-to-end-normal / 14-end-to-end-insurance | 通常案件・保険案件の通しテスト |
| 15-versioning-test-result / 16-invoice-snapshot-test | 見積版管理・請求スナップショットのテスト |
| 17-pdf-regression-check | PDF実物・回帰目視確認（→ 証拠画像は 02-materials/pdf-samples） |

## 02 資料

| 資料 | 内容 | 参照元 |
|---|---|---|
| [pdf-samples/](./02-materials/pdf-samples/) 01〜09 | 見積（混在税率/損害）・請求・調査報告・写真台帳・作業報告・発注確認・保存用・旧見積の実生成PDF画像 | 17-pdf-regression-check.txt から参照 |

## 03 SOP（標準作業手順）

| SOP | 内容 |
|---|---|
| [command-cheatsheet.md](./03-sop/command-cheatsheet.md) | 開発コマンド一覧（サーバー起動・Git操作・レビュー用ファイル出力・トラブル時の確認セット・画面URL一覧） |

## 04 設計書

| 設計書 | 内容 | 検証記録 |
|---|---|---|
| [08-migration-notes.txt](./04-design/08-migration-notes.txt) | 旧データ→新 Project へのデータ移行設計（並走方針・保存キー・マッピング） | 同ファイル末尾に旧データ互換の検証結果 |
| [09-existing-feature-impact.txt](./04-design/09-existing-feature-impact.txt) | 統合修正で既存機能に与えた影響の整理 | — |
| [11-tax-calculation-spec.txt](./04-design/11-tax-calculation-spec.txt) | 税区分・税率の計算仕様（合算後切り捨て・TaxBreakdown・スナップショット） | [12-tax-test-result.txt](./01-past-work/verification-2026-07-12/12-tax-test-result.txt) |
| [dependency-map.md](./04-design/dependency-map.md) | コード・データ・ドキュメントの依存関係マップ | — |

## 参照関係マップ（ドキュメント間リンク）

```text
00-master-index.md（本ファイル・起点）
 ├→ 01-past-work/development-history.md
 │    ├→ 04-design/08,09,11（第4期の設計判断）
 │    ├→ 01-past-work/verification-2026-07-12/（第4期の検証）
 │    └→ 01-past-work/10-remaining-todos.txt
 ├→ 04-design/dependency-map.md
 │    ├→ 04-design/08-migration-notes.txt（データ移行の前提）
 │    └→ 04-design/11-tax-calculation-spec.txt（税計算の前提）
 ├→ 04-design/11-tax-calculation-spec.txt
 │    └→ 検証: verification-2026-07-12/12-tax-test-result.txt
 └→ verification-2026-07-12/17-pdf-regression-check.txt
      └→ 証拠: 02-materials/pdf-samples/01〜09
```

## 運用ルール

1. **分類先の判断**: 完了した作業の記録＝01、画像・サンプル等の素材＝02、繰り返す手順＝03、仕様・設計判断＝04。
2. **重複禁止**: 同じ内容を複数フォルダに置かない。片方を正本とし、他方からはリンクで参照する。
3. **参照の明記**: 設計書には対応する検証記録を、検証記録には証拠資料を必ずリンクする。
4. **インデックス更新**: ドキュメントの追加・移動・削除時は本ファイルの表と参照関係マップを更新する。
5. **旧番号の維持**: verification 時代の連番（01〜17）はファイル内の相互参照を壊さないため維持する。

## 整理履歴

- 2026-07-15: REVO OS 統合作業（初回）
  - 旧 `verification/`・`docs/command-cheatsheet.md` を上記4分類へ再分類
  - 重複削除: `src/app/projects/sample/invoice/page 2.tsx`（現行 page.tsx より古い作業コピー）を削除
  - 参照関係・依存関係を作成（本ファイル＋ dependency-map.md）
