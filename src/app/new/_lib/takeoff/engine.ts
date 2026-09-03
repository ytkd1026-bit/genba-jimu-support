// 拾い出し 共通 Takeoff Engine（決定論的計算コア）
// ─────────────────────────────────────────────────────────────
// 重要な設計方針：
//  ・数量計算は「決定論」。同じ入力なら必ず同じ結果。生成AIに算数を渡さない。
//  ・工種ごとに個別計算機を作らず、共通関数＋工種設定(TAKEOFF_CONFIGS)で切替える。
//  ・このファイルは外部 import を持たない（Node で単体テスト可能・再利用容易）。
//
// クロス寸法ルール（修正版）：
//  ・各明細の寸法は「入力値のまま」保持し、明細段階で 0.1m 切り上げは行わない。
//  ・部屋別 → 品番別に合算 → 任意ロス率 → 「最終発注数量のみ」0.1m 切り上げ。

export type TakeoffType =
  | "wallpaper"       // クロス
  | "cf"              // CF
  | "long_sheet"      // 長尺シート
  | "floor_tile"      // FT
  | "tile_carpet"     // タイルカーペット
  | "decorative_sheet"; // シート

export type CalcKind = "length" | "area_rolls" | "area";
export type Unit = "m" | "㎡" | "枚" | "ケース";

export interface TakeoffTypeConfig {
  type: TakeoffType;
  label: string;
  calcKind: CalcKind;
  orderUnit: Unit;        // 発注単位
  estimateUnit: Unit;     // 見積単位
  materialWidthMm?: number; // 材料幅（area_rolls用・将来マスタ化）
  estimateRoundStep: number; // 見積の丸め単位（㎡/m）
  orderRoundStep: number;    // 発注の丸め単位（m）
  lossApplies: boolean;
  parts?: string[];          // 部位（クロス：壁/天井/梁/下がり天井）
  pieceAreaM2?: number;      // 1枚面積（タイルカーペット将来用）
  piecesPerCase?: number;    // ケース枚数（将来用）
  mvp: "primary" | "secondary" | "later";
}

// 画面には最初から6工種すべて表示する。
export const TAKEOFF_ORDER: TakeoffType[] = [
  "wallpaper",
  "cf",
  "long_sheet",
  "floor_tile",
  "tile_carpet",
  "decorative_sheet",
];

export const TAKEOFF_CONFIGS: Record<TakeoffType, TakeoffTypeConfig> = {
  wallpaper: {
    type: "wallpaper", label: "クロス", calcKind: "length",
    orderUnit: "m", estimateUnit: "m",
    estimateRoundStep: 0.1, orderRoundStep: 0.1,
    lossApplies: true, parts: ["壁", "天井", "梁", "下がり天井"],
    mvp: "primary",
  },
  cf: {
    type: "cf", label: "CF", calcKind: "area_rolls",
    orderUnit: "m", estimateUnit: "㎡",
    materialWidthMm: 1820, estimateRoundStep: 0.1, orderRoundStep: 0.1,
    lossApplies: true, mvp: "primary",
  },
  long_sheet: {
    type: "long_sheet", label: "長尺シート", calcKind: "area_rolls",
    orderUnit: "m", estimateUnit: "㎡",
    materialWidthMm: 1820, estimateRoundStep: 0.01, orderRoundStep: 0.1,
    lossApplies: true, mvp: "secondary",
  },
  floor_tile: {
    type: "floor_tile", label: "FT", calcKind: "area",
    orderUnit: "㎡", estimateUnit: "㎡",
    estimateRoundStep: 0.01, orderRoundStep: 0.01,
    lossApplies: true, mvp: "secondary",
  },
  tile_carpet: {
    type: "tile_carpet", label: "タイルカーペット", calcKind: "area",
    orderUnit: "㎡", estimateUnit: "㎡",
    estimateRoundStep: 0.01, orderRoundStep: 0.01,
    lossApplies: true, mvp: "secondary",
    // 将来：pieceAreaM2 / piecesPerCase を材料マスタから取得
  },
  decorative_sheet: {
    type: "decorative_sheet", label: "シート", calcKind: "area",
    orderUnit: "㎡", estimateUnit: "㎡",
    estimateRoundStep: 0.01, orderRoundStep: 0.01,
    lossApplies: true, mvp: "later",
  },
};

