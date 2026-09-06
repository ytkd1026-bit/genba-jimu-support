// 単価マスタ（自社単価マスタ）— 見積・原価の「正本」
//
// ユーザーごとに自社の単価マスタを持つ。見積・原価入力画面では、この
// マスタから「項目を選ぶ＋数量を入れる」だけで原価・売価・粗利まで自動計算する。
// 見積側と原価側の二重入力・再計算をなくすのが目的。
//
// 表現できる3種類（工種を問わず同じ構造。クロス専用にハードコードしない）:
//   材料のみ   … 材料原価単価のみ >0（例: クロス材料費）
//   施工のみ   … 労務原価単価のみ >0（例: クロス施工費）
//   材料＋施工 … 材料・労務の両方 >0（例: クロス張替 = 複合工事項目）
//
// 将来 Supabase へ移行する前提で型を設計する。現段階は localStorage 保存。
// 移行時は read / write の実装だけ差し替える（listStore.ts と同じ方針）。

import type { TaxType, TaxRate } from "./taxCalculation";
import { unitCostTotal, referenceSellingUnitPrice, roundYen } from "./costCalc";

export const UNIT_PRICE_MASTER_KEY = "genba_unit_price_master_v1";
const SEED_FLAG_KEY = "genba_unit_price_master_seeded_v1";

/** 単価マスタ1件。原価単価合計・参考売上単価は保存時に再計算して保持する。 */
export type UnitPriceMasterItem = {
  id: string; // 例: UPM-0001
  workCategory: string; // 工種（例: クロス工事）
  itemName: string; // 項目名（例: クロス張替）
  materialName: string; // 材料名（無しは ""）
  unit: string; // 単位（例: m）
  materialUnitCost: number; // 材料原価単価
  laborUnitCost: number; // 労務原価単価
  subcontractUnitCost: number; // 外注原価単価
  otherUnitCost: number; // その他原価単価
  totalUnitCost: number; // 原価単価合計（= 上記4つの合計。保存時に再計算）
  targetProfitRate: number; // 標準目標粗利率（0〜1）
  referenceSellingUnitPrice: number; // 参考売上単価（原価単価÷(1-粗利率)。保存時に再計算）
  standardSellingUnitPrice: number; // 標準売上単価（手動設定可。初期値は参考売上単価）
  taxType: TaxType; // 税区分
  taxRate: TaxRate; // 税率
  active: boolean; // 有効 / 無効
  isTestData?: boolean; // テストデータ識別（任意・後方互換。データ自身が保持）
  environment?: "development" | "production"; // 旧フラグ（後方互換の読み取り専用）
  createdAt: string;
  updatedAt: string;
};

/** 新規1件のための入力（派生フィールドは withMasterDerived が計算する） */
export type UnitPriceMasterInput = Omit<
  UnitPriceMasterItem,
  | "totalUnitCost"
  | "referenceSellingUnitPrice"
  | "standardSellingUnitPrice"
  | "createdAt"
  | "updatedAt"
> & { createdAt?: string; standardSellingUnitPrice?: number };

/** 原価単価合計・参考売上単価を再計算し、標準売上単価の初期値も補完して返す。 */
export function withMasterDerived(
  item: UnitPriceMasterInput,
  now = new Date().toISOString(),
): UnitPriceMasterItem {
  const totalUnitCost = unitCostTotal(item);
  const reference = referenceSellingUnitPrice(totalUnitCost, item.targetProfitRate);
  const standard =
    item.standardSellingUnitPrice && item.standardSellingUnitPrice > 0
      ? roundYen(item.standardSellingUnitPrice)
      : reference;
  return {
    ...item,
    totalUnitCost,
    referenceSellingUnitPrice: reference,
    standardSellingUnitPrice: standard,
    createdAt: item.createdAt ?? now,
    updatedAt: now,
  };
}

// ─── localStorage ストア（グローバル＝ユーザー単位。案件には紐づかない） ──
function read(): UnitPriceMasterItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(UNIT_PRICE_MASTER_KEY);
    return raw ? (JSON.parse(raw) as UnitPriceMasterItem[]) : [];
  } catch {
    return [];
  }
}

