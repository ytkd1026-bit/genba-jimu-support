# 13. ChatGPTワーク 命名規則違反・修正提案

AI棟梁 運用規格 / 分類：JIMU / 版：Ver1.0 / 作成：2026-07-12
対象：ユーザー提供の ChatGPTプロジェクト6・通常チャット17・アーカイブ60（計83件）
根拠：08 チャット命名規則 `分類-YYYYMMDD-内容`／分類は 07-chatgpt-work-inventory.csv と一致。

## ⑥ 命名規則違反の抽出

**判定：対象83件すべてが現行の命名規則に違反している。**

違反の内訳（規則 `分類-YYYYMMDD-内容` に対して）：

| 違反種別 | 該当 | 件数 |
|----------|------|------|
| 分類接頭辞なし（JIMU/REVO/AIT/KNOW が付いていない） | 83件すべて（例外：題名に「REVO」を含む3件も規格の接頭辞形式ではない） | 83 |
| 日付(YYYYMMDD)なし | 83件すべて | 83 |
| 半角/全角スペースを含む（区切り規則違反） | 「AI棟梁 立案…」「Google Drive ZIP解析」「iPhone 通話自動録音」「大阪 ティラミス おすすめ」「Excel見積書 自動入力」等 | 該当のみ |

> ※「REVOロードマップ」「REVO日報整理」「REVO 書道デザイン」は題名に REVO を含むが、
> 規格の接頭辞形式（`REVO-YYYYMMDD-...`）ではないため違反として扱う。

## ⑦ 修正後名称の提案

- 形式：`分類-YYYYMMDD-内容`。内容内のスペースは `_` へ置換（規格02）。
- **日付は `YYYYMMDD` をプレースホルダとした（要補完）**。各チャットの実際の作成日は
  題名から判別できず、推測しないため。ChatGPTの作成日を各自入れて確定する。
- 分類は 07-chatgpt-work-inventory.csv と一致。優先度・状態はCSV側を参照。

