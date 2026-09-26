import { describe, it, expect } from "vitest";
import companiesData from "../../../public/data/companies.json";
import curvesData from "../../../public/data/curves.json";
import statsData from "../../../public/data/stats.json";
import type { CompaniesData, CompanyRow, CurvesData } from "@/features/ranking/types";
import { companyFiscalPeriodLabel } from "@/lib/data/period";
import type { CompanyStatsData } from "../types";
import { buildCompanyView } from "./view";
import { buildActualsQa, type ActualsAnswer } from "./actualsQa";

const companies = companiesData as CompaniesData;
const curves = curvesData as CurvesData;
const stats = statsData as CompanyStatsData;

/** 画面と同じ手順でその会社の Q&A を組む（決算期は会社ごとの値を `lib/data/period.ts` から）。 */
function qaFor(id: string) {
  const view = buildCompanyView(companies, curves, stats, id)!;
  const row = companies.rows.find((r) => r[0] === id) as CompanyRow;
  return buildActualsQa(view, companyFiscalPeriodLabel(companies, row));
}

const sentence = (answer: ActualsAnswer) => `${answer.before}${answer.value}${answer.after}`;

describe("buildActualsQa（C16・AC-34）", () => {
  /*
   * **文全体の一致で固定する。** spec 1.22 の「決算期は説明にだけ置く」「推定の語を書かない」
   * 「質問も回答も社名から始める」は、これで全部守られる。
   */
  it("キーエンスの見出し・説明・4問を spec 1.22 の文言どおりに組む", () => {
    const qa = qaFor("6861");
    expect(qa.heading).toBe("株式会社キーエンスの年収に関するQ&A");
    expect(qa.note).toBe(
      "2026年3月期の有価証券報告書の値です。提出会社（単体）のもので、連結子会社の従業員は入りません。"
    );
    expect(qa.items.map((item) => item.question)).toEqual([
      "株式会社キーエンスの平均年収はいくらですか？",
      "株式会社キーエンスの平均年齢は何歳ですか？",
      "株式会社キーエンスの平均勤続年数は何年ですか？",
      "株式会社キーエンスの従業員数は何人ですか？",
    ]);
    expect(qa.items.map((item) => sentence(item.answer))).toEqual([
      "株式会社キーエンスの平均年収は2,178万円です。",
      "株式会社キーエンスの平均年齢は35.0歳です。",
      "株式会社キーエンスの平均勤続年数は11.3年です。",
      "株式会社キーエンスの従業員数は3,306人です（提出会社単体。連結子会社の従業員は含みません）。",
    ]);
  });

  // 太字にするのは値だけ。値の前後に割ってあることを、値の側で確かめる。
  it("回答の値は4項目の数字そのもので、前後の地の文を含まない", () => {
    expect(qaFor("6861").items.map((item) => item.answer.value)).toEqual([
      "2,178万円",
      "35.0歳",
      "11.3年",
      "3,306人",
    ]);
  });

  /*
   * **決算期は会社ごとの値**（E1）。4月期のヤガミで別の値が出ることで、見出しや固定の文に
   * 決算期が埋まっていないことも見える。**説明の1行にだけ出る**（企業詳細で2か所の決まり。
   * もう1か所は要約の節の説明）。
   */
  it("決算期はその会社の値で、説明の1行にだけ入る", () => {
    const qa = qaFor("7488");
    expect(qa.note.startsWith("2026年4月期の有価証券報告書の値です。")).toBe(true);
    const rest = [qa.heading, ...qa.items.flatMap((item) => [item.question, sentence(item.answer)])];
    for (const text of rest) expect(text).not.toMatch(/\d{4}年\d{1,2}月期/);
  });
});
