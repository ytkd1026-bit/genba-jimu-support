// 新UI チャットの型定義とモックデータ（UI設計用）。
// 重要: チャットは正本ではない。正本は案件DB（genba_projects_v1）。
// チャットは「案件DBへ情報を入れる入口・連絡手段」という位置づけ。
//
// 本番Migrationは今回行わない。将来テーブル化する場合の想定構造:
//   chat_rooms / chat_members / messages / message_attachments / message_reads
// これらは下記 interface に対応する。承認前に破壊的DB変更はしない。

import type { ProjectStatus } from "@/app/utils/projects";

/** 将来 chat_rooms 相当 */
export interface ChatRoom {
  id: string;
  /** 元請・顧客名 */
  counterparty: string;
  /** 関連案件（正本は案件DB。ここは参照用スナップショット） */
  relatedProject: RelatedProjectRef | null;
  lastMessage: string;
  lastAt: string;      // 表示用日時（例 "9:24" / "昨日"）
  unreadCount: number;
}

/** 将来 messages 相当 */
export interface ChatMessage {
  id: string;
  roomId: string;
  /** "self" = 自社送信、"other" = 相手 */
  from: "self" | "other";
  senderName: string;
  body: string;
  at: string; // 表示用時刻
}

/** 会話に紐づく案件カード（案件DBの参照。将来は projectId で解決する） */
export interface RelatedProjectRef {
  projectId: string;
  projectName: string;
  status: ProjectStatus;
  estimateState: string; // 例: 送付済 / 未作成
  constructionState: string;
  invoiceState: string;
}

// ─── モックデータ（設計プレビュー用。実データではない） ──────────
export const MOCK_ROOMS: ChatRoom[] = [
  {
    id: "room-1",
    counterparty: "株式会社ABC",
    relatedProject: {
      projectId: "REV-2026-0001",
      projectName: "○○マンション 502号室 クロス貼替",
      status: "submitted",
      estimateState: "送付済",
      constructionState: "予定",
      invoiceState: "未作成",
    },
    lastMessage: "明日の鍵ですが管理人預けです",
    lastAt: "9:24",
    unreadCount: 2,
  },
  {
    id: "room-2",
    counterparty: "田中工務店",
    relatedProject: {
      projectId: "REV-2026-0002",
      projectName: "△△邸 CF貼替",
      status: "in_progress",
      estimateState: "承認済",
      constructionState: "施工中",
      invoiceState: "未作成",
    },
    lastMessage: "本日分の写真送りました。ご確認ください。",
    lastAt: "昨日",
    unreadCount: 0,
  },
  {
    id: "room-3",
    counterparty: "山本不動産 管理部",
    relatedProject: {
      projectId: "REV-2026-0003",
      projectName: "□□店舗 床補修",
      status: "completed",
      estimateState: "承認済",
      constructionState: "完了",
      invoiceState: "未作成",
    },
    lastMessage: "請求書の発行お願いできますか？",
    lastAt: "月曜",
    unreadCount: 1,
  },
];

export const MOCK_MESSAGES: Record<string, ChatMessage[]> = {
  "room-1": [
    { id: "m1", roomId: "room-1", from: "other", senderName: "株式会社ABC 佐藤", body: "先日はお見積ありがとうございました。", at: "9:10" },
    { id: "m2", roomId: "room-1", from: "self",  senderName: "自社",            body: "こちらこそありがとうございます。明日9時から入らせていただきます。", at: "9:18" },
    { id: "m3", roomId: "room-1", from: "other", senderName: "株式会社ABC 佐藤", body: "明日の鍵ですが管理人預けです", at: "9:24" },
  ],
};
