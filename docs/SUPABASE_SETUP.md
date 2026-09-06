# Supabase 端末間データ共有 セットアップ手順（Phase 1）

MacとiPhoneで同じデータ（自社情報・元請・単価・案件・見積）を共有するための初回設定です。
所要 10〜15分。未設定の間もアプリは端末内のローカル保存で従来どおり動きます。

## 1. Supabase プロジェクトを作成
1. https://supabase.com にサインイン（無料枠でOK）。
2. **New project** を作成（名前・DBパスワード・リージョンは任意。リージョンは Tokyo 推奨）。
3. 作成完了まで1〜2分待つ。

## 2. データベースにテーブルを作成
1. 左メニュー **SQL Editor** → **New query**。
2. リポジトリの `supabase/migrations/0001_init.sql` の**全文**を貼り付けて **Run**。
3. エラーなく完了すればテーブル・RLS・トリガが作成されます。
   （`organizations` / `company_settings` / `contractors` / `unit_price_master` / `projects` / `work_items` / `saved_estimates` / `saved_invoices`）

## 3. 認証設定
1. 左メニュー **Authentication → Providers → Email** が有効なことを確認。
2. 動作確認を素早くしたい場合は **Authentication → Sign In / Providers → Email** の
   **Confirm email** を一旦 OFF にすると、確認メールなしで即ログインできます（本番では ON 推奨）。

## 4. 接続情報をアプリに設定
1. 左メニュー **Project Settings → API**（または API Keys）。
2. **Project URL** と **Publishable key**（`sb_publishable_...`）をコピー。
   ※旧プロジェクトで **anon public**（`eyJ...` JWT 形式）しか無い場合はそれでも可。
3. プロジェクト直下の `.env.local` に追記（`.env.local.example` を参照）：
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxx
   # 旧 anon key しか無い場合はこちら（どちらか一方でOK）
   # NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxx
   ```
4. `npm run dev` を**再起動**（env は起動時に読み込まれます）。

## 5. 使い方（E2E）
1. Mac でホーム右上の **ログイン** → **新規登録**（メール＋パスワード）。
   - 登録時にサーバ側トリガが自動で「事業者(organization)」と所属を作成します（1ユーザー1事業者）。
2. ホームに出る **「この端末のデータをクラウドへ移行しますか？」** で移行（既存のローカルの自社情報・元請・単価がクラウドへ。テスト区分は保持）。
3. iPhone で**同じアカウント**にログイン → 会社情報・元請・単価が表示されます。
4. iPhone で見積を作成・保存 → Mac で再読み込みすると同じ案件・見積が見えます。
5. Mac で売価を変更・保存 → iPhone で再読み込みすると更新後の価格になります。

## 補足
- 業務データの正本はクラウド（Supabase）。localStorage は入力途中の下書き・一時キャッシュに限定。
- 通信失敗時は下書き（useAutoDraft）で入力が保持され、復旧後に保存できます。
- RLS により、他アカウント（他事業者）のデータは読み書きできません。
- 段階移行のため、Phase 2（Project/WorkItem）・Phase 3（見積/請求）のクラウド保存は順次このスキーマ上に実装します。
