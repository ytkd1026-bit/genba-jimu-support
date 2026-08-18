// 画面表示用の暫定改ページ。
//
// 工種の分類・並び順・小計は PDF と同じ groupLinesByCategory を使う（別ロジックにしない）。
// このファイルが持つのは「画面で何行目に改ページするか」だけ。
//
// PDFとの完全一致は求めない。一致させるのは
//   工種の順番／工種のまとまり／工種小計／諸経費が最後／総合計が最後／（続き）表示
// の6点で、改ページ位置そのものはPDFを正とする。
//
// 高さ測定エンジンは作らない。1行を1単位とし、ヘッダー・工種見出し・小計・
// 総合計がそれぞれ占める領域を単位数で見積もる簡潔な規則にしている。

import type { EstimateCategoryGroup } from "./estimateCategoryGroups";
import type { SellingLine } from "@/components/pdf/WorkEstimatePDF";
import { DEFAULT_SHEET_LAYOUT, type SheetLayout } from "./sheetLayout";

// 寸法の数値は sheetLayout.ts に集約している。ここには持たない。

/** 1ページ内に置かれる、ある工種の一部分 */
export type SheetBlock = {
  group: EstimateCategoryGroup;
  /** このページに載せる明細 */
  lines: SellingLine[];
  /** 2ページ目以降か（見出しに「（続き）」を付ける） */
  isContinuation: boolean;
  /** この工種の最終ページか（工種小計を出す） */
  showSubtotal: boolean;
};

export type SheetPage = {
  pageNumber: number;
  blocks: SheetBlock[];
  /** 帳票ヘッダーを出すか（1ページ目のみ） */
  showHeader: boolean;
  /** 全体合計を出すか（最終ページのみ） */
  showGrandTotal: boolean;
};

/**
 * 工種セクションを画面ページへ割り付ける。
 * 工種は必ず新しいページから始める（PDFと同じ扱い）。
 */
export function paginateSheet(
  groups: EstimateCategoryGroup[],
  layout: SheetLayout = DEFAULT_SHEET_LAYOUT,
): SheetPage[] {
  const {
    pageCapacity: PAGE_CAPACITY,
    headerUnits: HEADER_UNITS,
    headingUnits: HEADING_UNITS,
    subtotalUnits: SUBTOTAL_UNITS,
    grandTotalUnits: GRAND_TOTAL_UNITS,
  } = layout;

  const pages: SheetPage[] = [];
  let current: SheetPage | null = null;
  let used = 0;

  const newPage = (showHeader: boolean) => {
    current = { pageNumber: pages.length + 1, blocks: [], showHeader, showGrandTotal: false };
    pages.push(current);
    used = showHeader ? HEADER_UNITS : 0;
  };

  groups.forEach((group, gi) => {
    const isLastGroup = gi === groups.length - 1;
    let remaining = [...group.lines];
    let isContinuation = false;

    // 工種はページの先頭から始める
    newPage(pages.length === 0);

    while (remaining.length > 0) {
      const free = PAGE_CAPACITY - used - HEADING_UNITS;

      // 見出しすら置けないなら次のページへ
      if (free <= 0) {
        newPage(false);
        continue;
      }

      // 残り全部と小計（最終工種なら総合計も）が収まるか
      const tailUnits = SUBTOTAL_UNITS + (isLastGroup ? GRAND_TOTAL_UNITS : 0);
      const fitsAll = remaining.length + tailUnits <= free;

      const take = fitsAll ? remaining.length : Math.max(1, free);
      const lines = remaining.slice(0, take);
      remaining = remaining.slice(take);

      current!.blocks.push({
        group,
        lines,
        isContinuation,
        showSubtotal: remaining.length === 0 && fitsAll,
      });
      used += HEADING_UNITS + lines.length + (remaining.length === 0 && fitsAll ? SUBTOTAL_UNITS : 0);
      isContinuation = true;

      // 全部載せたが小計が入らなかった場合は、小計だけ次ページへ送る
      if (remaining.length === 0 && !fitsAll) {
        newPage(false);
        current!.blocks.push({ group, lines: [], isContinuation: true, showSubtotal: true });
        used += HEADING_UNITS + SUBTOTAL_UNITS;
      }

      if (remaining.length > 0) newPage(false);
    }
  });

  // 全体合計は最終ページに置く。入らなければページを足す。
  if (pages.length === 0) {
    newPage(true);
  }
  const last = pages[pages.length - 1];
  if (used + GRAND_TOTAL_UNITS > PAGE_CAPACITY) {
    newPage(false);
  }
  pages[pages.length - 1].showGrandTotal = true;
  void last;

  return pages;
}
