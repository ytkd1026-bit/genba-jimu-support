// ─── 型定義 ──────────────────────────────────────────────────

export interface AmountCandidate {
  value: string;
  normalizedValue: string;
  reason: string;
  confidence: "high" | "medium" | "low";
}

export interface DateCandidate {
  value: string;
  raw: string;
  reason: string;
  confidence: "high" | "medium" | "low";
}

export interface AddressCandidate {
  value: string;
  reason: string;
  confidence: "high" | "medium" | "low";
}

export interface TextCandidate {
  value: string;
  reason: string;
  confidence: "high" | "medium" | "low";
}

export interface AiCandidates {
  clientNameCandidates: TextCandidate[];
  recipientNameCandidates: TextCandidate[];
  customerNameCandidates: TextCandidate[];
  siteAddressCandidates: AddressCandidate[];
  orderDateCandidates: DateCandidate[];
  buildScheduleDateCandidates: DateCandidate[];
  workPeriodCandidates: DateCandidate[];
  orderNumberCandidates: TextCandidate[];
  amountCandidates: AmountCandidate[];
  invoiceRegistrationNumberCandidates: TextCandidate[];
  workDescriptionCandidates: TextCandidate[];
  paymentTermCandidates: TextCandidate[];
  warningMessages: string[];
  warnings?: string[];
}

export const defaultAiCandidates: AiCandidates = {
  clientNameCandidates: [],
  recipientNameCandidates: [],
  customerNameCandidates: [],
  siteAddressCandidates: [],
  orderDateCandidates: [],
  buildScheduleDateCandidates: [],
  workPeriodCandidates: [],
  orderNumberCandidates: [],
  amountCandidates: [],
  invoiceRegistrationNumberCandidates: [],
  workDescriptionCandidates: [],
  paymentTermCandidates: [],
  warningMessages: [],
  warnings: [],
};

export function safeMergeCandidates(
  raw: Partial<AiCandidates> | null | undefined
): AiCandidates {
  return {
    ...defaultAiCandidates,
    ...raw,
    warningMessages: raw?.warningMessages ?? raw?.warnings ?? [],
    warnings: raw?.warnings ?? raw?.warningMessages ?? [],
  };
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
  normalizedText: string;
}

// ─── テキスト正規化 ───────────────────────────────────────────

function cl(line: string): string {
  return line.replace(/\s+/g, "");
}

function compressAll(text: string): string {
  return text.replace(/\s+/g, "");
}

function buildLines(rawText: string): { lines: string[]; compressed: string[] } {
  const rawLines = rawText.split(/\r?\n/);
  const lines = rawLines.map((l) => l.trim()).filter((l) => l.length > 0);
  const compressed = lines.map(cl);
  return { lines, compressed };
}

// ─── 書類種別 ────────────────────────────────────────────────

function detectDocumentType(compressed: string): string {
  if (/発注書|注文書/.test(compressed)) return "発注書・注文書";
  if (/見積書|見積もり/.test(compressed)) return "見積書";
  if (/請求書/.test(compressed)) return "請求書";
  if (/領収書/.test(compressed)) return "領収書";
  return "";
}

// ─── インボイス登録番号（最初に抽出して金額除外に使う）────────

interface InvoiceNumber {
  full: string;
  digits: string;
}

function findInvoiceRegistrationNumbers(rawText: string): InvoiceNumber[] {
  const seen = new Set<string>();
  const results: InvoiceNumber[] = [];
  // T followed by 10-15 digits (with possible spaces between digits from OCR)
  const pattern = /T[\s　]*([\d][\d\s　]{8,14}[\d])/g;
  let m;
  while ((m = pattern.exec(rawText)) !== null) {
    const digits = m[1].replace(/\s+/g, "");
    if (digits.length >= 10 && digits.length <= 15) {
      const full = "T" + digits;
      if (!seen.has(full)) {
        seen.add(full);
        results.push({ full, digits });
      }
    }
  }
  // Also try compressed text to catch space-free matches
  const comp = compressAll(rawText);
  const pattern2 = /T(\d{10,15})/g;
  while ((m = pattern2.exec(comp)) !== null) {
    const full = "T" + m[1];
    if (!seen.has(full)) {
      seen.add(full);
      results.push({ full, digits: m[1] });
    }
  }
  return results;
}

// ─── 除外数字セット（インボイス番号・電話・郵便番号） ──────────

