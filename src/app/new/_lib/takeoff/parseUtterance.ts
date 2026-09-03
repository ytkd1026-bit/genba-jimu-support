// 拾い出し 音声発話パーサ
// ─────────────────────────────────────────────────────────────
// 役割：音声認識の文字列（例「245、6本」「洋室1」「壁」「SP2525」「3600流し」）を
//       構造化アクションへ変換する。ここでは「解釈」だけを行い、
//       数量計算は engine.ts（決定論）に委譲する。生成AIは使わない。
//
// 判定優先順位：コマンド > 部位 > 寸法×本数 > 流し/幅指定 > 品番 > 数値のみ > 部屋名

import { parseDimension, type DimParseResult } from "./engine";

export type VoiceCommand =
  | "next"          // 次
  | "same_product"  // 同じ品番
  | "same_room"     // 同じ部屋
  | "delete_last"   // 今のなし
  | "undo"          // 一つ戻る
  | "correct"       // 訂正
  | "change_room"   // 部屋変更
  | "finish";       // 終了

export type UtteranceAction =
  | { kind: "command"; command: VoiceCommand }
  | { kind: "part"; part: string }
  | { kind: "dimension"; dim: DimParseResult; count: number }
  | { kind: "flow_dim"; dim: DimParseResult }   // 「3600流し」
  | { kind: "width_dim"; dim: DimParseResult }  // 「2600幅」
  | { kind: "product"; product: string }
  | { kind: "room"; room: string }
  | { kind: "unknown"; raw: string };

// 部位キーワード（クロス）。長い語を先に判定する。
const PARTS = ["下がり天井", "下り天井", "天井", "壁", "梁"] as const;

const COMMAND_MAP: Array<[RegExp, VoiceCommand]> = [
  [/^(次|つぎ|ネクスト)$/, "next"],
  [/^(同じ品番|おなじひんばん)$/, "same_product"],
  [/^(同じ部屋|おなじへや)$/, "same_room"],
  [/^(今のなし|いまのなし|取り消し|とりけし)$/, "delete_last"],
  [/^(一つ戻る|ひとつ戻る|ひとつもどる|戻る|もどる)$/, "undo"],
  [/^(訂正|ていせい)$/, "correct"],
  [/^(部屋変更|へやへんこう)$/, "change_room"],
  [/^(終了|しゅうりょう|おわり|完了)$/, "finish"],
];

/** 全角→半角・空白除去・句読点統一 */
export function normalizeUtterance(raw: string): string {
  return raw
    .replace(/[０-９ａ-ｚＡ-Ｚ．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[、，,]/g, "、")
    .replace(/\s+/g, "")
    .trim();
}

/** 品番らしさ：英字+数字の組（SP2525 / HM12001 / sp-2525 等） */
function looksLikeProduct(s: string): string | null {
  const m = s.match(/^(?:品番)?([a-zA-Z]{1,6})[-‐−]?(\d{2,6})$/);
  if (m) return `${m[1].toUpperCase()}${m[2]}`;
  return null;
}

/**
 * 1発話 → 1アクション。
 * 「245、6本」のような複合はここで寸法+本数に分解する。
 * 曖昧寸法（1桁/5桁など）は dim.ambiguous=true のまま返し、UI側で確認を要求する。
 */
export function parseUtterance(rawInput: string): UtteranceAction {
  const raw = rawInput.trim();
  if (!raw) return { kind: "unknown", raw: rawInput };
  const s = normalizeUtterance(raw);

  // 1) コマンド
  for (const [re, command] of COMMAND_MAP) {
    if (re.test(s)) return { kind: "command", command };
  }

  // 2) 部位
  for (const p of PARTS) {
    if (s === p) return { kind: "part", part: p === "下り天井" ? "下がり天井" : p };
  }

  // 3) 寸法×本数：「245、6本」「2400 6本」「2600かける2」「245×6」
  const dimCount = s.match(
    /^(\d+(?:\.\d+)?(?:mm|cm|m)?)(?:、|×|x|かける)?(\d+)(?:本|枚|ほん|まい)$/i,
  );
  if (dimCount) {
    const dim = parseDimension(dimCount[1]);
    const count = parseInt(dimCount[2], 10);
    if (count >= 1 && count <= 200) return { kind: "dimension", dim, count };
  }

  // 4) 流し/幅の方向指定：「3600流し」「2600幅」
  const flow = s.match(/^(\d+(?:\.\d+)?(?:mm|cm|m)?)(?:流し|ながし)$/);
  if (flow) return { kind: "flow_dim", dim: parseDimension(flow[1]) };
  const width = s.match(/^(\d+(?:\.\d+)?(?:mm|cm|m)?)(?:幅|はば)$/);
  if (width) return { kind: "width_dim", dim: parseDimension(width[1]) };

  // 5) 品番
  const product = looksLikeProduct(s);
  if (product) return { kind: "product", product };

  // 6) 数値のみ → 寸法1本ぶん（クロスの「2400」単独など）
  if (/^\d+(?:\.\d+)?(?:mm|cm|m)?$/.test(s)) {
    return { kind: "dimension", dim: parseDimension(s), count: 1 };
  }

  // 7) それ以外の短い語 → 部屋名として提案（勝手に確定はUI側の責務で制御）
  if (raw.length <= 12) return { kind: "room", room: raw };

  return { kind: "unknown", raw: rawInput };
}
