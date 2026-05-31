export interface StoredDocument {
  id: string;
  documentName: string;
  category: string;
  relatedProject: string;
  memo: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = "genba_jimu_document_storage";

export function getStoredDocuments(): StoredDocument[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredDocument[]) : [];
  } catch {
    return [];
  }
}

export function saveStoredDocument(
  doc: Omit<StoredDocument, "id" | "createdAt" | "updatedAt">
): StoredDocument {
  const docs = getStoredDocuments();
  const now = new Date().toISOString();
  const newDoc: StoredDocument = {
    ...doc,
    id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now,
    updatedAt: now,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...docs, newDoc]));
  return newDoc;
}

export function deleteStoredDocument(id: string): void {
  const docs = getStoredDocuments().filter((d) => d.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
}
