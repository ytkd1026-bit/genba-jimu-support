# 拾い出し計算エンジン 単体テスト
# 実行方法:
#   npx tsc src/app/new/_lib/takeoff/engine.ts --outDir /tmp/tk --rootDir src/app/new/_lib/takeoff --target es2020 --module es2020 --moduleResolution node --skipLibCheck
#   cp verification/takeoff-engine.test.mjs /tmp/tk/run.mjs && node /tmp/tk/run.mjs

import * as E from "./engine.js";

let pass = 0, fail = 0;
const out = [];
function approx(a, b, eps = 1e-6) { return Math.abs(a - b) <= eps; }
function ok(name, cond, got, exp) {
  if (cond) { pass++; out.push(`  ✅ ${name}` + (got !== undefined ? `  → ${got}` : "")); }
  else { fail++; out.push(`  ❌ ${name}  期待:${exp}  実際:${got}`); }
}

out.push("=== 寸法パーサ（cm/mm 判定） ===");
ok("『245』→2.45m(cm)", (() => { const r = E.parseDimension("245"); return r.unitUsed === "cm" && approx(r.meters, 2.45); })(), E.parseDimension("245").meters, 2.45);
ok("『246』→2.46m(cm)", (() => { const r = E.parseDimension("246"); return r.unitUsed === "cm" && approx(r.meters, 2.46); })(), E.parseDimension("246").meters, 2.46);
ok("『2460』→2.46m(mm)", (() => { const r = E.parseDimension("2460"); return r.unitUsed === "mm" && approx(r.meters, 2.46); })(), E.parseDimension("2460").meters, 2.46);
ok("『2400』→2.4m(mm)", (() => { const r = E.parseDimension("2400"); return r.unitUsed === "mm" && approx(r.meters, 2.4); })(), E.parseDimension("2400").meters, 2.4);
ok("『245cm』→2.45m", approx(E.parseDimension("245cm").meters, 2.45), E.parseDimension("245cm").meters, 2.45);
ok("『2.4』→2.4m", approx(E.parseDimension("2.4").meters, 2.4), E.parseDimension("2.4").meters, 2.4);
ok("曖昧値『7』は確定しない(ambiguous)", E.parseDimension("7").meters === null && E.parseDimension("7").ambiguous === true, "null/ambiguous", "確認要求");

out.push("");
out.push("=== クロス：明細（丸めなし・入力のまま） ===");
ok("2.4m×6=14.4m", approx(E.calculateLength(2.4, 6), 14.4), E.calculateLength(2.4, 6), 14.4);
ok("2.6m×2=5.2m", approx(E.calculateLength(2.6, 2), 5.2), E.calculateLength(2.6, 2), 5.2);

const wpEntry = [{
  id: "e1", room: "洋室1", part: "壁", product: "SP2525",
  lines: [
    { id: "l1", dimRaw: "2400", meters: E.parseDimension("2400").meters, count: 6 },
    { id: "l2", dimRaw: "2600", meters: E.parseDimension("2600").meters, count: 2 },
  ],
}];
const wpSum = E.summarizeWallpaper(wpEntry);
ok("洋室1 壁 SP2525 合計=19.6m(丸めなし)", approx(wpSum.byProduct[0].rawTotal, 19.6), wpSum.byProduct[0].rawTotal, 19.6);

out.push("");
out.push("=== クロス：端数は『最終発注のみ』0.1m切り上げ ===");
const endEntry = [{ id: "e", room: "R", part: "壁", product: "X", lines: [{ id: "l", dimRaw: "1896", meters: E.parseDimension("1896").meters, count: 1 }] }];
const endSum = E.summarizeWallpaper(endEntry);
ok("1896mm×1 → raw 1.896m 保持", approx(endSum.byProduct[0].rawTotal, 1.896), endSum.byProduct[0].rawTotal, 1.896);
ok("→ 最終発注 1.9m", approx(endSum.byProduct[0].orderQty, 1.9), endSum.byProduct[0].orderQty, 1.9);

