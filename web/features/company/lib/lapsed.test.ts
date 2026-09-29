import { describe, expect, it } from "vitest";
import {
  dateLabel,
  findLapsed,
  lapsedCardFacts,
  lapsedCardLead,
  lapsedNotice,
  lapsedPageMeta,
  type LapsedData,
} from "./lapsed";

/**
 * 母集団から外れた会社のページ（refresh の D9・#879・spec 1.16・AC-7）。**合成データで見る**——
 * いまのデータに外れた会社はいない（最初に外れうるのは 2027-08-26）。
 */
const DATA: LapsedData = {
  industries: ["建設業", "電気機器"],
  periods: ["2025-03", "2026-06"],
  rows: [["E09999", "テスト電機株式会社", 1, 3, 40.1, 8.7, 18811567, 534, 0, 1]],
  filedById: { E09999: "2026-09-28" },
  worklife: {
    meta: { source: "mhlw-positivedb", matched: 0, count: 1 },
    pool: [],
    rows: [0],
    notes: [0],
  },
};

describe("findLapsed", () => {
  it("業種と決算期は lapsed.json の中のプールから引く", () => {
    const company = findLapsed(DATA, "E09999")!;
    expect(company.tse33).toBe("電気機器");
    expect(company.fiscalPeriod).toBe("2026年6月期");
    expect(company.filed).toBe("2026年9月28日");
    expect(company.avgSalary).toBe(18811567);
    expect(company.hasBadge).toBe(false);
  });

  it("母集団の会社は null", () => {
    expect(findLapsed(DATA, "6861")).toBeNull();
  });

  it("提出日が引けなければ落とす（断りに出す値を黙って空にしない）", () => {
    expect(() => findLapsed({ ...DATA, filedById: {} }, "E09999")).toThrow(/提出日/);
  });
});

describe("dateLabel", () => {
  it("月と日に0を付けない", () => {
    expect(dateLabel("2027-08-05")).toBe("2027年8月5日");
  });
});

describe("断りと文言", () => {
  const company = findLapsed(DATA, "E09999")!;

  it("断りは最後の有報の決算期と提出日、提出が途切れていることを言う（AC-7）", () => {
    const notice = lapsedNotice(company);
    expect(notice.heading).toContain("提出が途切れています");
    expect(notice.body).toContain("2026年6月期");
    expect(notice.body).toContain("2026年9月28日");
    expect(notice.body).toContain("ランキング");
  });

  it("カードは「最新の」と書かず、順位の段を持たない", () => {
    expect(lapsedCardLead(company)).not.toContain("最新");
    expect(lapsedCardLead(company)).toContain("最後の有価証券報告書（2026年6月期）");
    expect(lapsedCardFacts(company).map((f) => f.label)).toEqual(["平均年齢", "従業員数（単体）"]);
  });

  it("メタは順位を出さず、description で提出が途切れていることを言う", () => {
    const meta = lapsedPageMeta(company);
    expect(meta.canonical).toBe("/company/E09999");
    expect(meta.description).toContain("有報の提出が途切れています");
    expect(`${meta.title}${meta.description}`).not.toMatch(/\d+位/);
  });
});
