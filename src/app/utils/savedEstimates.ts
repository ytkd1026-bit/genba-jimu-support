import type { TaxType, TaxRate, TaxBreakdown } from "./taxCalculation";

const SAVED_ESTIMATES_KEY = "genba_jimu_saved_estimates";
const SELECTED_ESTIMATE_ID_KEY = "genba_jimu_selected_estimate_id";

export type EstimateStatus = "draft" | "saved" | "submitted";

export type EstimateItem = {
  id: number;
  category: string;
  koujiName: string;
  koujiContent: string;
  location1: string;
  location2: string;
  qty: string;
  unit: string;
  unitPrice: string;
  note: string;
};

/** 見積・請求の保存時に残す明細スナップショット（保存時点の税情報を含む） */
export type LineSnapshot = {
  workItemId: string;
  workName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  taxType: TaxType;
  taxRate: TaxRate;
};

export type SavedEstimate = {
  id: string;
  createdAt: string;
  updatedAt: string;
  estimateNo: string;
  projectId: string;
  projectName: string;
  clientName: string;
  siteAddress: string;
  workDescription: string;
  estimateItems: EstimateItem[];
  subtotal: number;
  tax: number; // = taxBreakdown.taxTotal（互換維持）
  total: number;
  status: EstimateStatus;
  version: number; // 版番号（1始まり）
  memo: string;
  // ── 税区分対応（後方互換のため任意） ──────────────────────
  taxBreakdown?: TaxBreakdown;
  /** 保存時点の明細スナップショット（税情報を含む・後から WorkItem が変わっても不変） */
  lineSnapshots?: LineSnapshot[];
  // ── 版管理（後方互換のため任意） ──────────────────────────
  /** 前版の見積ID（新しい版として保存したときに設定） */
  previousEstimateId?: string;
  /** 修正理由（新しい版として保存したときに入力） */
  revisionReason?: string;
};

export function getSavedEstimates(): SavedEstimate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SAVED_ESTIMATES_KEY);
    return raw ? (JSON.parse(raw) as SavedEstimate[]) : [];
  } catch {
    return [];
  }
}

export function upsertEstimate(est: SavedEstimate): void {
  const list = getSavedEstimates();
  const idx = list.findIndex((e) => e.id === est.id);
  if (idx >= 0) {
    list[idx] = est;
  } else {
    list.unshift(est);
  }
  localStorage.setItem(SAVED_ESTIMATES_KEY, JSON.stringify(list));
}

export function duplicateEstimate(id: string): SavedEstimate | null {
  const list = getSavedEstimates();
  const src = list.find((e) => e.id === id);
  if (!src) return null;
  const now = new Date().toLocaleString("ja-JP");
  const newEst: SavedEstimate = {
    ...src,
    id: `est-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
    version: 1,
    status: "draft",
    estimateNo: `EST-COPY-${Date.now()}`,
  };
  list.unshift(newEst);
  localStorage.setItem(SAVED_ESTIMATES_KEY, JSON.stringify(list));
  return newEst;
}

export function deleteEstimate(id: string): void {
  const list = getSavedEstimates().filter((e) => e.id !== id);
  localStorage.setItem(SAVED_ESTIMATES_KEY, JSON.stringify(list));
}

export function getSelectedEstimateId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SELECTED_ESTIMATE_ID_KEY);
}

export function setSelectedEstimateId(id: string): void {
  localStorage.setItem(SELECTED_ESTIMATE_ID_KEY, id);
}

export function clearSelectedEstimateId(): void {
  localStorage.removeItem(SELECTED_ESTIMATE_ID_KEY);
}

export const STATUS_LABELS: Record<EstimateStatus, string> = {
  draft:     "下書き",
  saved:     "保存済み",
  submitted: "提出済み",
};

export const STATUS_STYLES: Record<EstimateStatus, string> = {
  draft:     "bg-stone-100 text-stone-600",
  saved:     "bg-blue-100 text-blue-700",
  submitted: "bg-green-100 text-green-700",
};
