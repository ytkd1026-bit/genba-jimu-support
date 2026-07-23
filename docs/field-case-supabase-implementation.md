# 現場データ Supabase 連携 実装手順書（AI棟梁ナレッジ基盤）

REVO Holdings / genba-jimu-support

現地調査〜対応の現場知見を Supabase に構造化して蓄積し、全文検索と将来の
AI検索（RAG）の基盤にするための実装一式です。

## 1. 成果物一覧

| # | 成果物 | パス |
|---|--------|------|
| 1 | SQL Migration（初回） | `supabase/migrations/20260723090000_field_cases.sql` |
| 1 | SQL Migration（追加・原因分離） | `supabase/migrations/20260724090000_field_cases_cause_split.sql` |
| 2 | TypeScript 型 | `src/app/utils/fieldCases.ts`（型定義部） |
| 3 | Supabase Insert 関数 | `src/app/utils/fieldCases.ts` → `insertFieldCase()` |
| 4 | Storage Upload 関数 | `src/app/utils/fieldCases.ts` → `uploadFieldPhoto()` / `uploadFieldPhotos()` |
| 5 | 検索 API | `src/app/api/field-cases/search/route.ts`（+ `searchFieldCases()`） |
| 6 | Decision Log 更新 | `src/app/utils/fieldCases.ts` → `writeDecisionLog()`（Insert 時に自動出力） |
| 7 | 実装手順書 | 本ドキュメント |
| － | 登録サンプル/RegisterAPI | `supabase/seed/20260723_field_case_gt1634saws.sql`, `src/app/api/field-cases/register/route.ts` |

## 2. データモデル

```
field_cases ──< field_case_tags >── tags        （タグは別テーブルで正規化 = RAG 用）
     │
     ├──< field_case_photos                      （画像URL。実体は Storage: field-photos）
     │
     └──< decision_logs                          （登録内容の監査証跡 / AI判定の記録）
```

### field_cases（現場データ本体）
- 分類: `category` / `subcategory` / `manufacturer` / `model_number` / `manufactured_on`
- 所見: `symptoms[]`（症状）/ `diagnosis`（診断サマリ）/
  `recommended_actions[]`（推奨対応）/ `repair_candidates[]`（修理候補）/
  `emergency_action`（応急対応）/ `ai_judgment`（AI判定）/ `risk`（リスク）
- **原因の推定/確定分離**（追加migration `20260724090000`）:
  - `suspected_cause`（推定原因）/ `confirmed_cause`（確定原因）
  - `diagnosis_status`（`suspected` / `confirmed` / `manufacturer_confirmed` / `unresolved`、CHECK制約付き）
  - `cause`（旧カラム）は後方互換のため温存。既存値は `suspected_cause` へバックフィル。
- 全文検索: `search_body`（生成カラム, pg_trgm GIN）と `search_vector`
  （生成カラム, tsvector GIN）を自動生成。**症状・推定/確定原因・対応方法・修理候補を含めて全文検索可能**。
  - ※ 生成カラムの IMMUTABLE 要件のため、配列連結は自作の `array_to_text_imm()`（標準 `array_to_string` は STABLE のため不可）、
    tsvector の config は `pg_catalog.simple` とスキーマ修飾している。

### field_case_photos（画像）
- `storage_path` / `url`（先行登録時は NULL 可）/ `photo_tag` / `caption` / `sort_order`
- `photo_status`（`pending_upload` / `uploaded` / `failed`、CHECK制約付き）
  実ファイル未取得でもメタデータのみ先行登録し、後から実ファイルを紐付けられる。

### 全文検索の設計方針
- 日本語は標準 tsvector の分かち書きが弱いため、**pg_trgm による部分一致/類似検索を主軸**にしています。
- 型式（GT-1634SAWS-TB）やエラー番号（651）など英数字トークンは
  `search_vector`（simple 設定）でも語検索できます。
- `search_field_cases()` RPC が両方＋タグ一致を横断し、`word_similarity` でランキングします。
- さらに高精度な日本語形態素検索が必要になった場合は、Supabase の
  **PGroonga** 拡張の有効化を検討してください（`search_body` に PGroonga インデックスを追加）。

### 検索速度のためのインデックス
- `idx_field_cases_search_body_trgm`（GIN, pg_trgm）… 部分一致/類似
- `idx_field_cases_search_vector`（GIN, tsvector）… 語検索
- `category, subcategory` / `model_number` / `manufacturer` / `created_at` の btree
- `field_case_tags(tag_id)` / `tags(name) trgm` … タグ検索
- `decision_logs(detail)` GIN … ログの JSON 検索

## 3. セットアップ手順

### 3-1. 依存パッケージ
`@supabase/supabase-js` を追加済み（`package.json`）。未インストールなら:
```bash
npm install
```

### 3-2. 環境変数（`.env.local`）
```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...            # 検索・読み取り用
SUPABASE_URL=https://xxxxx.supabase.co          # サーバ用（省略時は NEXT_PUBLIC を使用）
SUPABASE_SERVICE_ROLE_KEY=eyJ...                # 書き込み用（サーバ限定・秘匿）
```
> `SUPABASE_SERVICE_ROLE_KEY` は RLS をバイパスします。クライアントへ絶対に露出させないでください。

