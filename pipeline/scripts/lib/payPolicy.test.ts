import { describe, it, expect } from "vitest";
import { toPayPolicyRecord, type PayPolicyRow } from "./payPolicy";

const row = (over: Partial<PayPolicyRow> = {}): PayPolicyRow => ({
  doc_id: "S100TEST",
  edinet_code: "E00001",
  name: "テスト株式会社",
  verdict: "own",
  source: "section",
  title: "②従業員給与等の決定方針",
  blocks: [{ kind: "para", text: "給与は役割で決める。" }],
  ...over,
});

describe("toPayPolicyRecord", () => {
  it("文を書き換えずに、画面が使う鍵だけにする", () => {
    expect(
      toPayPolicyRecord(
        row({
          blocks: [
            { kind: "heading", text: "（報酬の水準）" },
            { kind: "para", text: "一行目。\n二行目。" },
            { kind: "table", rows: [["区分", "内容"], ["基本給", "役割に応じて決める"]] },
            { kind: "image", alt: "0104010_004.png" },
          ],
        })
      )
    ).toEqual({
      source: "section",
      title: "②従業員給与等の決定方針",
      blocks: [
        { kind: "heading", text: "（報酬の水準）" },
        { kind: "para", text: "一行目。\n二行目。" },
        { kind: "table", rows: [["区分", "内容"], ["基本給", "役割に応じて決める"]] },
        // 代替テキストは空かファイル名で、読める文字が無いので落とす
        { kind: "image" },
      ],
    });
  });

  it("本文の無い会社は null（節ごと出さない）", () => {
    expect(toPayPolicyRecord(row({ verdict: "none", source: undefined, title: null, blocks: [] }))).toBeNull();
  });

  it("参照先の節から取った会社は、その節を source に持つ", () => {
    expect(toPayPolicyRecord(row({ source: "sustainability", title: null }))?.source).toBe("sustainability");
  });

  it("表の結合したセルはそのまま持ち、結合の無い表には鍵を足さない", () => {
    const rows = [["報酬の種類", "概要"], ["", "ストック・オプション", "3年で行使"], ["RSU", "3年で確定"]];
    const spans = [
      [0, 0, 2, 1],
      [1, 0, 1, 2],
    ];
    expect(toPayPolicyRecord(row({ blocks: [{ kind: "table", rows, spans }] }))?.blocks).toEqual([
      { kind: "table", rows, spans },
    ]);
    expect(toPayPolicyRecord(row({ blocks: [{ kind: "table", rows }] }))?.blocks[0]).not.toHaveProperty("spans");
  });

  it("形が崩れていたら落とす", () => {
    for (const bad of [
      row({ verdict: "referenced" }),
      row({ source: "somewhere" }),
      row({ title: " " }),
      row({ blocks: [{ kind: "para", text: "" }] }),
      row({ blocks: [{ kind: "table", rows: [] }] }),
      row({ blocks: [{ kind: "list", text: "x" }] }),
      // 結合がセルを指していない・何も結合していない・空
      row({ blocks: [{ kind: "table", rows: [["A", "B"]], spans: [[0, 2, 2, 1]] }] }),
      row({ blocks: [{ kind: "table", rows: [["A", "B"]], spans: [[0, 0, 1, 1]] }] }),
      row({ blocks: [{ kind: "table", rows: [["A", "B"]], spans: [] }] }),
    ]) {
      expect(() => toPayPolicyRecord(bad)).toThrow();
    }
  });
});
