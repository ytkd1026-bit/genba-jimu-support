# Supabase — 保険提出用テンプレート（雛形）ライブラリ

保険会社提出用の施工項目説明資料などの「雛形（テンプレート）」を
Supabase（Postgres ＋ Storage）で管理するためのマイグレーションと手順です。

> **前提**: 本アプリ本体は現状 localStorage ベースで、Supabase は未導入です。
> ここに置いたマイグレーションは、雛形ライブラリの基盤を用意するためのもので、
> **実際の Supabase プロジェクトへの適用・ファイルアップロードは手元で実行**してください
> （この開発環境からライブ Supabase へは接続していません）。

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

## テーブル

| テーブル | 役割 |
| --- | --- |
| `insurance_document_templates` | 雛形の本体（メタ情報＋ `body_text` 本文全文） |
| `insurance_template_versions` | バージョンと Storage 上のファイルパス（PDF / DOCX） |
| `insurance_template_tags` | 検索用タグ |

RLS は有効。読み取りは `authenticated` ロールに許可、書き込みは `service_role` のみ。

## 適用手順

### 1. マイグレーション（スキーマ・バケット・初期データ）

Supabase CLI を使う場合（プロジェクトに link 済みであること）:

```bash
supabase db push
```

または個別に psql で流す場合:

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260724000001_insurance_templates_schema.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260724000002_insurance_templates_storage.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260724000003_seed_ins_tpl_001.sql
```

これで以下が作成されます:

- バケット `insurance-templates`（非公開）
- テーブル 3 種
- 雛形 `INS-TPL-001`、バージョン `1.0`、タグ 10 件

### 2. 実ファイルのアップロード（フォルダ `INS-TPL-001/`）

SQL ではファイル本体を投入できないため、以下のいずれかで
`supabase/templates/INS-TPL-001/` の 2 ファイルをアップロードします。

Supabase CLI:

```bash
supabase storage cp \
  "supabase/templates/INS-TPL-001/AIG提出用_漏水事故復旧工事_見積項目施工必要性説明書.pdf" \
  "ss:///insurance-templates/INS-TPL-001/AIG提出用_漏水事故復旧工事_見積項目施工必要性説明書.pdf"

supabase storage cp \
  "supabase/templates/INS-TPL-001/AIG提出用_漏水事故復旧工事_見積項目施工必要性説明書.docx" \
  "ss:///insurance-templates/INS-TPL-001/AIG提出用_漏水事故復旧工事_見積項目施工必要性説明書.docx"
```

`insurance_template_versions` に登録済みのパスと一致していることが重要です:

- `INS-TPL-001/AIG提出用_漏水事故復旧工事_見積項目施工必要性説明書.pdf`
- `INS-TPL-001/AIG提出用_漏水事故復旧工事_見積項目施工必要性説明書.docx`

### 3. `body_text`（PDF 本文全文）の投入

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