// ─── 丸め（浮動小数の誤差に強い実装） ───────────────────────────
const EPS = 1e-9;

export function ceilTo(value: number, step: number): number {
  if (step <= 0) return value;
  const n = Math.ceil(value / step - EPS);
  // n×step の浮動小数ノイズ（例 19×0.1=1.9000000000000001）を除去して保存値を綺麗にする
  return Math.round(n * step * 1e6) / 1e6;
}

export function roundTo(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(Math.round(value / step) * step * 1e6) / 1e6;
}

/** 最終発注数量の切り上げ（既定 0.1m 単位）。クロスはここでのみ切り上げる。 */
export function roundOrderQuantity(value: number, step = 0.1): number {
  return ceilTo(value, step);
}

// ─── 共通計算関数 ──────────────────────────────────────────────
/** 長さ（クロス）：1明細 = 寸法(m) × 本数（入力値のまま・丸めなし） */
export function calculateLength(meters: number, count: number): number {
  return meters * count;
}

/** 面積：奥行(m) × 幅(m) */
export function calculateArea(flowM: number, widthM: number): number {
  return flowM * widthM;
}

/** 必要本数：幅方向 ÷ 材料幅 を切り上げ */
export function calculateRollCount(widthM: number, materialWidthM: number): number {
  if (materialWidthM <= 0) return 0;
  return Math.max(1, Math.ceil(widthM / materialWidthM - EPS));
}

/** 必要枚数：面積 ÷ 1枚面積 を切り上げ（タイルカーペット将来用） */
export function calculatePieces(areaM2: number, pieceAreaM2: number): number {
  if (pieceAreaM2 <= 0) return 0;
  return Math.ceil(areaM2 / pieceAreaM2 - EPS);
}

/** 必要ケース：枚数 ÷ ケース枚数 を切り上げ（将来用） */
export function calculateCases(pieces: number, piecesPerCase: number): number {
  if (piecesPerCase <= 0) return 0;
  return Math.ceil(pieces / piecesPerCase - EPS);
}

/** ロス加算：base × (1 + loss%/100)。システムが勝手に加算しない＝loss=0で素通し。 */
export function calculateLoss(base: number, lossRatePct: number): number {
  const l = isFinite(lossRatePct) ? lossRatePct : 0;
  return base * (1 + l / 100);
}

// ─── 寸法パーサ（cm / mm / m を判定。曖昧なら確認を要求） ──────
export type DimUnit = "m" | "cm" | "mm";
export interface DimCandidate { unit: DimUnit; meters: number; label: string }
export interface DimParseResult {
  raw: string;
  meters: number | null;   // 確定値（曖昧・不正なら null）
  unitUsed: DimUnit | null;
  ambiguous: boolean;
  candidates: DimCandidate[]; // 曖昧時の候補
}

const PLAUSIBLE_MIN_M = 0.05; // 5cm
const PLAUSIBLE_MAX_M = 20;   // 20m

function plausible(m: number): boolean {
  return m >= PLAUSIBLE_MIN_M && m <= PLAUSIBLE_MAX_M;
}

function fmtM(m: number): string {
  return `${(Math.round(m * 1000) / 1000).toString()}m`;
}

/**
 * 現場表現の寸法を解釈する。
 *  ・末尾に mm/cm/m があれば優先。
 *  ・数字のみ：2〜3桁=cm、4桁=mm を基本。小数点付きは m。
 *  ・1桁 / 5桁以上 / 実装レンジ外 は曖昧として候補提示（勝手に確定しない）。
 */