| 現チャット名 | 分類 | 修正後名称（案・日付は要補完） |
|--------------|------|-------------------------------|
| 現場監督育成プロジェクト | AIT | AIT-YYYYMMDD-現場監督育成プロジェクト |
| コード一覧 | JIMU | JIMU-YYYYMMDD-コード一覧 |
| AI棟梁 立案からリリースまでの記録 | AIT | AIT-YYYYMMDD-AI棟梁_立案からリリースまでの記録 |
| REVOロードマップ | REVO | REVO-YYYYMMDD-REVOロードマップ |
| 起業家とは | KNOW | KNOW-YYYYMMDD-起業家とは |
| 営業に使える心理学 | REVO | REVO-YYYYMMDD-営業に使える心理学 |
| REVO日報整理 | REVO | REVO-YYYYMMDD-REVO日報整理 |
| ChatGPTアプリ設置方法 | KNOW | KNOW-YYYYMMDD-ChatGPTアプリ設置方法 |
| 資金調達方法の違い | REVO | REVO-YYYYMMDD-資金調達方法の違い |
| Amazon副収入の真実 | KNOW | KNOW-YYYYMMDD-Amazon副収入の真実 |
| Adobe Stock コントリビュータ | KNOW | KNOW-YYYYMMDD-Adobe_Stock_コントリビュータ |
| 成好明文情報収集 | KNOW | KNOW-YYYYMMDD-成好明文情報収集 |
| AI経営チーム評価 | REVO | REVO-YYYYMMDD-AI経営チーム評価 |
| ファイルアプリ確認方法 | KNOW | KNOW-YYYYMMDD-ファイルアプリ確認方法 |
| Google Drive ZIP解析 | KNOW | KNOW-YYYYMMDD-Google_Drive_ZIP解析 |
| 職人の価格設定方法 | REVO | REVO-YYYYMMDD-職人の価格設定方法 |
| 現場事務サポ修正指示 | JIMU | JIMU-YYYYMMDD-現場事務サポ修正指示 |
| ブラッシュアップ提案 | KNOW | KNOW-YYYYMMDD-ブラッシュアップ提案 |
| 事業進捗管理整理 | REVO | REVO-YYYYMMDD-事業進捗管理整理 |
| 遊戯王風イラスト変換 | KNOW | KNOW-YYYYMMDD-遊戯王風イラスト変換 |
| Marvel風イラスト変換 | KNOW | KNOW-YYYYMMDD-Marvel風イラスト変換 |
| イラスト変換 | KNOW | KNOW-YYYYMMDD-イラスト変換 |
| ポケモン風イラスト依頼 | KNOW | KNOW-YYYYMMDD-ポケモン風イラスト依頼 |
| AIへの要望伝え方 | KNOW | KNOW-YYYYMMDD-AIへの要望伝え方 |
| AIprojec リモコン紛失対処法 | KNOW | KNOW-YYYYMMDD-AIprojec_リモコン紛失対処法 |
| 無料タスク管理アプリ | KNOW | KNOW-YYYYMMDD-無料タスク管理アプリ |
| 無料AIスライドツール | KNOW | KNOW-YYYYMMDD-無料AIスライドツール |
| 画像作成サポート | KNOW | KNOW-YYYYMMDD-画像作成サポート |
| 7日間筋トレプラン | KNOW | KNOW-YYYYMMDD-7日間筋トレプラン |
| AIリール動画プロンプト | KNOW | KNOW-YYYYMMDD-AIリール動画プロンプト |
| Webマーケティング解説 | KNOW | KNOW-YYYYMMDD-Webマーケティング解説 |
| iPhone 通話自動録音 | KNOW | KNOW-YYYYMMDD-iPhone_通話自動録音 |
| テキストから動画生成 AI | KNOW | KNOW-YYYYMMDD-テキストから動画生成_AI |
| 法人倒産時の責任 | REVO | REVO-YYYYMMDD-法人倒産時の責任 |
| 風刺画の作成 | KNOW | KNOW-YYYYMMDD-風刺画の作成 |
| 千成瓢箪の解説 | KNOW | KNOW-YYYYMMDD-千成瓢箪の解説 |
| 無料議事録アプリ紹介 | KNOW | KNOW-YYYYMMDD-無料議事録アプリ紹介 |
| 大阪 ティラミス おすすめ | KNOW | KNOW-YYYYMMDD-大阪_ティラミス_おすすめ |
| 社会保険含む額面計算 | REVO | REVO-YYYYMMDD-社会保険含む額面計算 |
| スマスロ天井期待解析 | KNOW | KNOW-YYYYMMDD-スマスロ天井期待解析 |
| ビジネス文調に変換 | KNOW | KNOW-YYYYMMDD-ビジネス文調に変換 |
| メール用に修正 | KNOW | KNOW-YYYYMMDD-メール用に修正 |
| 返事の仕方提案 | KNOW | KNOW-YYYYMMDD-返事の仕方提案 |
| 大阪 スーパー銭湯 リスト | KNOW | KNOW-YYYYMMDD-大阪_スーパー銭湯_リスト |
| 優秀なセールスマン特徴 | REVO | REVO-YYYYMMDD-優秀なセールスマン特徴 |
| 建築ADRの説明 | REVO | REVO-YYYYMMDD-建築ADRの説明 |
| 面談後のお礼メール | KNOW | KNOW-YYYYMMDD-面談後のお礼メール |
| 無料アプリの仕組み | KNOW | KNOW-YYYYMMDD-無料アプリの仕組み |
| 融合ゴジラ | KNOW | KNOW-YYYYMMDD-融合ゴジラ |
| 下請けの対抗方法 | REVO | REVO-YYYYMMDD-下請けの対抗方法 |
| 建築業許可証要件 | REVO | REVO-YYYYMMDD-建築業許可証要件 |
| 未払い・貸し倒れ保証 | REVO | REVO-YYYYMMDD-未払い・貸し倒れ保証 |
| REVO 書道デザイン | REVO | REVO-YYYYMMDD-REVO_書道デザイン |
| 建築業向けファクタリング会社 | REVO | REVO-YYYYMMDD-建築業向けファクタリング会社 |
| 二級施工管理士要件 | AIT | AIT-YYYYMMDD-二級施工管理士要件 |
| AIで建築見積作成 | JIMU | JIMU-YYYYMMDD-AIで建築見積作成 |
| ビジネスメール文例 | KNOW | KNOW-YYYYMMDD-ビジネスメール文例 |
| 3Dパース作成 | AIT | AIT-YYYYMMDD-3Dパース作成 |
| フラジャイルX症候群とは | KNOW | KNOW-YYYYMMDD-フラジャイルX症候群とは |
| PCで収入を得る方法 | KNOW | KNOW-YYYYMMDD-PCで収入を得る方法 |
| 画像背景黒に変更 | KNOW | KNOW-YYYYMMDD-画像背景黒に変更 |
| 外注費と雇用費比較 | REVO | REVO-YYYYMMDD-外注費と雇用費比較 |
| 蕁麻疹治療方法 | KNOW | KNOW-YYYYMMDD-蕁麻疹治療方法 |
| 遅延損害金請求について | REVO | REVO-YYYYMMDD-遅延損害金請求について |
| 大阪 野菜ラーメン店 | KNOW | KNOW-YYYYMMDD-大阪_野菜ラーメン店 |
| Benim hakkımda ne düşünüyorsun | KNOW | KNOW-YYYYMMDD-Benim_hakkımda_ne_düşünüyorsun |
| Excel見積書 自動入力 | JIMU | JIMU-YYYYMMDD-Excel見積書_自動入力 |
| ロト7当選確率 | KNOW | KNOW-YYYYMMDD-ロト7当選確率 |
| 職人腰袋の革種類 | AIT | AIT-YYYYMMDD-職人腰袋の革種類 |
| 収益化手段と比較 | REVO | REVO-YYYYMMDD-収益化手段と比較 |
| 南大阪 フィギュア買取 | KNOW | KNOW-YYYYMMDD-南大阪_フィギュア買取 |
| スマスロ ハイエナ台 | KNOW | KNOW-YYYYMMDD-スマスロ_ハイエナ台 |
| 東洋医学で仕事する方法 | KNOW | KNOW-YYYYMMDD-東洋医学で仕事する方法 |
| アプリ開発と運営方法 | JIMU | JIMU-YYYYMMDD-アプリ開発と運営方法 |
| スマスロ化物語解析 | KNOW | KNOW-YYYYMMDD-スマスロ化物語解析 |
| 事業計画改善提案 | REVO | REVO-YYYYMMDD-事業計画改善提案 |
| 現場のやりとり分析 | AIT | AIT-YYYYMMDD-現場のやりとり分析 |
| 補助金リストとカレンダー | REVO | REVO-YYYYMMDD-補助金リストとカレンダー |
| 音声分析と教育テンプレ | AIT | AIT-YYYYMMDD-音声分析と教育テンプレ |
| 起業家の定義 | KNOW | KNOW-YYYYMMDD-起業家の定義 |
| 事業計画書作成支援 | REVO | REVO-YYYYMMDD-事業計画書作成支援 |
| 音声データ処理方法 | KNOW | KNOW-YYYYMMDD-音声データ処理方法 |
| 音声文字起こし方法 | KNOW | KNOW-YYYYMMDD-音声文字起こし方法 |
## 補足・運用手順

1. まず優先度 **X（破棄候補）** の23件（娯楽・私生活・ギャンブル・雑学）を
   アーカイブ整理／削除の棚卸し対象にする（事業価値なしと判定）。
2. 残りを分類フォルダ（JIMU/REVO/AIT/KNOW）へ移し、上表の修正後名称へリネーム
   （日付を実作成日で補完）。
3. 「※要確認」を付した項目（成好明文情報収集／ブラッシュアップ提案／3Dパース作成／
   現場のやりとり分析／Excel見積書 自動入力／音声データ処理方法／音声文字起こし方法）は、
   題名だけでは分類が確定しづらいため、中身を1度開いて最終確定する。
4. これらは**ドキュメント上の提案**であり、実際のリネーム・削除はユーザーが ChatGPT 側で行う。
   本リポジトリのコード・UI は一切変更していない。

## 注意
- 本作業は題名テキストのみを根拠に実施（推測禁止）。内容未確認のため、
  状態は「一覧区分」（プロジェクト=DOING／通常=TODO／アーカイブ=ARCHIVE）に基づく。
- AI棟梁は未公開。分類・整理は内部運用のみで、UI/メニュー/β機能には出さない。
