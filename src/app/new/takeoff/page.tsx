// 新UI 拾い出し（/new/takeoff）ルート。
// サーバーコンポーネントとして searchParams を解決し、初期工種を
// クライアント本体（TakeoffClient）へ渡す。searchParams を使うため
// このルートは本番でも request 時にレンダリングされ、?type= 付きURLは
// JS が動かない端末でも STEP2 の HTML が返る。

import TakeoffClient from "./TakeoffClient";
import { TAKEOFF_CONFIGS, type TakeoffType } from "../_lib/takeoff/engine";

export default async function TakeoffPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const sp = await searchParams;
  const initialType: TakeoffType | null =
    sp.type && sp.type in TAKEOFF_CONFIGS ? (sp.type as TakeoffType) : null;
  return <TakeoffClient initialType={initialType} />;
}
