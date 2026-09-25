import { describe, expect, it } from "vitest";
import {
  axisPosition,
  buildRadarAxes,
  MIN_POSITION,
  ranks,
  representative,
  representativeValue,
  type RadarAxis,
  type RadarAxisInput,
  missingAxisNote,
  unitPickNote,
} from "./radar";

/*
 * 軸に打つ1点の規則。**`representativeValue`（ビルド時に順位を決める pipeline 側）と
 * `representative`（画面側）は同じ規則でなければならない**——ずれると図の頂点と
 * 隣に出る値が別の規約で選ばれる。前者は後者の `.value` なので、規則は
 * `representative` で見て、`representativeValue` は分岐の要所で一致だけを見る。
 */
describe("representative / representativeValue", () => {
  it("全体値があればそれを採り、区分名は添えない（三菱商事の残業）", () => {
    const units = [
      { unit: "総合職", value: 14.1 },
      { unit: "一般職", value: 3.3 },
    ];
    expect(representative(10.5, units)).toEqual({ value: 10.5, pickedUnit: null });
    expect(representativeValue(10.5, units)).toBe(10.5);
  });

  it("区分がちょうど1つならその値。選んでいないので区分名は添えない（キーエンスの有給）", () => {
    expect(representative(null, [{ unit: "正社員", value: 38.8 }])).toEqual({
      value: 38.8,
      pickedUnit: null,
    });
  });

  /*
   * ~~区分が2つ以上なら掲載なしにする~~（W2 まで）→ **先頭の区分の値を採る**
   * （W3・#802）。区分ごとに公表している有給222社・残業112社の図から軸が
   * 1本欠けていた。**平均はしない**（spec 1.4）。**区分名で振り分けない**——
   * 名前で飛ばすと spec 2.2b が禁じた「区分名を分類する」ことになる。
   */
  it("区分が2つ以上なら先頭を採り、その区分名を添える。平均せず、管理職が先頭でも飛ばさない（ラクス・オルガノ）", () => {
    expect(
      representative(null, [
        { unit: "正社員", value: 88 },
        { unit: "RAM社員", value: 92.7 },
        { unit: "契約社員", value: 96.8 },
      ])
    ).toEqual({ value: 88, pickedUnit: "正社員" });
    expect(
      representative(null, [
        { unit: "管理職", value: 48.2 },
        { unit: "総合職", value: 66 },
        { unit: "一般職", value: 81.1 },
      ])
    ).toEqual({ value: 48.2, pickedUnit: "管理職" });
    // 新日本空調の有給（営業・管理系 67.4 / 技術系 60.8）。平均の 64.1 にしない。
    expect(representativeValue(null, [{ value: 67.4 }, { value: 60.8 }])).toBe(67.4);
  });

  it("値が null の区分は数に入れない（W2 で落とした値）", () => {
    // 値のある区分が1つだけ → 選んでいない。
    expect(
      representative(null, [
        { unit: "総合職", value: null },
        { unit: "一般職", value: 20 },
      ])
    ).toEqual({ value: 20, pickedUnit: null });
    // 先頭の値が落とされていれば、値のある最初の区分（節の先頭の行と同じ）。
    expect(
      representative(null, [
        { unit: "総合職", value: null },
        { unit: "一般職", value: 12 },
        { unit: "嘱託", value: 30 },
      ])
    ).toEqual({ value: 12, pickedUnit: "一般職" });
    // 区分の行はあるが値が無い会社（W2 で 0 を落とした野村総合研究所）。
    expect(representative(null, [{ value: null }, { value: null }])).toEqual({
      value: null,
      pickedUnit: null,
    });
  });

  it("区分が無ければ掲載なし", () => {
    expect(representative(null, [])).toEqual({ value: null, pickedUnit: null });
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
    expect(ranks([null, null])).toEqual({ rank: [-1, -1], population: 0 });
  });
});