export function parseDimension(raw: string): DimParseResult {
  const base: DimParseResult = { raw, meters: null, unitUsed: null, ambiguous: false, candidates: [] };
  if (raw == null) return base;
  // 全角数字・記号を半角へ
  const z2h = raw.replace(/[０-９．]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  );
  const s = z2h.trim().toLowerCase().replace(/\s+/g, "");
  if (s === "") return base;

  // 明示単位
  const mmM = s.match(/^(\d+(?:\.\d+)?)mm$/);
  if (mmM) {
    const m = parseFloat(mmM[1]) / 1000;
    return { ...base, meters: m, unitUsed: "mm", ambiguous: !plausible(m) };
  }
  const cmM = s.match(/^(\d+(?:\.\d+)?)cm$/);
  if (cmM) {
    const m = parseFloat(cmM[1]) / 100;
    return { ...base, meters: m, unitUsed: "cm", ambiguous: !plausible(m) };
  }
  const mM = s.match(/^(\d+(?:\.\d+)?)m$/);
  if (mM) {
    const m = parseFloat(mM[1]);
    return { ...base, meters: m, unitUsed: "m", ambiguous: !plausible(m) };
  }

  // 小数点付き（単位なし）→ m とみなす
  if (/^\d+\.\d+$/.test(s)) {
    const m = parseFloat(s);
    return { ...base, meters: m, unitUsed: "m", ambiguous: !plausible(m) };
  }

  // 数字のみ
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    const len = s.length;
    if (len === 2 || len === 3) {
      const m = n / 100; // cm
      return { ...base, meters: plausible(m) ? m : null, unitUsed: "cm", ambiguous: !plausible(m) };
    }
    if (len === 4) {
      const m = n / 1000; // mm
      return { ...base, meters: plausible(m) ? m : null, unitUsed: "mm", ambiguous: !plausible(m) };
    }
    // 1桁 / 5桁以上：曖昧 → 候補提示
    const cands: DimCandidate[] = [];
    const asCm = n / 100;
    const asMm = n / 1000;
    if (plausible(asCm)) cands.push({ unit: "cm", meters: asCm, label: `${n}cm = ${fmtM(asCm)}` });
    if (plausible(asMm)) cands.push({ unit: "mm", meters: asMm, label: `${n}mm = ${fmtM(asMm)}` });
    return { ...base, meters: null, unitUsed: null, ambiguous: true, candidates: cands };
  }

  return base; // 解釈不能
}

// ─── データモデル ──────────────────────────────────────────────
export interface WallpaperLine {
  id: string;
  dimRaw: string;   // 入力文字列（表示用）
  meters: number;   // 確定寸法(m)
  count: number;    // 本数
}

export interface TakeoffEntry {
  id: string;
  room: string;        // 部屋
  part?: string;       // 部位（クロス）
  product: string;     // 品番
  // クロス（length）
  lines?: WallpaperLine[];
  // 床系（area / area_rolls）
  flowRaw?: string; flowM?: number;   // 流し方向（奥行）
  widthRaw?: string; widthM?: number; // 幅方向
  materialWidthMm?: number;
  lossRate?: number;                  // 床系はエントリ単位
  flowDir?: string; jointDir?: string;
}

// ─── クロス集計（部屋別を保持しつつ品番別に合算） ─────────────
export interface WallpaperRoomLine {
  room: string; part?: string; product: string;
  lines: WallpaperLine[];
  meters: number; // 部屋×部位×品番の合計（raw）
}
export interface WallpaperProductSummary {
  product: string;
  breakdown: WallpaperRoomLine[]; // 部屋別内訳（確認用）
  rawTotal: number;               // 全室合算（raw・丸めなし）
  lossRate: number;               // 適用ロス率(%)
  afterLoss: number;              // ロス適用後
  orderQty: number;               // 最終発注（0.1m 切り上げ）
}

/**
 * クロス集計。
 * 明細は入力値のまま合算し、品番別合計にロス率を掛け、
 * 「最後の発注数量だけ」0.1m 切り上げる。
 */
export function summarizeWallpaper(
  entries: TakeoffEntry[],
  lossByProduct: Record<string, number> = {},
): {
  byRoom: WallpaperRoomLine[];
  byProduct: WallpaperProductSummary[];
} {
  const byRoom: WallpaperRoomLine[] = [];
  for (const e of entries) {
    const lines = e.lines ?? [];
    const meters = lines.reduce((s, l) => s + calculateLength(l.meters, l.count), 0);
    byRoom.push({ room: e.room, part: e.part, product: e.product, lines, meters });
  }

  const productMap = new Map<string, WallpaperRoomLine[]>();
  for (const r of byRoom) {
    const key = r.product || "(品番未設定)";
    if (!productMap.has(key)) productMap.set(key, []);
    productMap.get(key)!.push(r);
  }

  const byProduct: WallpaperProductSummary[] = [];
  for (const [product, rows] of productMap) {
    const rawTotal = rows.reduce((s, r) => s + r.meters, 0);
    const lossRate = lossByProduct[product] ?? 0;
    const afterLoss = calculateLoss(rawTotal, lossRate);
    const orderQty = roundOrderQuantity(afterLoss, 0.1);
    byProduct.push({ product, breakdown: rows, rawTotal, lossRate, afterLoss, orderQty });
  }
  return { byRoom, byProduct };
}

