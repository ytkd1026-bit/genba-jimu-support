export interface ExpenseDraft {
  id: string;
  date: string;
  vendor: string;
  amount: string;
  taxType: string;
  category: string;
  linkedProject: string;
  memo: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
  status: "draft" | "confirmed";
  ocrText?: string;
  aiStructuredData?: Record<string, unknown> | null;
  aiStatus?: "not_started" | "pending" | "completed" | "failed";
  aiCandidates?: Record<string, unknown> | null;
}

const STORAGE_KEY = "genba_jimu_expense_drafts";

export function getExpenseDrafts(): ExpenseDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ExpenseDraft[]) : [];
  } catch {
    return [];
  }
}

export function saveExpenseDraft(
  draft: Omit<ExpenseDraft, "id" | "createdAt" | "updatedAt">
): ExpenseDraft {
  const drafts = getExpenseDrafts();
  const now = new Date().toISOString();
  const newDraft: ExpenseDraft = {
    ...draft,
    id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now,
    updatedAt: now,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...drafts, newDraft]));
  return newDraft;
}

export function updateExpenseDraft(
  id: string,
  data: Partial<ExpenseDraft>
): void {
  const drafts = getExpenseDrafts().map((d) =>
    d.id === id ? { ...d, ...data, updatedAt: new Date().toISOString() } : d
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

export function deleteExpenseDraft(id: string): void {
  const drafts = getExpenseDrafts().filter((d) => d.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}
