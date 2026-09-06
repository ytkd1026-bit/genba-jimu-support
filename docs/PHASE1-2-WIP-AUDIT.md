# Phase 1.2 既存Supabase WIP 監査報告

監査日：2026-09-06
監査者：実装担当（Claude）
起点commit：`3513306`（工程Aのcommit `07d4d6a` を含む状態で実施）

**本監査で行った変更：なし。**
旧WIPの読み取り、現行コードの読み取り、過去監査レポートの読み取りのみ。
DB接続・migration実行・schema変更・Supabase本番操作・旧WIP修正・branch操作は一切していない。

---

## 1. Executive Summary

**GO / NO-GO 判定：条件付きGO（ただし Phase 1.2-0 と 1.2-1 を終えるまで実装着手はNO-GO）**

- 旧WIPの `0001_init.sql`（333行）は**そのまま再利用できる品質**。org分離・RLS・`local_ref` による冪等移行・
  スナップショット保持など、Phase 1.1 で確定した設計思想と矛盾しない。
- ただし**旧WIPはどのブランチにもコミットされていない**。main working copy の未コミット状態でのみ存在し、
  失われれば作り直しになる。**最優先で保全する。**
- security は「新テーブルを作る前に確認」の指示どおり、先に片付ける必要がある。
  ただし過去監査（S-1〜S-5）は**AI棟梁プロジェクト `dzyowbsaufkvfmqiaepy` に対するもので、
  事務サポのプロジェクトとは別**である。事務サポ側の実測はまだ誰も行っていない。
- 現行コードには `.env.local` に**別のプロジェクト参照 `gvdqjotccltljdwkyuzu` が既に設定されている**。
  「AI棟梁と共用か／専用か」は事実上すでに分かれている可能性が高いが、**中身は未確認**。
- ID採番は localStorage カウンタ依存で、端末間で重複発番しうる。ただし DB 側に
  `unique (organization_id, project_code)` があるため、**重複は静かに増えるのではなく insert が失敗する**。
  データ破壊ではなく操作失敗として現れる。server-side採番は必要だが、緊急度は「即死」ではない。

---

## 2. 現行の保存構造（`/Users/yo/Projects/genba-newui-preview` @ 3513306）

### 2-1. 共通基盤

`src/app/utils/listStore.ts` の `createListStore(key, getId, getProjectId)` が
**8つのストアの唯一の入口**になっている。

| listStore を使うストア | localStorage キー |
|---|---|
| `projects.ts` | `genba_projects_v1` |
| `workItems.ts` | `genba_work_items_v1` |
| `workReports.ts` | `genba_work_reports_v1` |
| `photoRecords.ts` | `genba_photo_records_v1` |
| `damageRecords.ts` | `genba_damage_records_v1` |
| `projectLogs.ts` | `genba_project_logs_v1` |
| `insuranceInfo.ts` | `genba_insurance_info_v1` |
| `learningRecords.ts` | `genba_learning_records_v1` |

> **これは移行にとって非常に有利。** read / write の2関数を差し替えるだけで
> 8種類のエンティティを同時にクラウド化できる。画面側の変更はほぼ不要。

### 2-2. listStore を使っていない保存処理（個別対応が必要）

| ファイル | 保存キー | 特徴 |
|---|---|---|
| `savedEstimates.ts` | `genba_jimu_saved_estimates` | 配列を丸ごと read/write。版管理・`lineSnapshots`・`taxBreakdown` を保持。**Phase 1.1 の正本** |
| `savedInvoices.ts` | （同系） | 同様のスナップショット構造 |
| `companySettings.ts` | `genba_settings` | フラットな1オブジェクト。**18ファイルが参照** |
| `documentStorage.ts` | `genba_jimu_document_storage` | 書類ファイルのメタ＋本体を localStorage に保持。**Storage移行の主対象** |
| `idGenerator.ts` | `genba_id_counters_v1` | 連番カウンタ。6ストアが依存 |

### 2-3. 依存の広がり（移行時の影響範囲）

