import { describe, expect, it } from "vitest";
import { OG_FACTS } from "./ogFacts";
import { OG_IMAGE } from "./assets";
import { fiscalPeriodLabel } from "@/lib/data/period";
import { toManYen } from "@/features/ranking/lib/format";
import companiesData from "../../public/data/companies.json";
import statsData from "../../public/data/stats.json";
import type { CompaniesData } from "@/features/ranking/types";

/*
 * 焼いてある OG画像がいまのデータと合っていること（S2・Issue #116）。
 *
 * **初版は絵に数字を1つも載せていなかった。** 「載せると年1回のデータ更新のたびに
 * 焼き直しが要り、更新を忘れた1枚が SNS のキャッシュに残る」がその理由で、
 * 版面を差し替えて数字を載せると決めた以上（2026-08-26・運営者の指示）、
 * **その焼き直しを忘れないことをここで担保する。**
 *
 * `build:data` を回して `build:brand` を回さないと、この3つのどれかが落ちる。
 */

const companies = companiesData as unknown as CompaniesData;

describe("OG画像に焼いてある母集団", () => {
  it("社数が `companies.meta.count` と一致する", () => {
    expect(OG_FACTS.count).toBe(companies.meta.count);
  });

  it("全体平均が `stats.json` の実測値の平均と一致する", () => {
    // 先頭が実測値（`bases[0] === null`）。年齢そろえの列を採ると、絵の
    // 「有価証券報告書の数値のまま」と食い違う（ADR-0007）。
    expect(statsData.bases[0]).toBeNull();
    expect(OG_FACTS.averageManYen).toBe(toManYen(statsData.population[0].mean));
  });

  it("対象期間が画面と同じ文字列になっている", () => {
    // 決算期を文字列にするのは `lib/data/period.ts` の1か所だけ（CLAUDE.md）。
    expect(OG_FACTS.fiscalPeriod).toBe(fiscalPeriodLabel(companies.meta));
  });

  it("代替テキストが絵の中の文字を全部持っている", () => {
    // 絵に書いてあることをそのまま読み上げる文なので、数字が欠けたら代替にならない。
    for (const part of [
      "OpenReport",
      `${OG_FACTS.count.toLocaleString("ja-JP")}社`,
      `${OG_FACTS.averageManYen.toLocaleString("ja-JP")}万円`,
      OG_FACTS.fiscalPeriod,
      "金融庁 EDINET",
    ]) {
      expect(OG_IMAGE.alt).toContain(part);
    }
  });
});