### 3-3. マイグレーション適用
Supabase CLI を使う場合（migration は日付順に適用されます）:
```bash
supabase db push
# もしくは Dashboard の SQL Editor に下記の順で貼り付けて実行
#   1) supabase/migrations/20260723090000_field_cases.sql
#   2) supabase/migrations/20260724090000_field_cases_cause_split.sql
#   3) supabase/seed/20260723_field_case_gt1634saws.sql  （サンプル投入・任意）
```
実行内容:
- 拡張 `pgcrypto` / `pg_trgm` を有効化
- テーブル `field_cases` / `tags` / `field_case_tags` / `field_case_photos` / `decision_logs`
- RPC `search_field_cases` / `attach_tags` / `upsert_tag`
- インデックス各種
- Storage バケット `field-photos`（public）と RLS ポリシー

### 3-4. 動作確認（任意）
サンプル現場データを SQL で投入:
```bash
# SQL Editor で supabase/seed/20260723_field_case_gt1634saws.sql を実行
select * from public.search_field_cases('エラー651');
```

## 4. アプリからの使い方

### 4-1. 登録（画像アップロード込み）
`POST /api/field-cases/register`（サーバ側で service_role 使用）
```jsonc
{
  "category": "設備工事",
  "subcategory": "給湯器",
  "manufacturer": "ノーリツ",
  "modelNumber": "GT-1634SAWS-TB",
  "manufacturedOn": "2010-05",
  "symptoms": ["浴槽の自動湯はり不良", "ノーリツ給湯器にエラー651表示", "浴室水栓のハンドル部および吐水パイプ部から水漏れ"],
  "suspectedCause": "エラー651から水量サーボ系統の異常を疑う。",
  "confirmedCause": null,
  "diagnosisStatus": "suspected",
  "diagnosis": "水量サーボ系統の異常を疑う。現地分解診断またはメーカー点検が未実施のため確定原因は未確定。",
  "recommendedActions": ["給湯器本体交換（一式交換）", "浴室および台所リモコン交換", "循環アダプター交換", "水栓ハンドル部パッキン交換", "吐水パイプ部OリングまたはUパッキン交換", "水栓本体摩耗が確認された場合は水栓本体交換"],
  "repairCandidates": ["水量サーボ交換", "ハーネス・コネクタの点検または修復", "電装基板交換"],
  "aiJudgment": "2010年製で設計標準使用期間10年を超過しているため、単体修理より一式交換を優先推奨。",
  "risk": "設計標準使用期間を大きく超過（16年経過）のため他部品の連鎖故障リスク大。",
  "tags": ["給湯器","ノーリツ","GT-1634SAWS-TB","エラー651","水量サーボ","自動湯はり","浴室リモコン","台所リモコン","循環アダプター","水漏れ","パッキン交換","設備工事","AI棟梁"],
  // photos: base64 があれば Storage へアップロード。base64 省略時は
  //         photo_status=pending_upload のメタデータ先行登録になる。
  "photos": [
    { "fileName": "1_label.jpg",    "photoTag": "給湯器型式ラベル", "caption": "ノーリツ GT-1634SAWS-TB / 製造年月 2010年5月" },
    { "fileName": "2_remote.jpg",   "photoTag": "浴室リモコン", "caption": "エラー651表示 / 39℃設定表示 / ふろ自動・給湯制御確認" },
    { "fileName": "3_adapter.jpg",  "photoTag": "浴槽循環アダプター", "caption": "交換対象部材 / 循環金具状況" },
    { "fileName": "4_bathroom.jpg", "photoTag": "浴室全景", "caption": "水栓位置 / ハンドル部および吐水パイプ部の漏水確認対象" },
    { "fileName": "5_estimate.jpg", "photoTag": "給湯器交換見積書", "caption": "本体・リモコン・循環アダプター交換内容" }
  ]
}
```
処理: 画像を `field-photos` へアップロード → `field_cases` へ Insert → タグを別テーブルへ正規化 →
`field_case_photos` へ URL 紐付け → `decision_logs` へ登録内容を出力。

コードから直接使う場合:
```ts
import { getSupabaseAdminClient } from "@/lib/supabaseClient";
import { insertFieldCase, uploadFieldPhotos } from "@/app/utils/fieldCases";

const supabase = getSupabaseAdminClient();
const photos = await uploadFieldPhotos(supabase, "tmp-id", [
  { file: bytes, fileName: "1_label.jpg", contentType: "image/jpeg", photoTag: "給湯器型式ラベル" },
]);
const { case: saved } = await insertFieldCase(supabase, { /* FieldCaseInput */, photos });
```

### 4-2. 検索
`GET /api/field-cases/search?q=エラー651&category=設備工事&subcategory=給湯器`
```jsonc
{ "ok": true, "count": 1, "results": [ { "id": "...", "tags": [...], "rank": 1.0, ... } ] }
```
原因・症状・対応方法・タグを横断して部分一致/類似で検索し、`rank` 降順で返します。

## 5. Decision Log 出力（今回の登録内容）

