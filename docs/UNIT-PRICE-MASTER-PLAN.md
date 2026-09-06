# 単価マスタ登録候補 設計（Phase 1.1 の次フェーズ）

作成日：2026-09-06

**この文書は設計のみ。Phase 1.1 では実装しない。DB追加も行わない。**

---

## 0. 目的

見積や完了案件で使った工事項目のうち、**単価マスタに未登録のもの**を検出し、
職人が承認したときだけ単価マスタへ追加できるようにする。

現場で入力した実績がマスタに育っていくのが狙い。ただし
**自動登録・自動上書きは絶対にしない。** 価格は職人が決める。

### 例

```
工種：設備工事
項目：洗面台入替
メーカー：クリナップ
品番：BGA
仕様：W600
本体価格：41,000円
```
既存マスタに一致項目が無ければ「単価表に未登録の工事項目があります」として候補キューへ積む。

---

## 1. 現状（調査結果）

- **`claude/new-mobile-ui-development-8ukgy3` に単価マスタは存在しない。**
  `unitPriceMaster` / `standardProfitRate` ともに該当コード0件。
- 単価マスタ本体は
  - localStorage 版：`/Users/yo/Projects/genba-jimu-support` の未コミット WIP（`unitPriceRepository.ts`）
  - Supabase 版：同 WIP の `supabase/migrations/0001_init.sql` の `unit_price_master` テーブル

`unit_price_master` の既存カラム
```
trade_category / item_name / material_name / unit
material_unit_cost / labor_unit_cost / subcontract_unit_cost / other_unit_cost / total_unit_cost
target_profit_rate / reference_selling_unit_price / standard_selling_unit_price
active / is_test_data / local_ref
```

**したがってこの機能は、単価マスタ本体を新UIブランチへ取り込んだ後でなければ実装できない。**
Phase 1.1 で単価マスタを移植しないという判断は正しく、この機能もその後になる。

---

## 2. 候補データの構造（将来）

`unit_price_candidates`（新規テーブル。Phase 1.2 の schema 追加時に併せて検討）

| 列 | 意味 |
|---|---|
| `trade_category` | 工種 |
| `item_name` | 項目名 |
| `maker` | メーカー |
| `product_name` | 商品名 |
| `product_code` | 品番 |
| `spec` | 仕様 |
| `size` | サイズ |
| `unit` | 単位 |
| `material_unit_cost` | 材料原価 |
| `labor_unit_cost` | 施工原価 |
| `standard_selling_unit_price` | 標準売価 |
| `contractor_selling_prices` | 元請別売価（jsonb：`{ contractorId: price }`） |
| `source_project_id` | 参照案件ID |
| `source_estimate_id` | 参照見積ID |
| `last_used_at` | 最終使用日 |
| `status` | `pending` / `registered` / `dismissed` / `deferred` |
| `matched_master_id` | 既存マスタと同一項目と判定した場合の参照先 |

> 既存 `WorkItem` には メーカー / 商品名 / 品番 / 仕様 / サイズ の列が無い。
> 現状は `workDescription`（材料名・工事内容）に文字列として入っている。
> **不足項目としてここに明記する。** 実装フェーズで
> `work_items` に列を足すか、候補テーブル側でパースして持つかを決める。
> Phase 1.1 では追加しない。

---

## 3. 検出のタイミング

**入力中にポップアップを出さない。** 職人の手が止まるため。

| タイミング | 出すもの |
|---|---|
| 見積の本保存が完了した直後 | 「未登録単価候補 ◯件」の控えめな通知（バナー1行） |
| 案件完了時 | 同上 |
| My / 設定画面 | 候補キューの一覧へ入る導線 |

通知はあくまで件数の表示。詳細は職人が自分のタイミングで開く。

---

## 4. 判定ロジック

### 4-1. 未登録の判定

`trade_category` + `item_name` + `unit` の3点一致でマスタを引く。
一致が無ければ **新規候補**。

### 4-2. 既存だが価格が違う場合

**更新候補**として、比較表を出す。

```
洗面台入替（設備工事 / 台）
  現在単価   38,000 円
  今回単価   41,000 円
```
選択肢：
- 単価表を更新する
- 現在値を維持する

### 4-3. 新規候補の選択肢

- 単価表へ登録する
- 今回は登録しない（`dismissed`）
- あとで確認（`deferred` … キューに残す）

**どの選択肢もユーザーが押すまで何も起きない。**

---

## 5. AI の使いどころ

| 使ってよい | 使わない |
|---|---|
| 名称の正規化（「クロス貼替」「クロス張替」「クロス張り替え」を同一候補として束ねる提案） | 価格の決定 |
| `workDescription` からのメーカー・品番・仕様の抽出候補の提示 | マスタへの自動登録 |
| 似た既存マスタ項目のサジェスト | 既存単価の自動上書き |

AI の出力は必ず「候補」として提示し、確定は職人が行う。

---

## 6. 実装順序

1. Phase 1.1 完了（見積画面・見積帳票）
2. Phase 1.2（Supabase クラウド保存・端末間共有）
3. 単価マスタ本体を新UIブランチへ取り込む
4. `unit_price_candidates` 追加＋検出・承認UI

3 より前にこの機能を作らない。マスタが無ければ「未登録」の判定ができないため。
