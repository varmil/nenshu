import { describe, it, expect } from "vitest";
import companiesData from "@/public/data/companies.json";
import {
  shortIndustryLabel,
  INDUSTRY_SHORT_LABELS,
  MAX_INDUSTRY_LABEL_LENGTH,
} from "./industry";

/**
 * **実物の `companies.json` に対して見る。** 略称の表は業種名の綴りを鍵にした
 * 手書きの表なので、データ側の綴りとずれると**静かに効かなくなる**（`??` で
 * 原文に落ちるだけなので、画面は壊れずに元の長さへ戻る）。
 */
const industries: string[] = companiesData.industries;

describe("shortIndustryLabel", () => {
  it("表に無い業種は原文のまま返す", () => {
    expect(shortIndustryLabel("電気機器")).toBe("電気機器");
    expect(shortIndustryLabel("その他金融業")).toBe("その他金融業");
  });

  it("証券、商品先物取引業だけを略す（落とすのは「取引業」）", () => {
    expect(shortIndustryLabel("証券、商品先物取引業")).toBe("証券・商品先物");
    expect(Object.keys(INDUSTRY_SHORT_LABELS)).toEqual(["証券、商品先物取引業"]);
  });

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
  it("33業種すべてが略称のあと上限に収まる", () => {
    const tooLong = industries
      .map((name) => ({ name, label: shortIndustryLabel(name) }))
      .filter(({ label }) => label.length > MAX_INDUSTRY_LABEL_LENGTH);
    expect(tooLong).toEqual([]);
  });

  it("上限ちょうどの業種は略さない（8文字は収まる）", () => {
    // `ガラス・土石製品の中央値 318万円` は実測 179.5px で、器の 191.8px に入る。
    expect(industries).toContain("ガラス・土石製品");
    expect(shortIndustryLabel("ガラス・土石製品")).toBe("ガラス・土石製品");
  });
});
