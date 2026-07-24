-- 保険提出用テンプレート用の Storage バケットとポリシー
-- ------------------------------------------------------------------
-- バケット: insurance-templates（非公開）
-- 構成例:
--   insurance-templates/
--     INS-TPL-001/
--       AIG提出用_漏水事故復旧工事_見積項目施工必要性説明書.pdf
--       AIG提出用_漏水事故復旧工事_見積項目施工必要性説明書.docx
--
-- 実ファイルのアップロードは SQL では行えないため、
-- supabase/README.md のアップロード手順に従って別途投入する。
-- ==================================================================

-- ─── バケット作成（非公開）────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('insurance-templates', 'insurance-templates', false)
on conflict (id) do nothing;

-- ─── Storage ポリシー ─────────────────────────────────────────
-- 読み取り（ダウンロード）はログインユーザーに許可。
-- アップロード・更新・削除は service_role のみ（ポリシー未付与）。
drop policy if exists "insurance-templates read for authenticated"
  on storage.objects;
create policy "insurance-templates read for authenticated"
  on storage.objects
  for select to authenticated
  using (bucket_id = 'insurance-templates');
