# 現場事例 登録ワークフロー 設計書（AI棟梁 / 日常業務化）

利用者は写真・動画・音声・テキストを投入するだけ。AIが解析・整理し、代表者が
1画面で確認・修正し、「承認して保存」1回で Supabase に保存を完了する。
通常登録で SQL・migration・GitHub・個別プロンプト・手動アップロード・タグ手入力・
Decision Log 手動作成を**一切要求しない**。

---

## 1. 現行実装調査結果（差分の起点）

| 領域 | 現行 | 本設計での扱い |
|---|---|---|
| データ保存 | 画面系は localStorage（`createListStore`）。現場事例のみ Supabase 用 `fieldCases.ts` を追加済み | 現場事例は Supabase を正とする。ワークフロー列を追加 |
| 現場事例スキーマ | `field_cases`/`tags`/`field_case_tags`/`field_case_photos`/`decision_logs`（migration 2件）。推定/確定原因は分離済み | **非破壊の追加migration**で workflow・confidence・監査・統計・ジョブを追加 |
| AI解析 | `/api/ai/vision-structure`（OpenAI Vision＋ローカルfallback）。帳票向けの候補抽出（`aiStructuring.ts`） | 現場事例向けに `/api/field-cases/analyze` を新設。confidence 付き構造化を返す |
| 画像 | クライアント圧縮 `imageCompress.ts`、Storage `field-photos`（既存migration） | 承認時にまとめて Storage 保存し `field_case_photos` へ紐付け |
| 検索 | `search_field_cases` RPC（原因/症状/対応/タグ横断） | **`workflow_status='approved'` 既定フィルタ**を追加（承認前の混入防止） |
| UI | `"use client"` ページ、`formStyles.ts`、ブランド色 `#8B4A3C`、min-h 44px のスマホ配慮 | 同パターンで `/field-cases/new`・`/field-cases/[id]/review` を新設 |
| 監査/承認 | なし | `field_case_edits`（AI値↔修正値の履歴）と workflow で新設 |
| 統計/非同期 | なし | 統計テーブル＋承認後の非同期分離（後述） |

**差分の要点**: スキーマは破壊せず列・テーブルを追加。既存の register/search は活かしつつ、
「解析→draft→承認→確定」の状態遷移と監査・統計・非同期を上乗せする。

---

## 2. 画面遷移図

```mermaid
flowchart TD
  A[/field-cases/new\nスマホ入力\n写真・動画・音声・テキスト/] -->|解析開始| B{AI解析ジョブ\n/api/field-cases/analyze}
  B -->|構造化+confidence| C[draft保存\nworkflow_status=draft\n/api/field-cases/draft]
  C --> D[/field-cases/[id]/review\n代表者確認画面\n1画面で編集/]
  D -->|修正を保存| C
  D -->|保留| E[workflow_status=pending_approval]
  D -->|却下| F[workflow_status=rejected]
  D -->|承認して保存| G[/api/field-cases/approve\n主要データ同期保存\n+監査ログ/]
  G --> H[workflow_status=approved\n案件ID発番・写真Storage\ntags・検索index・Decision Log]
  G -.->|非同期ジョブ| I[統計更新/類似案件/\nRAG文/PDF下書き/サムネ]
  H --> J[/field-cases 一覧・検索\napprovedのみ表示/]
```

状態遷移: `draft → pending_approval → approved`（`rejected` は差戻し、`verified` は
後日の実地確認で確定）。承認前（draft/pending_approval/rejected）は検索・一覧に出さない。

---

## 3. DB追加migration設計（`20260725090000_field_case_workflow.sql`・非破壊）

### field_cases への追加列
- `title text`（案件名）/ `error_codes text[]`（エラーコード）/ `additional_checks text[]`（追加確認事項）/ `alternative_actions text[]`（代替対応）
- `workflow_status text`（`draft`/`pending_approval`/`approved`/`rejected`/`verified`・CHECK・既定 `draft`）
- `case_no text`（承認時に発番する案件ID 例 `FC-2026-0001`）/ `approved_at` / `approved_by`
- `ai_confidence jsonb`（項目別 confidence 0–1）/ `ai_raw jsonb`（AI生成の生値スナップショット）
- `rag_text text`（類似案件・RAG検索用の要約文。※高度なRAGは範囲外、要約テキスト保持のみ）
- `service_years int generated`（製造年からの使用年数。統計用）
- 既存 `search_field_cases` RPC を `p_include_unapproved boolean default false` 付きへ再定義