function write(list: UnitPriceMasterItem[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(UNIT_PRICE_MASTER_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

let idCounter = 0;
function issueMasterId(existing: UnitPriceMasterItem[]): string {
  let max = 0;
  for (const m of existing) {
    const n = parseInt(m.id.replace(/^UPM-/, ""), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  idCounter = Math.max(idCounter, max);
  idCounter += 1;
  return `UPM-${String(idCounter).padStart(4, "0")}`;
}

export const unitPriceMasterStore = {
  /** 全件取得（読み込み失敗時は空配列） */
  getAll(): UnitPriceMasterItem[] {
    return read();
  },
  /** 有効な項目のみ取得（見積・原価入力の選択肢用） */
  getActive(): UnitPriceMasterItem[] {
    return read().filter((m) => m.active);
  },
  /** ID指定で1件取得 */
  getById(id: string): UnitPriceMasterItem | null {
    return read().find((m) => m.id === id) ?? null;
  },
  /** 追加または上書き（派生フィールドは再計算）。保存できなければ false */
  upsert(item: UnitPriceMasterItem): boolean {
    const list = read();
    const derived = withMasterDerived(item);
    const idx = list.findIndex((m) => m.id === derived.id);
    if (idx >= 0) list[idx] = derived;
    else list.push(derived);
    return write(list);
  },
  /** 新規作成（IDを発行して保存）。作成した項目を返す（保存失敗時 null） */
  create(input: Omit<UnitPriceMasterInput, "id">): UnitPriceMasterItem | null {
    const list = read();
    const id = issueMasterId(list);
    const item = withMasterDerived({ ...input, id });
    list.push(item);
    return write(list) ? item : null;
  },
  /** ID指定で削除 */
  remove(id: string): void {
    write(read().filter((m) => m.id !== id));
  },
};

// ─── 必須シード（クロス材料費 / クロス施工費 / クロス張替） ────────────
// 仕様4: これらは「後から追加するセット機能」ではなく、最初から必須の標準項目。
// 冪等: 一度シードしたら再実行しない（ユーザーの編集・削除を上書きしない）。
const CROSS_SEEDS: Array<Omit<UnitPriceMasterInput, "id">> = [
  {
    workCategory: "クロス工事",
    itemName: "クロス材料費",
    materialName: "",
    unit: "m",
    materialUnitCost: 240,
    laborUnitCost: 0,
    subcontractUnitCost: 0,
    otherUnitCost: 0,
    targetProfitRate: 0.25,
    taxType: "taxable",
    taxRate: 10,
    active: true,
  },
  {
    // クロス施工費 / m（労務450 → 参考売価600）。仕様4A
    workCategory: "クロス工事",
    itemName: "クロス施工費",
    materialName: "",
    unit: "m",
    materialUnitCost: 0,
    laborUnitCost: 450,
    subcontractUnitCost: 0,
    otherUnitCost: 0,
    targetProfitRate: 0.25,
    taxType: "taxable",
    taxRate: 10,
    active: true,
  },
  {
    // クロス施工費 / 人工（労務21,750 → 参考売価29,000）。仕様4B。0.5/1.5人工にも対応
    workCategory: "クロス工事",
    itemName: "クロス施工費",
    materialName: "",
    unit: "人工",
    materialUnitCost: 0,
    laborUnitCost: 21750,
    subcontractUnitCost: 0,
    otherUnitCost: 0,
    targetProfitRate: 0.25,
    taxType: "taxable",
    taxRate: 10,
    active: true,
  },
  {
    // クロス施工費 / 式（売価は案件ごとに手入力）。仕様4C
    workCategory: "クロス工事",
    itemName: "クロス施工費",
    materialName: "",
    unit: "式",
    materialUnitCost: 0,
    laborUnitCost: 0,
    subcontractUnitCost: 0,
    otherUnitCost: 0,
    targetProfitRate: 0.25,
    taxType: "taxable",
    taxRate: 10,
    active: true,
  },
  {
    workCategory: "クロス工事",
    itemName: "クロス張替",
    materialName: "",
    unit: "m",
    materialUnitCost: 240,
    laborUnitCost: 450,
    subcontractUnitCost: 0,
    otherUnitCost: 0,
    targetProfitRate: 0.25,
    taxType: "taxable",
    taxRate: 10,
    active: true,
  },
];

/**
 * 初回のみ必須クロス項目をシードする。冪等（フラグで二重シード防止）。
 * 既存マスタが空でもフラグが立っていれば何もしない（ユーザーが3件とも削除した意思を尊重）。
 * 画面マウント時に呼ぶ。
 */
export function ensureUnitPriceMasterSeeded(): void {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(SEED_FLAG_KEY)) return;
  } catch {
    return;
  }
  const list = read();
  const now = new Date().toISOString();
  for (const seed of CROSS_SEEDS) {
    // 同じ工種・項目名・材料名・単位が既にあれば重複追加しない（単位別レコードは許容・仕様6）
    const dup = list.some(
      (m) =>
        m.workCategory === seed.workCategory &&
        m.itemName === seed.itemName &&
        m.materialName === seed.materialName &&
        m.unit === seed.unit,
    );
    if (dup) continue;
    const id = issueMasterId(list);
    list.push(withMasterDerived({ ...seed, id }, now));
  }
  write(list);
  try {
    localStorage.setItem(SEED_FLAG_KEY, "1");
  } catch {
    // シードフラグ保存失敗時も本体は保存済み。次回は重複チェックで防ぐ。
  }
}
