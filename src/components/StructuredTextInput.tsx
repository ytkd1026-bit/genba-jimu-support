"use client";

// 構造化テキスト入力の共通コンポーネント
// 被害状況・確認した事実・推定原因・復旧方法・作業報告・学び などの
// 文章入力欄に使う。将来の音声入力追加を前提とした再利用可能な部品。
//
// 方針:
// - allowFutureVoiceInput が true の欄は、将来音声認識APIを接続する対象
//   （現時点ではバッジ表示のみで機能は持たない）
// - 数値・金額・品番・住所・電話番号・保険番号にはこの部品を使わないこと

export type StructuredTextInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allowFutureVoiceInput?: boolean;
  required?: boolean;
  /** 入力欄の行数（デフォルト2） */
  rows?: number;
};

export function StructuredTextInput({
  label,
  value,
  onChange,
  placeholder,
  allowFutureVoiceInput = false,
  required = false,
  rows = 2,
}: StructuredTextInputProps) {
  return (
    <div>
      <label className="mb-0.5 flex items-center gap-1.5 text-xs leading-[1.35] text-stone-400">
        <span>
          {label}
          {required && <span className="ml-0.5 text-red-500">＊</span>}
        </span>
        {allowFutureVoiceInput && (
          <span
            className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-400"
            title="将来のアップデートで音声入力に対応予定です"
          >
            🎤 音声対応予定
          </span>
        )}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="min-h-[44px] w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm leading-[1.5] text-stone-800 placeholder:text-stone-300 focus:border-[#8B4A3C] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#8B4A3C]/30"
      />
    </div>
  );
}