### 監査（AI精度評価に使える修正履歴）
`field_case_edits`：`case_id` / `field_name` / `ai_value` / `approved_value` /
`edited_by` / `edited_at` / `edit_reason` / `ai_confidence numeric`。

### 解析ジョブ
`analysis_jobs`：`id` / `case_id` / `status`(queued/running/done/failed) / `input_kinds` /
`result jsonb` / `error` / timestamps。

### 統計（承認後に非同期集計）
`field_case_stats`：`dimension`（manufacturer/model/error_code/manufacture_year/
service_years/cause/action/recurrence/ai_edit_rate/ai_match_rate）/ `bucket` / `count` /
`updated_at`（PK: dimension+bucket）。集計は関数 `refresh_field_case_stats()` で洗い替え。

### 監査ログ（システム操作ログ）
`audit_logs`：`entity` / `entity_id` / `action` / `actor` / `detail jsonb` / `created_at`。

### 類似案件
`field_case_links`：`case_id` / `related_case_id` / `score` / `reason`（承認後の非同期で作成）。

### Storage
既存 `field-photos` に加え、サムネ用 `field-photos-thumb` バケットを追加（非同期生成）。

---

## 4. API設計

| API | メソッド | 役割 | 権限 |
|---|---|---|---|
| `/api/field-cases/analyze` | POST | 画像/テキスト等を受け AI 解析。confidence 付き構造化データ＋不足時の確認事項(最大3)を返す。draft を作成し `caseId` を返す | service_role |
| `/api/field-cases/draft` | POST | draft の作成/更新（修正を保存・保留）。`workflow_status` を draft/pending_approval に | service_role |
| `/api/field-cases/approve` | POST | **承認して保存**。主要データを同期保存（案件ID発番・field_cases確定・写真Storage・photos紐付け・tags・検索index・Decision Log・監査ログ・edits履歴）。統計/類似/RAG/PDF/サムネは非同期キューへ | service_role |
| `/api/field-cases/reject` | POST | 却下（workflow_status=rejected、理由を監査ログへ） | service_role |
| `/api/field-cases/search` | GET/POST | 既定で approved のみ。`includeUnapproved` は管理用途 | anon |
| `/api/field-cases/[id]` | GET | 承認画面/再表示用の1件取得（draft含む） | service_role |
| `/api/field-cases/stats/refresh` | POST | 統計洗い替え（非同期ワーカー or 手動） | service_role |

**AI値の非確定**: analyze は結果を確定情報にしない。`ai_raw`＋`ai_confidence` を保持し、
確定値は代表者の承認値。approve 時に AI値≠承認値の項目を `field_case_edits` へ記録する。

---

## 9. 非同期処理設計

承認押下時のトランザクション（同期・高速）:
1. 案件ID発番 → 2. field_cases を approved で保存 → 3. 写真 Storage 保存 →
4. field_case_photos 紐付け → 5. tags 登録 → 6. search_body/rag_text 更新 →
7. Decision Log 作成 → 8. 監査ログ・edits 履歴保存。

非同期（`analysis_jobs`/簡易キュー経由、`/api/field-cases/stats/refresh` 等で実行）:
- 類似案件検索（`field_case_links`）
- 統計更新（`refresh_field_case_stats`）
- RAG文章生成（`rag_text` の高度化）
- PDF下書き生成 / 画像サムネイル生成

> 本環境にジョブランナーが無いため、S級実装では承認APIが軽量ジョブ行を作成し、
> `stats/refresh` エンドポイント（cron/Runtimeから叩く想定）で消化する構成。承認の応答は
> 非同期処理の完了を待たない。

---

## 10. 統計更新処理

`refresh_field_case_stats()`（SQL関数, approved のみ対象）で以下を洗い替え:
メーカー別 / 型式別 / エラーコード別 / 製造年別 / 使用年数別 / 原因別 / 対応方法別 /
再発件数 / AI解析修正率（edits件数÷承認件数）/ AIと確定診断の一致率
（diagnosis_status の AI値と承認値の一致率）。承認処理とは分離して実行。

---

## 11. 監査ログ

- `audit_logs`: 承認/却下/保留などの操作を actor 付きで記録。
- `field_case_edits`: **AI生成値・代表者修正後の値・修正者・修正日時・修正理由(任意)・
  対象項目の AI confidence** を保存。将来の AI 精度評価（修正率/一致率）に直接利用する。

---

