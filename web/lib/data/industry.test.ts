import { describe, it, expect } from "vitest";
import { companies, industryOf, pickCompany } from "@/testing/realData";
import { shortIndustryLabel, INDUSTRY_SHORT_LABELS, MAX_INDUSTRY_LABEL_LENGTH } from "./industry";

/**
 * **実物の `companies.json` に対して見る。** 略称の表は業種名の綴りを鍵にした
 * 手書きの表なので、データ側の綴りとずれると**静かに効かなくなる**（`??` で
 * 原文に落ちるだけなので、画面は壊れずに元の長さへ戻る）。
 */
const industries: string[] = companies.industries;

describe("shortIndustryLabel", () => {
  it("表に無い業種は原文のまま返す（上限ちょうどの長さも略さない）", () => {
    expect(shortIndustryLabel("電気機器")).toBe("電気機器");
    expect(shortIndustryLabel("その他金融業")).toBe("その他金融業");
    // 上限は、上限ちょうどの長さの業種名を中央値の金額と並べても器に収まることを
    // 実測して決めた（`industry.ts`）。その長さの業種名をデータから選ぶ。
    const exact = industryOf(
      pickCompany("業種名がちょうど上限の長さで、略称の表に無い会社", (row) => {
        const name = industries[row[2]];
        return name.length === MAX_INDUSTRY_LABEL_LENGTH && !(name in INDUSTRY_SHORT_LABELS);
      })
    );
    expect(shortIndustryLabel(exact)).toBe(exact);
  });

  it("証券、商品先物取引業は略す（落とすのは「取引業」だけ）", () => {
    expect(shortIndustryLabel("証券、商品先物取引業")).toBe("証券・商品先物");
  });

  /*
   * 表の鍵の綴りがデータとずれていないこと。その業種の会社がデータから1社もいなく
   * なっても落ちる——そのときは表の行が使われていないので、消してよい。
   */
  it("表の鍵が実データの業種名として実在する", () => {
    for (const key of Object.keys(INDUSTRY_SHORT_LABELS)) {
      expect(industries, `${key} は companies.industries に無い`).toContain(key);
    }
  });

  /*
   * **これが本体。** 器（296px の2行目から `1人当たり経常利益` を引いた 191.8px）に
   * 収まる上限は実測で8文字だった。**データ側に9文字以上の業種名が増えたら、
   * ここが落ちて略称を足すことになる**——落ちなければ、その業種の会社を
   * 1社も見ないまま行が折れる。
   */
  it("データの全業種が略称のあと上限に収まる", () => {
    const tooLong = industries
      .map((name) => ({ name, label: shortIndustryLabel(name) }))
      .filter(({ label }) => label.length > MAX_INDUSTRY_LABEL_LENGTH);
    expect(tooLong).toEqual([]);
  });
});
