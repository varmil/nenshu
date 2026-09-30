import { describe, expect, it } from "vitest";
import {
  dateLabel,
  findUnranked,
  unrankedCardFacts,
  unrankedCardLead,
  unrankedNotice,
  unrankedPageMeta,
  type UnrankedData,
} from "./unranked";

/**
 * ランキングの外の会社のページ（refresh の D9・#879・D11・#903・spec 1.16・AC-7）。**合成データで
 * 見る**——提出が途切れた会社はいまのデータにいない（最初に外れうるのは 2027-08-26）し、線を割った
 * 会社は毎日の更新で入れ替わる。
 */
const DATA: UnrankedData = {
  industries: ["情報・通信業", "電気機器"],
  periods: ["2026-05", "2026-06"],
  rows: [
    ["E09999", "テスト電機株式会社", 1, 3, 40.1, 8.7, 18811567, 534, 0, 1],
    ["E09998", "テストＨＤ株式会社", 0, 5, 40.9, 5.0, 5223089, 40, 0, 0],
    ["E09997", "テスト商事株式会社", 0, 5, 38.0, 6.0, 6000000, 60, 0, 0],
  ],
  reasonById: { E09999: "lapsed", E09998: "belowLine", E09997: "belowLine" },
  filedById: { E09999: "2026-09-28", E09998: "2026-08-28", E09997: "2026-08-28" },
  consolidatedById: { E09998: 224 },
  worklife: {
    meta: { source: "mhlw-positivedb", matched: 0, count: 3 },
    pool: [],
    rows: [0, 0, 0],
    notes: [0, 0, 0],
  },
};

describe("findUnranked", () => {
  it("業種と決算期は unranked.json の中のプールから引く", () => {
    const company = findUnranked(DATA, "E09999")!;
    expect(company.tse33).toBe("電気機器");
    expect(company.fiscalPeriod).toBe("2026年6月期");
    expect(company.filed).toBe("2026年9月28日");
    expect(company.avgSalary).toBe(18811567);
    expect(company.hasBadge).toBe(false);
    expect(company.reason).toBe("lapsed");
  });

  it("連結の従業員数は持っている会社だけ", () => {
    expect(findUnranked(DATA, "E09998")!.employeesConsolidated).toBe(224);
    expect(findUnranked(DATA, "E09997")!.employeesConsolidated).toBeNull();
  });

  it("母集団の会社は null", () => {
    expect(findUnranked(DATA, "6861")).toBeNull();
  });

  it("提出日・理由が引けなければ落とす（断りに出す値を黙って空にしない）", () => {
    expect(() => findUnranked({ ...DATA, filedById: {} }, "E09999")).toThrow(/提出日/);
    expect(() => findUnranked({ ...DATA, reasonById: {} }, "E09999")).toThrow(/理由/);
  });
});

describe("dateLabel", () => {
  it("月と日に0を付けない", () => {
    expect(dateLabel("2027-08-05")).toBe("2027年8月5日");
  });
});

describe("提出が途切れた会社の断りと文言（D9）", () => {
  const company = findUnranked(DATA, "E09999")!;

  it("断りは最後の有報の決算期と提出日、提出が途切れていることを言う（AC-7）", () => {
    const notice = unrankedNotice(company, 100);
    expect(notice.heading).toContain("提出が途切れています");
    expect(notice.body).toContain("2026年6月期");
    expect(notice.body).toContain("2026年9月28日");
    expect(notice.body).toContain("ランキング");
  });

  it("カードは「最新の」と書かず、順位の段を持たない", () => {
    expect(unrankedCardLead(company)).not.toContain("最新");
    expect(unrankedCardLead(company)).toContain("最後の有価証券報告書に載っている");
    // 決算期は断りが言う（企業詳細で決算期を出すのは2か所まで。S3）
    expect(unrankedCardLead(company)).not.toMatch(/\d{4}年\d{1,2}月期/);
    expect(unrankedCardFacts(company).map((f) => f.label)).toEqual([
      "平均年齢",
      "従業員数（単体）",
    ]);
  });

  it("メタは順位を出さず、description で提出が途切れていることを言う", () => {
    const meta = unrankedPageMeta(company, 100);
    expect(meta.canonical).toBe("/company/E09999");
    expect(meta.description).toContain("有報の提出が途切れています");
    expect(`${meta.title}${meta.description}`).not.toMatch(/\d+位/);
  });
});

describe("単体従業員の線を割った会社の断りと文言（D11）", () => {
  const company = findUnranked(DATA, "E09998")!;

  it("断りは単体の従業員数と線、決算期を言い、数字がグループの平均ではないことを連結の人数で言う", () => {
    const notice = unrankedNotice(company, 100);
    expect(notice.heading).toBe("単体の従業員が100人を下回っています");
    expect(notice.body).toContain("2026年5月期");
    expect(notice.body).toContain("従業員が40人");
    expect(notice.body).toContain("100人以上の会社で作っている");
    expect(notice.body).toContain("連結224人");
    // 提出は途切れていない
    expect(`${notice.heading}${notice.body}`).not.toContain("途切れ");
  });

  it("連結の人数が無ければ、グループと比べる文を出さない", () => {
    const notice = unrankedNotice(findUnranked(DATA, "E09997")!, 100);
    expect(notice.body).not.toContain("連結");
    expect(notice.body).toContain("提出会社の60人の平均です");
  });

  it("線は渡した値を使う（掲載の条件の値を書き写さない）", () => {
    expect(unrankedNotice(company, 50).heading).toBe("単体の従業員が50人を下回っています");
  });

  it("カードは最新の有報の言い方で、決算期を書かない", () => {
    expect(unrankedCardLead(company)).toContain("最新の有価証券報告書に基づく");
    expect(unrankedCardLead(company)).not.toMatch(/\d{4}年\d{1,2}月期/);
  });

  it("メタは順位を出さず、description でランキングに載せていないことを言う", () => {
    const meta = unrankedPageMeta(company, 100);
    expect(meta.description).toContain("100人を下回ったため、ランキングには載せていません");
    expect(meta.description).toContain("2026年5月期");
    expect(`${meta.title}${meta.description}`).not.toMatch(/\d+位/);
  });
});
