import { describe, expect, it } from "vitest";
import type { TenureHistory } from "../types";
import {
  buildTenureChart,
  buildTenureSummary,
  buildTenureTable,
  formatYearsDiff,
} from "./tenureHistory";

const YEARS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

/** モック 1b の仮の値（日本特殊陶業・ガラス・土石製品）。 */
const SAMPLE: TenureHistory = {
  years: YEARS,
  values: [15.2, 15.6, 16.0, 16.5, 17.4, 17.9, 18.9, 18.7, 19.0, 19.4],
  industryMedian: [15.8, 15.9, 16.0, 16.1, 16.3, 16.4, 16.4, 16.5, 16.6, 16.7],
};

/** 2017・2018年と2023年が欠けた会社。 */
const GAPPED: TenureHistory = {
  years: YEARS,
  values: [null, null, 9.8, 10.1, 10.5, 11.0, null, 11.6, 12.0, 12.3],
  industryMedian: [12.0, 12.1, 12.1, 12.2, 12.3, 12.3, 12.4, 12.4, 12.5, 12.6],
};

describe("formatYearsDiff", () => {
  it("全角の符号と年を付ける。丸めてから符号を決める", () => {
    expect(formatYearsDiff(4.2)).toBe("＋4.2年");
    expect(formatYearsDiff(-0.3)).toBe("−0.3年");
    expect(formatYearsDiff(0.04)).toBe("±0.0年");
    expect(formatYearsDiff(-0.04)).toBe("±0.0年");
  });
});

describe("buildTenureTable（AC-19・AC-20）", () => {
  it("10行で、基準年の行は差が空、以降は基準年との差", () => {
    const { rows, baseYear } = buildTenureTable(SAMPLE);
    expect(rows).toHaveLength(10);
    expect(baseYear).toBe(2017);
    expect(rows[0].diff).toBeNull();
    expect(formatYearsDiff(rows[9].diff!)).toBe("＋4.2年");
  });

  it("基準年はその会社で最初に値のある年。欠損の年は値も差も空", () => {
    const { rows, baseYear } = buildTenureTable(GAPPED);
    expect(baseYear).toBe(2019);
    expect(rows[0]).toEqual({ year: 2017, value: null, diff: null });
    expect(rows[2].diff).toBeNull();
    expect(rows[6]).toEqual({ year: 2023, value: null, diff: null });
    expect(formatYearsDiff(rows[9].diff!)).toBe("＋2.5年");
  });

  it("差は画面に出ている小数第1位の値どうしで取る", () => {
    // 有報の桁のまま引くと 19.44 − 15.16 = 4.28 → 「＋4.3年」になり、表の 19.4 と 15.2 の差と合わない。
    const { rows } = buildTenureTable({
      years: [2017, 2018],
      values: [15.16, 19.44],
      industryMedian: [null, null],
    });
    expect(formatYearsDiff(rows[1].diff!)).toBe("＋4.2年");
  });
});

describe("buildTenureSummary", () => {
  it("1文目は年・社名・値で閉じ、2文目で業種の中央値との差と最初の年からの動きを言う", () => {
    expect(buildTenureSummary(SAMPLE, "日本特殊陶業株式会社", "ガラス・土石製品")).toBe(
      "2026年の日本特殊陶業株式会社の平均勤続年数は、単体（提出会社）で19.4年です。" +
        "ガラス・土石製品の中央値（16.7年）より2.7年長く、2017年の15.2年から9年で4.2年伸びています。"
    );
  });

  it("短くなった会社・中央値より短い会社は、向きの語が変わる", () => {
    const shrinking: TenureHistory = {
      years: [2017, 2026],
      values: [14.0, 12.5],
      industryMedian: [13.0, 13.1],
    };
    expect(buildTenureSummary(shrinking, "A社", "サービス業")).toBe(
      "2026年のA社の平均勤続年数は、単体（提出会社）で12.5年です。" +
        "サービス業の中央値（13.1年）より0.6年短く、2017年の14.0年から9年で1.5年短くなっています。"
    );
  });

  it("欠損の年は飛ばし、実在する最初と最後の年で書く", () => {
    expect(buildTenureSummary(GAPPED, "B社", "情報・通信業")).toContain("2019年の9.8年から7年で2.5年伸びています");
  });

  it("中央値と同じ・動いていないときは差を書かない", () => {
    const flat: TenureHistory = { years: [2025, 2026], values: [10.0, 10.04], industryMedian: [10.0, 10.0] };
    expect(buildTenureSummary(flat, "C社", "小売業")).toBe(
      "2026年のC社の平均勤続年数は、単体（提出会社）で10.0年です。" +
        "小売業の中央値（10.0年）と同じで、2025年の10.0年から1年で変わっていません。"
    );
  });

  it("値が1年だけなら、中央値との差で文を閉じる", () => {
    const single: TenureHistory = {
      years: [2025, 2026],
      values: [null, 8.0],
      industryMedian: [9.0, 9.5],
    };
    expect(buildTenureSummary(single, "D社", "小売業")).toBe(
      "2026年のD社の平均勤続年数は、単体（提出会社）で8.0年です。小売業の中央値（9.5年）より1.5年短くなっています。"
    );
  });

  it("決算期を書かない（企業詳細で決算期を出すのは2か所だけ）", () => {
    expect(buildTenureSummary(SAMPLE, "E社", "鉄鋼")).not.toMatch(/\d{4}年\d{1,2}月期/);
  });
});