function buildExclusionDigits(
  rawText: string,
  invoices: InvoiceNumber[]
): Set<string> {
  const excluded = new Set<string>();
  // Invoice digit sequences
  for (const inv of invoices) {
    excluded.add(inv.digits);
    // Partial prefixes/suffixes in case OCR clips a digit
    if (inv.digits.length > 3) {
      excluded.add(inv.digits.slice(1));
      excluded.add(inv.digits.slice(0, -1));
    }
  }
  // Phone numbers: 0X-XXXX-XXXX patterns
  const phonePattern = /0\d{1,3}[-\s]?\d{2,4}[-\s]?\d{4}/g;
  let m;
  while ((m = phonePattern.exec(rawText)) !== null) {
    excluded.add(m[0].replace(/[^\d]/g, ""));
  }
  // Postal codes: 123-4567
  const postalPattern = /\d{3}[-]\d{4}/g;
  while ((m = postalPattern.exec(rawText)) !== null) {
    excluded.add(m[0].replace(/[^\d]/g, ""));
  }
  return excluded;
}

// ─── 金額バリデーション ───────────────────────────────────────

function isValidAmountNumber(numStr: string, excludedDigits: Set<string>): boolean {
  const n = numStr.replace(/,/g, "");
  if (!n || !/^\d+$/.test(n)) return false;
  // 10桁以上 = インボイス番号・電話番号・顧客番号等
  if (n.length >= 10) return false;
  // 2桁以下は短すぎる
  if (n.length < 3) return false;
  // 除外セットに含まれる
  if (excludedDigits.has(n)) return false;
  const val = parseInt(n, 10);
  if (val <= 0) return false;
  // 10億以上は異常
  if (val >= 1_000_000_000) return false;
  return true;
}

// ─── 金額候補（カテゴリ高・中のみ、除外セット適用）────────────

const AMOUNT_HIGH_LABELS = [
  "税抜発注金額", "税込発注金額", "発注金額", "御請求金額", "請求金額",
  "請負金額", "合計金額", "税込合計", "受注金額",
];
const AMOUNT_MED_LABELS = ["合計", "金額", "小計"];

function findAmountCandidates(
  rawText: string,
  lines: string[],
  compressed: string[],
  excludedDigits: Set<string>
): AmountCandidate[] {
  const seen = new Set<string>();
  const results: AmountCandidate[] = [];

  function add(numStr: string, reason: string, confidence: "high" | "medium" | "low") {
    const n = numStr.replace(/,/g, "");
    if (!isValidAmountNumber(numStr, excludedDigits)) return;
    if (seen.has(n)) return;
    seen.add(n);
    const formatted = parseInt(n, 10).toLocaleString("ja-JP");
    results.push({ value: formatted, normalizedValue: n, reason, confidence });
  }

  // HIGH: ラベル付き行での抽出
  for (let i = 0; i < lines.length; i++) {
    const c = compressed[i];
    for (const label of AMOUNT_HIGH_LABELS) {
      if (c.includes(label)) {
        for (let offset = 0; offset <= 2 && i + offset < lines.length; offset++) {
          const nums = compressed[i + offset].match(/[\d,]+/g) ?? [];
          for (const n of nums) add(n, `${label}付近`, "high");
        }
      }
    }
    for (const label of AMOUNT_MED_LABELS) {
      if (c.includes(label)) {
        for (let offset = 0; offset <= 1 && i + offset < lines.length; offset++) {
          const nums = compressed[i + offset].match(/[\d,]+/g) ?? [];
          for (const n of nums) add(n, `${label}付近`, "medium");
        }
      }
    }
  }

  // HIGH: 通貨記号付き
  const currencyPats: [RegExp, string][] = [
    [/[¥￥]([\d,]+)/g, "通貨記号付近"],
    [/([\d,]+)円/g, "円表記"],
  ];
  for (const [pat, reason] of currencyPats) {
    let m;
    pat.lastIndex = 0;
    while ((m = pat.exec(rawText)) !== null) add(m[1], reason, "high");
  }

  // MEDIUM: カンマ区切り数字
  const commaPattern = /\d{1,3}(?:,\d{3})+/g;
  let m;
  while ((m = commaPattern.exec(rawText)) !== null) add(m[0], "カンマ区切り数字", "medium");

  return results
    .sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      if (order[a.confidence] !== order[b.confidence]) {
        return order[a.confidence] - order[b.confidence];
      }
      return parseInt(b.normalizedValue, 10) - parseInt(a.normalizedValue, 10);
    })
    .slice(0, 12);
}

