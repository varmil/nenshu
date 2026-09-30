import { describe, it, expect } from "vitest";
import { formatDecimal1, formatInt, formatManYen } from "@/features/ranking/lib/format";
import { companyFiscalPeriodLabel } from "@/lib/data/period";
import { companies, curves, pickCompany, rowOf, stats } from "@/testing/realData";
import { buildCompanyView } from "./view";
import { buildActualsQa, type ActualsAnswer } from "./actualsQa";

/** 画面と同じ手順でその会社の Q&A を組む（決算期は会社ごとの値を `lib/data/period.ts` から）。 */
function qaFor(id: string) {
  const view = buildCompanyView(companies, curves, stats, id)!;
  return buildActualsQa(view, companyFiscalPeriodLabel(companies, rowOf(id)));
}

const sentence = (answer: ActualsAnswer) => `${answer.before}${answer.value}${answer.after}`;

/** 平均年収の回答に断りを重ねない会社（単体が連結の10%以上）。 */
const plainCompany = () => pickCompany("単体が連結の10%以上の会社", (row) => row[8] === 0);

describe("buildActualsQa（C16・AC-34）", () => {
  /*
   * **文全体の一致で固定する。** spec 1.22 の「決算期は説明にだけ置く」「推定の語を書かない」
   * 「質問も回答も社名から始める」は、これで全部守られる。値は `companies.json` の行から引く。
   */
  it("見出し・説明・4問を spec 1.22 の文言どおりに組む", () => {
    const id = plainCompany();
    const [, name, , , avgAge, avgTenure, avgSalary, employees] = rowOf(id);
    const qa = qaFor(id);
    expect(qa.heading).toBe(`${name}の年収に関するQ&A`);
    expect(qa.note).toBe(
      `${companyFiscalPeriodLabel(companies, rowOf(id))}の有価証券報告書の値です。提出会社（単体）のもので、連結子会社の従業員は入りません。`
    );
    expect(qa.items.map((item) => item.question)).toEqual([
      `${name}の平均年収はいくらですか？`,
      `${name}の平均年齢は何歳ですか？`,
      `${name}の平均勤続年数は何年ですか？`,
      `${name}の従業員数は何人ですか？`,
    ]);
    expect(qa.items.map((item) => sentence(item.answer))).toEqual([
      `${name}の平均年収は${formatManYen(avgSalary)}です。`,
      `${name}の平均年齢は${formatDecimal1(avgAge)}歳です。`,
      `${name}の平均勤続年数は${formatDecimal1(avgTenure)}年です。`,
      `${name}の従業員数は${formatInt(employees)}人です（提出会社単体。連結子会社の従業員は含みません）。`,
    ]);
  });

  // 太字にするのは値だけ。値の前後に割ってあることを、値の側で確かめる。
  it("回答の値は4項目の数字そのもので、前後の地の文を含まない", () => {
    const id = plainCompany();
    const [, , , , avgAge, avgTenure, avgSalary, employees] = rowOf(id);
    expect(qaFor(id).items.map((item) => item.answer.value)).toEqual([
      formatManYen(avgSalary),
      `${formatDecimal1(avgAge)}歳`,
      `${formatDecimal1(avgTenure)}年`,
      `${formatInt(employees)}人`,
    ]);
  });

  /*
   * **単体が連結の10%未満の会社だけ、平均年収の回答に断りを重ねる。** 断りは同じ1文の中
   * ——回答だけが引用されても落ちない。値（太字）は他の会社と同じく金額だけ。
   * 断りの無い側は上の文全体の一致が固定している。
   */
  it("単体が連結の10%未満の会社は、平均年収の回答に単体の人数と断りが入る", () => {
    const id = pickCompany("単体が連結の10%未満の会社", (row) => row[8] === 1);
    const [, name, , , , , avgSalary, employees] = rowOf(id);
    const [salary] = qaFor(id).items;
    expect(sentence(salary.answer)).toBe(
      `${name}の平均年収は${formatManYen(avgSalary)}です（提出会社単体の${formatInt(employees)}人の平均で、グループ全体の平均ではありません）。`
    );
    expect(salary.answer.value).toBe(formatManYen(avgSalary));
  });

  /*
   * **決算期は会社ごとの値**（E1）。最も多い決算期と違う会社で確かめることで、見出しや
   * 固定の文に決算期が埋まっていないことも見える。**説明の1行にだけ出る**（要約と給与の
   * 決定方針の節の説明も自分の節の先頭に置くが、それぞれ別の節）。
   */
  it("決算期はその会社の値で、説明の1行にだけ入る", () => {
    const perPeriod = new Map<number, number>();
    for (const row of companies.rows) perPeriod.set(row[9], (perPeriod.get(row[9]) ?? 0) + 1);
    const [common] = [...perPeriod].sort((a, b) => b[1] - a[1])[0];
    const id = pickCompany("決算期が最も多い決算期と違う会社", (row) => row[9] !== common);

    const qa = qaFor(id);
    const period = companyFiscalPeriodLabel(companies, rowOf(id));
    expect(qa.note.startsWith(`${period}の有価証券報告書の値です。`)).toBe(true);
    const rest = [
      qa.heading,
      ...qa.items.flatMap((item) => [item.question, sentence(item.answer)]),
    ];
    for (const text of rest) expect(text).not.toMatch(/\d{4}年\d{1,2}月期/);
  });
});
