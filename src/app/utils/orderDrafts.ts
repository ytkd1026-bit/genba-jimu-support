export interface OrderDraft {
  id: string;
  clientName: string;
  orderDate: string;
  projectName: string;
  workDescription: string;
  orderAmount: string;
  paymentTerm: string;
  memo: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
  status: "draft" | "confirmed";
}

const STORAGE_KEY = "genba_jimu_order_drafts";

export function getOrderDrafts(): OrderDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as OrderDraft[]) : [];
  } catch {
    return [];
  }
}

export function saveOrderDraft(
  draft: Omit<OrderDraft, "id" | "createdAt" | "updatedAt">
): OrderDraft {
  const drafts = getOrderDrafts();
  const now = new Date().toISOString();
  const newDraft: OrderDraft = {
    ...draft,
    id: `ord_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now,
    updatedAt: now,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...drafts, newDraft]));
  return newDraft;
}

export function updateOrderDraft(
  id: string,
  data: Partial<OrderDraft>
): void {
  const drafts = getOrderDrafts().map((d) =>
    d.id === id ? { ...d, ...data, updatedAt: new Date().toISOString() } : d
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

export function deleteOrderDraft(id: string): void {
  const drafts = getOrderDrafts().filter((d) => d.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}
