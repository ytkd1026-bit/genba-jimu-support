# Make シナリオ設計

Make は本システムの **入口（トリガ）** と **出口（通知・保管）** を担う。
LLM並列呼び出しやDB書き込みは Edge Function 側で完結させ、Make は「人・外部SaaSへ届ける」役に徹する。

---

## シナリオA: 入口（質問を投げる）

```mermaid
flowchart LR
    T["トリガ<br/>Webhook or スケジュール"] --> H["HTTP: Make → Edge Function<br/>POST /functions/v1/ask-multi-ai"]
    H --> P["JSON Parse: 応答"]
    P --> R["Router"]
    R -->|done/partial| OK["シナリオBへ<br/>（通常はDB Webhookが発火）"]
    R -->|failed| ERR["エラー通知(Slack)"]
```

**HTTPモジュール設定**

| 項目 | 値 |
|------|----|
| URL | `https://<PROJECT_REF>.supabase.co/functions/v1/ask-multi-ai` |
| Method | POST |
| Header | `x-edge-token: <EDGE_SHARED_TOKEN>` / `Content-Type: application/json` |
| Body | `{ "question": "{{trigger.question}}", "context": "{{trigger.context}}", "requester": "{{trigger.requester}}" }` |
| Timeout | 180秒（3AI＋Judgeの合計を考慮） |

> UIから直接叩く場合はこのシナリオAは不要。Makeは定期質問（例: 毎朝の相場観確認）やフォーム連携で使う。

---

## シナリオB: 出口（Decision確定を配信）

Supabase の **Database Webhook**（`decision_log` の INSERT）を Make の Webhook で受け、分岐配信する。

```mermaid
flowchart LR
    DBW["Supabase DB Webhook<br/>decision_log INSERT"] --> MW["Make: Custom Webhook"]
    MW --> G["Supabase: minutes/comparison 取得<br/>(session_id で JOIN)"]
    G --> S["Slack: 議事録要約＋決定を投稿"]
    G --> N["Notion / Google Docs: 議事録全文を保管"]
    G --> M["Gmail: 依頼者へメール"]
```

**Supabase側 Database Webhook 設定**

- Table: `public.decision_log`
- Events: `INSERT`
- URL: Make の Custom Webhook URL
- Payload に `record`（新規行）が含まれる → `record.session_id` で関連データを引く。

**Slack投稿テンプレ例**

```
:white_check_mark: 意思決定が記録されました
*{{record.title}}*
決定: {{record.decision}}
根拠: {{record.rationale}}
信頼度: {{comparison.confidence}}
議事録: {{minutes.summary}}
```

---

## 環境変数（Make側 Connection / Data Store）

| 名前 | 用途 |
|------|------|
| `SUPABASE_FUNCTION_URL` | Edge Function ベースURL |
| `EDGE_SHARED_TOKEN` | `x-edge-token` に設定する共有トークン |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | 関連データ取得用（読み取りはRLS+認証） |

---

## なぜ Make と Edge Function を分けるか

- **Edge Function** … 低遅延・秘密鍵管理・トランザクション的なDB書き込みが得意。
- **Make** … SlackやNotion等 **数百のSaaSコネクタ** とスケジュール実行をノーコードで持つ。
- LLM呼び出しをMakeのHTTPモジュールで3本並列に組むより、Edge Functionの `Promise.allSettled` で一括制御した方が **部分障害・タイムアウト・コスト記録** を一貫管理できる。
