// 単体請求書の本保存ユーティリティ
// savedEstimates.ts と同じパターンで、将来 Supabase へ移行できる構造にしている

const SAVED_INVOICES_KEY = 'genba_jimu_saved_invoices';

export type SavedInvoice = {
  id: string;
  createdAt: string;
  updatedAt: string;
  invoiceNo: string;
  projectId?: string;
  projectName: string;
  clientName: string;
  invoiceDate: string;
  dueDate: string;
  subtotal: number;
  tax: number;
  total: number;
  status: 'draft' | 'issued';
  memo: string;
};

export function getSavedInvoices(): SavedInvoice[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SAVED_INVOICES_KEY);
    return raw ? (JSON.parse(raw) as SavedInvoice[]) : [];
  } catch {
    return [];
  }
}

export function upsertInvoice(inv: SavedInvoice): void {
  const list = getSavedInvoices();
  const idx = list.findIndex((e) => e.id === inv.id);
  if (idx >= 0) {
    list[idx] = inv;
  } else {
    list.unshift(inv);
  }
  localStorage.setItem(SAVED_INVOICES_KEY, JSON.stringify(list));
}

export function deleteInvoice(id: string): void {
  const list = getSavedInvoices().filter((e) => e.id !== id);
  localStorage.setItem(SAVED_INVOICES_KEY, JSON.stringify(list));
}
