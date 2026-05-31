// ─── 型定義 ──────────────────────────────────────────────────
export interface AiStructuredResult {
  documentType: string;
  clientName: string;
  recipientName: string;
  orderDate: string;
  buildScheduleDate: string;
  orderNumber: string;
  customerName: string;
  projectName: string;
  siteAddress: string;
  workDescription: string;
  workPeriod: string;
  orderAmount: string;
  paymentTerm: string;
  invoiceRegistrationNumber: string;
  lineItems: string[];
  warnings: string[];
  rawOcrText: string;
}

// ─── 内部ユーティリティ ───────────────────────────────────────

/** 行内のスペースを全て除去（OCR の文字間スペース対策）*/
function cl(line: string): string {
  return line.replace(/\s+/g, "");
}

/** テキスト全体をスペースなしに圧縮 */
function compressAll(text: string): string {
  return text.replace(/\s+/g, "");
}

// ─── 書類種別 ────────────────────────────────────────────────
function detectDocumentType(compressed: string): string {
  if (/発注書|注文書/.test(compressed)) return "発注書・注文書";
  if (/見積書|見積もり/.test(compressed)) return "見積書";
  if (/請求書/.test(compressed)) return "請求書";
  if (/領収書/.test(compressed)) return "領収書";
  return "";
}

// ─── 会社名（元請名）────────────────────────────────────────
const COMPANY_KEYWORDS = [
  "株式会社", "（株）", "(株)", "合同会社", "有限会社",
  "工務店", "建設", "リフォーム", "設計事務所", "商店",
];

function findCompanyLines(lines: string[]): string[] {
  return lines
    .map((l) => cl(l))
    .filter(
      (c) =>
        c.length >= 3 &&
        c.length <= 50 &&
        COMPANY_KEYWORDS.some((kw) => c.includes(kw))
    );
}

// ─── 住所 ──────────────────────────────────────────────────
const PREF_WORDS = ["都", "道", "府", "県"];
const CITY_WORDS = ["市", "区", "町", "村"];

interface AddressHit {
  address: string;
  lineIndex: number;
}

function findAddresses(lines: string[]): AddressHit[] {
  const results: AddressHit[] = [];
  for (let i = 0; i < lines.length; i++) {
    const c = cl(lines[i]);
    const hasPref = PREF_WORDS.some((p) => c.includes(p));
    const hasCity = CITY_WORDS.some((w) => c.includes(w));
    if (hasPref && hasCity && c.length >= 7 && c.length <= 60) {
      results.push({ address: c, lineIndex: i });
    }
  }
  return results;
}

function pickSiteAddress(
  lines: string[],
  addresses: AddressHit[]
): string {
  if (addresses.length === 0) return "";
  if (addresses.length === 1) return addresses[0].address;

  const SITE_KEYWORDS = ["現場所在地", "現場", "所在地", "施工場所"];
  for (let i = 0; i < lines.length; i++) {
    const c = cl(lines[i]);
    if (SITE_KEYWORDS.some((kw) => c.includes(kw))) {
      let nearest = addresses[0];
      let minDist = Math.abs(addresses[0].lineIndex - i);
      for (const a of addresses) {
        const dist = Math.abs(a.lineIndex - i);
        if (dist < minDist) { minDist = dist; nearest = a; }
      }
      return nearest.address;
    }
  }
  return addresses[0].address;
}

// ─── 日付 ──────────────────────────────────────────────────
interface DateHit {
  date: string;
  contextBefore: string;
  contextAfter: string;
  lineIndex: number;
}

function findAllDates(lines: string[]): DateHit[] {
  const results: DateHit[] = [];
  const patterns = [
    /(\d{4})年(\d{1,2})月(\d{1,2})日/,
    /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
  ];
  for (let i = 0; i < lines.length; i++) {
    const c = cl(lines[i]);
    for (const pattern of patterns) {
      const m = c.match(pattern);
      if (m) {
        const y = m[1];
        const mo = m[2].padStart(2, "0");
        const d = m[3].padStart(2, "0");
        results.push({
          date: `${y}/${mo}/${d}`,
          contextBefore: i > 0 ? cl(lines[i - 1]) : "",
          contextAfter: i < lines.length - 1 ? cl(lines[i + 1]) : "",
          lineIndex: i,
        });
      }
    }
  }
  return results;
}

function dateByLabel(dates: DateHit[], keywords: string[]): string {
  for (const hit of dates) {
    const ctx = hit.contextBefore + cl(hit.contextAfter);
    if (keywords.some((kw) => ctx.includes(kw))) return hit.date;
  }
  return "";
}

// ─── 金額 ──────────────────────────────────────────────────
function extractAmount(allCompressed: string): string {
  const labeled = [
    /(?:税抜発注金額|税込発注金額|発注金額)[^\d]{0,10}([\d,]+)/,
    /(?:御請求金額|請求金額|請負金額|見積金額)[^\d]{0,10}([\d,]+)/,
    /(?:合計金額|合計)[^\d]{0,10}([\d,]+)/,
    /(?:金額)[^\d]{0,10}([\d,]+)/,
  ];
  for (const p of labeled) {
    const m = allCompressed.match(p);
    if (m) return m[1];
  }
  const currency = [/¥([\d,]+)/, /￥([\d,]+)/, /([\d,]{4,})円/];
  for (const p of currency) {
    const m = allCompressed.match(p);
    if (m) return m[1];
  }
  return "";
}

// ─── 工事内容 ────────────────────────────────────────────────
const WORK_KEYWORDS = [
  "クロス", "CF", "フロアタイル", "フロア", "工事", "施工",
  "アクセント", "器具", "階段", "トイレ", "内装", "壁紙",
  "ビニル", "長尺", "カーペット",
];

