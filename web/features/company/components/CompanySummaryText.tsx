import { SUMMARY_SOURCE, type SummaryView } from "../lib/summary";

/**
 * 会社の説明文と出典の1行（C7・Issue #161）。母集団の会社（`CompanyDetail`）と、ランキングの外の
 * 会社（`UnrankedCompanyDetail`・D9・D11）の両方が使う。**説明文の無い会社では呼ばない**（AC-21）。
 */
export function CompanySummaryText({ summary }: { summary: SummaryView }) {
  return (
    <div className="col-span-2 flex max-w-2xl flex-col gap-1 sm:col-span-1 sm:col-start-2">
      <p className="text-muted-foreground text-sm leading-relaxed">{summary.text}</p>
      {/*
        要約であることと出典（AC-22）。**決算期を書かない**——企業詳細の決算期は
        Q&A・要約・給与の決定方針の各節の説明の先頭と決まっている（S3・#134。
        C7 の時点では「有価証券報告書の実測値（2026年3月期）」の見出しと重なった）。
        **同じ断りも1画面に2回置かない**ので、下の Q&A にはこの文を重ねていない
        （Issue #128 と同じ扱い）。
      */}
      <p className="text-muted-foreground text-xs">
        {SUMMARY_SOURCE}（
        <a href="/about#company-summary" className="text-primary underline">
          要約の作り方
        </a>
        ）
      </p>
    </div>
  );
}
