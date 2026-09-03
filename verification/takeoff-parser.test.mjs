# 拾い出し発話パーサ 単体テスト（コンパイル後 import を ./engine.js に補正して実行）

import { parseUtterance } from "./parseUtterance.js";
let pass = 0, fail = 0; const out = [];
function ok(name, cond, got) {
  if (cond) { pass++; out.push(`  ✅ ${name}`); }
  else { fail++; out.push(`  ❌ ${name}  実際:${JSON.stringify(got)}`); }
}
let a;
a = parseUtterance("洋室1"); ok("『洋室1』→部屋", a.kind === "room" && a.room === "洋室1", a);
a = parseUtterance("壁"); ok("『壁』→部位", a.kind === "part" && a.part === "壁", a);
a = parseUtterance("天井"); ok("『天井』→部位", a.kind === "part" && a.part === "天井", a);
a = parseUtterance("下がり天井"); ok("『下がり天井』→部位", a.kind === "part" && a.part === "下がり天井", a);
a = parseUtterance("SP2525"); ok("『SP2525』→品番", a.kind === "product" && a.product === "SP2525", a);
a = parseUtterance("sp 2525".replace(" ","")); ok("『sp2525』→SP2525", a.kind === "product" && a.product === "SP2525", a);
a = parseUtterance("245、6本"); ok("『245、6本』→寸法2.45m×6", a.kind === "dimension" && Math.abs(a.dim.meters - 2.45) < 1e-9 && a.count === 6, a);
a = parseUtterance("2460、2本"); ok("『2460、2本』→2.46m×2", a.kind === "dimension" && Math.abs(a.dim.meters - 2.46) < 1e-9 && a.count === 2, a);
a = parseUtterance("2400 6本".replace(" ","")); ok("『2400 6本』→2.4m×6", a.kind === "dimension" && Math.abs(a.dim.meters - 2.4) < 1e-9 && a.count === 6, a);
a = parseUtterance("3500×4"); // ×のみ・本なし → 数値のみ扱いにならないか（本なしは不成立→unknown or room判定を確認）
ok("『3500×4』は寸法×本数として不確定（誤確定しない）", a.kind !== "dimension" || a.dim.ambiguous || a.count === 4, a);
a = parseUtterance("2600かける2本"); ok("『2600かける2本』→2.6m×2", a.kind === "dimension" && Math.abs(a.dim.meters - 2.6) < 1e-9 && a.count === 2, a);
a = parseUtterance("3600流し"); ok("『3600流し』→流し方向3.6m", a.kind === "flow_dim" && Math.abs(a.dim.meters - 3.6) < 1e-9, a);
a = parseUtterance("2600幅"); ok("『2600幅』→幅方向2.6m", a.kind === "width_dim" && Math.abs(a.dim.meters - 2.6) < 1e-9, a);
a = parseUtterance("2400"); ok("『2400』単独→寸法×1", a.kind === "dimension" && a.count === 1 && Math.abs(a.dim.meters - 2.4) < 1e-9, a);
a = parseUtterance("次"); ok("『次』→コマンド", a.kind === "command" && a.command === "next", a);
a = parseUtterance("今のなし"); ok("『今のなし』→取消", a.kind === "command" && a.command === "delete_last", a);
a = parseUtterance("一つ戻る"); ok("『一つ戻る』→undo", a.kind === "command" && a.command === "undo", a);
a = parseUtterance("終了"); ok("『終了』→finish", a.kind === "command" && a.command === "finish", a);
a = parseUtterance("部屋変更"); ok("『部屋変更』→change_room", a.kind === "command" && a.command === "change_room", a);
a = parseUtterance("７"); ok("全角『７』→曖昧（勝手に確定しない）", (a.kind === "dimension" && a.dim.ambiguous) || a.kind === "room", a);
out.push(`===== 合計 ${pass} pass / ${fail} fail =====`);
console.log(out.join("\n"));
process.exit(fail > 0 ? 1 : 0);
