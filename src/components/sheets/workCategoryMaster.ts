// 工種マスタ。
//
// 見積は工種をセクションとして構成する。1工種が複数ページに渡ることを前提とし、
// ページ情報はここにも保存データにも持たない（描画時にのみ決まるため）。
//
// 既存データとの互換:
//   WorkItem.category には表示名の文字列がそのまま保存されている。
//   これをIDへ書き換える移行は行わない（保存形式を変えない）。
//   代わりに aliases で「表示名 → ID」を解決する。
//   マスタに無い工種は「その他」へ寄せ、データを落とさない。

/**
 * 分析軸。AI棟梁・利益分析・工程管理で工種をまたいで集計するために使う。
 * 工種そのものより粗い粒度で、工種が増えても分析軸は増えにくい。
 */
export type AnalysisGroup =
  | "structure"   // 躯体・下地をつくる
  | "finish"      // 仕上げる
  | "equipment"   // 設備を入れる
  | "demolition"  // 壊す・撤去する
  | "misc"        // 雑工事
  | "overhead";   // 経費

export const ANALYSIS_GROUP_LABELS: Record<AnalysisGroup, string> = {
  structure:  "躯体・下地",
  finish:     "仕上げ",
  equipment:  "設備",
  demolition: "解体・撤去",
  misc:       "雑工事",
  overhead:   "諸経費",
};

export type WorkCategory = {
  categoryId: string;
  categoryName: string;
  /** 見積書での並び順。小さいほど先。諸経費は必ず最後になるよう大きい値を持つ。 */
  displayOrder: number;
  analysisGroup: AnalysisGroup;
  /** 既存データの表示名から逆引きするための別名（表記ゆれを吸収する） */
  aliases: readonly string[];
};

/** マスタに無い工種の受け皿。並び順は諸経費の直前。 */
export const OTHER_CATEGORY_ID = "other";

export const WORK_CATEGORIES: readonly WorkCategory[] = [
  { categoryId: "carpentry",  categoryName: "大工工事",   displayOrder: 10, analysisGroup: "structure",  aliases: ["大工", "大工工事", "木工事"] },
  { categoryId: "demolition", categoryName: "解体工事",   displayOrder: 20, analysisGroup: "demolition", aliases: ["解体", "解体工事", "撤去工事"] },
  { categoryId: "interior",   categoryName: "内装工事",   displayOrder: 30, analysisGroup: "finish",     aliases: ["内装", "内装工事", "クロス工事"] },
  { categoryId: "floor",      categoryName: "床工事",     displayOrder: 40, analysisGroup: "finish",     aliases: ["床", "床工事"] },
  { categoryId: "ceiling",    categoryName: "天井工事",   displayOrder: 50, analysisGroup: "finish",     aliases: ["天井", "天井工事"] },
  { categoryId: "wall",       categoryName: "壁工事",     displayOrder: 60, analysisGroup: "finish",     aliases: ["壁", "壁工事"] },
  { categoryId: "painting",   categoryName: "塗装工事",   displayOrder: 70, analysisGroup: "finish",     aliases: ["塗装", "塗装工事"] },
  { categoryId: "fitting",    categoryName: "建具工事",   displayOrder: 80, analysisGroup: "finish",     aliases: ["建具", "建具工事"] },
  { categoryId: "equipment",  categoryName: "設備工事",   displayOrder: 90, analysisGroup: "equipment",  aliases: ["設備", "設備工事", "電気工事", "給排水工事"] },
  { categoryId: "misc",       categoryName: "雑工事",     displayOrder: 100, analysisGroup: "misc",      aliases: ["雑", "雑工事", "雑工事一式"] },
  // 受け皿。マスタに無い工種はここへ集める。
  { categoryId: OTHER_CATEGORY_ID, categoryName: "その他", displayOrder: 900, analysisGroup: "misc", aliases: [] },
  // 諸経費は実務上つねに最後にまとめるため、最大の並び順を与える。
  { categoryId: "overhead",   categoryName: "諸経費",     displayOrder: 999, analysisGroup: "overhead",  aliases: ["諸経費", "経費", "現場管理費"] },
];

const BY_ID = new Map(WORK_CATEGORIES.map((c) => [c.categoryId, c]));

/** 表示名 → 工種。表記ゆれは aliases で吸収し、未知の値は「その他」へ寄せる。 */
export function resolveWorkCategory(categoryName: string): WorkCategory {
  const name = (categoryName ?? "").trim();
  if (name) {
    const hit = WORK_CATEGORIES.find(
      (c) => c.categoryName === name || c.aliases.includes(name),
    );
    if (hit) return hit;
  }
  return BY_ID.get(OTHER_CATEGORY_ID)!;
}

/** 工種IDから引く。未登録なら「その他」。 */
export function workCategoryById(categoryId: string): WorkCategory {
  return BY_ID.get(categoryId) ?? BY_ID.get(OTHER_CATEGORY_ID)!;
}

/** 選択肢用の表示名一覧（「その他」は選ばせないので除く） */
export function workCategoryNames(): string[] {
  return WORK_CATEGORIES.filter((c) => c.categoryId !== OTHER_CATEGORY_ID)
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((c) => c.categoryName);
}
