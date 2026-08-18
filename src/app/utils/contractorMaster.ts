// 元請マスタ（元請＝発注元／提出先）
//
// 一度登録した元請情報（会社名・担当・住所・連絡先・締日・支払条件）を、
// 見積作成のたびに入力し直さなくて済むようにする。見積画面では元請を「選ぶ」だけ。
// 見積データへは contractorId で関連付け、名前文字列だけで結ばない（仕様21）。
//
// 既存の Customer（genba_jimu_customers）とは別に新設する（要件項目が多いため）。
// 既存の顧客画面・旧データは変更しない。
//
// 将来 Supabase へ移行する前提の型。現段階は localStorage 保存（listStore と同方針）。

export const CONTRACTOR_MASTER_KEY = "genba_contractor_master_v1";

export type Contractor = {
  id: string; // 例: CON-0001
  name: string; // 元請名・会社名
  contactName: string; // 担当者名
  postalCode: string; // 郵便番号
  address: string; // 住所
  tel: string; // 電話番号
  email: string; // メール
  closingDay: string; // 締日（例: "末日" / "20日"。文字列で柔軟に保持）
  paymentTerms: string; // 支払条件（例: "翌月末払い"）
  note: string; // 備考
  active: boolean; // 有効 / 無効
  isTestData?: boolean; // テストデータ識別（任意・後方互換。データ自身が保持）
  environment?: "development" | "production"; // 旧フラグ（後方互換の読み取り専用）
  createdAt: string;
  updatedAt: string;
};

export type ContractorInput = Omit<Contractor, "id" | "createdAt" | "updatedAt"> & {
  createdAt?: string;
};

function read(): Contractor[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CONTRACTOR_MASTER_KEY);
    return raw ? (JSON.parse(raw) as Contractor[]) : [];
  } catch {
    return [];
  }
}

function write(list: Contractor[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(CONTRACTOR_MASTER_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

function issueContractorId(existing: Contractor[]): string {
  let max = 0;
  for (const c of existing) {
    const n = parseInt(c.id.replace(/^CON-/, ""), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return `CON-${String(max + 1).padStart(4, "0")}`;
}

export const contractorStore = {
  /** 全件取得 */
  getAll(): Contractor[] {
    return read();
  },
  /** 有効な元請のみ（見積の選択肢用） */
  getActive(): Contractor[] {
    return read().filter((c) => c.active);
  },
  /** ID指定で1件取得 */
  getById(id: string): Contractor | null {
    return read().find((c) => c.id === id) ?? null;
  },
  /** 追加または上書き。保存できなければ false */
  upsert(item: Contractor): boolean {
    const list = read();
    const idx = list.findIndex((c) => c.id === item.id);
    const next = { ...item, updatedAt: new Date().toISOString() };
    if (idx >= 0) list[idx] = next;
    else list.push(next);
    return write(list);
  },
  /** 新規作成（IDを発行して保存）。作成した元請を返す（保存失敗時 null） */
  create(input: ContractorInput): Contractor | null {
    const list = read();
    const now = new Date().toISOString();
    const item: Contractor = {
      ...input,
      id: issueContractorId(list),
      createdAt: input.createdAt ?? now,
      updatedAt: now,
    };
    list.push(item);
    return write(list) ? item : null;
  },
  /** ID指定で削除 */
  remove(id: string): void {
    write(read().filter((c) => c.id !== id));
  },
};

/** 見積へスナップショット保存する提出先情報（発行時点で固定。仕様22） */
export type SubmitToSnapshot = {
  contractorId: string;
  name: string;
  contactName: string;
  postalCode: string;
  address: string;
  tel: string;
  email: string;
};

/** 元請から提出先スナップショットを作る */
export function contractorToSnapshot(c: Contractor): SubmitToSnapshot {
  return {
    contractorId: c.id,
    name: c.name,
    contactName: c.contactName,
    postalCode: c.postalCode,
    address: c.address,
    tel: c.tel,
    email: c.email,
  };
}
