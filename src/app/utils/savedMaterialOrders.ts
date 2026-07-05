// 材料計算行 本保存ユーティリティ
// savedEstimates.ts / savedInvoices.ts と同じパターンで、将来 Supabase へ移行できる構造にしている

const SAVED_MATERIAL_ORDERS_KEY = "genba_jimu_saved_material_orders";

export type SavedMaterialRow = {
  id: number;
  koujiType: string;
  location1: string;
  location2: string;
  qty: string;
  unit: string;
  lossRate: string;
  unitPrice: string;
  itemName: string;
  orderNote: string;
  supplier: string;
  isSupplied: boolean;
  isOrdered: boolean;
  orderDate: string;
  deliveryDate: string;
  deliveryNote: string;
};

export type SavedMaterialOrder = {
  id: string;
  createdAt: string;
  updatedAt: string;
  projectId?: string;
  projectName: string;
  rows: SavedMaterialRow[];
  totalMaterialCost: number;
};

export function getSavedMaterialOrders(): SavedMaterialOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SAVED_MATERIAL_ORDERS_KEY);
    return raw ? (JSON.parse(raw) as SavedMaterialOrder[]) : [];
  } catch {
    return [];
  }
}

export function upsertMaterialOrder(order: SavedMaterialOrder): void {
  const list = getSavedMaterialOrders();
  const idx = list.findIndex((o) => o.id === order.id);
  if (idx >= 0) {
    list[idx] = order;
  } else {
    list.unshift(order);
  }
  localStorage.setItem(SAVED_MATERIAL_ORDERS_KEY, JSON.stringify(list));
}

export function deleteMaterialOrder(id: string): void {
  const list = getSavedMaterialOrders().filter((o) => o.id !== id);
  localStorage.setItem(SAVED_MATERIAL_ORDERS_KEY, JSON.stringify(list));
}
