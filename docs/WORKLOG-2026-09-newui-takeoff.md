# 新UI開発・実機不具合解決 作業記録

- **期間**: 2026-09-03 〜 2026-09-04
- **対象**: `ytkd1026-bit/genba-jimu-support` / branch `claude/new-mobile-ui-development-8ukgy3`
- **作業場所**: git worktree `/Users/yo/Projects/genba-newui-preview`（main copy `review/draft-save` のWIPとは完全分離）
- **最終実装SHA**: `02b6f1d`（push済み）
- **作業記録SHA**: `2ec275e`

---

## 1. 成果サマリ

| 項目 | 状態 |
|---|---|
| 新UI（/new 5タブ）デザイン統一・テーマ切替 | ✅ 完了（cacf858） |
| 拾い出しMVP（6工種・手入力・計算・見積/発注反映） | ✅ 完了（368a50d） |
| 音声入力 | 実装済み／iPhone HTTPS実機検証待ち |
| iPhone実機タップ不具合の根本解決 | ✅ 完了（20937c2〜02b6f1d） |
| 見積・発注・請求の新UI入口 | ✅ 完了（9df032e） |
| シート発注単位 m 化 | ✅ 完了（9df032e） |
| iPhone実機で今回の検証対象機能が動作 | ✅ 本人確認済み（本番ビルド :3001） |

---

## 2. 環境構成（今後の作業の前提）

```
/Users/yo/Projects/genba-jimu-support   ← main copy（review/draft-save・WIPあり・触らない）
/Users/yo/Projects/genba-newui-preview  ← 新UI worktree（claude/new-mobile-ui-development-8ukgy3）
```

- **node_modules**: worktreeへは APFS clone コピー（`cp -Rc`）。**シンボリックリンクはTurbopackが拒否**するため不可
- **開発サーバー**: `:3000`（`npm run dev -- -H 0.0.0.0 -p 3000`）… Mac確認用
- **本番確認サーバー**: `:3001`（`npx next build && npx next start -H 0.0.0.0 -p 3001`）… **iPhone実機確認は必ずこちら**
- iPhoneアクセス: 同一Wi-Fiで `http://192.168.3.3:3001/new`

---

## 3. 作業タイムライン

### フェーズ1: 新UIプレビュー環境構築（9/3）
- 新UIブランチはリモートのみ存在・ローカルはWIPありの別ブランチ → **git worktreeで分離チェックアウト**（ブランチ切替なし・WIP無接触）
- Turbopackのsymlink拒否をAPFS cloneで解決し、devサーバー起動・5ルート確認

### フェーズ2: 新UI統一・タップ修正・見積再構成・テーマ（cacf858）
- `--nu-*` CSS変数によるテーマ基盤（`.nu-root` スコープ・`data-nu-theme` 切替、4テーマ）
- iOSタップ対策: `.nu-root` 配下の操作要素へ `touch-action: manipulation` 一括適用
- 新UI見積・原価入力画面（/new/projects/[id]/estimate）・案件詳細（/new/projects/[id]）

### フェーズ3: 拾い出しMVP（368a50d）
- 共通Takeoff Engine（決定論・import無し・単体テスト可）＋発話パーサ＋Web Speech音声＋4ステップUI
- エンジン24件・パーサ20件の単体テスト全パス（verification/takeoff-*）

### フェーズ4: 全ボタン監査と品質基準導入（20937c2）
- 「URLが200」ではなく「**ボタンを押して遷移到達**」を完了条件とする運査へ移行
- 375px・touchイベント合成で全8ルート・44操作の実タップ監査
- layout内の生`<script>`（テーマちらつき防止）がReact console errorを出していたのを発見・useLayoutEffect化

### フェーズ5: iPhone実機不具合の解決（9df032e → ee3451d → 02b6f1d）
- 実機報告「工種6ボタンだけ無反応」→ 下記§4の通り2層の根本原因を特定・解決
- 最終的にiPhone実機で6工種STEP2表示＋クロス計算動作を本人確認