| モジュール | import しているファイル数 |
|---|---|
| `projects` | 30 |
| `companySettings` | 18 |
| `savedEstimates` | 10 |
| `workItems` | 9 |
| `savedInvoices` | 5 |
| `documentStorage` | 2 |
| `listStore` | 8（すべて utils 内） |
| `idGenerator` | 6（すべて utils 内） |

> `listStore` と `idGenerator` は utils 内部からしか呼ばれていない。
> **画面を1つも触らずに差し替えられる**ということ。

---

## 3. 旧Supabase WIP の全体像（`/Users/yo/Projects/genba-jimu-support`）

branch `review/draft-save` @ `a5dc3f2` の**未コミット**変更として存在する。

### 3-1. ファイル一覧（未追跡＝新規）

```
supabase/migrations/0001_init.sql                333行
src/app/lib/supabase/client.ts                    48行
src/app/lib/supabase/backend.ts                  230行
src/app/lib/supabase/authRepository.ts           168行
src/app/lib/supabase/authErrors.ts                25行
src/app/lib/supabase/migrationState.ts           118行
src/app/repositories/companyRepository.ts        246行
src/app/repositories/contractorRepository.ts     152行
src/app/repositories/unitPriceRepository.ts      176行
src/app/repositories/migrationRepository.ts      124行
src/app/auth/page.tsx
docs/SUPABASE_SETUP.md
verification/app-setup-scope.test.mjs
verification/phase1-migration-state.test.mjs
```

### 3-2. 変更済み（未コミット）の既存ファイル

```
package.json / package-lock.json   （@supabase/supabase-js 追加）
src/app/page.tsx                   （ホームのアカウント表示・移行バナー）
src/app/setup/page.tsx
src/app/settings/company|contractors|unit-master/page.tsx
src/app/estimate/new/page.tsx
src/app/projects/[projectId]/work-items/page.tsx
src/app/utils/appSetup.ts / estimateRows.ts / unitPriceMaster.ts
src/components/estimate/EstimateEditor.tsx
src/app/utils/pdfDownload.ts / pdfPresentation.ts / src/components/PdfOverlay.tsx
```

> **注記（工程Aとの関係）**：旧WIPには `pdfPresentation.ts` と `PdfOverlay.tsx` という
> PDF表示系の実装が既にある。工程Aでは現行branchに閉じた最小実装（`pdfActions.ts` /
> `PdfActionPanel.tsx`）を新規に作った。将来この2つを突き合わせて統合するか、
> 片方を廃棄するかの判断が必要。**今回は比較のみで統合していない。**

### 3-3. migration 一覧

`supabase/migrations/0001_init.sql` のみ。**1本だけ。**

### 3-4. テーブル定義（実測）

| テーブル | PK | FK | unique | RLS | updated_atトリガ |
|---|---|---|---|---|---|
| `organizations` | uuid | — | — | ○ | ○ |
| `organization_members` | (org_id, user_id) 複合 | org, auth.users | — | ○ | — |
| `company_settings` | uuid | org | (org) | ○ | ○ |
| `contractors` | uuid | org | (org, local_ref) | ○ | ○ |
| `unit_price_master` | uuid | org | (org, local_ref) | ○ | ○ |
| `projects` | uuid | org, contractor | (org, project_code) / (org, local_ref) | ○ | ○ |
| `work_items` | uuid | org, project | (org, local_ref) | ○ | ○ |
| `saved_estimates` | uuid | org, project, contractor | (org, local_ref) | ○ | **×** |
| `saved_invoices` | uuid | org, project, contractor | (org, local_ref) | ○ | **×** |

**index：PK と unique 制約以外に明示的な index は 1本も無い。**

### 3-5. RLS / policy

- 9テーブルすべてで `enable row level security` 済み。
- 業務7テーブルは `do $$ ... $$` ループで select/insert/update/delete の4ポリシーを一括生成。
  条件はすべて `is_org_member(organization_id)`、対象ロールは `to authenticated`。
- `anon` 向けポリシーは**1本も無い** → RLS有効なので anon は全テーブル遮断される。
- `organizations` は `org_select` = `is_org_member(id)`、
  `org_insert` = **`auth.uid() is not null`**（後述の指摘 F-1）。
