-- =============================================================================
-- 現場データ登録サンプル（今回の現場情報）
--   カテゴリ: 設備工事 / 給湯器 / ノーリツ GT-1634SAWS-TB / 製造 2010年5月
--
-- 前提: 20260723090000_field_cases.sql と 20260724090000_field_cases_cause_split.sql
--       を適用済みであること。
-- 特徴: 推定原因/確定原因を分離。確定原因は現地分解診断・メーカー点検未実施のため未確定。
--       写真は実ファイル未取得のため photo_status = pending_upload（メタデータ先行登録）。
-- 何度流しても重複しないよう固定 UUID を使う（冪等）。
-- =============================================================================

do $$
declare
  v_case_id uuid := '11111111-1111-4111-8111-111111111111';
begin
  delete from public.field_cases where id = v_case_id;

  -- 1. 本体（推定原因/確定原因を分離）---------------------------------------
  insert into public.field_cases (
    id, category, subcategory, manufacturer, model_number, manufactured_on,
    symptoms, suspected_cause, confirmed_cause, diagnosis_status, diagnosis,
    recommended_actions, repair_candidates, ai_judgment, risk, source
  ) values (
    v_case_id,
    '設備工事', '給湯器', 'ノーリツ', 'GT-1634SAWS-TB', '2010-05-01',
    array[
      '浴槽の自動湯はり不良',
      'ノーリツ給湯器にエラー651表示',
      '浴室水栓のハンドル部および吐水パイプ部から水漏れ'
    ],
    'エラー651から水量サーボ系統の異常を疑う。',        -- 推定原因
    null,                                                -- 確定原因（未確定）
    'suspected',                                         -- 診断ステータス
    '水量サーボ系統の異常を疑う。現地分解診断またはメーカー点検が未実施のため確定原因は未確定。',
    -- 推奨対応: 2010年製・設計標準使用期間10年超過のため一式交換を優先 + 水栓対応
    array[
      '給湯器本体交換（一式交換）',
      '浴室および台所リモコン交換',
      '循環アダプター交換',
      '水栓ハンドル部パッキン交換',
      '吐水パイプ部OリングまたはUパッキン交換',
      '水栓本体摩耗が確認された場合は水栓本体交換'
    ],
    -- 修理候補: 本体交換ではなく修理する場合の候補
    array[
      '水量サーボ交換',
      'ハーネス・コネクタの点検または修復',
      '電装基板交換'
    ],
    '2010年製で設計標準使用期間10年を超過しているため、単体修理より本体・リモコン・循環アダプターの一式交換を優先推奨。',
    '設計標準使用期間を大きく超過（16年経過）のため他部品の連鎖故障リスク大。',
    'AI棟梁'
  );

  -- 2. タグを別テーブルへ正規化登録 -----------------------------------------
  perform public.attach_tags(v_case_id, array[
    '給湯器', 'ノーリツ', 'GT-1634SAWS-TB', 'エラー651', '水量サーボ',
    '自動湯はり', '浴室リモコン', '台所リモコン', '循環アダプター', '水漏れ',
    'パッキン交換', 'Oリング', 'Uパッキン', '設備工事', 'AI棟梁'
  ]);

  -- 3. 写真（実ファイル未取得 → メタデータのみ先行登録 / pending_upload）------
  --    後から実ファイルを field-photos へアップロードし url を更新できる設計。
  insert into public.field_case_photos
    (case_id, storage_path, url, photo_tag, caption, sort_order, photo_status)
  values
    (v_case_id, v_case_id || '/1_label.jpg',    null, '給湯器型式ラベル',
       'ノーリツ GT-1634SAWS-TB / 製造年月 2010年5月', 1, 'pending_upload'),
    (v_case_id, v_case_id || '/2_remote.jpg',   null, '浴室リモコン',
       'エラー651表示 / 39℃設定表示 / ふろ自動・給湯制御確認', 2, 'pending_upload'),
    (v_case_id, v_case_id || '/3_adapter.jpg',  null, '浴槽循環アダプター',
       '交換対象部材 / 循環金具状況', 3, 'pending_upload'),
    (v_case_id, v_case_id || '/4_bathroom.jpg', null, '浴室全景',
       '水栓位置 / ハンドル部および吐水パイプ部の漏水確認対象', 4, 'pending_upload'),
    (v_case_id, v_case_id || '/5_estimate.jpg', null, '給湯器交換見積書',
       '本体・リモコン・循環アダプター交換内容', 5, 'pending_upload');

  -- 4. Decision Log へ登録内容を出力 ----------------------------------------
  insert into public.decision_logs (case_id, action, actor, summary, detail)
  values (
    v_case_id,
    'field_case_registered',
    'AI棟梁',
    '[設備工事/給湯器] ノーリツ GT-1634SAWS-TB を登録（原因: 推定のみ・確定未実施）',
    jsonb_build_object(
      'category', '設備工事',
      'subcategory', '給湯器',
      'manufacturer', 'ノーリツ',
      'model_number', 'GT-1634SAWS-TB',
      'manufactured_on', '2010-05',
      'symptoms', jsonb_build_array(
        '浴槽の自動湯はり不良',
        'ノーリツ給湯器にエラー651表示',
        '浴室水栓のハンドル部および吐水パイプ部から水漏れ'
      ),
      'suspected_cause', 'エラー651から水量サーボ系統の異常を疑う。',
      'confirmed_cause', null,
      'diagnosis_status', 'suspected',
      'recommended_actions', jsonb_build_array(
        '給湯器本体交換（一式交換）', '浴室および台所リモコン交換', '循環アダプター交換',
        '水栓ハンドル部パッキン交換', '吐水パイプ部OリングまたはUパッキン交換',
        '水栓本体摩耗が確認された場合は水栓本体交換'
      ),
      'repair_candidates', jsonb_build_array(
        '水量サーボ交換', 'ハーネス・コネクタの点検または修復', '電装基板交換'
      ),
      'ai_judgment', '2010年製で設計標準使用期間10年を超過しているため、単体修理より一式交換を優先推奨。',
      'risk', '設計標準使用期間を大きく超過（16年経過）のため他部品の連鎖故障リスク大。',
      'photos', jsonb_build_array(
        jsonb_build_object('photo_tag','給湯器型式ラベル','photo_status','pending_upload'),
        jsonb_build_object('photo_tag','浴室リモコン','photo_status','pending_upload'),
        jsonb_build_object('photo_tag','浴槽循環アダプター','photo_status','pending_upload'),
        jsonb_build_object('photo_tag','浴室全景','photo_status','pending_upload'),
        jsonb_build_object('photo_tag','給湯器交換見積書','photo_status','pending_upload')
      )
    )
  );
end$$;

-- 確認用クエリ ----------------------------------------------------------------
-- select * from public.search_field_cases('651');
-- select summary, detail from public.decision_logs order by created_at desc limit 1;
-- select photo_tag, photo_status from public.field_case_photos order by sort_order;
