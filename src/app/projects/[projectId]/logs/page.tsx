"use client";

// 08 案件ログ（準備中）
// 型・保存層（projectLogs.ts）は実装済み。入力画面は今後のアップデートで追加する。

import { ProjectComingSoon } from "@/components/ProjectComingSoon";

export default function ProjectLogsPage() {
  return (
    <ProjectComingSoon
      active="logs"
      title="案件ログ"
      description="保険会社・元請・施主とのやり取りを記録する画面を準備中です。"
    />
  );
}
