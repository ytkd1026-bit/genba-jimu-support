# クラウド保存・端末間共有 設計（Phase 1.2）

作成日：2026-09-06 ／ 対象ブランチ：`claude/new-mobile-ui-development-8ukgy3`

**この文書は設計のみ。Phase 1.1 では実装しない。migration も適用しない。**

---

## 0. 解決したい問題

iPhone で登録した案件が Mac に出てこない。

原因はコード上の想定挙動である。業務データの正本が `localStorage` にあり、
`localStorage` は「ブラウザ × origin」ごとに分離されるため、
iPhone Safari と Mac のブラウザでは別の保管庫になる。同期する仕組みは存在しない。

### 完成要件

```
iPhone で案件登録 → Mac で同じ案件を確認・編集 → iPhone で再確認
```
が同一データで成立すること。

### 方針

- **Supabase を業務データの正本にする。**
- `localStorage` は次の2用途に限定する。
  - 自動下書き（`useAutoDraft` / `draftStorage`）
  - オフライン時の一時キャッシュ
- PDF・写真は Supabase Storage に置き、案件ID・書類ID・version で紐付ける。

---

## 1. 再利用できる既存設計（調査結果）

### 1-1. 所在に注意

Supabase Phase 1 の実装は **`/Users/yo/Projects/genba-jimu-support`（main working copy）の未コミット WIP としてのみ存在する。**
`review/draft-save` にも `claude/new-mobile-ui-development-8ukgy3` にもコミットされていない。

> **先にやること**：この WIP を失わないよう、Phase 1.2 着手時に独立ブランチへコミットする。
> 現時点では他セッションの作業中の可能性があるため、こちらからは触っていない。

### 1-2. 既にあるもの（そのまま使える）

| 資産 | 内容 |
|---|---|
| `supabase/migrations/0001_init.sql`（333行） | 下記9テーブル＋RLS＋トリガ。**再設計不要** |
| `src/app/lib/supabase/client.ts` | Supabase クライアント生成 |
| `src/app/lib/supabase/backend.ts` | `supabase` / `local` のバックエンド判定（env設定済み＋サインイン済み＋org あり なら supabase） |
| `src/app/lib/supabase/authRepository.ts` / `authErrors.ts` | メール＋パスワード認証 |
| `src/app/lib/supabase/migrationState.ts` | 端末データ移行の状態管理 |
| `src/app/repositories/{company,contractor,unitPrice,migration}Repository.ts` | 画面が直接 supabase を触らないための層。**このパターンを踏襲する** |
| `docs/SUPABASE_SETUP.md` / `.env.local.example` | 手順と環境変数 |

**既存テーブル**：`organizations` / `organization_members` / `company_settings` / `contractors` /
`unit_price_master` / `projects` / `work_items` / `saved_estimates` / `saved_invoices`

**設計上の良い点（維持する）**

- 内部主キーは `uuid`、業務番号は `*_code` / `*_number` に分離。
- `local_ref` に localStorage 側のIDを保持し、`unique (organization_id, local_ref)` で
  **冪等な移行**ができる（二重投入しても増えない）。
- `saved_estimates` / `saved_invoices` は `line_items_snapshot` `company_snapshot`
  `submit_to_snapshot` を jsonb で持ち、**過去版がマスタ変更で変わらない**。
  Phase 1.1 で localStorage 側に実装した版管理と同じ思想。
- `is_test_data` によるテストデータ分類（`NODE_ENV` に依存しない既存方針と一致）。
- RLS は `is_org_member(organization_id)` で全業務テーブル一括適用。

---

## 2. 不足しているもの

### 2-1. 不足テーブル

