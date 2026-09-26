import { ExternalLink } from "lucide-react";
import { analysisNote, digestNote, type AnalysisView } from "../lib/analysis";

/*
 * 有報の要約と AI 分析の2節（C10・Issue #242、アートボード 8a / 8b / 8c）。
 *
 * **どちらも島の外で描く。** `[id].astro` が名前付きスロットで `CompanyDetailIsland` に
 * 差し込むので、ここはサーバーで1度 HTML になるだけで、クライアントの JS にも props にも
 * 入らない（`lib/analysis.ts` の冒頭）。**状態を持たせないこと**——持たせても動かない。
 *
 * **2つを見分けられることが要件**（AC-29・ADR-0015 決定5）。分析は muted の面で囲い、
 * 直下に AI が書いた評価だという断りを置く。要約は白地のまま断りを置かない。2つの節は
 * ページの中で離れている（分析は平均年収カードの直後、要約は稼ぐ力の推移の後ろ）。
 */

/**
 * 「{社名}の現状と今後」。**平均年収カードの直後に置く**——「◯◯ 年収」で来た読者の答え
 * （カード）を押し下げず、数字を見た直後に「この会社はいまどうなのか」が続く。
 */
export function AnalysisSection({ name, view }: { name: string; view: AnalysisView }) {
  return (
    <section
      className="bg-muted flex flex-col rounded-xl p-3.5 sm:px-5.5 sm:py-5"
      data-testid="company-analysis"
    >
      <h2 className="text-lg font-bold">{name}の現状と今後</h2>
      <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
        {analysisNote(view.asOf)}
        <a href="/about#company-analysis" className="text-primary underline">
          要約と分析の作り方
        </a>
      </p>

      {/*
        一言は**見出しより大きくしない**（アートボード 8b の注記）。見出しと張り合うと役目が
        読めないので、強さは白地の内側カードとラベルで出し、字は本文より一段強い semibold に
        留める。
      */}
      <div className="bg-background ring-foreground/10 mt-3.5 rounded-lg px-3.5 py-3 ring-1 sm:px-4.5 sm:py-3.5">
        <p className="text-muted-foreground mb-1 text-xs font-medium">ひとことで言うと</p>
        <p className="text-sm leading-relaxed font-semibold text-pretty sm:text-[15px]">{view.headline}</p>
      </div>

      <p className="mt-3.5 text-[13px] leading-[1.85] text-pretty sm:text-sm">{view.body}</p>

      {/*
        参照した資料（ADR-0015 決定4）。**無い会社では見出しごと出さない**（2,961社中2,515社）。
        `nofollow`——2,961ページに外部リンクが載るので、評価を渡す意図の無いリンクとして示す。
        別タブで開くので `noopener` を付ける。
      */}
      {view.sources.length > 0 && (
        <div className="border-border mt-3.5 border-t pt-3">
          <h3 className="mb-1.5 text-xs font-bold">参照した資料</h3>
          <ul className="flex flex-col gap-2">
            {view.sources.map((source) => (
              <li key={source.url} className="flex flex-col gap-px">
                <a
                  href={source.url}
                  target="_blank"
                  rel="nofollow noopener"
                  className="text-primary flex gap-1 text-xs leading-normal underline"
                >
                  {source.title}
                  <ExternalLink aria-hidden="true" className="mt-0.5 size-3 flex-none" />
                </a>
                <span className="text-muted-foreground text-[11px]">{source.meta}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * 「{社名}の有価証券報告書の要約」。**稼ぐ力の推移の後ろ・この数字の作り方の前**。
 * 1文目が事業の説明になりやすく、ページ上部の説明文（C7）と内容が重なるので離して置く。
 */
export function DigestSection({
  name,
  view,
  fiscalPeriod,
}: {
  name: string;
  view: AnalysisView;
  /** その会社の決算期（`2026年3月期`）。直後の「年収に関するQ&A」の説明と同じ値。 */
  fiscalPeriod: string;
}) {
  return (
    <section className="flex flex-col" data-testid="company-digest">
      <h2 className="text-lg font-bold">{name}の有価証券報告書の要約</h2>
      <p className="text-muted-foreground mt-1 mb-2.5 text-xs leading-relaxed">{digestNote(fiscalPeriod)}</p>
      <p className="text-[13px] leading-[1.85] text-pretty sm:text-sm">{view.digest}</p>
    </section>
  );
}