- `organization_members` は select / insert / delete のみ（update 無し）。

### 3-6. 関数

| 関数 | 種別 | search_path | 備考 |
|---|---|---|---|
| `touch_updated_at()` | trigger | 未設定 | テーブル参照なし。実害なし |
| `is_org_member(uuid)` | **security definer** | `set search_path = public` ✅ | 自分の所属判定のみ |
| `my_organization_id()` | **security definer** | `set search_path = public` ✅ | 自分のorg返却のみ |
| `handle_new_user()` | **security definer** trigger | `set search_path = public` ✅ | サインアップ時に org+membership 自動作成 |

> **過去監査の S-4「search_path未固定」は、この migration には当てはまらない。**
> security definer の3関数すべてで `set search_path = public` 済み。

### 3-7. Auth 構成

- Supabase Auth のメール＋パスワード（`authRepository.ts` / `/auth` ページ）。
- `auth.users` への insert トリガ `on_auth_user_created` → `handle_new_user()` で
  **1ユーザー＝1事業者**の org と owner membership を自動作成。
- magic link / OAuth / LINE ログインは未実装。

### 3-8. Storage 構成

**migration にも WIP コードにも Storage の定義は一切無い。**
バケット・Storage RLS・パス設計はまだ存在しない。写真とPDFは現在も localStorage 上。

### 3-9. repository 層

| repository | 対象 | 方式 |
|---|---|---|
| `companyRepository` | 会社設定 | Supabase / local 二重実装 |
| `contractorRepository` | 元請マスタ | 同上（`local_ref` で冪等） |
| `unitPriceRepository` | 単価マスタ | 同上 |
| `migrationRepository` | localStorage→クラウド移行 | 3カテゴリの検証つき冪等再実行 |

`backend.ts` の方針が重要：**「3カテゴリすべてがクラウドで確認できるまで通常の読み書きは localStorage を維持する」**
＝部分移行で正本を混在させない。この考え方は Phase 1.2 でもそのまま採用すべき。

---

## 4. 再利用可／要修正／廃棄の分類

| 対象 | 判定 | 理由・必要な修正 |
|---|---|---|
| `0001_init.sql` の org / RLS / 関数 | **そのまま再利用** | 設計が妥当。search_path も固定済み |
| `local_ref` 冪等移行の仕組み | **そのまま再利用** | 端末データ移行の要 |
| `client.ts` / `backend.ts` の二重バックエンド判定 | **そのまま再利用** | オフライン方針と整合 |
| `authRepository.ts` / `/auth` | **そのまま再利用**（方式確定後） | ログイン方式が未決なので確定待ち |
| `migrationRepository.ts` | **拡張して再利用** | 現在は会社/元請/単価の3カテゴリのみ。projects/work_items/estimates を追加 |
| `company_settings` / `contractors` / `unit_price_master` テーブル | **そのまま再利用** | — |
| `projects` テーブル | **要修正** | `property_name` / `room_number` / `customer_name` / `project_type` / `building_type` が無い |
| `work_items` テーブル | **要修正** | `location2`（部位）が無い。現行は location1/location2 の2本 |
| `saved_estimates` テーブル | **要修正** | `previous_estimate_id` / `revision_reason` / `tax_breakdown` / `estimate_items_snapshot` / `updated_at` が無い（Phase 1.1 の版管理を保存できない） |
| `saved_invoices` テーブル | **要修正** | `updated_at` が無い |
| index | **要追加** | `organization_id` / `project_id` に index が1本も無い |
| `org_insert` ポリシー | **要修正** | 下記 F-1 |
| Storage | **新規設計** | 何も存在しない |
| 旧WIPの `pdfPresentation.ts` / `PdfOverlay.tsx` | **要判断** | 工程Aの `pdfActions.ts` と役割が重複。統合方針を決める |
| 旧WIPの旧UI画面変更（`settings/*`, `estimate/new` 等） | **原則廃棄** | 現行の正本は `/new` 配下。旧UI画面ごと移植しない |

---

## 5. Security 監査

### 5-1. 過去監査の位置づけ（重要な事実確認）

