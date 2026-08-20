import { NavLink } from "@/features/navigation/components/NavLink";
import { Badge } from "@/design-system/ui/badge";
import { deviationScore, formatDeviation } from "@/features/company/lib/stats";
import type { RankedCompany, TargetAge } from "../types";
import { displaySalary } from "../lib/rank";
import { formatManYen } from "../lib/format";
import { CompanyLogoMark } from "./CompanyLogoMark";
import { CompanyMetaLine } from "./CompanyMetaLine";
import { SalaryBar } from "./SalaryBar";

/**
 * モバイルの行（U13、アートボード 5c）。
 *
 * **カードの枠を外して区切り線だけにする。** U12 は1社ごとに `Card` で囲んでいたが、
 * 枠が100本並ぶと枠自体が模様になり、行の切れ目が読み取りにくかった。上下の余白と
 * 1本の細い線のほうが、同じ密度でも境目がはっきりする。
 *
 * **行は「順位・ロゴ」と「それ以外」の2つに割れている。** 社名・金額の行、meta と
 * 偏差値の行、年収バーの3段はすべて右側の列の中に積む。バーを行の全幅に伸ばすと
 * 順位とロゴの下まで届き、**どの社名に対する帯なのかが読み取りにくくなる**
 * （公開後の指摘）。順位は行の縦中央に置く。
 */
export function RankingCardList({
  companies,
  targetAge,
  pageMaxSalary,
  population,
}: {
  companies: RankedCompany[];
  targetAge: TargetAge | null;
  pageMaxSalary: number;
  population: { mean: number; sd: number } | null;
}) {
  const isRaw = targetAge === null;

  return (
    <div className="flex flex-col md:hidden">
      {companies.map((company) => {
        const salary = displaySalary(company);
        return (
          <div key={company.id} className="border-border flex items-center gap-2.5 border-b py-2.5">
            <span className="w-5 shrink-0 text-center text-[0.95rem] font-bold tabular-nums">
              {company.rank}
            </span>
            <CompanyLogoMark name={company.name} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                {/*
                  **社名は1行で切る**（公開後の指摘）。折り返すと行の高さが会社ごとに
                  変わり、一覧としての読みやすさが落ちる。`min-w-0` が無いと
                  flex アイテムの最小幅が中身の幅になり、`truncate` が効かない。
                */}
                {/* prefetch={false} の理由は RankingTable.tsx を参照。 */}
                <NavLink
                  href={`/company/${company.id}`}
                  prefetch={false}
                  className="text-primary min-w-0 truncate text-sm font-bold hover:underline"
                >
                  {company.name}
                </NavLink>
                <span className="shrink-0 text-base font-bold tabular-nums">
                  {formatManYen(salary)}
                </span>
              </div>

              <div className="text-muted-foreground flex items-center justify-between gap-2 text-[0.7rem]">
                {/*
                  **「本社のみ」は社名の隣ではなく meta 行に置く。** 社名の行に並べると
                  バッジのぶん社名が先に切れる（390px で「三菱商事株式…」になっていた）。
                  意味は変わらないので、行の中で場所を譲る。
                */}
                <span className="flex min-w-0 items-center gap-1.5">
                  {company.hasBadge && (
                    <Badge variant="outline" className="h-4 shrink-0 px-1.5 text-[0.65rem]">
                      本社のみ
                    </Badge>
                  )}
                  <CompanyMetaLine company={company} compact />
                </span>
                <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
                  {/*
                    **実測値のときは何も添えない**（アートボード 5c）。有報そのままの
                    数字に注記を付けると、かえって加工したように見える。年齢そろえの
                    ときだけ「推定」の一語を行に置く（AC-9）——モバイルには列見出しが
                    無い。**年齢は書かない**。見出しと帯に出ているうえ、360px では
                    この行が meta 側の幅を食って社名の下が読めなくなる。
                  */}
                  {!isRaw && <span>推定</span>}
                  {population && (
                    <span>
                      偏差値{" "}
                      {formatDeviation(deviationScore(salary, population.mean, population.sd))}
                    </span>
                  )}
                </span>
              </div>

              <SalaryBar value={salary} max={pageMaxSalary} mean={population?.mean ?? null} />
            </div>
          </div>
        );
      })}
      <p className="text-muted-foreground pt-3 text-xs">
        {isRaw
          ? "有価証券報告書の平均年間給与（提出会社単体）そのままです。年齢の違いは補正していません。"
          : "推定年収は年齢補正後の推定値です。実際の年収を保証するものではありません。"}
        {" "}
        帯はこのページの1位を100%とした相対の長さで、細い縦線は全体平均
        {population ? `（${formatManYen(population.mean)}）` : ""}の位置です。
        偏差値は分布が右に裾を引くため100を超えることがあります。水準は順位と併せて読んでください。
      </p>
    </div>
  );
}