describe("axisPosition", () => {
  it("1位が最も外側。最下位でも中心には置かない（掲載なしと見分けるため）", () => {
    expect(axisPosition(1, 100)).toBe(1);
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

  // 男女の賃金の差異は親 Issue 154 で図から降ろした（数値は W1 の節に残る）。
  // 番号を文字列に書くと `#154` が生の hex カラーとして lint に引っかかる
  // （`no-restricted-syntax`）。
  it("5軸を12時から時計回りで返す（男女の賃金の差異は軸に無い）", () => {
    expect(axes.map((a) => a.key)).toEqual([
      "salary",
      "paidLeave",
      "tenure",
      "profit",
      "overtime",
    ]);
  });

  it("AC-7 掲載なしの軸は頂点を打たず、ラベルは指標名のまま残る", () => {
    const overtime = axes[4];
    // 向きは図の説明文（`外側ほど上位`）と隣の順位が担う（「残業の少なさ」にしない）。
    expect(overtime.label).toBe("残業時間");
    expect(overtime.valueText).toBe("掲載なし");
    expect(overtime.position).toBeNull();
    expect(overtime.rankText).toBe("");
  });

  it("順位はその軸の母集団で数え、「上位◯%」の表記は使わない", () => {
    expect(axes[1].rankText).toBe("895社中883位");
    expect(axes[0].rankText).toBe("1,867社中1位");
    // `上位82%` は上から82%の位置の意味だが、日本語としては上位＝良いに読める。
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

  it("掲載なしの軸には注記を付けない", () => {
    // 値が無いのに「1人当たり…」だけが残ると、掲載があるように見える。
    const missingProfit = buildRadarAxes(
      { ...inputs, profit: input(null, -1, 2959) },
      FORMAT,
      { profit: "電気機器の中央値 191万円" },
      { profit: "1人当たり経常利益" }
    );
    expect(missingProfit[3].subLabel).toBe("");
    expect(missingProfit[3].note).toBe("");
  });

  it("先頭の区分で点を打った軸だけが、実数と順位に区分名を持つ（W3）", () => {
    const picked = buildRadarAxes(
      { ...inputs, paidLeave: { value: 88, rank: 120, population: 1486, pickedUnit: "正社員" } },
      FORMAT
    );
    expect(picked[1].valueText).toBe("88%");
    expect(picked[1].position).not.toBeNull();
    expect(picked[1].rankText).toBe("1,486社中120位");
    expect(picked.map((a) => a.pickedUnit)).toEqual(["", "正社員", "", "", ""]);
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
  it("先頭の区分で点を打った軸が無ければ出さない（有給・残業以外の軸は数えない）", () => {
    expect(unitPickNote(base)).toBeNull();
    expect(unitPickNote([axis("salary", "正社員"), axis("profit", "正社員")])).toBeNull();
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
});

/*
 * P1 の AC-7。**頂点を打たなかった軸がある会社にだけ出す**（W3 の後の指摘で
 * `unitPickNote` とそろえた）。以前は5軸すべてに頂点がある会社にも出ていた。
 */
describe("missingAxisNote", () => {
  it("5軸すべてに頂点があれば出さない。先頭の区分で点を打った軸も欠けていない扱い（ラクスの有給）", () => {
    const axes = buildRadarAxes(
      {
        salary: input(900, 500, 2961),
        paidLeave: { value: 88, rank: 100, population: 1486, pickedUnit: "正社員" },
        tenure: input(4, 2000, 2961),
        profit: input(300, 900, 2959),
        overtime: input(19.3, 1137, 1525),
      },
      FORMAT
    );
    expect(missingAxisNote(axes)).toBeNull();
  });

  it("掲載なしの軸が1つでもあれば出す（キーエンスの残業）", () => {
    const axes = buildRadarAxes(
      {
        salary: input(2178, 1, 2961),
        paidLeave: input(38.8, 1461, 1486),
        tenure: input(11.3, 1955, 2961),
        profit: input(4062, 16, 2959),
        overtime: input(null, -1, 1525),
      },
      FORMAT
    );
    expect(missingAxisNote(axes)).toBe("公表の無い指標は頂点を打たず、残りの点で閉じています。");
  });
});