| テーブル | 用途 | 現在の localStorage キー |
|---|---|---|
| `customers` | 得意先 | `genba_jimu_customers` |
| `surveys` | 現地調査 | （画面内・未保存） |
| `damage_records` | 損傷記録 | `genba_damage_records_v1` |
| `photo_records` | 写真台帳 | `genba_photo_records_v1` |
| `work_reports` | 施工記録・完了報告 | `genba_work_reports_v1` |
| `material_orders` | 発注 | `genba_jimu_saved_material_orders` / `genba_jimu_order_drafts` |
| `expenses` | 経費 | `genba_jimu_expense_drafts` |
| `project_logs` / `project_histories` | 案件ログ | `genba_project_logs_v1` / `genba_jimu_project_histories` |
| `documents` | **帳票メタデータ**（PDFのStorage参照） | `genba_jimu_document_storage` |
| `id_counters` | 採番カウンタ | `genba_id_counters_v1` |
| `unit_price_candidates` | 単価マスタ登録候補 | （未実装・[UNIT-PRICE-MASTER-PLAN](./UNIT-PRICE-MASTER-PLAN.md) 参照） |

`genba_settings`（会社情報）は `company_settings` に、`genba_projects_v1` は `projects` に、
`genba_work_items_v1` は `work_items` に、`genba_jimu_saved_estimates` は `saved_estimates` に対応済み。

### 2-2. 既存テーブルに不足しているカラム

Phase 1.1 で確定した仕様を保存できるようにするための追加。

**`projects`**
```
property_name  text   -- 物件名（単票型帳票のヘッダー）
room_number    text   -- 号室
customer_name  text   -- 担当者・入居者名
project_type   text   -- normal / insurance
building_type  text   -- condominium / apartment / …
```

**`saved_estimates`**
```
previous_estimate_id uuid references saved_estimates(id)  -- 版の連鎖
revision_reason      text                                 -- 修正理由
tax_breakdown        jsonb                                 -- 税率別内訳スナップショット
estimate_items_snapshot jsonb                              -- 分類/工事内容/施工箇所/備考の保存
form_type            text                                  -- single / supervised（帳票2モード）
```

> `line_items_snapshot` だけでは Phase 1.1 の `lineSnapshots`（金額・税）は入るが、
> `estimateItems`（分類・工事内容・施工箇所・備考）が入らない。
> localStorage 版では両方を持って合成しているため、クラウド側も2列必要。

**`work_items`**
```
location2  text  -- 部位（天井/壁/床/共通）。現在 location 1本しかない
```

### 2-3. Storage（PDF・写真）

バケット構成案（いずれも private、RLS はパス先頭の org id で判定）

```
documents/<org_id>/<project_code>/estimates/<estimate_number>_v<version>.pdf
documents/<org_id>/<project_code>/invoices/<invoice_number>.pdf
photos/<org_id>/<project_code>/<photo_id>.jpg
```

`documents` テーブル（新規）でメタデータを持つ。

```
id uuid pk
organization_id uuid not null
project_id uuid
doc_type text            -- estimate / invoice / work_report / survey / photo_ledger
doc_number text          -- 見積番号など
version int
storage_path text        -- 上記パス
issued_at timestamptz
created_at timestamptz
```

**原則**：PDF は「発行した版の証跡」として保存する。再生成ではなく発行時にアップロードする。
過去版の PDF は上書きしない（`version` 込みのパスにするのはこのため）。

---

## 3. localStorage → Supabase 移行方針

### 3-1. 段階

| 段階 | 対象 | 状態 |
|---|---|---|
| Phase 1（済・WIP） | company_settings / contractors / unit_price_master | repository 化まで完了 |
| **Phase 1.2-a** | projects / work_items | 本フェーズの主対象 |
| **Phase 1.2-b** | saved_estimates（版・スナップショット）／ saved_invoices | 本フェーズの主対象 |
| Phase 1.3 | photos / work_reports / documents + Storage | 後続 |

### 3-2. やり方（既存パターンの踏襲）

