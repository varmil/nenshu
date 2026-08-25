import { describe, expect, it } from "vitest";
import {
  axisPosition,
  buildRadarAxes,
  MIN_POSITION,
  RADAR_LIST_ORDER,
  ranks,
  representativeUnitLabel,
  representativeValue,
  type RadarAxisInput,
} from "./radar";

describe("representativeValue", () => {
  it("全体値があればそれを採る", () => {
    expect(representativeValue(10.5, [{ value: 14.1 }, { value: 3.3 }])).toBe(10.5);
  });

  it("全体値が無く区分が1つならその値（キーエンスの有給 38.8%）", () => {
    expect(representativeValue(null, [{ value: 38.8 }])).toBe(38.8);
  });

  it("区分が2つ以上なら掲載なしにする（代表を選ばない・平均もしない）", () => {
    // spec 2.2b が禁じた「代表の1区分を選んで残りを捨てる」ことを図の側でもしない。
    expect(representativeValue(null, [{ value: 67.4 }, { value: 60.8 }])).toBeNull();
  });

  it("値が null の区分は数に入れない", () => {
    expect(representativeValue(null, [{ value: 38.8 }, { value: null }])).toBe(38.8);
  });

  it("区分が無ければ掲載なし", () => {
    expect(representativeValue(null, [])).toBeNull();
  });
});

describe("ranks", () => {
  it("大きいほど上位（既定）", () => {
    expect(ranks([10, 30, 20]).rank).toEqual([3, 1, 2]);
  });

  it("残業は小さいほど上位（5軸すべて外側＝良いに揃える）", () => {
    expect(ranks([10, 30, 20], true).rank).toEqual([1, 3, 2]);
  });

  it("同値は同順位", () => {
    expect(ranks([20, 20, 10]).rank).toEqual([1, 1, 3]);
  });

  it("母集団はその軸に値がある会社だけ（欠測を最下位に数えない）", () => {
    const { rank, population } = ranks([10, null, 30]);
    expect(population).toBe(2);
    expect(rank).toEqual([2, -1, 1]);
  });

  it("値が1つも無ければ母集団0", () => {
    expect(ranks([null, null])).toEqual({ rank: [-1, -1], population: 0 });
  });
});

describe("axisPosition", () => {
  it("1位が最も外側", () => {
    expect(axisPosition(1, 100)).toBe(1);
  });

  it("最下位でも中心には置かない（掲載なしと見分けるため）", () => {
    expect(axisPosition(100, 100)).toBe(MIN_POSITION);
  });

  it("欠測は null", () => {
    expect(axisPosition(-1, 100)).toBeNull();
  });

  it("母集団が1なら最も外側（比べる相手がいない）", () => {
    expect(axisPosition(1, 1)).toBe(1);
  });
});

const input = (value: number | null, rank: number, population = 100): RadarAxisInput => ({
  value,
  rank,
  population,
});

const FORMAT = {
  salary: (v: number) => `${v}円`,
  paidLeave: (v: number) => `${v}%`,
  tenure: (v: number) => `${v}年`,
  profit: (v: number) => `${v}円`,
  overtime: (v: number) => `${v}時間`,
};

describe("buildRadarAxes", () => {
  const axes = buildRadarAxes(
    {
      salary: input(2178, 1, 1867),
      paidLeave: input(38.8, 883, 895),
      tenure: input(11.3, 1468, 1867),
      profit: input(4062, 16, 1864),
      overtime: input(null, -1, 974),
    },
    FORMAT,
    { profit: "電気機器の中央値 191万円" },
    { profit: "1人当たり経常利益" }
  );

  it("5軸を12時から時計回りで返す", () => {
    expect(axes.map((a) => a.key)).toEqual([
      "salary",
      "paidLeave",
      "tenure",
      "profit",
      "overtime",
    ]);
  });

  // 親 Issue 154 で図から降ろした。番号を文字列に書くと `#154` が
  // 生の hex カラーとして lint に引っかかる（`no-restricted-syntax`）。
  it("男女の賃金の差異は軸に無い", () => {
    expect(axes.some((a) => a.label.includes("賃金の差異"))).toBe(false);
  });

  it("AC-7 掲載なしの軸は頂点を打たず、ラベルは残る", () => {
    const overtime = axes[4];
    expect(overtime.label).toBe("残業の少なさ");
    expect(overtime.valueText).toBe("掲載なし");
    expect(overtime.position).toBeNull();
    expect(overtime.rankText).toBe("");
  });

  it("順位はその軸の母集団で数える（有給は895社）", () => {
    expect(axes[1].rankText).toBe("895社中883位");
    expect(axes[0].rankText).toBe("1,867社中1位");
  });

  it("「上位◯%」の表記は使わない（上位82%が良い意味に読まれるため）", () => {
    for (const axis of axes) expect(axis.rankText).not.toContain("上位");
  });

  it("軸ごとの書式が値に当たる", () => {
    expect(axes.map((a) => a.valueText)).toEqual([
      "2178円",
      "38.8%",
      "11.3年",
      "4062円",
      "掲載なし",
    ]);
  });

  it("稼ぐ力の注記が付く", () => {
    expect(axes[3].subLabel).toBe("1人当たり経常利益");
    expect(axes[3].note).toBe("電気機器の中央値 191万円");
  });

  it("掲載なしの軸には注記も区分名も付けない", () => {
    // 値が無いのに「1人あたり…」や区分名だけが残ると、掲載があるように見える。
    expect(axes[4].subLabel).toBe("");
    expect(axes[4].note).toBe("");
  });

  it("区分がちょうど1つのとき、その区分名が軸に添う", () => {
    const [axis] = buildRadarAxes(
      {
        salary: input(2178, 1, 1867),
        paidLeave: { ...input(38.8, 883, 895), unitLabel: "正社員" },
        tenure: input(11.3, 1468, 1867),
        profit: input(4062, 16, 1864),
        overtime: input(null, -1, 974),
      },
      FORMAT
    ).filter((a) => a.key === "paidLeave");
    expect(axis.subLabel).toBe("正社員");
  });
});

describe("RADAR_LIST_ORDER", () => {
  /*
   * 図（`RADAR_AXES`）は12時から時計回り、リストは別の並び（アートボード 6b）。
   * **稼ぐ力だけが2行ぶんの高さを持つ**ので、途中に挟むとそこで行間が崩れる。
   */
  it("稼ぐ力を最後に置く", () => {
    expect(RADAR_LIST_ORDER[RADAR_LIST_ORDER.length - 1]).toBe("profit");
  });

  it("5軸を1つずつ含む", () => {
    expect([...RADAR_LIST_ORDER].sort()).toEqual(
      ["overtime", "paidLeave", "profit", "salary", "tenure"].sort()
    );
  });
});

describe("representativeUnitLabel", () => {
  it("全体値から来たときは区分名を出さない", () => {
    expect(representativeUnitLabel(74, [{ unit: "正社員", value: 70 }])).toBe("");
  });

  it("区分がちょうど1つならその名前を返す", () => {
    expect(representativeUnitLabel(null, [{ unit: "正社員", value: 38.8 }])).toBe("正社員");
  });

  it("区分が2つ以上なら空（代表を選ばない）", () => {
    expect(
      representativeUnitLabel(null, [
        { unit: "営業・管理系", value: 67.4 },
        { unit: "技術系", value: 60.8 },
      ])
    ).toBe("");
  });

  it("値の無い区分は数えない", () => {
    expect(
      representativeUnitLabel(null, [
        { unit: "正社員", value: 38.8 },
        { unit: "派遣社員", value: null },
      ])
    ).toBe("正社員");
  });
});
