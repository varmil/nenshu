import { describe, expect, it } from "vitest";
import {
  axisPosition,
  buildRadarAxes,
  MIN_POSITION,
  RADAR_LIST_ORDER,
  ranks,
  representative,
  representativeValue,
  type RadarAxis,
  type RadarAxisInput,
  unitPickNote,
} from "./radar";

describe("representativeValue", () => {
  it("全体値があればそれを採る", () => {
    expect(representativeValue(10.5, [{ value: 14.1 }, { value: 3.3 }])).toBe(10.5);
  });

  it("全体値が無く区分が1つならその値（キーエンスの有給 38.8%）", () => {
    expect(representativeValue(null, [{ value: 38.8 }])).toBe(38.8);
  });

  /*
   * ~~区分が2つ以上なら掲載なしにする~~（W2 まで）→ **先頭の区分の値を採る**
   * （W3・#802）。区分ごとに公表している有給222社・残業112社の図から軸が
   * 1本欠けていた。**平均はしない**（spec 1.4）。
   */
  it("区分が2つ以上なら先頭の区分の値を採る（新日本空調の有給）", () => {
    // 営業・管理系 67.4 / 技術系 60.8。平均の 64.1 にしない。
    expect(representativeValue(null, [{ value: 67.4 }, { value: 60.8 }])).toBe(67.4);
  });

  it("値が null の区分は数に入れない", () => {
    expect(representativeValue(null, [{ value: 38.8 }, { value: null }])).toBe(38.8);
    // 先頭の値が落とされていれば、値のある最初の区分（節の先頭の行と同じ）。
    expect(representativeValue(null, [{ value: null }, { value: 12 }, { value: 30 }])).toBe(12);
  });

  it("区分が無ければ掲載なし", () => {
    expect(representativeValue(null, [])).toBeNull();
  });
});

