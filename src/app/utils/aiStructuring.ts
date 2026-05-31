// ─── 型定義 ──────────────────────────────────────────────────

export interface AiCandidates {
  companies: string[];
  addresses: string[];
  dates: string[];
  amounts: string[];
  workItems: string[];
  invoiceNumbers: string[];
  recipients: string[];
}

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
  candidates: AiCandidates;
  warnings: string[];
  rawOcrText: string;
}

// ─── ユーティリティ ───────────────────────────────────────────

/** 行内のスペースを全除去（OCR 文字間スペース対策） */
function cl(line: string): string {
  return line.replace(/\s+/g, "");
}

/** 全体をスペースなしに圧縮 */
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

// ─── 会社名（複数候補）───────────────────────────────────────

const COMPANY_KEYWORDS = [
  "株式会社", "（株）", "(株)", "合同会社", "有限会社",
  "工務店", "建設", "リフォーム", "設計事務所", "商店",
];

function findCompanyLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  for (const line of lines) {
    const c = cl(line);
    if (
      c.length >= 3 &&
      c.length <= 50 &&
      COMPANY_KEYWORDS.some((kw) => c.includes(kw)) &&
      !seen.has(c)
    ) {
      seen.add(c);
      results.push(c);
    }
  }
  // REVO などの英字社名も追加
  for (const line of lines) {
    const raw = line.trim();
    if (
      /[A-Za-z]{2,}/.test(raw) &&
      raw.length >= 2 &&
      raw.length <= 40 &&
      !COMPANY_KEYWORDS.some((kw) => cl(raw).includes(kw)) &&
      !seen.has(cl(raw))
    ) {
      seen.add(cl(raw));
      results.push(cl(raw));
    }
  }
  return results.slice(0, 6);
}

// ─── 住所（複数候補）────────────────────────────────────────

const PREF_WORDS = ["都", "道", "府", "県"];
const CITY_WORDS = ["市", "区", "町", "村"];

interface AddressHit {
  address: string;
  lineIndex: number;
}

function findAddresses(lines: string[]): AddressHit[] {
  const seen = new Set<string>();
  const results: AddressHit[] = [];
  for (let i = 0; i < lines.length; i++) {
    const c = cl(lines[i]);
    const hasPref = PREF_WORDS.some((p) => c.includes(p));
    const hasCity = CITY_WORDS.some((w) => c.includes(w));
    if (hasPref && hasCity && c.length >= 7 && c.length <= 60 && !seen.has(c)) {
      seen.add(c);
      results.push({ address: c, lineIndex: i });
    }
  }
  return results;
}