describe("buildTenureChart（AC-19・AC-20）", () => {
  it("欠損の年で会社の線を切る。点は値のある年だけ打つ", () => {
    const chart = buildTenureChart(GAPPED);
    // 2019〜2022 と 2024〜2026 の2本。2023 をまたいでつながない。
    expect(chart.line.match(/M/g)).toHaveLength(2);
    expect(chart.points.map((p) => p.year)).toEqual([2019, 2020, 2021, 2022, 2024, 2025, 2026]);
    // 中央値は10年ぶん続いている。
    expect(chart.medianLine.match(/M/g)).toHaveLength(1);
  });

  it("最新年（値のある最後の年）の点だけが latest", () => {
    const chart = buildTenureChart({ ...GAPPED, values: [...GAPPED.values.slice(0, 9), null] });
    expect(chart.points.filter((p) => p.latest).map((p) => p.year)).toEqual([2025]);
  });

  it("縦軸は0から始めず、会社と中央値の両方が枠の内側に収まる", () => {
    const chart = buildTenureChart(SAMPLE);
    const top = chart.padding.top;
    const bottom = chart.height - chart.padding.bottom;
    expect(Math.min(...chart.ticks.map((t) => t.value))).toBeGreaterThan(0);
    for (const point of chart.points) {
      expect(point.cy).toBeGreaterThan(top);
      expect(point.cy).toBeLessThan(bottom);
    }
    expect(chart.medianLabel!.y).toBeGreaterThan(top);
    expect(chart.medianLabel!.y).toBeLessThan(bottom);
  });

  it("点線が点のすぐ上を通る年は、値のラベルを点の下に逃がす", () => {
    const chart = buildTenureChart({
      years: [2025, 2026],
      values: [12.0, 12.0],
      // 2025年は点線が点のすぐ上、2026年は下を通る
      industryMedian: [12.2, 11.8],
    });
    expect(chart.points.map((p) => p.labelBelow)).toEqual([true, false]);
  });

  it("中央値のラベルは会社の線と反対側に置く", () => {
    expect(buildTenureChart(SAMPLE).medianLabel?.below).toBe(true);
    expect(buildTenureChart(GAPPED).medianLabel?.below).toBe(false);
  });

  it("中央値のラベルは、左へ伸びる範囲で点線がいちばん低い／高いところの外側に置く", () => {
    // 右肩上がりの点線の下に置くとき、右端の高さで置くと左側で点線がラベルを横切る。
    const below = buildTenureChart(SAMPLE);
    const rightEnd = below.points.find((p) => p.latest)!;
    expect(below.medianLabel!.below).toBe(true);
    expect(below.medianLabel!.x).toBe(rightEnd.cx);
    const lastMedianY = buildTenureChart({ ...SAMPLE, industryMedian: SAMPLE.industryMedian.map(() => 16.7) })
      .medianLabel!.y;
    expect(below.medianLabel!.y).toBeGreaterThan(lastMedianY);

    // 点線の上に置くときは、範囲でいちばん高いところ（右肩上がりなら右端）。
    const above = buildTenureChart(GAPPED);
    const flat = buildTenureChart({ ...GAPPED, industryMedian: GAPPED.industryMedian.map(() => 12.6) });
    expect(above.medianLabel!.y).toBeCloseTo(flat.medianLabel!.y, 5);
  });

  it("目盛は整数の年（1・2・5年刻み）", () => {
    for (const history of [SAMPLE, GAPPED]) {
      const ticks = buildTenureChart(history).ticks.map((t) => t.value);
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      for (const tick of ticks) expect(Number.isInteger(tick), `${ticks}`).toBe(true);
    }
  });

  it("値が全部同じでも範囲が潰れない", () => {
    const chart = buildTenureChart({ years: [2025, 2026], values: [5, 5], industryMedian: [5, 5] });
    expect(chart.ticks.length).toBeGreaterThanOrEqual(2);
    expect(Number.isFinite(chart.points[0].cy)).toBe(true);
  });
});
