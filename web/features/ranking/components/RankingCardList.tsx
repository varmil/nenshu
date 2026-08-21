import { NavLink } from "@/features/navigation/components/NavLink";
import { deviationScore, formatDeviation } from "@/features/company/lib/stats";
import type { RankedCompany, TargetAge } from "../types";
import { displaySalary } from "../lib/rank";
import { formatManYen } from "../lib/format";
import { CompanyLogo } from "@/features/logo/components/CompanyLogo";
import { CompanyMetaLine } from "./CompanyMetaLine";
import { SalaryBar } from "./SalaryBar";

/**
 * モバイルの行（アートボード 2a、Issue #119）。
 *
 * **カードの枠を外して区切り線だけにする。** U12 は1社ごとに `Card` で囲んでいたが、
 * 枠が100本並ぶと枠自体が模様になり、行の切れ目が読み取りにくかった。上下の余白と
 * 1本の細い線のほうが、同じ密度でも境目がはっきりする。
 *
 * **行は「順位 / ロゴ / 社名＋meta / 金額ブロック」の4カラム。** アートボード 5c の
 * 頃は社名・meta・年収バーを右の1列に縦積みしており、バーだけが行の全幅に伸びていた。
 * **バーは金額ブロックの幅（80px）に収める**——金額の直下にあれば「この数字の帯」と
 * 読めるが、行いっぱいに伸びると順位とロゴの下にも掛かり、何に対する帯なのかが
 * 曖昧になる。80px は最大値「2,178万円」の実測幅で、バーの左端が数値の左端に揃う。
 *
 * **縮むのは社名と平均年齢だけ。** 金額ブロックと偏差値は `shrink-0` で、360px でも
 * 省略記号に飲まれない（受け入れ条件）。行の高さはロゴの48pxと `py` で決まるので、
 * 社名の長さによらず9社ぶんが等間隔に並ぶ。
 *
 * PC の表（`RankingTable.tsx`）と、順位・金額・偏差値の算出（`lib/rank`・`lib/format`・
 * `features/company/lib/stats`）はこの Issue では触っていない。
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
            {/*
              順位は 12px。18px（`text-[0.95rem]`）だと社名と同じ強さで目に入り、
              「何位の会社か」より先に数字だけが読まれる。行の縦中央に置く。
            */}
            <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums">
              {company.rank}
            </span>
            <CompanyLogo id={company.id} name={company.name} size="row" />

            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              {/*
                **社名は1行で切る**（公開後の指摘）。折り返すと行の高さが会社ごとに
                変わり、一覧としての読みやすさが落ちる。`min-w-0` が無いと flex
                アイテムの最小幅が中身の幅になり、`truncate` が効かない。`block` に
                しないとインラインのままはみ出す（360px で横スクロールが出た）。
              */}
              {/* prefetch={false} の理由は RankingTable.tsx を参照。 */}
              <NavLink
                href={`/company/${company.id}`}
                prefetch={false}
                className="text-primary block truncate text-sm font-bold hover:underline"
              >
                {company.name}
              </NavLink>

              {/*
                meta 行は**平均年齢と偏差値だけ**。「本社のみ」バッジはここから外した
                （PC の表には残る）——4カラムにして社名の列が 390px で 160px 前後まで
                狭まったので、バッジのぶんは社名か偏差値のどちらかを削ることになる。
              */}
              <div className="text-muted-foreground flex items-baseline justify-between gap-1.5 text-[0.7rem]">
                <CompanyMetaLine company={company} compact />
                <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
                  {/*
                    **実測値のときは何も添えない**（アートボード 5c）。有報そのままの
                    数字に注記を付けると、かえって加工したように見える。年齢そろえの
                    ときだけ「推定」の一語を行に置く（AC-9）——モバイルには列見出しが
                    無い。**年齢は書かない**。見出しと帯に出ているため。
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
            </div>

            {/*
              金額ブロック。幅は 80px 固定で、中の金額とバーが同じ左端・右端を持つ。
              バーの意味は PC の表と同じ——このページの1位を100%とした相対の長さで、
              細い縦線が全体平均の位置（`SalaryBar`）。
            */}
            <div className="flex w-20 shrink-0 flex-col gap-1 text-right">
              <span className="text-base font-bold tabular-nums">{formatManYen(salary)}</span>
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
