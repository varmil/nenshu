import type { RankedCompany } from "../types";
import { formatDecimal1, formatInt, formatManYen } from "../lib/format";

/**
 * 社名の下に添える1行（U13、アートボード 5a）。
 * `業種 ・ 平均42.3歳 ・ 在籍17.0年 ・ 4,456人`。
 *
 * U12 まではこの4つが表の独立した列で、社名の列を 200px 弱まで押し込んでいた。
 * **どれも「この会社がどんな会社か」を言う属性で、金額のように行どうしを見比べる
 * ものではない**ので、1行にまとめて社名に寄せる。
 *
 * **年齢そろえのときだけ末尾に実測値を出す**（アートボード 4a）。補正後の数字だけを
 * 見せると、元がいくらだったのかを確かめる手段がページから消える。
 */
export function CompanyMetaLine({
  company,
  omitTenure = false,
}: {
  company: RankedCompany;
  /** モバイルは幅が足りないので在籍年数を落とす（アートボード 5c）。 */
  omitTenure?: boolean;
}) {
  /*
   * `block`。`truncate` は `overflow: hidden` を効かせるが、インラインのままでは
   * はみ出した文字がそのまま外へ出る（360px でページに横スクロールが出た）。
   */
  return (
    <span className="text-muted-foreground block truncate text-xs">
      {company.tse33} ・ 平均{formatDecimal1(company.avgAge)}歳
      {!omitTenure && ` ・ 在籍${formatDecimal1(company.avgTenure)}年`} ・{" "}
      {formatInt(company.employees)}人
      {company.estimatedSalary !== null && ` ・ 実績 ${formatManYen(company.avgSalary)}`}
    </span>
  );
}