out.push("");
out.push("=== クロス：同一品番 全室合算 ===");
const mk = (room, m) => ({ id: room, room, part: "壁", product: "SP2525", lines: [{ id: room + "l", dimRaw: String(m), meters: m, count: 1 }] });
const multi = [mk("LDK", 10), mk("洋室1", 15), mk("洋室2", 20), mk("廊下", 15), mk("玄関", 10)];
const multiSum = E.summarizeWallpaper(multi);
ok("10+15+20+15+10 = 70.0m", approx(multiSum.byProduct[0].orderQty, 70.0), multiSum.byProduct[0].orderQty, 70.0);

out.push("");
out.push("=== クロス：ロス率は品番合算後→最終のみ切り上げ（修正版例） ===");
const lossEntries = [mk("LDK", 10.23), mk("洋室1", 15.18), mk("洋室2", 20.11)];
const lossSum = E.summarizeWallpaper(lossEntries, { SP2525: 5 });
ok("raw合計=45.52m", approx(lossSum.byProduct[0].rawTotal, 45.52), lossSum.byProduct[0].rawTotal, 45.52);
ok("ロス5%後=47.796m", approx(lossSum.byProduct[0].afterLoss, 47.796), lossSum.byProduct[0].afterLoss, 47.796);
ok("最終発注=47.8m", approx(lossSum.byProduct[0].orderQty, 47.8), lossSum.byProduct[0].orderQty, 47.8);

out.push("");
out.push("=== CF：本数/発注m/見積㎡ ===");
const cf = E.computeAreaEntry(
  { id: "c", room: "洗面室", product: "HM12001", flowM: 3.6, widthM: 2.6, materialWidthMm: 1820, lossRate: 0 },
  E.TAKEOFF_CONFIGS.cf,
);
ok("2.6÷1.82 → 必要本数2", cf.rollCount === 2, cf.rollCount, 2);
ok("発注 3.6×2 = 7.2m", approx(cf.orderValue, 7.2), cf.orderValue, 7.2);
ok("見積 3.6×2.6=9.36 → 9.4㎡", approx(cf.estimateValue, 9.4), cf.estimateValue, 9.4);

out.push("");
out.push("=== 長尺シート ===");
const ls = E.computeAreaEntry(
  { id: "s", room: "廊下", product: "LN", flowM: 5.4, widthM: 3.2, materialWidthMm: 1820, lossRate: 0 },
  E.TAKEOFF_CONFIGS.long_sheet,
);
ok("3.2÷1.82 → 2本", ls.rollCount === 2, ls.rollCount, 2);
ok("発注 5.4×2 = 10.8m", approx(ls.orderValue, 10.8), ls.orderValue, 10.8);
ok("見積 5.4×3.2 = 17.28㎡", approx(ls.estimateValue, 17.28), ls.estimateValue, 17.28);

out.push("");
out.push("=== FT ===");
const ft = E.computeAreaEntry({ id: "f", room: "居室", product: "FT", flowM: 4.2, widthM: 3.6, lossRate: 0 }, E.TAKEOFF_CONFIGS.floor_tile);
ok("4.2×3.6 = 15.12㎡", approx(ft.estimateValue, 15.12), ft.estimateValue, 15.12);

out.push("");
out.push("=== タイルカーペット（面積） ===");
const tc = E.computeAreaEntry({ id: "t", room: "事務所", product: "TC", flowM: 4.2, widthM: 3.6, lossRate: 0 }, E.TAKEOFF_CONFIGS.tile_carpet);
ok("4.2×3.6 = 15.12㎡", approx(tc.estimateValue, 15.12), tc.estimateValue, 15.12);

out.push("");
out.push(`===== 合計 ${pass} pass / ${fail} fail =====`);
console.log(out.join("\n"));
process.exit(fail > 0 ? 1 : 0);
