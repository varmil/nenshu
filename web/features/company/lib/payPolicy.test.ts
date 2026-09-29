import { describe, it, expect } from "vitest";
import { payPolicies as payPoliciesData, pickCompany, rowOf } from "@/testing/realData";
import {
  blockChars,
  buildPayPolicyView,
  cellSpan,
  PAY_POLICY_FOLD_OVER,
  PAY_POLICY_OPEN_AT_LEAST,
  type PayPolicyBlock,
} from "./payPolicy";

const payPolicies = payPoliciesData.byId;

const para = (chars: number, ch = "あ"): PayPolicyBlock => ({
  kind: "para",
  text: ch.repeat(chars),
});
const heading = (text: string): PayPolicyBlock => ({ kind: "heading", text });

describe("buildPayPolicyView", () => {
  it("見出しは社名から始まり、会社の小見出しと出どころの節を持ち、畳まない", () => {
    const id = pickCompany("給与の決定方針の節に小見出しがあり、1,000字以下の会社", (row) => {
      const record = payPolicies[row[0]];
      return (
        record?.source === "section" &&
        record.title !== null &&
        record.blocks.reduce((sum, b) => sum + blockChars(b), 0) <= PAY_POLICY_FOLD_OVER
      );
    });
    const name = rowOf(id)[1];
    expect(buildPayPolicyView(name, payPolicies[id])).toEqual({
      heading: `${name}の給与の決定方針`,
      sourceLabel: "人材戦略に関する基本方針等",
      title: payPolicies[id].title,
      open: payPolicies[id].blocks,
      folded: [],
      foldedChars: 0,
    });
  });

  it("本文の無い会社は null（節ごと出さない）", () => {
    const id = pickCompany("給与の決定方針の本文が無い会社", (row) => !(row[0] in payPolicies));
    expect(buildPayPolicyView(rowOf(id)[1], payPolicies[id])).toBeNull();
    expect(buildPayPolicyView("x", { source: "section", title: null, blocks: [] })).toBeNull();
  });

  it("参照先の節から取った会社は、その節の名前を出す", () => {
    const id = pickCompany(
      "給与の決定方針をサステナビリティの節から取った会社",
      (row) => payPolicies[row[0]]?.source === "sustainability"
    );
    expect(buildPayPolicyView(rowOf(id)[1], payPolicies[id])?.sourceLabel).toBe(
      "サステナビリティに関する考え方及び取組"
    );
    expect(
      buildPayPolicyView("x", { source: "employees", title: null, blocks: [para(10)] })?.sourceLabel
    ).toBe("従業員の状況");
  });

  it("1,000字までは畳まない", () => {
    const view = buildPayPolicyView("x", {
      source: "section",
      title: null,
      blocks: [para(500), para(500)],
    })!;
    expect(view.folded).toEqual([]);
  });

  it("1,000字を超えたら、400字に届いた塊で切り、残りの字数を数える", () => {
    const blocks = [para(250), para(200), para(300), para(300)];
    const view = buildPayPolicyView("x", { source: "section", title: null, blocks })!;
    expect(view.open).toEqual(blocks.slice(0, 2));
    expect(view.folded).toEqual(blocks.slice(2));
    expect(view.foldedChars).toBe(600);
  });

  it("開いている部分を小見出しで終わらせない", () => {
    const blocks = [para(390), heading("（賞与）"), para(300), para(400)];
    const view = buildPayPolicyView("x", { source: "section", title: null, blocks })!;
    expect(view.open).toEqual(blocks.slice(0, 3));
    expect(view.folded).toEqual(blocks.slice(3));
  });

  it("畳む部分が空になるなら畳まない", () => {
    const view = buildPayPolicyView("x", { source: "section", title: null, blocks: [para(1200)] })!;
    expect(view.open).toHaveLength(1);
    expect(view.folded).toEqual([]);
  });

  /**
   * 実データの全社で、畳む・畳まないの分かれ方と開いている量が spec 1.23 のとおりであること。
   * **塊をつなぎ直すと元の本文に戻る**（開く部分と畳む部分で1字も落とさない）。
   */
  it("全社で、開く部分と畳む部分をつなぐと元の本文に戻り、畳むのは1,000字を超える会社だけ", () => {
    let folded = 0;
    for (const [id, record] of Object.entries(payPolicies)) {
      const view = buildPayPolicyView("x", record)!;
      expect([...view.open, ...view.folded], id).toEqual(record.blocks);
      const total = record.blocks.reduce((sum, b) => sum + blockChars(b), 0);
      if (view.folded.length > 0) {
        folded++;
        expect(total, id).toBeGreaterThan(PAY_POLICY_FOLD_OVER);
        expect(
          view.open.reduce((sum, b) => sum + blockChars(b), 0),
          id
        ).toBeGreaterThanOrEqual(PAY_POLICY_OPEN_AT_LEAST);
        expect(view.open.at(-1)?.kind, id).not.toBe("heading");
      }
    }
    // 畳む会社が1社も無いと、上の畳む側の検査が空振りする。
    expect(folded).toBeGreaterThan(0);
  });
});

describe("blockChars", () => {
  it("空白を数えず、表はセルの字をすべて、画像は0", () => {
    expect(blockChars({ kind: "para", text: "給与は\n役割で　決める。" })).toBe(10);
    expect(
      blockChars({
        kind: "table",
        rows: [
          ["区分", "内容"],
          ["基本給", "役割"],
        ],
      })
    ).toBe(9);
    expect(blockChars({ kind: "image" })).toBe(0);
  });
});

describe("cellSpan", () => {
  it("結合したセルだけが colSpan・rowSpan を持ち、1の側は書かない", () => {
    const spans: [number, number, number, number][] = [
      [0, 0, 2, 1],
      [2, 0, 1, 2],
    ];
    expect(cellSpan(spans, 0, 0)).toEqual({ colSpan: 2, rowSpan: undefined });
    expect(cellSpan(spans, 2, 0)).toEqual({ colSpan: undefined, rowSpan: 2 });
    expect(cellSpan(spans, 0, 1)).toBeUndefined();
    expect(cellSpan(undefined, 0, 0)).toBeUndefined();
  });

  /**
   * 表の各行が占める列の数（上の行から伸びてくる結合を含む）。**これがそろっていない表は列が
   * ずれて見える**——公開後の指摘（ソニーグループ・2026-09-28）はこの形で出た。
   */
  function rowWidths(rows: string[][], spans: [number, number, number, number][] | undefined) {
    const covered = new Map<number, Set<number>>();
    return rows.map((row, r) => {
      const used = covered.get(r) ?? new Set<number>();
      let col = 0;
      row.forEach((_, c) => {
        while (used.has(col)) col++;
        const { colSpan = 1, rowSpan = 1 } = cellSpan(spans, r, c) ?? {};
        for (let k = 1; k < rowSpan; k++) {
          const below = covered.get(r + k) ?? new Set<number>();
          for (let x = col; x < col + colSpan; x++) below.add(x);
          covered.set(r + k, below);
        }
        col += colSpan;
      });
      return Math.max(col, ...[...used].map((x) => x + 1));
    });
  }

  it("全社の表で、結合を入れると各行が同じ列数を占める", () => {
    let tables = 0;
    for (const [id, record] of Object.entries(payPolicies)) {
      for (const block of record.blocks) {
        if (block.kind !== "table") continue;
        tables++;
        expect(new Set(rowWidths(block.rows, block.spans)).size, id).toBe(1);
      }
    }
    // 表が1つも無いと上の検査が空振りする。
    expect(tables).toBeGreaterThan(0);
  });
});