`/Users/yo/revo-ai-touryou/docs/security/PHASE0-audit-report.md`（2026-07-22）を読んだ。
**対象は AI棟梁プロジェクト `dzyowbsaufkvfmqiaepy` であり、事務サポではない。**

| 指摘 | 内容 | 事務サポへの当てはまり |
|---|---|---|
| S-1 匿名で全報告データ閲覧可 | 3ビューが `security_invoker` 未設定 | **当てはまらない**（0001_init.sql にビューは1本も無い） |
| S-2 管理関数を anon/authenticated が実行可 | `proacl` が PUBLIC EXECUTE | **要注意**。0001_init.sql も `revoke execute` を書いていない（F-2） |
| S-3 LINE署名検証の欠如 | LINE Webhook | **当てはまらない**（事務サポに LINE Webhook は無い） |
| S-4 search_path 未固定 | 4関数 | **当てはまらない**（3関数とも固定済み） |
| S-5 default ACL が公開側 | `public`/`storage` の default ACL が anon/authenticated へ全権 | **プロジェクトを共用する場合のみ当てはまる**（F-3） |

### 5-2. 事務サポ側の指摘

| # | 深刻度 | 内容 |
|---|---|---|
| **F-1** | 🟠 中 | `org_insert` が `with check (auth.uid() is not null)`。ログインさえしていれば誰でも `organizations` 行を無制限に作れる。`mem_insert` が `is_org_member` を要求するため乗っ取りには繋がらないが、行の無制限生成（DoS/ゴミ蓄積）が可能。`handle_new_user` がサインアップ時に自動作成する以上、クライアントからの org insert は本来不要。**ポリシー削除または大幅制限を推奨** |
| **F-2** | 🟡 低〜中 | `is_org_member` / `my_organization_id` / `handle_new_user` に `revoke execute from public` が無い。前2つは呼び出しても自分の情報しか返らず実害は小さい。`handle_new_user` はトリガ関数なので直接呼ぶとエラーになる。ただし S-2 と同種の指摘であり、**hygiene として revoke を入れるべき** |
| **F-3** | 🔴 高（条件付き） | AI棟梁プロジェクトを共用する場合、S-5 の default ACL により**今後作る全オブジェクトが anon/authenticated へ公開**される。RLS を有効化したテーブルは行アクセスで守られるが、**RLS の付け忘れが即座に全公開になる**。Storage も同様。**プロジェクト分離、または default ACL の是正が前提条件** |
| **F-4** | 🟠 中 | index が皆無。RLS の述語が `organization_id` を必ず参照するため、行数が増えると全件走査になる。`(organization_id)` および `work_items(project_id)` / `saved_estimates(project_id)` に index が必要 |
| **F-5** | 🟡 低 | `saved_estimates` / `saved_invoices` に `updated_at` が無い。設計書が想定する last-write-wins の衝突解決ができない |
| **F-6** | ⚪ 未確認 | 事務サポ側 Supabase プロジェクト（`.env.local` の参照先）の実状態が**未検証**。RLS 有効か、default ACL、Storage バケット、既に何かテーブルが作られているか、いずれも未確認 |

### 5-3. 環境変数の実状（値は確認していない）

現行branchの `.env.local` に以下が**既に設定済み**。

```
NEXT_PUBLIC_SUPABASE_URL           = 設定あり（project-ref: gvdqjotccltljdwkyuzu）
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 設定あり
```

`gvdqjotccltljdwkyuzu` は AI棟梁の `dzyowbsaufkvfmqiaepy` と**別のプロジェクト参照**である。
つまり「事務サポ専用を分ける」方向で既に環境が用意されている可能性が高いが、
**中身は未確認**（本監査ではDB接続していない）。

---

## 6. ID採番 監査

現行 `idGenerator.ts` は `genba_id_counters_v1` の localStorage カウンタで採番する。

```
issueProjectId()  → REV-2026-0001（年ごとにリセット）
issueRecordId()   → D-001 / P-001 / W-001（案件内連番）
```