function extractWorkDescription(lines: string[]): string {
  const found: string[] = [];
  for (const line of lines) {
    const c = cl(line);
    if (
      c.length >= 2 &&
      c.length <= 60 &&
      WORK_KEYWORDS.some((kw) => c.includes(kw))
    ) {
      if (!found.includes(c)) found.push(c);
    }
  }
  return found.slice(0, 3).join("・");
}

// ─── インボイス登録番号 ────────────────────────────────────
function extractInvoiceNumber(allCompressed: string): string {
  const m = allCompressed.match(/T\d{10,15}/);
  return m ? m[0] : "";
}

// ─── 宛先 ──────────────────────────────────────────────────
function extractRecipient(lines: string[]): string {
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const c = cl(lines[i]);
    if (c.includes("御中") || (c.includes("様") && c.length <= 20)) {
      return c;
    }
    // 英数字主体で短い行（社名など）
    if (/[A-Za-z]{2,}/.test(lines[i]) && c.length <= 40 && c.length >= 2) {
      if (!COMPANY_KEYWORDS.some((kw) => c.includes(kw))) {
        return c;
      }
    }
  }
  return "";
}

// ─── お客様名 ───────────────────────────────────────────────
function extractCustomerName(lines: string[]): string {
  for (const line of lines) {
    const c = cl(line);
    const m = c.match(/([^\s\n]{1,10})様/);
    if (m && m[1] !== "御中" && m[1].length >= 1) {
      return m[1] + "様";
    }
  }
  return "";
}

// ─── 発注番号 ───────────────────────────────────────────────
function extractOrderNumber(allCompressed: string): string {
  const patterns = [
    /(?:発注番号|注文番号|受注番号)[^\d]{0,5}([\w\-]+)/,
    /(?:No|NO|no)[.:]?\s*([\w\-]+)/,
  ];
  for (const p of patterns) {
    const m = allCompressed.match(p);
    if (m) return m[1];
  }
  return "";
}

// ─── 支払条件 ───────────────────────────────────────────────
function extractPaymentTerm(lines: string[]): string {
  const keywords = ["締め", "払い", "支払", "精算", "請求サイト"];
  for (const line of lines) {
    const c = cl(line);
    if (keywords.some((kw) => c.includes(kw)) && c.length <= 30) {
      return c;
    }
  }
  return "";
}

// ─── 工期 ──────────────────────────────────────────────────
function extractWorkPeriod(lines: string[], dates: DateHit[]): string {
  const keywords = ["工期間", "工期", "期間"];
  for (let i = 0; i < lines.length; i++) {
    const c = cl(lines[i]);
    if (keywords.some((kw) => c.includes(kw))) {
      const nearby = dates.filter((d) => Math.abs(d.lineIndex - i) <= 3);
      if (nearby.length >= 2) return `${nearby[0].date} ～ ${nearby[1].date}`;
      if (nearby.length === 1) return nearby[0].date;
    }
  }
  return "";
}

// ─── メイン関数 ──────────────────────────────────────────────
export function structureOcrText(rawText: string): AiStructuredResult {
  const lines = rawText.split(/\r?\n/).filter((l) => l.trim());
  const allCompressed = compressAll(rawText);
  const warnings: string[] = [];

  // 書類種別
  const documentType = detectDocumentType(allCompressed);

  // 会社名（元請）
  const companies = findCompanyLines(lines);
  const clientName = companies[0] || "";
  if (companies.length > 1) {
    warnings.push("会社名候補が複数あります。元請名を原本で確認してください。");
  }

  // 住所
  const allAddresses = findAddresses(lines);
  const siteAddress = pickSiteAddress(lines, allAddresses);
  if (allAddresses.length > 1) {
    const hasContextKeyword = ["現場所在地", "現場", "所在地"].some((kw) =>
      allCompressed.includes(kw)
    );
    if (!hasContextKeyword) {
      warnings.push("住所候補が複数あります。原本確認してください。");
    }
  }

  // 日付
  const allDates = findAllDates(lines);
  const orderDate =
    dateByLabel(allDates, ["発注日", "注文日"]) || allDates[0]?.date || "";
  const buildScheduleDate = dateByLabel(allDates, ["建方予定日", "建方", "施工予定日", "施工予定"]);
  const workPeriod = extractWorkPeriod(lines, allDates);

  if (allDates.length > 4) {
    warnings.push("日付候補が多くあります。発注日・工期を原本で確認してください。");
  }

  // 金額
  const orderAmount = extractAmount(allCompressed);
  if (orderAmount && !/^\d[\d,]*$/.test(orderAmount)) {
    warnings.push("金額候補はOCR誤認識の可能性があります。原本確認してください。");
  }

  // インボイス番号
  const invoiceRegistrationNumber = extractInvoiceNumber(allCompressed);

  // 工事内容
  const workDescription = extractWorkDescription(lines);

  // 宛先・お客様
  const recipientName = extractRecipient(lines);
  const customerName = extractCustomerName(lines);

  // 発注番号
  const orderNumber = extractOrderNumber(allCompressed);

  // 支払条件
  const paymentTerm = extractPaymentTerm(lines);

  return {
    documentType,
    clientName,
    recipientName,
    orderDate,
    buildScheduleDate,
    orderNumber,
    customerName,
    projectName: "",
    siteAddress,
    workDescription,
    workPeriod,
    orderAmount,
    paymentTerm,
    invoiceRegistrationNumber,
    lineItems: [],
    warnings,
    rawOcrText: rawText,
  };
}
