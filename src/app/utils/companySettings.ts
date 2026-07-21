// 会社設定（事業者設定）の共通読み込みユーティリティ
//
// 保存元は settings/company/page.tsx（キー: genba_settings）。
// これまで見積・単体請求・一括請求の各画面が同じ読み込みコードを重複実装していたため、
// ここに集約する。保存キー・保存形式（会社情報＋振込先のフラット結合）は
// 既存データとの互換のため変更しない。

const SETTINGS_STORAGE_KEY = "genba_settings";

export type CompanySettings = {
  businessName: string;   // 屋号・会社名
  representative: string; // 代表者名（接頭辞なし。例: "山田 太郎"）
  postalCode: string;
  address: string;
  tel: string;
  email: string;
  invoiceNumber: string;  // インボイス登録番号
};

export type BankSettings = {
  bankName: string;
  branchName: string;
  accountType: string;    // "普通" | "当座"
  accountNumber: string;
  accountHolder: string;
};

/** PDF帳票へ渡す形式（既存 EstimatePDF.tsx の CompanyInfoForPDF と同形） */
export type CompanyInfoForPdf = {
  name: string;
  postalCode: string;
  address: string;
  representative: string; // "代表　山田 太郎" 形式
  tel: string;
  email: string;
  invoiceNumber: string;
};

// デフォルト値は settings/company/page.tsx の DEFAULT_COMPANY / DEFAULT_BANK と同値。
// 本番値として固定しないこと（設定画面で必ず上書きされる前提のデモ値）。
export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  businessName:   "REVO",
  representative: "山田 太郎",
  postalCode:     "〒590-0000",
  address:        "大阪府堺市〇〇区〇〇町",
  tel:            "090-0000-0000",
  email:          "example@example.com",
  invoiceNumber:  "T0000000000000",
};

export const DEFAULT_BANK_SETTINGS: BankSettings = {
  bankName:      "〇〇銀行",
  branchName:    "〇〇支店",
  accountType:   "普通",
  accountNumber: "1234567",
  accountHolder: "ヤマダ タロウ",
};

function readRaw(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function str(v: unknown, fallback: string): string {
  return typeof v === "string" && v !== "" ? v : fallback;
}

/** 会社情報を取得する（未設定の項目はデフォルト値で補完） */
export function getCompanySettings(): CompanySettings {
  const saved = readRaw();
  const d = DEFAULT_COMPANY_SETTINGS;
  return {
    businessName:   str(saved.businessName, d.businessName),
    representative: str(saved.representative, d.representative),
    postalCode:     str(saved.postalCode, d.postalCode),
    address:        str(saved.address, d.address),
    tel:            str(saved.tel, d.tel),
    email:          str(saved.email, d.email),
    invoiceNumber:  str(saved.invoiceNumber, d.invoiceNumber),
  };
}

/** 振込先情報を取得する（未設定の項目はデフォルト値で補完） */
export function getBankSettings(): BankSettings {
  const saved = readRaw();
  const d = DEFAULT_BANK_SETTINGS;
  return {
    bankName:      str(saved.bankName, d.bankName),
    branchName:    str(saved.branchName, d.branchName),
    accountType:   str(saved.accountType, d.accountType),
    accountNumber: str(saved.accountNumber, d.accountNumber),
    accountHolder: str(saved.accountHolder, d.accountHolder),
  };
}

/**
 * PDF帳票用の会社情報を取得する。
 * 代表者名は既存帳票と同じ「代表　◯◯」形式へ整形する。
 */
export function getCompanyInfoForPdf(): CompanyInfoForPdf {
  const c = getCompanySettings();
  return {
    name:           c.businessName,
    postalCode:     c.postalCode,
    address:        c.address,
    representative: `代表　${c.representative}`,
    tel:            c.tel,
    email:          c.email,
    invoiceNumber:  c.invoiceNumber,
  };
}

/**
 * 会社設定が「未完了」かどうかを判定する（S-7 警告用・読取専用）。
 * 保存済み設定が無い、または必須項目（屋号・インボイス番号・振込先銀行名）が
 * 空、もしくは既定プレースホルダのままなら未完了とみなす。
 * getCompanySettings は未設定をデフォルト補完するため、ここでは生の保存値を見る。
 */
export function isCompanySettingsIncomplete(): boolean {
  if (typeof window === "undefined") return false;
  const raw = readRaw();
  const filled = (v: unknown, placeholder: string): boolean =>
    typeof v === "string" && v.trim() !== "" && v.trim() !== placeholder;
  const businessOk = filled(raw.businessName, DEFAULT_COMPANY_SETTINGS.businessName);
  const invoiceOk = filled(raw.invoiceNumber, DEFAULT_COMPANY_SETTINGS.invoiceNumber);
  const bankOk = filled(raw.bankName, DEFAULT_BANK_SETTINGS.bankName);
  return !(businessOk && invoiceOk && bankOk);
}