## 13. 操作手順書（利用者・代表者向け）

**利用者（現場）**
1. スマホで `/field-cases/new` を開く
2. 写真を複数選択（動画・音声・短文は任意。必須入力なし）
3. 「解析開始」→ 数秒で確認画面へ

**代表者**
4. `/field-cases/[id]/review` で 問題/原因/診断状態/推奨対応/リスク/写真説明/タグ を確認
5. 必要なら各欄を修正（AI生成値はグレー表示、confidence 低は警告色）
6. 下部ボタン: **修正を保存** / **保留** / **却下** / **承認して保存**
7. 「承認して保存」1回で完了。案件ID発番・保存・写真紐付け・Decision Log まで自動。
   再読み込みしてもデータは保持され、承認済みは検索・一覧に出る。

SQL・GitHub・Claude への個別操作は不要。

---

## 実装スコープ（本PR = S級のみ）

**実装する（完成条件を満たす最小縦断）**: 追加migration（workflow/confidence/監査/
統計/ジョブ/類似）、fieldCases module 拡張（draft/approve/audit/approvedのみ検索）、
analyze/draft/approve/reject/[id] API、アップロード画面、代表者承認画面、統計洗い替え関数。

**実装しない（指示により範囲外）**: 高度なRAG（ベクトル検索/pgvector）・外部公開機能。
動画/音声は「受領してテキスト添付・後処理」までとし高度な文字起こしは範囲外。PDF下書き・
サムネ生成・ジョブランナー常駐はテーブル/関数の器のみ用意し常駐処理は未実装。

---

## 実装物一覧（本PRで追加）

| 種別 | パス |
|---|---|
| 追加migration | `supabase/migrations/20260725090000_field_case_workflow.sql` |
| module（draft/approve/audit/stats） | `src/app/utils/fieldCaseWorkflow.ts` |
| AI解析 | `src/app/utils/fieldCaseAnalysis.ts` |
| 型・検索フィルタ拡張 | `src/app/utils/fieldCases.ts` |
| API | `analyze` / `draft` / `approve` / `reject` / `[id]` / `stats/refresh`（`src/app/api/field-cases/…`） |
| 画面 | `src/app/field-cases/new/page.tsx`（アップロード）、`src/app/field-cases/[id]/review/page.tsx`（承認）、`src/app/field-cases/page.tsx`（一覧・検索） |

## 完成条件チェック（ローカルPostgreSQL 16 + build/tsc/lint で検証）

| 完成条件 | 実装/検証 |
|---|---|
| スマホから写真と短い文章を投入できる | ✅ `/field-cases/new`（写真複数/動画/録音/テキスト・必須ゼロ） |
| AI解析結果が確認画面に表示される | ✅ `analyze`→draft→`/[id]/review` に confidence 付きで表示 |
| 代表者が修正できる | ✅ review画面で全項目編集可 |
| 承認ボタン1回で保存できる | ✅ 「承認して保存」→ `/api/field-cases/approve` |
| 再読み込みしてもデータが消えない | ✅ draftをSupabaseに保存、写真も解析時にStorage確定 |
| 写真が案件へ紐付く | ✅ `field_case_photos`（analyze時にupload+紐付け） |
| 承認前データが検索結果へ混入しない | ✅ `search_field_cases` 既定 approved のみ（PG検証: draft除外=1/include=2） |
| 承認済み案件を再表示できる | ✅ `/field-cases` 一覧・`/[id]/review` 再表示（承認後は読取専用表示） |
| AI生成値と修正値の履歴が残る | ✅ `field_case_edits`（AI値/承認値/修正者/日時/理由/confidence）。PG検証: edits記録・ai_edit_rate=0.5・ai_match_rate=0.5 |
| 通常登録時にSQL/GitHub操作が不要 | ✅ 画面→API→自動保存で完結 |

**PG実行検証（要点）**: 3migration+seed適用OK / draft作成→approved検索除外→承認(case_no発番 FC-2026-xxxx)→
approved検索出現 / 監査edits・audit_logs・analysis_jobs(queued) 記録 / `refresh_field_case_stats`
（メーカー/型式/エラー/製造年/使用年数16年/原因/対応/再発/AI修正率0.5/AI一致率0.5）。

**未検証**: HTTP APIエンドポイント・画面のE2E（実Supabase必要）。AI解析の実呼び出し（OPENAI_API_KEY
未設定時はローカル簡易抽出にフォールバック）。実画像アップロード・常駐ジョブランナー。
