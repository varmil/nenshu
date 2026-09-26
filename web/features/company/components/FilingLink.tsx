import { ExternalLink, FileText } from "lucide-react";
import { edinetDocumentUrl } from "@/lib/data/sources";

/**
 * 有報への直リンク（C13・Issue #814、`docs/company/spec.md` 1.20・AC-31）。
 *
 * **実測値の4項目の下辺に付ける帯**（Claude Design の案 D）。4項目の枠の続きとして描き、
 * どの数字の出典かを形で示す——枠の側は下の角を丸めず、帯が下の角を持つ。C16（#838）で
 * 4項目を Q&A に作り替えたので、いまは「年収に関するQ&A」の4問の枠の下辺に付く
 * （`ActualsQaSection`）。
 *
 * - **帯全体を1つのリンクにする。** 右の「EDINETで開く」だけをリンクにすると、モバイルで
 *   押せる範囲が文字の大きさぶんしかない。高さは `min-h-11`（44px）
 * - **決算期を書かない。** 企業詳細の決算期は同じ節の Q&A の説明と要約の説明の2か所と決まって
 *   いる（`docs/site-chrome/spec.md` 5.1）
 * - **社名も書かない。** 真上の質問と回答に社名が並んでいるうえ、長い社名だとモバイルで1行に
 *   収まらない
 * - 別タブで開く（読者はページの数字と書類を見比べる）。`nofollow` は付けない——公的な一次情報で、
 *   「このページの出典」のリンクと同じ扱い
 */
export function FilingLink({ docId }: { docId: string }) {
  return (
    <a
      href={edinetDocumentUrl(docId)}
      target="_blank"
      rel="noreferrer"
      data-testid="company-filing"
      className="bg-muted border-border flex min-h-11 items-center justify-between gap-3 rounded-b-lg border border-t-0 px-3 py-2"
    >
      <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
        <FileText aria-hidden="true" className="size-3.5 flex-none" />
        この会社の有価証券報告書
      </span>
      <span className="text-primary inline-flex flex-none items-center gap-1 text-[13px] font-semibold underline underline-offset-2">
        EDINETで開く
        <ExternalLink aria-hidden="true" className="size-3 flex-none" />
      </span>
    </a>
  );
}
