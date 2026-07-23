# 現場データ Supabase 連携 実装手順書（AI棟梁ナレッジ基盤）

REVO Holdings / genba-jimu-support

現地調査〜対応の現場知見を Supabase に構造化して蓄積し、全文検索と将来の
AI検索（RAG）の基盤にするための実装一式です。

## 1. 成果物一覧

| # | 成果物 | パス |
|---|--------|------|
| 1 | SQL Migration | `supabase/migrations/20260723090000_field_cases.sql` |
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
- 所見: `symptoms[]`（症状）/ `cause`（原因）/ `diagnosis`（診断）/
  `recommended_actions[]`（推奨対応）/ `emergency_action`（応急対応）/
  `ai_judgment`（AI判定）/ `risk`（リスク）
- 全文検索: `search_body`（生成カラム, pg_trgm GIN）と `search_vector`
  （生成カラム, tsvector GIN）を自動生成。**原因・症状・対応方法を含めて全文検索可能**。

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
Supabase CLI を使う場合:
```bash
supabase db push
# もしくは Dashboard の SQL Editor に migration を貼り付けて実行
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
  "symptoms": ["浴槽自動湯はり不良", "エラー651", "水栓ハンドル漏水", "吐水パイプ漏水"],
  "cause": "経年劣化",
  "diagnosis": "水量サーボ不良",
  "recommendedActions": ["給湯器本体交換", "マルチリモコン交換", "循環アダプター交換", "水栓パッキン交換"],
  "emergencyAction": "電装基板交換",
  "aiJudgment": "修理より本体交換推奨",
  "risk": "16年経過機のため他部品故障リスク大",
  "tags": ["給湯器","ノーリツ","GT-1634SAWS-TB","エラー651","水量サーボ","自動湯はり","浴室リモコン","循環アダプター","水漏れ","パッキン交換","設備工事","AI棟梁"],
  "photos": [
    { "fileName": "1_label.jpg",    "contentType": "image/jpeg", "base64": "<...>", "photoTag": "給湯器型式ラベル" },
    { "fileName": "2_remote.jpg",   "contentType": "image/jpeg", "base64": "<...>", "photoTag": "浴室リモコン", "caption": "エラー651表示" },
    { "fileName": "3_adapter.jpg",  "contentType": "image/jpeg", "base64": "<...>", "photoTag": "循環アダプター" },
    { "fileName": "4_bathroom.jpg", "contentType": "image/jpeg", "base64": "<...>", "photoTag": "浴室全景", "caption": "水栓漏水" },
    { "fileName": "5_estimate.jpg", "contentType": "image/jpeg", "base64": "<...>", "photoTag": "交換見積書" }
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

- **summary**: `[設備工事/給湯器] GT-1634SAWS-TB を登録`
- **actor**: `AI棟梁`
- **detail**（JSON）:

```json
{
  "category": "設備工事",
  "subcategory": "給湯器",
  "manufacturer": "ノーリツ",
  "model_number": "GT-1634SAWS-TB",
  "manufactured_on": "2010-05",
  "symptoms": ["浴槽自動湯はり不良", "エラー651", "水栓ハンドル漏水", "吐水パイプ漏水"],
  "cause": "経年劣化",
  "diagnosis": "水量サーボ不良",
  "recommended_actions": ["給湯器本体交換", "マルチリモコン交換", "循環アダプター交換", "水栓パッキン交換"],
  "emergency_action": "電装基板交換",
  "ai_judgment": "修理より本体交換推奨",
  "risk": "16年経過機のため他部品故障リスク大",
  "tags": ["給湯器","ノーリツ","GT-1634SAWS-TB","エラー651","水量サーボ","自動湯はり","浴室リモコン","循環アダプター","水漏れ","パッキン交換","設備工事","AI棟梁"],
  "photos": [
    { "photo_tag": "給湯器型式ラベル" },
    { "photo_tag": "浴室リモコン", "caption": "エラー651表示" },
    { "photo_tag": "循環アダプター" },
    { "photo_tag": "浴室全景", "caption": "水栓漏水" },
    { "photo_tag": "交換見積書" }
  ]
}
```

## 6. 将来 RAG への発展
- `tags` を独立テーブルにしているため、タグ×型式×症状のグラフ検索・共起分析が容易です。
- `field_cases` に `embedding vector(1536)` カラムと **pgvector** 拡張を追加すれば、
  症状文のベクトル近傍検索（RAG の検索段）に発展できます。
  `search_body` を埋め込みソースとして流用できます。

## 7. セキュリティ / 運用メモ
- RLS: anon は読み取りのみ、書き込みは authenticated / service_role に限定（migration の
  ポリシーは社内利用前提の最小構成。運用ポリシーに合わせて調整）。
- Storage `field-photos` は既定 public。非公開にする場合は `getPublicUrl` を
  `createSignedUrl` に切り替え済みのフォールバックが動作します（バケットを private に変更）。
- service_role キーはサーバ側（API Route）でのみ使用してください。
