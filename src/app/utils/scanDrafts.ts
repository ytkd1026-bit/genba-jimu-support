export type ScanType =
  | "client_document"
  | "receipt"
  | "order_document"
  | "other_document";

export type ScanDraftStatus = "draft" | "confirmed" | "registered";

export interface ScanDraft {
  id: string;
  scanType: ScanType;
  fileName: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
  status: ScanDraftStatus;
  extractedData: Record<string, string>;
  memo: string;
}

const STORAGE_KEY = "genba_jimu_scan_drafts";

export function getScanDrafts(): ScanDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ScanDraft[]) : [];
  } catch {
    return [];
  }
}

export function saveScanDraft(
  draft: Omit<ScanDraft, "id" | "createdAt" | "updatedAt">
): ScanDraft {
  const drafts = getScanDrafts();
  const now = new Date().toISOString();
  const newDraft: ScanDraft = {
    ...draft,
    id: `scan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now,
    updatedAt: now,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...drafts, newDraft]));
  return newDraft;
}

export function updateScanDraft(id: string, data: Partial<ScanDraft>): void {
  const drafts = getScanDrafts().map((d) =>
    d.id === id ? { ...d, ...data, updatedAt: new Date().toISOString() } : d
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

export function deleteScanDraft(id: string): void {
  const drafts = getScanDrafts().filter((d) => d.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

export function getScanDraftById(id: string): ScanDraft | undefined {
  return getScanDrafts().find((d) => d.id === id);
}

export function getScanDraftsByType(scanType: ScanType): ScanDraft[] {
  return getScanDrafts().filter((d) => d.scanType === scanType);
}
