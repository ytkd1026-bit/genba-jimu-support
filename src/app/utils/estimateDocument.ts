// 提出用 見積帳票の共通データモデル
//
// 目的: 見積書プレビュー（HTML）と見積書PDFで「同じデータ・同じ帳票定義」を使い、
// 「プレビューで見た内容 = 発行されたPDF」を保証する。
//
// 原価・粗利の遮断はこの型で行う。入力は SellingLine（原価フィールドを持たない型）だけで、
// この型にも原価・粗利・内部管理の項目は一切存在しない。CSSでの非表示ではなく、
// PDF へ渡すデータ自体から除外する。

import type { SellingLine } from "@/components/pdf/WorkEstimatePDF";
import type { CompanyInfoForPdf } from "./companySettings";
import {
  calculateTaxBreakdown,
  normalizeTaxType,
  normalizeTaxRate,
  taxTypeLabel,
  type TaxBreakdown,
} from "./taxCalculation";

/** 帳票に印字する明細1行（提出用のみ） */
export type EstimateDocumentLine = {
  no: number;
  category: string;
  workName: string;
  workDescription: string;
  location: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  tax: number;
  note: string;
};

/**
 * 見積書の書式。案件ごとに職人が選ぶ（REVOが自動で決めない）。
 *  - "single"     原状回復・単票型：1枚で工事全体が分かる（賃貸原状回復・退去修繕など）
 *  - "supervised" 工事監督・リノベーション型：表紙／工事内訳書／工種別内訳明細書の3部構成
 */
export type EstimateFormType = "single" | "supervised";

export const ESTIMATE_FORM_LABELS: Record<EstimateFormType, string> = {
  single: "原状回復・単票",
  supervised: "工事監督・リノベーション",
};

/** 工種（大分類）ごとのまとまり。単票型の頭出しと、内訳書・内訳明細書の親行に使う */
export type EstimateDocumentGroup = {
  /** 大分類記号（A, B, C …）。先に現れた工種から順に振る */
  code: string;
  /** 工種名。未入力の明細は「その他」にまとめる */
  label: string;
  lines: EstimateDocumentLine[];
  /** 税抜の小計 */
  subtotal: number;
};

/** 帳票1枚ぶんの内容（提出用のみ） */
export type EstimateDocument = {
  title: string;
  estimateNo: string;
  createdDate: string;
  validUntil: string;
  submitTo: string;
  projectName: string;
  siteAddress: string;
  projectId: string;
  /** 物件名・号室（単票型のヘッダーに出す。案件の識別情報） */
  propertyName: string;
  roomNumber: string;
  company: CompanyInfoForPdf;
  lines: EstimateDocumentLine[];
  /** 工種（大分類）ごとのまとまり。lines と同じ明細を並べ替えずに束ねたもの */
  groups: EstimateDocumentGroup[];
  breakdown: TaxBreakdown;
  remarks: string[];
};

/**
 * 帳票に印字する単位へ正規化する。
 * 組文字（㎡ 等）は環境によって字形が欠けるため、帳票では安全な表記へ置き換える。
 * プレビューとPDFが同じ表記になるよう、変換はこの帳票モデル側で1回だけ行う。
 */
export function printableUnit(unit: string): string {
  return unit
    .replace(/㎡/g, "m2")
    .replace(/㎥/g, "m3")
    .replace(/㍍/g, "m")
    .replace(/㎞/g, "km")
    .replace(/㎝/g, "cm")
    .replace(/㎜/g, "mm")
    .replace(/㎏/g, "kg")
    .replace(/㍑/g, "L");
}