登録時に `decision_logs` へ以下が記録されます（`action = field_case_registered`）。

- **summary**: `[設備工事/給湯器] ノーリツ GT-1634SAWS-TB を登録（原因: 推定のみ・確定未実施）`
- **actor**: `AI棟梁`
- **detail**（JSON）:

```json
{
  "category": "設備工事",
  "subcategory": "給湯器",
  "manufacturer": "ノーリツ",
  "model_number": "GT-1634SAWS-TB",
  "manufactured_on": "2010-05",
  "symptoms": [
    "浴槽の自動湯はり不良",
    "ノーリツ給湯器にエラー651表示",
    "浴室水栓のハンドル部および吐水パイプ部から水漏れ"
  ],
  "suspected_cause": "エラー651から水量サーボ系統の異常を疑う。",
  "confirmed_cause": null,
  "diagnosis_status": "suspected",
  "recommended_actions": [
    "給湯器本体交換（一式交換）", "浴室および台所リモコン交換", "循環アダプター交換",
    "水栓ハンドル部パッキン交換", "吐水パイプ部OリングまたはUパッキン交換",
    "水栓本体摩耗が確認された場合は水栓本体交換"
  ],
  "repair_candidates": ["水量サーボ交換", "ハーネス・コネクタの点検または修復", "電装基板交換"],
  "ai_judgment": "2010年製で設計標準使用期間10年を超過しているため、単体修理より一式交換を優先推奨。",
  "risk": "設計標準使用期間を大きく超過（16年経過）のため他部品の連鎖故障リスク大。",
  "photos": [
    { "photo_tag": "給湯器型式ラベル",   "photo_status": "pending_upload" },
    { "photo_tag": "浴室リモコン",       "photo_status": "pending_upload" },
    { "photo_tag": "浴槽循環アダプター", "photo_status": "pending_upload" },
    { "photo_tag": "浴室全景",           "photo_status": "pending_upload" },
    { "photo_tag": "給湯器交換見積書",   "photo_status": "pending_upload" }
  ]
}
```

> 写真は実ファイルが作業環境に存在しなかったため、`photo_status = pending_upload` の
> メタデータ先行登録です（画像は未アップロード）。後日 `field-photos` へアップロードし
> `url` / `photo_status` を更新してください。

## 6. 将来 RAG への発展
- `tags` を独立テーブルにしているため、タグ×型式×症状のグラフ検索・共起分析が容易です。
- `field_cases` に `embedding vector(1536)` カラムと **pgvector** 拡張を追加すれば、
  症状文のベクトル近傍検索（RAG の検索段）に発展できます。
  `search_body` を埋め込みソースとして流用できます。

## 6.5 実行検証結果（ローカル PostgreSQL 16）

Supabase 本体（PostgREST/Storage API）が無い環境のため、Supabase 固有オブジェクト
（`storage` スキーマ・`anon`/`authenticated`/`service_role` ロール）をローカル shim で補い、
**マイグレーション・seed・検索RPC・Decision Log を実 PostgreSQL で検証済み**。

| 検証 | 結果 |
|------|------|
| 初回 + 追加 migration 適用 | ✅ 成功（`array_to_string` が STABLE で生成カラム不可 → `array_to_text_imm()` へ修正、tsvector config を `pg_catalog.simple` へ修正） |
| seed 適用 | ✅ 成功（現場データ1件・タグ・写真5件・Decision Log 1件） |
| テーブル作成 | ✅ 5テーブル（field_cases / tags / field_case_tags / field_case_photos / decision_logs） |
| 推定/確定原因の分離 | ✅ suspected_cause / confirmed_cause / diagnosis_status / repair_candidates を確認 |
| Storage バケット | ✅ `field-photos`（public） |
| RLS | ✅ 全5テーブルで有効・ポリシー設定済み |
| 検索 `651` / `ノーリツ` / `GT-1634SAWS-TB` / `水量サーボ` / `浴室リモコン` | ✅ 全て1件ヒット（浴室リモコンはタグ一致 rank=0.9） |
| Decision Log 自動生成 | ✅ suspected_cause / confirmed_cause(null) / diagnosis_status を記録 |
| 重複登録 | ✅ seed（固定UUID・delete+insert）は冪等 / register 経路（新規UUID）は追記型で重複許容 |
| `npx tsc --noEmit` / `npm run build` | ✅ 成功 / 新規ファイル lint error なし |

**未検証**: register / search の HTTP API エンドポイント自体は Supabase 実インスタンスが
必要なため未実行（依存する SQL 層は上記のとおり検証済み）。実 Supabase での実行コマンドは
本書 3〜4章のとおり。

## 7. セキュリティ / 運用メモ
- RLS: anon は読み取りのみ、書き込みは authenticated / service_role に限定（migration の
  ポリシーは社内利用前提の最小構成。運用ポリシーに合わせて調整）。
- Storage `field-photos` は既定 public。非公開にする場合は `getPublicUrl` を
  `createSignedUrl` に切り替え済みのフォールバックが動作します（バケットを private に変更）。
- service_role キーはサーバ側（API Route）でのみ使用してください。
