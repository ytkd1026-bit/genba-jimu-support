import { NextRequest, NextResponse } from "next/server";
import {
  structureOcrText,
  defaultAiCandidates,
  safeMergeCandidates,
} from "@/app/utils/aiStructuring";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const text: string = typeof body?.text === "string" ? body.text : "";

    if (!text.trim()) {
      return NextResponse.json({
        ok: false,
        error: "テキストが空です",
        candidates: defaultAiCandidates,
        warnings: ["テキストが空のため整理できませんでした。"],
      });
    }

    const result = structureOcrText(text);

    return NextResponse.json({
      ok: true,
      ...result,
      candidates: safeMergeCandidates(result.candidates),
    });
  } catch (err) {
    console.error("[structure-ocr] error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "AI整理に失敗しました",
        candidates: defaultAiCandidates,
        warnings: ["AI整理に失敗しました。ローカル候補抽出に切り替えてください。"],
      },
      { status: 500 }
    );
  }
}