describe("representative", () => {
  it("区分が2つ以上なら先頭を選び、その区分名を添える（ラクスの有給・W3）", () => {
    expect(
      representative(null, [
        { unit: "正社員", value: 88 },
        { unit: "RAM社員", value: 92.7 },
        { unit: "契約社員", value: 96.8 },
      ])
    ).toEqual({ value: 88, pickedUnit: "正社員" });
  });

  it("区分名は会社が登録したまま。管理職が先頭でも飛ばさない（オルガノの有給）", () => {
    // 名前で振り分けると spec 2.2b が禁じた「区分名を分類する」ことになる。
    expect(
      representative(null, [
        { unit: "管理職", value: 48.2 },
        { unit: "総合職", value: 66 },
        { unit: "一般職", value: 81.1 },
      ])
    ).toEqual({ value: 48.2, pickedUnit: "管理職" });
  });

  it("選んでいないときは区分名を添えない", () => {
    // 全体値がある（三菱商事の残業）。
    expect(
      representative(10.5, [
        { unit: "総合職", value: 14.1 },
        { unit: "一般職", value: 3.3 },
      ])
    ).toEqual({ value: 10.5, pickedUnit: null });
    // 区分がちょうど1つ（キーエンスの有給）。登録された値が1つしか無く、選んでいない。
    expect(representative(null, [{ unit: "正社員", value: 38.8 }])).toEqual({
      value: 38.8,
      pickedUnit: null,
    });
    // 値のある区分が1つだけ（もう1つは W2 で落とした）。
    expect(
      representative(null, [
        { unit: "総合職", value: null },
        { unit: "一般職", value: 20 },
      ])
    ).toEqual({ value: 20, pickedUnit: null });
    expect(representative(null, [])).toEqual({ value: null, pickedUnit: null });
    // 区分の行はあるが値が無い会社（W2 で 0 を落とした野村総合研究所）。
    expect(representative(null, [{ value: null }, { value: null }])).toEqual({
      value: null,
      pickedUnit: null,
    });
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
  const inputs = {
    salary: input(2178, 1, 1867),
    paidLeave: input(38.8, 883, 895),
    tenure: input(11.3, 1468, 1867),
    profit: input(4062, 16, 1864),
    overtime: input(null, -1, 974),
  };
  const axes = buildRadarAxes(
    inputs,
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
    expect(overtime.label).toBe("残業時間");
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

  it("先頭の区分で点を打った軸は、実数と順位を出し区分名を持つ（W3）", () => {
    const picked = buildRadarAxes(
      { ...inputs, paidLeave: { value: 88, rank: 120, population: 1486, pickedUnit: "正社員" } },
      FORMAT
    );
    expect(picked[1].valueText).toBe("88%");
    expect(picked[1].position).not.toBeNull();
    expect(picked[1].rankText).toBe("1,486社中120位");
    expect(picked[1].pickedUnit).toBe("正社員");
    // **「区分別」は無くなった**（W2 の表記）。値が無い軸は「掲載なし」だけ。
    expect(picked.some((a) => a.valueText === "区分別")).toBe(false);
  });

  it("区分名は選んだ軸だけが持つ", () => {
    expect(axes.map((a) => a.pickedUnit)).toEqual(["", "", "", "", ""]);
  });

  it("掲載なしの軸には注記を付けない", () => {
    // 値が無いのに「1人あたり…」だけが残ると、掲載があるように見える。
    expect(axes[4].subLabel).toBe("");
    expect(axes[4].note).toBe("");
  });

  /*
   * 有給・残業には区分名（`対象とする労働者すべて`）を添えていたが**落とした**
   * （運営者の指示）。長い区分名で行が2行になり、そのぶんの情報量に見合わない。
   * **区分名は W1 の節が行ごとに出している**ので、この画面から消えるわけではない。
   */
  it("注記を持つのは稼ぐ力だけ（有給・残業に区分名を添えない）", () => {
    expect(axes.filter((a) => a.subLabel !== "").map((a) => a.key)).toEqual(["profit"]);
  });

  it("残業の軸は指標名そのまま（向きは説明文と順位が担う）", () => {
    expect(axes[4].label).toBe("残業時間");
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

describe("unitPickNote", () => {
  const axis = (key: RadarAxis["key"], pickedUnit = ""): RadarAxis => ({
    key,
    label: "",
    valueText: "",
    position: 0.5,
    rankText: "",
    subLabel: "",
    note: "",
    pickedUnit,
  });
  const base = [axis("salary"), axis("paidLeave"), axis("tenure"), axis("profit"), axis("overtime")];

  /*
   * AC-17。**断りは該当する会社にだけ出す**——W2 の「区分別」の断りは全社の
   * ページに出ていて、どちらの軸も当てはまらない三菱商事でも読まされた。
   */
  it("先頭の区分で点を打った軸が無ければ出さない", () => {
    expect(unitPickNote(base)).toBeNull();
  });

  it("1軸なら軸と区分名を入れる（ラクスの有給）", () => {
    const note = unitPickNote([
      axis("salary"),
      axis("paidLeave", "正社員"),
      axis("tenure"),
      axis("profit"),
      axis("overtime"),
    ]);
    expect(note).toBe(
      "有給は雇用管理区分ごとの公表で全体の値が無いため、先頭の区分「正社員」の値で点を打っています。区分ごとの値は下の節にあります。"
    );
  });

  it("2軸なら両方の区分名を1文に入れる（オルガノ）", () => {
    const note = unitPickNote([
      axis("salary"),
      axis("paidLeave", "管理職"),
      axis("tenure"),
      axis("profit"),
      axis("overtime", "総合職"),
    ]);
    expect(note).toBe(
      "有給・残業は雇用管理区分ごとの公表で全体の値が無いため、先頭の区分の値で点を打っています（有給は「管理職」、残業は「総合職」）。区分ごとの値は下の節にあります。"
    );
  });

  it("有給・残業以外の軸は数えない", () => {
    expect(unitPickNote([axis("salary", "正社員"), axis("profit", "正社員")])).toBeNull();
  });
});