---

## 4. 問題と解決の記録（トラブルシューティング資料）

### 問題A: Turbopackがsymlinkのnode_modulesを拒否
- **症状**: `Symlink [project]/node_modules is invalid, it points out of the filesystem root` でdev起動即死
- **解決**: `cp -Rc`（APFS copy-on-write clone、5秒・容量ほぼゼロ）で実体コピー
- **教訓**: worktreeでの依存共有はsymlinkでなくAPFS clone

### 問題B: React「script tag while rendering」console error
- **症状**: 全/newページでconsole error。テーマちらつき防止の生`<script dangerouslySetInnerHTML>`がlayoutのJSX内にあった
- **解決**: script廃止 → ThemeProviderの`useLayoutEffect`（hydration後・初回ペイント前）で適用
- **教訓**: JSXツリー内の生scriptは禁止。ちらつき防止目的でも使わない

### 問題C: iPhone実機で `<button onClick>` 全滅（第1原因: hydration mismatch）
- **症状**: 実機で`<a>`(Link)は動くが`<button>`が全部無反応。エミュレーションでは再現せず
- **調査**: devサーバーは実機ブラウザのエラーを **`[browser]` プレフィックスでログ転送**する。そこに不一致箇所が明記されていた:
  ```
  <div id="nu-root" ... - data-nu-theme="navy">  ← クライアントにだけ存在
  ```
- **原因**: 端末に保存済みのテーマ(navy)を旧inline scriptがhydration前にDOMへ付与→サーバーHTMLと不一致→ハンドラ結線が壊れる。**テーマを切り替えた端末でのみ発症**（エミュ環境は未保存だったため再現せず）
- **解決**: 問題Bの修正で根治＋工種選択をLink化（アンカーはhydration不成立でも動く）
- **教訓**: 「アンカーは動くがonClickだけ死ぬ」＝hydration失敗の典型シグネチャ。実機不具合はまずサーバーログを `grep -E "browser|hydrat"`

### 問題D: iPhone実機でJS全滅（第2原因: Turbopack dev配信JSが実行不能）
- **症状**: 修正後・新サーバーでも実機はSTEP2切替不可・追加ボタン無反応・音声非対応表示・テーマ不適用。**コンソールにエラーは出ない**（HMR WebSocketエラーのみ）
- **調査**: サーバーログでタップ時の `GET /new/takeoff?type=wallpaper` 到達を確認（＝アンカー遷移は成立、画面切替だけ失敗）。素のinputに文字入力できる＝非制御input＝React未稼働
- **原因**: **開発モード（Turbopack dev）が配信する最新構文JSを端末のSafariが実行できない**（本番ビルドは広い互換性でコンパイルされるため動く）
- **解決**:
  1. `?type=` をサーバーページで解決しSTEP2を**SSRで返す**構造へ（page.tsx=サーバー、TakeoffClient.tsx=クライアントに分割。ルートが`ƒ`動的化）→ JSゼロでも工種選択が成立
  2. **実機確認は本番ビルド `:3001` で行う運用に確定**（実機で全機能動作を確認）
- **教訓**: 実機検証はdevサーバーでなく本番ビルドで。静的プリレンダー(`○`)のページはsearchParams反映がクライアント依存になる点にも注意（サーバーページ化で`ƒ`にする）

### 問題E: 実機でマイク（音声入力）が出ない
- **症状**: 本番ビルドでも「この端末は音声非対応です」表示
- **原因**: iOS SafariのWeb Speech APIは**HTTPSセキュアコンテキスト必須**。`http://192.168.3.3` は非セキュアのため仕様通り無効→手入力フォールバック表示（設計通り）
- **今後**: `next dev --experimental-https` か本番デプロイ（正式TLS）で検証

