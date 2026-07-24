# Supabase — 保険提出用テンプレート（雛形）ライブラリ

保険会社提出用の施工項目説明資料などの「雛形（テンプレート）」を
Supabase（Postgres ＋ Storage）で管理するためのマイグレーションと手順です。

> **重要 — ライブ側が正**
> 3 テーブル（`insurance_document_templates` / `insurance_template_versions` /
> `insurance_template_tags`）と RLS は、ライブ Supabase プロジェクト
> **"AI-touryou" に既に作成済み**です。ここのマイグレーションは
> **ライブ側の構造に一致させた記録／再現用**であり、既存環境へ再適用しても
> 壊れないよう冪等（`create ... if not exists`、`drop policy if exists` →
> `create policy`）に書いています。
>
> **まだ `supabase db push` は実行しないでください。** 適用する場合は、
> 下記「適用手順」を確認し、ライブ側と差分がないことを確かめてから行ってください。

## 構成

```
supabase/
  migrations/
    20260724000001_insurance_templates_schema.sql   # 3テーブル + RLS
    20260724000002_insurance_templates_storage.sql  # insurance-templates バケット + ポリシー
    20260724000003_seed_ins_tpl_001.sql             # INS-TPL-001 の初期データ
  templates/
    INS-TPL-001/                                     # アップロード元ファイルの置き場所
      AIG提出用_漏水事故復旧工事_見積項目施工必要性説明書.pdf   # ← 要追加
      AIG提出用_漏水事故復旧工事_見積項目施工必要性説明書.docx  # ← 要追加
```

## テーブル構造（ライブ "AI-touryou" 準拠）

### insurance_document_templates
| 列 | 型 | 備考 |
| --- | --- | --- |
| id | uuid | PK, default gen_random_uuid() |
| template_code | text | not null, unique |
| title | text | not null |
| category | text | not null |
| document_type | text | not null |
| accident_type | text | nullable |
| insurer_names | **text[]** | not null default `'{}'`（例: `{AIG,共通}`） |
| description | text | |
| body_text | text | PDF 本文全文 |
| current_version | text | not null default `'1.0'` |
| status | text | not null default `'draft'` / check(draft, official, archived) |
| is_active | boolean | not null default true |
| created_by | uuid | → auth.users(id) |
| created_at | timestamptz | not null default now() |
| updated_at | timestamptz | not null default now() |

### insurance_template_versions
| 列 | 型 | 備考 |
| --- | --- | --- |
| id | uuid | PK |
| template_id | uuid | not null |
| version | text | not null |
| pdf_path | text | バケット内 PDF パス |
| docx_path | text | バケット内 DOCX パス |
| source_filename_pdf | text | 元 PDF ファイル名 |
| source_filename_docx | text | 元 DOCX ファイル名 |
| change_summary | text | |
| is_current | boolean | not null default false |
| created_by | uuid | → auth.users(id) |
| created_at | timestamptz | not null default now() |
| — | | unique(template_id, version) |

### insurance_template_tags
| 列 | 型 | 備考 |
| --- | --- | --- |
| template_id | uuid | not null |
| tag | text | not null |
| created_at | timestamptz | not null default now() |
| — | | **primary key(template_id, tag)** |

**RLS**（3 テーブル共通）: `authenticated` ロールに対し
SELECT / INSERT / UPDATE / DELETE を許可、条件は `auth.uid() is not null`。

## 適用手順

> ライブ側にテーブル・RLS は作成済みのため、通常は **seed（初期データ）と
> ファイルアップロードのみ**を行えば足ります。スキーマ・バケットの
> マイグレーションは冪等なので再実行しても既存構造を壊しませんが、
> 実行前にライブ側との差分確認を推奨します。

### 1. （必要な場合のみ）スキーマ・バケットの整合

```bash
# 差分確認（実行はしない）
supabase db diff

# 問題なければ適用（冪等）
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260724000001_insurance_templates_schema.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260724000002_insurance_templates_storage.sql
```

### 2. 初期データ（INS-TPL-001）

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260724000003_seed_ins_tpl_001.sql
```

雛形 `INS-TPL-001`、バージョン `1.0`（`is_current=true`）、タグ 10 件が登録されます。

### 3. 実ファイルのアップロード（フォルダ `INS-TPL-001/`）

SQL ではファイル本体を投入できないため、
`supabase/templates/INS-TPL-001/` の 2 ファイルをアップロードします。

```bash
supabase storage cp \
  "supabase/templates/INS-TPL-001/AIG提出用_漏水事故復旧工事_見積項目施工必要性説明書.pdf" \
  "ss:///insurance-templates/INS-TPL-001/AIG提出用_漏水事故復旧工事_見積項目施工必要性説明書.pdf"

supabase storage cp \
  "supabase/templates/INS-TPL-001/AIG提出用_漏水事故復旧工事_見積項目施工必要性説明書.docx" \
  "ss:///insurance-templates/INS-TPL-001/AIG提出用_漏水事故復旧工事_見積項目施工必要性説明書.docx"
```

`insurance_template_versions.pdf_path` / `docx_path` に登録済みのパスと
一致していることが重要です:

- `INS-TPL-001/AIG提出用_漏水事故復旧工事_見積項目施工必要性説明書.pdf`
- `INS-TPL-001/AIG提出用_漏水事故復旧工事_見積項目施工必要性説明書.docx`

### 4. `body_text`（PDF 本文全文）の投入

seed ではプレースホルダを入れています。PDF の本文全文が確定したら差し替えてください:

```sql
update public.insurance_document_templates
set body_text = $$（ここに PDF 本文全文を貼り付け）$$
where template_code = 'INS-TPL-001';
```

（`$$ … $$` のドル引用符を使うと、本文中の引用符をエスケープせずに済みます。）

## 登録済みタグ（INS-TPL-001）

`保険復旧` / `漏水` / `火災保険` / `施工項目説明` / `原状回復` /
`クロス` / `フローリング` / `CF` / `巾木` / `AIG`