1. `src/app/repositories/<name>Repository.ts` を追加する。画面は repository だけを呼ぶ。
2. repository は `backend.ts` の判定で `supabase` / `local` を切り替える。
3. **localStorage ストアは消さない**。オフライン時のフォールバックと下書きに使い続ける。
4. 画面側は `async` 化のみ。計算ロジック（`computeWorkItemAmounts` / `calculateTaxBreakdown` /
   版管理）は一切変更しない。これらは保存先に依存しない純関数のまま。

### 3-3. 書き込み順序（見積の本保存）

Phase 1.1 で確定した順序をそのままクラウドへ移す。

```
work_items upsert → saved_estimates insert/update（スナップショット込み）
→ documents 登録 → Storage へ PDF アップロード
```
`saved_estimates` の書き込みが失敗したら PDF を発行しない（現在の挙動と同じ）。

---

## 4. 既存端末データの移行方法

既に `migrationRepository.ts` と `migrationState.ts` がある。この仕組みを拡張する。

1. ホーム画面に既にある「この端末のデータをクラウドへ移行しますか？」バナーを継続利用。
2. 移行は **`local_ref` による冪等 upsert**。同じ端末で二度押しても増えない。
3. 移行順序は外部キー順：`contractors` → `projects` → `work_items` → `saved_estimates` → `saved_invoices`。
4. 移行後も localStorage は**消さない**（ロールバック余地を残す）。
   `migrationState` に「移行済み」を記録し、以後は Supabase を正本として読む。
5. 複数端末から同じデータを移行した場合の重複は `local_ref` の unique 制約で防げるが、
   **端末ごとに local_ref 体系が独立している**ため、iPhone と Mac の両方に別々の案件がある場合は
   両方が投入される（＝統合ではなく合算）。これは正しい挙動として扱い、
   移行画面で「この端末の◯件を追加します」と件数を明示する。

---

## 5. 認証・organization 分離

既存実装をそのまま使う。

- `/auth` でメール＋パスワードサインアップ／サインイン。
- `handle_new_user` トリガでサインアップ時に `organizations` と `organization_members` を自動作成（1ユーザー1事業者）。
- RLS は全業務テーブルで `is_org_member(organization_id)`。
- **Mac と iPhone で同じアカウントにサインインすれば同じ org のデータが見える。** これが端末間共有の実体。

将来（複数人運用）に備えた検討事項（今回は実装しない）

- `organization_members.role`（owner / staff）による書き込み権限の分離。
- 職人アカウントを事務所 org に招待する導線。

---

## 6. オフライン時の扱い

現場は電波が悪い。オフラインで入力できないのは業務上許容できない。

| 状態 | 動作 |
|---|---|
| オンライン・サインイン済み | Supabase が正本。読み書きとも Supabase。 |
| オフライン | 既存の localStorage ストアへ書き、`pending` フラグを付ける。画面は通常どおり動く。 |
| 復帰時 | `pending` を `local_ref` で冪等 upsert し、成功したらフラグを落とす。 |
| 未サインイン | 従来どおり localStorage のみ（単一端末運用）。 |

**衝突の扱い**：同一 `local_ref` に対する更新は `updated_at` が新しい方を採用（last-write-wins）。
見積の**過去版は更新対象にしない**ため、衝突しても過去版は壊れない。
これは Phase 1.1 で「過去版は変更しない」を守っている構造の副次的な利点。

---

## 7. Phase 1.2 の進め方

1. main working copy の Supabase WIP を独立ブランチへコミット（**まずこれ**）。
2. 2-2 の不足カラムを `0002_phase12.sql` として追加（`0001_init.sql` は変更しない）。
3. `projectRepository` / `workItemRepository` / `estimateRepository` を追加。
4. 新UIの案件・見積画面を repository 経由へ差し替え（計算ロジックは触らない）。
5. Mac と iPhone で同一アカウントにサインインし、
   「iPhone で登録 → Mac で編集 → iPhone で再確認」を実機で確認。
6. `documents` + Storage は Phase 1.3。

**本番 migration の適用は、上記1が終わり、内容を確認してからにする。**
現時点で勝手に適用しない。