function pickSiteAddress(lines: string[], addresses: AddressHit[]): string {
  if (addresses.length === 0) return "";
  if (addresses.length === 1) return addresses[0].address;
  const SITE_KW = ["現場所在地", "現場", "所在地", "施工場所"];
  for (let i = 0; i < lines.length; i++) {
    const c = cl(lines[i]);
    if (SITE_KW.some((kw) => c.includes(kw))) {
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

// ─── 日付（複数候補）────────────────────────────────────────

interface DateHit {
  date: string;
  contextBefore: string;
  contextAfter: string;
  lineIndex: number;
}

function findAllDates(lines: string[]): DateHit[] {
  const seen = new Set<string>();
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
        const date = `${m[1]}/${m[2].padStart(2, "0")}/${m[3].padStart(2, "0")}`;
        if (!seen.has(date)) {
          seen.add(date);
          results.push({
            date,
            contextBefore: i > 0 ? cl(lines[i - 1]) : "",
            contextAfter: i < lines.length - 1 ? cl(lines[i + 1]) : "",
            lineIndex: i,
          });
        }
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

// ─── 金額（複数候補）────────────────────────────────────────

function findMultipleAmounts(rawText: string): string[] {
  const allComp = compressAll(rawText);
  const seen = new Set<string>();

  // ラベル付き優先
  const labelPatterns = [
    /(?:税抜発注金額|税込発注金額|発注金額|御請求金額|請求金額|請負金額|合計金額|合計|金額)[^\d]{0,10}([\d,]+)/g,
  ];
  for (const p of labelPatterns) {
    let m;
    p.lastIndex = 0;
    while ((m = p.exec(allComp)) !== null) seen.add(m[1]);
  }

  // 通貨記号
  const currencyPatterns = [/¥([\d,]+)/g, /￥([\d,]+)/g, /([\d,]{3,})円/g];
  for (const p of currencyPatterns) {
    let m;
    p.lastIndex = 0;
    while ((m = p.exec(allComp)) !== null) seen.add(m[1]);
  }

  // カンマ区切り数字
  const commaPattern = /\d{1,3}(?:,\d{3})+/g;
  let m;
  while ((m = commaPattern.exec(allComp)) !== null) seen.add(m[0]);

  return Array.from(seen)
    .filter((n) => n.replace(/,/g, "").length >= 3)
    .sort((a, b) => {
      const na = parseInt(a.replace(/,/g, ""), 10);
      const nb = parseInt(b.replace(/,/g, ""), 10);
      return nb - na;
    })
    .slice(0, 10);
}

// ─── 工事内容（複数候補）────────────────────────────────────

const WORK_KEYWORDS = [
  "クロス", "CF", "フロアタイル", "フロア", "工事", "施工",
  "アクセント", "器具", "階段", "トイレ", "内装", "壁紙",
  "ビニル", "長尺", "カーペット", "補修",
];

function findWorkItems(lines: string[]): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  for (const line of lines) {
    const c = cl(line);
    if (
      c.length >= 2 &&
      c.length <= 60 &&
      WORK_KEYWORDS.some((kw) => c.includes(kw)) &&
      !seen.has(c)
    ) {
      seen.add(c);
      results.push(c);
    }
  }
  return results.slice(0, 8);
}

// ─── インボイス番号（複数候補）──────────────────────────────

function findInvoiceNumbers(allComp: string): string[] {
  const seen = new Set<string>();
  const p = /T\d{10,15}/g;
  let m;
  while ((m = p.exec(allComp)) !== null) seen.add(m[0]);
  return Array.from(seen);
}

// ─── 宛先（複数候補）────────────────────────────────────────

function findRecipients(lines: string[]): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const c = cl(lines[i]);
    if ((c.includes("御中") || (c.includes("様") && c.length <= 20)) && !seen.has(c)) {
      seen.add(c);
      results.push(c);
    }
  }
  return results.slice(0, 4);
}

// ─── その他（単一値） ────────────────────────────────────────

function extractCustomerName(lines: string[]): string {
  for (const line of lines) {
    const c = cl(line);
    const m = c.match(/([^\s\n]{1,10})様/);
    if (m && m[1] !== "御中" && m[1].length >= 1) return m[1] + "様";
  }
  return "";
}

function extractOrderNumber(allComp: string): string {
  const patterns = [
    /(?:発注番号|注文番号|受注番号)[^\d]{0,5}([\w\-]+)/,
    /(?:No|NO)[.:]?\s*([\w\-]+)/,
  ];
  for (const p of patterns) {
    const m = allComp.match(p);
    if (m) return m[1];
  }
  return "";
}

function extractPaymentTerm(lines: string[]): string {
  const keywords = ["締め", "払い", "支払", "精算", "請求サイト"];
  for (const line of lines) {
    const c = cl(line);
    if (keywords.some((kw) => c.includes(kw)) && c.length <= 30) return c;
  }
  return "";
}

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
  const allComp = compressAll(rawText);
  const warnings: string[] = [];

  // 書類種別
  const documentType = detectDocumentType(allComp);

  // 会社名候補（全件）
  const companies = findCompanyLines(lines);
  if (companies.length > 1) {
    warnings.push("会社名候補が複数あります。元請名を原本で確認してください。");
  }

  // 住所候補（全件）
  const allAddresses = findAddresses(lines);
  const addressStrings = allAddresses.map((a) => a.address);
  const siteAddress = pickSiteAddress(lines, allAddresses);
  if (allAddresses.length > 1) {
    const hasCtx = ["現場所在地", "現場", "所在地"].some((kw) => allComp.includes(kw));
    if (!hasCtx) warnings.push("住所候補が複数あります。原本確認してください。");
  }

  // 日付候補（全件）
  const allDates = findAllDates(lines);
  const dateStrings = allDates.map((d) => d.date);
  if (allDates.length > 4) {
    warnings.push("日付候補が多くあります。発注日・工期を原本で確認してください。");
  }

  // 金額候補（複数）
  const amounts = findMultipleAmounts(rawText);

  // 工事内容候補（複数）
  const workItems = findWorkItems(lines);

  // インボイス番号候補
  const invoiceNumbers = findInvoiceNumbers(allComp);

  // 宛先候補
  const recipients = findRecipients(lines);

  // 単一ベスト推定値（候補の先頭 or ラベル文脈優先）
  const orderDate = dateByLabel(allDates, ["発注日", "注文日"]) || dateStrings[0] || "";
  const buildScheduleDate = dateByLabel(allDates, ["建方予定日", "建方", "施工予定日", "施工予定"]);
  const orderAmount = amounts[0] || "";
  const workDescription = workItems[0] || "";
  const clientName = companies[0] || "";
  const recipientName = recipients[0] || "";
  const invoiceRegistrationNumber = invoiceNumbers[0] || "";

  const candidates: AiCandidates = {
    companies,
    addresses: addressStrings,
    dates: dateStrings,
    amounts,
    workItems,
    invoiceNumbers,
    recipients,
  };

  return {
    documentType,
    clientName,
    recipientName,
    orderDate,
    buildScheduleDate,
    orderNumber: extractOrderNumber(allComp),
    customerName: extractCustomerName(lines),
    projectName: "",
    siteAddress,
    workDescription,
    workPeriod: extractWorkPeriod(lines, allDates),
    orderAmount,
    paymentTerm: extractPaymentTerm(lines),
    invoiceRegistrationNumber,
    lineItems: [],
    candidates,
    warnings,
    rawOcrText: rawText,
  };
}