- カウンタが消えても、呼び出し側が渡す既存ID一覧から最大値を復元する自己修復つき。
- **端末をまたぐと衝突する。** iPhone と Mac がそれぞれ `REV-2026-0001` を発番しうる。
- ただし DB 側に `unique (organization_id, project_code)` があるため、
  **2台目の insert は失敗する。静かに重複データが増えることはない。**
  ＝データ破壊ではなく「保存できない」という形で表面化する。
- 見積番号 `REV-2026-0001-EST-01` は案件IDから導出されるため、案件IDが一意なら一意。

**方針（設計書の記載どおり）**：内部PK＝uuid、人間向け番号＝server-side採番。
Phase 1.2-3 で実装。今回は実装しない。

---

## 7. localStorage 依存箇所

| 分類 | キー | 移行先 |
|---|---|---|
| 業務データ | `genba_projects_v1` | `projects` |
| 業務データ | `genba_work_items_v1` | `work_items` |
| 業務データ | `genba_jimu_saved_estimates` | `saved_estimates` |
| 業務データ | （請求） | `saved_invoices` |
| 業務データ | `genba_settings` | `company_settings` |
| 業務データ | `genba_work_reports_v1` 他5種 | **テーブル未作成** |
| 書類 | `genba_jimu_document_storage` | Storage ＋ `documents` テーブル（未作成） |
| 採番 | `genba_id_counters_v1` | server-side採番へ置換 |
| 下書き | `genba-jimu-support:draft:*`（`draftStorage`） | **移行しない。localStorage のまま** |
| 一時 | `genba_takeoff_draft_v1` | 同上 |
| 設定 | `genba_jimu_test_mode` | 同上（端末ごとの設定） |

---

## 8. migration 統合方針

1. `0001_init.sql` は**変更しない**。既に本番へ適用済みかどうかが未確認のため、
   後から書き換えると適用済み環境と不一致になる。
2. 不足カラム・index・ポリシー修正は `0002_*.sql` 以降として**追記型**で足す。
3. 適用順：`0002_security_hardening.sql`（F-1/F-2/F-4）→ `0003_phase12_columns.sql`（不足カラム）
   → `0004_documents_storage.sql`。
4. 適用前に、対象プロジェクトの現状スナップショット（テーブル一覧・policy一覧・ACL）を取得して記録する。

---

## 9. Phase 1.2 施工順序（提示された順序に対する評価）

提示された 1.2-0 〜 1.2-9 の順序は**妥当**。以下2点だけ変更を提案する。

| 工程 | 内容 | 変更提案 |
|---|---|---|
| 1.2-0 | 既存WIP保全 | **最優先。今すぐ実施すべき**（未コミットのまま失うリスク） |
| 1.2-1 | Security（ACL/RLS/function権限/search_path/org分離） | **F-6の現状実測を先頭に追加**。実測なしに是正はできない |
| 1.2-2 | Auth方式確定 | そのまま |
| 1.2-3 | server-side ID採番 | そのまま |
| 1.2-4 | projects / customers | **`listStore` の read/write 差し替えを先に行う**ことを提案。8ストアを一度に載せられる |
| 1.2-5 | estimates / versions / snapshot | そのまま |
| 1.2-6 | costs / invoices | そのまま |
| 1.2-7 | localStorage migration | そのまま |
| 1.2-8 | Storage（photos / PDFs） | そのまま |
| 1.2-9 | iPhone → Mac → iPhone E2E | そのまま |

---

## 10. 各工程の完了条件

| 工程 | 完了条件 |
|---|---|
| 1.2-0 | 旧WIPが独立branchにコミットされ、`git log` で確認できる。現行正本branchは無変更 |
| 1.2-1 | 対象プロジェクトの policy 一覧・default ACL・function ACL・Storage バケット一覧を取得済み。F-1〜F-4 の是正SQLが適用され、anon での REST 直叩きが全テーブル 0行/401 になることを実測 |
| 1.2-2 | ログイン方式が1つに確定し、Mac と iPhone の両方でサインインできる |
| 1.2-3 | 2端末から連続で案件を作り、番号が重複せず連番になることを実測 |
| 1.2-4 | iPhone で作った案件が Mac に出る。`listStore` 経由の8ストアが同時に動く |
| 1.2-5 | 版（EST-01/EST-02）とスナップショットがクラウドで保持され、過去版が変わらない |
| 1.2-6 | 請求書がクラウド保存され、見積→請求連携が維持される |
| 1.2-7 | 既存端末データが1回で移行され、2回押しても増えない |
| 1.2-8 | PDF・写真が Storage に保存され、案件ID・書類ID・version で引ける |
| 1.2-9 | iPhone登録 → Mac編集 → iPhone再確認 が同一データで成立 |

