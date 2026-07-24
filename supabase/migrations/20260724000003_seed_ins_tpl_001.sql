-- 初期データ投入: INS-TPL-001
-- ------------------------------------------------------------------
-- ★ ライブ Supabase "AI-touryou" のカラム構成に一致させた seed。
-- 雛形「漏水事故復旧工事 見積項目・施工必要性説明書」を登録する。
--   1) insurance_document_templates … 本体
--   2) insurance_template_versions  … v1.0 の Storage パス（pdf_path / docx_path）
--   3) insurance_template_tags      … 検索用タグ
--
-- ※ body_text はプレースホルダを投入している。実 PDF の本文全文が
--    確定したら、下記 UPDATE で差し替えるか、この値を編集してから適用すること
--    （supabase/README.md 参照）。
-- 冪等性: template_code / (template_id, version) / PK(template_id, tag) の
--         一意制約で再適用しても重複しない。
-- ==================================================================

-- ─── 1) 本体 ─────────────────────────────────────────────────
insert into public.insurance_document_templates (
  template_code,
  title,
  category,
  document_type,
  accident_type,
  insurer_names,
  description,
  body_text,
  current_version,
  status
) values (
  'INS-TPL-001',
  '漏水事故復旧工事 見積項目・施工必要性説明書',
  '保険復旧工事',
  '施工項目説明資料',
  '漏水事故',
  array['AIG', '共通']::text[],
  '保険会社提出用の施工項目説明資料雛形',
  -- TODO: PDF 本文全文に差し替える（現状はプレースホルダ）
  '（PDF本文全文の投入待ち：AIG提出用_漏水事故復旧工事_見積項目施工必要性説明書.pdf の全文をここに登録してください）',
  '1.0',
  'official'
)
on conflict (template_code) do update set
  title           = excluded.title,
  category        = excluded.category,
  document_type   = excluded.document_type,
  accident_type   = excluded.accident_type,
  insurer_names   = excluded.insurer_names,
  description     = excluded.description,
  current_version = excluded.current_version,
  status          = excluded.status;
  -- body_text は上書きしない（手動投入した本文を保護するため）

-- ─── 2) バージョン v1.0（Storage パス）────────────────────────
insert into public.insurance_template_versions (
  template_id,
  version,
  pdf_path,
  docx_path,
  source_filename_pdf,
  source_filename_docx,
  is_current
)
select
  t.id,
  '1.0',
  'INS-TPL-001/AIG提出用_漏水事故復旧工事_見積項目施工必要性説明書.pdf',
  'INS-TPL-001/AIG提出用_漏水事故復旧工事_見積項目施工必要性説明書.docx',
  'AIG提出用_漏水事故復旧工事_見積項目施工必要性説明書.pdf',
  'AIG提出用_漏水事故復旧工事_見積項目施工必要性説明書.docx',
  true
from public.insurance_document_templates t
where t.template_code = 'INS-TPL-001'
on conflict (template_id, version) do update set
  pdf_path             = excluded.pdf_path,
  docx_path            = excluded.docx_path,
  source_filename_pdf  = excluded.source_filename_pdf,
  source_filename_docx = excluded.source_filename_docx,
  is_current           = excluded.is_current;

-- ─── 3) タグ ─────────────────────────────────────────────────
insert into public.insurance_template_tags (template_id, tag)
select t.id, tag
from public.insurance_document_templates t
cross join unnest(array[
  '保険復旧',
  '漏水',
  '火災保険',
  '施工項目説明',
  '原状回復',
  'クロス',
  'フローリング',
  'CF',
  '巾木',
  'AIG'
]) as tag
where t.template_code = 'INS-TPL-001'
on conflict (template_id, tag) do nothing;