/** 大分類記号（A, B, … Z, AA, AB …） */
function groupCode(index: number): string {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/** 明細の消費税（表示用・その行の税率のみ）。合計は breakdown 側で税率別に集計する */
function lineTax(line: SellingLine): number {
  if (normalizeTaxType(line.taxType) !== "taxable") return 0;
  return Math.floor((line.sellingAmount * normalizeTaxRate(line.taxRate)) / 100);
}

/** 備考へ付ける税区分マーク（課税10%は既定のため付けない） */
function taxNoteMark(line: SellingLine): string {
  const type = normalizeTaxType(line.taxType);
  const rate = normalizeTaxRate(line.taxRate);
  if (type === "taxable" && rate === 10) return "";
  if (type === "taxable") return `課税${rate}%`;
  return taxTypeLabel(type);
}

function joinLocation(line: SellingLine): string {
  if (line.location1 && line.location2) return `${line.location1} / ${line.location2}`;
  return line.location1 || line.location2 || "";
}

/**
 * 保存済み見積の createdAt（toLocaleString("ja-JP") 形式：例 "2026/9/6 4:30:00"）を
 * 帳票の作成日表記 "YYYY/MM/DD" へ整える。保存時点の日付をそのまま使うため、
 * 同じ版を後から再発行しても作成日は変わらない。
 */
export function formatDocumentDate(raw: string): string {
  const datePart = (raw || "").trim().split(/[\s\u3000]/)[0];
  const m = datePart.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!m) return datePart;
  return `${m[1]}/${m[2].padStart(2, "0")}/${m[3].padStart(2, "0")}`;
}

/** 作成日（YYYY/MM/DD）から有効期限（既定30日後）を求める */
export function defaultValidUntil(createdSlash: string, days = 30): string {
  const [y, m, d] = createdSlash.split("/").map((v) => parseInt(v, 10));
  if (!y || !m || !d) return "";
  const dt = new Date(y, m - 1, d + days);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}/${mm}/${dd}`;
}

/** REVO固定書式の既定の備考・条件 */
export const DEFAULT_ESTIMATE_REMARKS = [
  "本見積書の有効期限は上記のとおりです。",
  "記載のない工事・追加工事は別途お見積りとなります。",
  "工程・数量の変更が生じた場合は改めてご相談させていただきます。",
];

/**
 * 提出用の明細（原価を持たない SellingLine）から帳票モデルを組み立てる。
 * 税計算は共通の calculateTaxBreakdown へ委譲し、画面・プレビュー・PDFで同一結果にする。
 */
export function buildEstimateDocument(input: {
  title: string;
  estimateNo: string;
  createdDate: string;
  validUntil?: string;
  submitTo: string;
  projectName: string;
  siteAddress: string;
  projectId: string;
  propertyName?: string;
  roomNumber?: string;
  company: CompanyInfoForPdf;
  lines: SellingLine[];
  /** 保存済みの税内訳（版のスナップショット）。渡された場合はそれを正本とする */
  breakdown?: TaxBreakdown;
  remarks?: string[];
}): EstimateDocument {
  const lines: EstimateDocumentLine[] = input.lines.map((l, i) => ({
    no: i + 1,
    category: l.category,
    workName: l.workName,
    workDescription: l.workDescription,
    location: joinLocation(l),
    quantity: l.quantity,
    unit: printableUnit(l.unit),
    unitPrice: l.sellingUnitPrice,
    amount: l.sellingAmount,
    tax: lineTax(l),
    note: [l.note, taxNoteMark(l)].filter(Boolean).join(" / "),
  }));

  const breakdown =
    input.breakdown ??
    calculateTaxBreakdown(
      input.lines.map((l) => ({
        amount: l.sellingAmount,
        taxType: normalizeTaxType(l.taxType),
        taxRate: normalizeTaxRate(l.taxRate),
      })),
    );

  // 工種（大分類）ごとに束ねる。並び順は明細に最初に現れた順（勝手に並べ替えない）。
  const groupMap = new Map<string, EstimateDocumentGroup>();
  for (const line of lines) {
    const label = line.category.trim() || "その他";
    let g = groupMap.get(label);
    if (!g) {
      g = { code: groupCode(groupMap.size), label, lines: [], subtotal: 0 };
      groupMap.set(label, g);
    }
    g.lines.push(line);
    g.subtotal += line.amount;
  }
  const groups = [...groupMap.values()];

  return {
    title: input.title,
    estimateNo: input.estimateNo,
    createdDate: input.createdDate,
    validUntil: input.validUntil ?? defaultValidUntil(input.createdDate),
    submitTo: input.submitTo,
    projectName: input.projectName,
    siteAddress: input.siteAddress,
    projectId: input.projectId,
    propertyName: input.propertyName ?? "",
    roomNumber: input.roomNumber ?? "",
    company: input.company,
    lines,
    groups,
    breakdown,
    remarks: input.remarks ?? DEFAULT_ESTIMATE_REMARKS,
  };
}