### 補足: 検証上の落とし穴
- バックグラウンドのブラウザタブは `innerWidth=0` になり、横スクロール崩れ判定が誤検出する（表示中タブで計測すること）
- iPhoneの「履歴とWebサイトデータを消去」は**localStorageの業務データを消す**ため案内しない（pull-to-refreshで十分）

---

## 5. 拾い出し 確定仕様（要点）

- **クロス**: 明細寸法は実寸のまま保持 → 部屋別 → 同一品番を全室合算 → 任意ロス率(0/5/10/15/任意) → **最終発注のみ0.1m切上げ**（明細段階の切上げは禁止・撤回済み仕様）
- **寸法解釈**: 2〜3桁=cm／4桁=mm／小数・単位付き=明示。曖昧値（1桁・5桁等）は**候補提示で確認**、勝手に確定しない
- **CF**: 必要本数=ceil(幅÷材料幅1820mm)、発注m=流し×本数×(1+ロス)、見積㎡=流し×幅→0.1㎡切上げ。流し/ジョイント方向は職人指定
- **シート**: **m発注・㎡見積**（発注m=流し長さ×(1+ロス)→0.1m切上げの暫定。割付・巻込みは未実装）
- **設計**: 6工種は共通エンジン＋`TAKEOFF_CONFIGS`設定切替。数量計算は決定論（生成AIに算数を渡さない）。反映は既存 `workItemsStore`／`savedMaterialOrders` 再利用。DB変更なし（下書きのみ新キー `genba_takeoff_draft_v1`）
- **テスト**: `verification/takeoff-engine.test.mjs`（28件）・`takeoff-parser.test.mjs`（20件）。実行方法はファイル冒頭コメント参照

## 6. 今後の検証・運用ルール

1. **完了条件は「ユーザーが実際に操作して最後まで到達」**。URL直アクセス200だけで完了判定しない
2. **iPhone実機確認は本番ビルド** `http://192.168.3.3:3001`（devの:3000はこの端末のSafariと非互換）。コード更新時は `npx next build && npx next start -H 0.0.0.0 -p 3001` を再実行
3. 実機不具合はまず **サーバーログの`[browser]`転送** と **Mac Safariリモートインスペクタ**（設定→Safari→詳細→Webインスペクタ＋USB接続）で事実を取る。推測で直さない
4. タップ必須の主要導線は可能な限り**Link/アンカー**（hydration未完了でも動く）。状態切替はURLに載せてSSRで返す
5. hydration前のDOM書き換え禁止・JSX内の生script禁止
6. エミュレーション検証時は「実機のlocalStorage状態（テーマ等）を再現してから」回帰テストする

## 7. コミット一覧（このワークストリーム）

| SHA | 内容 |
|---|---|
| `861193b` | 新UI（/new 5タブ）初版 |
| `cacf858` | デザイン統一・iPhoneタップ対策・見積原価入力再構成・テーマ切替 |
| `368a50d` | 拾い出しMVP（6工種エンジン・音声・見積/発注反映・テスト44件） |
| `20937c2` | 生script廃止→useLayoutEffect（hydration mismatch根治） |
| `3d5fc3b` | タップ領域44px統一・検証スクリプト修正 |
| `9df032e` | 工種選択Link化・シートm発注・見積/発注/請求の新UI入口 |
| `ee3451d` | ?type=をSSR初期stateへ（JS無しでSTEP2） |
| `02b6f1d` | サーバーページ+クライアント分割（本番でも?type=をSSR・`ƒ`動的化） |

## 8. 残タスク

- 完了報告書・施工記録の遷移先（現在は案件一覧止まり）
- 材料計算・未請求確認・請求書作成・現調/写真台帳など深部画面の新UI化
- 音声入力のHTTPS環境検証（--experimental-https or デプロイ後）
- タイルカーペットの枚数/ケース計算の材料マスタ接続（関数実装済み）
- 漢数字読み（「六本」等）・音声コマンド拡充
- 拾い出し履歴の永続化（テーブル案は実装報告書に記載済み・migration未適用）