---

## 11. rollback 方針

- `backend.ts` の既存方針を維持：**クラウドで全カテゴリが確認できるまで localStorage を正本にする。**
  途中で問題が出たら env を外すだけで従来動作へ戻る。
- 移行後も **localStorage のデータは消さない**。移行は copy であって move ではない。
- migration は追記型（`0002`, `0003`…）にし、各ファイルに対応する `down` SQL をコメントで併記する。
- Storage は削除せず、世代付きパス（`.../v<version>.pdf`）にして上書きしない。

---

## 12. iPhone / Mac 移行テスト計画

1. Mac でサインアップ → org が1つ自動作成されることを確認
2. Mac で既存端末データを移行 → 件数が一致
3. iPhone で**同じアカウント**にサインイン → Mac のデータが見える
4. iPhone で案件を新規登録 → Mac をリロードして表示される
5. Mac で見積を編集し新版を保存 → iPhone で EST-01 / EST-02 の両方が見える
6. iPhone を機内モードにして入力 → 復帰後に反映され、二重登録されない
7. 同じ案件を2端末で同時編集 → 後勝ちになり、過去版が壊れない

---

## 13. 未決事項（本監査では確定しない）

| # | 事項 | 判断材料 | 推奨（確定ではない） |
|---|---|---|---|
| U-1 | AI棟梁 Supabase を使うか、事務サポ専用に分けるか | `.env.local` には既に別 project-ref `gvdqjotccltljdwkyuzu` が設定済み。AI棟梁側は S-5 の default ACL 問題を抱える | **分ける**。S-5 を引き継がずに済む |
| U-2 | worker ログイン方式（email/password / magic link / LINE） | WIP は email/password で実装済み。現場でパスワード管理は負担。LINE は署名検証（S-3）の実装が別途必要 | 当面 email/password を維持し、magic link を追加検討 |
| U-3 | 既存 HOTFIX が本番適用済みか | 未確認。`0001_init.sql` が対象プロジェクトへ適用済みかも未確認 | 1.2-1 の実測で判定 |
| U-4 | 単価マスタ Excel の移行方法 | 単価マスタ本体が現行branchに無い | 1.2 完了後、`UNIT-PRICE-MASTER-PLAN.md` の順序に従う |
| U-5 | 旧WIPの `pdfPresentation.ts` / `PdfOverlay.tsx` と工程Aの `pdfActions.ts` の統合 | 役割が重複 | 現行の `pdfActions.ts` を残し、旧WIP側は移植しない方向 |

---

## 14. GO / NO-GO 判定

| 判定対象 | 判定 |
|---|---|
| 旧WIPを土台に Phase 1.2 を進めること | **GO** |
| 直ちに実装（テーブル追加・repository追加）へ着手すること | **NO-GO** |

**着手前に必須の2条件**

1. **Phase 1.2-0**：旧WIP（未コミット）を独立branchへ保全する。
   これが終わるまで他の作業を始めない。失えば1620行の作り直しになる。
2. **Phase 1.2-1 の前半**：対象 Supabase プロジェクトの現状を read-only で実測し、
   F-6 を解消する。「新テーブルを作ってから権限を考える」を避けるための前提。

**Phase 1.2 の最初の実装工程**：`1.2-0 既存WIP保全`（コミットのみ。コード変更なし）

**ユーザー承認が必要な事項**：U-1（プロジェクト分離の可否）、U-2（ログイン方式）、
および 1.2-0 で旧WIPをコミットしてよいか（他セッションが同じ working copy を触っている可能性があるため）。
