// 帳票セルのドロップダウン選択肢。
//
// 列定義（estimateSheetColumns.ts）は optionsKey という参照キーだけを持ち、
// 実体はここに置く。選択肢はマスタデータであってレイアウトの一部ではないため。
//
// 現状の値は sample 側の見積画面で使われていた定数をそのまま集約したもの。
// 将来マスタをDB化する際は、この関数の中身だけを差し替える。
// DOM のみが参照する。PDF は選択肢を必要としない。

/** 工種（明細の「項目」列） */
const WORK_CATEGORIES = [
  "内装工事", "床工事", "天井工事", "壁工事",
  "建具工事", "塗装工事", "解体工事", "諸経費",
];

/** 単位。画面では職人に自然な表記（㎡ ㎥）を使う。PDF側は safePdfUnit() が変換する。 */
const UNITS = ["m", "㎡", "㎥", "枚", "式", "人工", "箇所", "本", "ケース", "台", "㎏"];

/** 施工箇所の第2階層（天井・壁・床など） */
const LOCATION2 = ["天井", "壁", "床", "共通"];

/** 施工箇所の第1階層（部屋）。自由入力が主なので候補は少数に留める。 */
const LOCATION1 = ["洋室", "和室", "LDK", "洗面所", "浴室", "トイレ", "玄関", "廊下", "現場全体"];

const REGISTRY: Record<string, readonly string[]> = {
  workCategory: WORK_CATEGORIES,
  unit: UNITS,
  location1: LOCATION1,
  location2: LOCATION2,
  // 工事名は過去実績から出す想定。段3-2Aでは候補を出さない（空配列）。
  workName: [],
};

/** optionsKey から選択肢を引く。未登録キーは空配列を返す（画面を壊さない）。 */
export function sheetOptions(key: string | undefined): readonly string[] {
  if (!key) return [];
  return REGISTRY[key] ?? [];
}