// ─── 床系集計（エントリごとに面積/本数/発注、品番別に合算） ────
export interface AreaEntryResult {
  entryId: string;
  room: string;
  product: string;
  flowM: number;
  widthM: number;
  materialWidthMm: number | null;
  rollCount: number | null;     // area_rolls のみ
  areaM2: number;               // 実面積（raw）
  estimateValue: number;        // 見積数量（丸め後）
  estimateUnit: Unit;
  orderRaw: number;             // 発注（ロス前・丸め前）
  orderValue: number;           // 発注数量（丸め後）
  orderUnit: Unit;
  lossRate: number;
  pieces?: number;              // 将来（タイルカーペット）
  cases?: number;
}

export function computeAreaEntry(
  entry: TakeoffEntry,
  config: TakeoffTypeConfig,
): AreaEntryResult {
  const flowM = entry.flowM ?? 0;
  const widthM = entry.widthM ?? 0;
  const areaM2 = calculateArea(flowM, widthM);
  const lossRate = entry.lossRate ?? 0;
  const estimateValue = ceilTo(areaM2, config.estimateRoundStep);

  let rollCount: number | null = null;
  let orderRaw: number;
  let orderUnit: Unit = config.orderUnit;

  if (config.calcKind === "area_rolls") {
    const matMm = entry.materialWidthMm ?? config.materialWidthMm ?? 1820;
    rollCount = calculateRollCount(widthM, matMm / 1000);
    // 発注 m = 流し方向 × 本数（ロスは発注へ加算）
    orderRaw = calculateLoss(flowM * rollCount, lossRate);
    orderUnit = "m";
  } else {
    // area：発注も面積（ロス加算）
    orderRaw = calculateLoss(areaM2, lossRate);
    orderUnit = config.orderUnit;
  }
  const orderValue = ceilTo(orderRaw, config.orderRoundStep);

  const res: AreaEntryResult = {
    entryId: entry.id, room: entry.room, product: entry.product,
    flowM, widthM,
    materialWidthMm: config.calcKind === "area_rolls" ? (entry.materialWidthMm ?? config.materialWidthMm ?? 1820) : null,
    rollCount, areaM2, estimateValue, estimateUnit: config.estimateUnit,
    orderRaw, orderValue, orderUnit, lossRate,
  };

  // 将来：タイルカーペットの枚数・ケース
  if (config.pieceAreaM2 && config.pieceAreaM2 > 0) {
    res.pieces = calculatePieces(areaM2, config.pieceAreaM2);
    if (config.piecesPerCase) res.cases = calculateCases(res.pieces, config.piecesPerCase);
  }
  return res;
}

export interface AreaProductSummary {
  product: string;
  estimateValue: number; estimateUnit: Unit;
  orderValue: number; orderUnit: Unit;
}

export function summarizeArea(
  entries: TakeoffEntry[],
  config: TakeoffTypeConfig,
): { entries: AreaEntryResult[]; byProduct: AreaProductSummary[] } {
  const results = entries.map((e) => computeAreaEntry(e, config));
  const map = new Map<string, AreaProductSummary>();
  for (const r of results) {
    const key = r.product || "(品番未設定)";
    const cur = map.get(key) ?? {
      product: key, estimateValue: 0, estimateUnit: r.estimateUnit,
      orderValue: 0, orderUnit: r.orderUnit,
    };
    cur.estimateValue = roundTo(cur.estimateValue + r.estimateValue, 0.0001);
    cur.orderValue = roundTo(cur.orderValue + r.orderValue, 0.0001);
    map.set(key, cur);
  }
  // 合算後に丸め直し（見積/発注の刻みで）
  const byProduct = [...map.values()].map((p) => ({
    ...p,
    estimateValue: ceilTo(p.estimateValue, config.estimateRoundStep),
    orderValue: ceilTo(p.orderValue, config.orderRoundStep),
  }));
  return { entries: results, byProduct };
}