// ─── 日付候補（カテゴリ別）────────────────────────────────────

interface RawDateHit {
  value: string;
  raw: string;
  year: number;
  lineIndex: number;
  ctx: string;
}

const DATE_PATS: RegExp[] = [
  /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/,
  /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
];

function extractAllDates(lines: string[], compressed: string[]): RawDateHit[] {
  const seen = new Set<string>();
  const results: RawDateHit[] = [];
  for (let i = 0; i < lines.length; i++) {
    for (const pat of DATE_PATS) {
      // Try both raw line and compressed
      const sources = [lines[i], compressed[i]];
      for (const src of sources) {
        const m = src.match(pat);
        if (!m) continue;
        const year = parseInt(m[1], 10);
        const month = parseInt(m[2], 10);
        const day = parseInt(m[3], 10);
        if (month < 1 || month > 12 || day < 1 || day > 31) continue;
        const value = `${m[1]}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
        if (seen.has(value)) break;
        seen.add(value);
        const ctxSlice = compressed
          .slice(Math.max(0, i - 2), Math.min(compressed.length, i + 3))
          .join("");
        results.push({ value, raw: m[0], year, lineIndex: i, ctx: ctxSlice });
        break;
      }
    }
  }
  return results;
}

const ORDER_KW = ["発注日", "注文日", "受注日"];
const BUILD_KW = ["建方予定日", "建方", "施工予定日", "着工予定日", "着工日"];
const PERIOD_KW = ["工期間", "工期", "期間"];

function categorizeDates(hits: RawDateHit[]): {
  orderDates: DateCandidate[];
  buildDates: DateCandidate[];
  workPeriods: DateCandidate[];
} {
  const orderDates: DateCandidate[] = [];
  const buildDates: DateCandidate[] = [];
  const workPeriods: DateCandidate[] = [];

  for (const hit of hits) {
    // 年が不合理な場合はスキップ（住所番地由来の誤認識）
    if (hit.year < 2000 || hit.year > 2050) continue;
    const confidence: DateCandidate["confidence"] = "high";

    let placed = false;
    if (ORDER_KW.some((kw) => hit.ctx.includes(kw))) {
      orderDates.push({ value: hit.value, raw: hit.raw, reason: "発注日付近", confidence });
      placed = true;
    }
    if (BUILD_KW.some((kw) => hit.ctx.includes(kw))) {
      buildDates.push({ value: hit.value, raw: hit.raw, reason: "建方予定日付近", confidence });
      placed = true;
    }
    if (PERIOD_KW.some((kw) => hit.ctx.includes(kw))) {
      workPeriods.push({ value: hit.value, raw: hit.raw, reason: "工期付近", confidence });
      placed = true;
    }
    if (!placed) {
      // 未分類は発注日候補として medium で追加
      orderDates.push({
        value: hit.value, raw: hit.raw,
        reason: "日付候補（用途不明）",
        confidence: "medium",
      });
    }
  }

  return { orderDates, buildDates, workPeriods };
}

// ─── 住所候補 ────────────────────────────────────────────────

const PREF_WORDS = ["都", "道", "府", "県"];
const CITY_WORDS = ["市", "区", "町", "村"];
const SITE_KW = ["現場所在地", "現場", "所在地", "施工場所", "工事場所"];
const RCPT_KW = ["御中", "様", "宛先", "送付先"];

function findAddressCandidates(lines: string[], compressed: string[]): AddressCandidate[] {
  const seen = new Set<string>();
  const results: AddressCandidate[] = [];

  for (let i = 0; i < lines.length; i++) {
    const c = compressed[i];
    const hasPref = PREF_WORDS.some((p) => c.includes(p));
    const hasCity = CITY_WORDS.some((w) => c.includes(w));
    if (!hasPref || !hasCity || c.length < 7 || c.length > 80) continue;
    if (seen.has(c)) continue;
    seen.add(c);

    const ctx = compressed.slice(Math.max(0, i - 3), i + 2).join("");
    let reason = "住所候補";
    let confidence: AddressCandidate["confidence"] = "medium";

    if (SITE_KW.some((kw) => ctx.includes(kw))) {
      reason = "現場所在地の可能性";
      confidence = "high";
    } else if (RCPT_KW.some((kw) => ctx.includes(kw))) {
      reason = "宛先住所の可能性";
    } else if (ctx.includes("発注者") || ctx.includes("元請")) {
      reason = "発注者住所の可能性";
    }

    results.push({ value: c, reason, confidence });
  }

  return results.slice(0, 6);
}

// ─── 会社名候補 ──────────────────────────────────────────────

const COMPANY_KW = [
  "株式会社", "（株）", "(株)", "合同会社", "有限会社",
  "工務店", "建設", "リフォーム", "設計事務所", "商店", "REVO",
];

function findClientNameCandidates(lines: string[], compressed: string[]): TextCandidate[] {
  const seen = new Set<string>();
  const results: TextCandidate[] = [];
  for (let i = 0; i < lines.length; i++) {
    const c = compressed[i];
    if (c.length < 3 || c.length > 50) continue;
    if (!COMPANY_KW.some((kw) => c.includes(kw))) continue;
    if (seen.has(c)) continue;
    seen.add(c);
    const ctx = compressed.slice(Math.max(0, i - 2), i + 3).join("");
    const reason = ctx.includes("発注者") || ctx.includes("元請")
      ? "元請名の可能性（高）"
      : "会社名・工務店名候補";
    const confidence: TextCandidate["confidence"] = ctx.includes("発注者") ? "high" : "medium";
    results.push({ value: c, reason, confidence });
  }
  return results.slice(0, 6);
}

function findRecipientCandidates(lines: string[], compressed: string[]): TextCandidate[] {
  const seen = new Set<string>();
  const results: TextCandidate[] = [];
  for (let i = 0; i < Math.min(compressed.length, 30); i++) {
    const c = compressed[i];
    if ((c.includes("御中") || (c.includes("様") && c.length <= 25)) && !seen.has(c)) {
      seen.add(c);
      results.push({ value: c, reason: "宛先候補（御中・様）", confidence: "medium" });
    }
  }
  return results.slice(0, 4);
}

// ─── お客様名候補 ─────────────────────────────────────────────

function findCustomerNameCandidates(compressed: string[]): TextCandidate[] {
  const seen = new Set<string>();
  const results: TextCandidate[] = [];
  for (const c of compressed) {
    const m = c.match(/([^\s\n]{1,15})様/);
    if (m && m[1] !== "御中" && m[1].length >= 1 && !seen.has(m[0])) {
      seen.add(m[0]);
      results.push({ value: m[0], reason: "お客様名候補（様）", confidence: "medium" });
    }
  }
  return results.slice(0, 3);
}

// ─── 工事内容候補 ─────────────────────────────────────────────

const WORK_KW = [
  "クロス", "CF", "フロアタイル", "フロア", "工事", "施工",
  "アクセント", "器具", "階段", "トイレ", "内装", "壁紙",
  "ビニル", "長尺", "カーペット", "補修", "張替", "貼替",
];

function findWorkDescriptionCandidates(compressed: string[]): TextCandidate[] {
  const seen = new Set<string>();
  const results: TextCandidate[] = [];
  for (const c of compressed) {
    if (c.length < 2 || c.length > 60) continue;
    if (!WORK_KW.some((kw) => c.includes(kw))) continue;
    if (seen.has(c)) continue;
    seen.add(c);
    results.push({ value: c, reason: "工事内容候補", confidence: "medium" });
  }
  return results.slice(0, 8);
}

// ─── 支払条件候補 ─────────────────────────────────────────────

function findPaymentTermCandidates(compressed: string[]): TextCandidate[] {
  const seen = new Set<string>();
  const results: TextCandidate[] = [];
  const kws = ["締め", "払い", "支払", "精算", "請求サイト", "支払条件", "支払サイト"];
  for (const c of compressed) {
    if (kws.some((kw) => c.includes(kw)) && c.length <= 40 && !seen.has(c)) {
      seen.add(c);
      results.push({ value: c, reason: "支払条件候補", confidence: "medium" });
    }
  }
  return results.slice(0, 3);
}

// ─── 発注番号候補 ─────────────────────────────────────────────

function findOrderNumberCandidates(rawText: string): TextCandidate[] {
  const seen = new Set<string>();
  const results: TextCandidate[] = [];
  const allComp = compressAll(rawText);
  const patterns = [
    /(?:発注番号|注文番号|受注番号)[^\d]{0,5}([\w\-]+)/,
    /(?:発注No|注文No|受注No)[.:]?\s*([\w\-]+)/i,
  ];
  for (const p of patterns) {
    const m = allComp.match(p);
    if (m && !seen.has(m[1])) {
      seen.add(m[1]);
      results.push({ value: m[1], reason: "発注番号候補", confidence: "medium" });
    }
  }
  return results.slice(0, 3);
}

// ─── メイン関数 ──────────────────────────────────────────────

export function structureOcrText(rawText: string): AiStructuredResult {
  const { lines, compressed } = buildLines(rawText);
  const allComp = compressAll(rawText);
  const warnings: string[] = [];

  // 1. 書類種別
  const documentType = detectDocumentType(allComp);

  // 2. インボイス登録番号を最初に抽出（金額候補の除外セット構築に使う）
  const invoiceNumbers = findInvoiceRegistrationNumbers(rawText);
  const excludedDigits = buildExclusionDigits(rawText, invoiceNumbers);

  const invoiceRegistrationNumberCandidates: TextCandidate[] = invoiceNumbers.map((inv) => ({
    value: inv.full,
    reason: "インボイス登録番号（T番号）",
    confidence: "high" as const,
  }));

  // 3. 金額候補（除外セット適用 → インボイス番号・電話番号等を絶対に含まない）
  const amountCandidates = findAmountCandidates(rawText, lines, compressed, excludedDigits);

  // 4. 日付候補（カテゴリ別）
  const dateHits = extractAllDates(lines, compressed);
  const { orderDates, buildDates, workPeriods } = categorizeDates(dateHits);

  // 5. 住所候補
  const siteAddressCandidates = findAddressCandidates(lines, compressed);

  // 6. 会社名候補
  const clientNameCandidates = findClientNameCandidates(lines, compressed);

  // 7. 宛先候補
  const recipientNameCandidates = findRecipientCandidates(lines, compressed);

  // 8. お客様名候補
  const customerNameCandidates = findCustomerNameCandidates(compressed);

  // 9. 工事内容候補
  const workDescriptionCandidates = findWorkDescriptionCandidates(compressed);

  // 10. 支払条件候補
  const paymentTermCandidates = findPaymentTermCandidates(compressed);

  // 11. 発注番号候補
  const orderNumberCandidates = findOrderNumberCandidates(rawText);

  // 警告
  if (clientNameCandidates.length > 1) {
    warnings.push("会社名候補が複数あります。元請名を原本で確認してください。");
  }
  if (siteAddressCandidates.length > 1) {
    warnings.push("住所候補が複数あります。現場住所を原本で確認してください。");
  }
  if (dateHits.filter((d) => d.year >= 2000 && d.year <= 2050).length > 4) {
    warnings.push("日付候補が多くあります。発注日・工期を原本で確認してください。");
  }
  if (amountCandidates.length === 0) {
    warnings.push("金額候補が見つかりませんでした。手動で入力してください。");
  }

  const candidates: AiCandidates = {
    clientNameCandidates,
    recipientNameCandidates,
    customerNameCandidates,
    siteAddressCandidates,
    orderDateCandidates: orderDates,
    buildScheduleDateCandidates: buildDates,
    workPeriodCandidates: workPeriods,
    orderNumberCandidates,
    amountCandidates,
    invoiceRegistrationNumberCandidates,
    workDescriptionCandidates,
    paymentTermCandidates,
    warningMessages: warnings,
  };

  // ─── ベスト単一値（下位互換用） ────────────────────────────
  const orderDate = orderDates.find((d) => d.confidence === "high")?.value
    ?? orderDates[0]?.value ?? "";
  const buildScheduleDate = buildDates[0]?.value ?? "";
  const workPeriod = workPeriods.length >= 2
    ? `${workPeriods[0].value} ～ ${workPeriods[1].value}`
    : workPeriods[0]?.value ?? "";
  const orderAmount = amountCandidates[0]?.normalizedValue ?? "";
  const workDescription = workDescriptionCandidates[0]?.value ?? "";
  const clientName = clientNameCandidates[0]?.value ?? "";
  const recipientName = recipientNameCandidates[0]?.value ?? "";
  const invoiceRegistrationNumber = invoiceRegistrationNumberCandidates[0]?.value ?? "";
  const siteAddress = siteAddressCandidates[0]?.value ?? "";
  const customerName = customerNameCandidates[0]?.value ?? "";
  const paymentTerm = paymentTermCandidates[0]?.value ?? "";
  const orderNumber = orderNumberCandidates[0]?.value ?? "";

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
    candidates,
    warnings,
    rawOcrText: rawText,
    normalizedText: lines.join("\n"),
  };
}
