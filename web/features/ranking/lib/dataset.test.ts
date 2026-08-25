import { describe, it, expect } from "vitest";
import { acceptCompaniesDataset } from "./dataset";
import { buildRankedCompanies } from "./rank";
import { INITIAL_STATE, parseSearchParams } from "./urlState";
import { buildLogoMask, logoIdSet } from "@/features/logo/lib/mask";
import companiesData from "../../../public/data/companies.json";
import curvesData from "../../../public/data/curves.json";
import logosData from "../../../public/data/logos.json";
import type { CompaniesData, CurvesData } from "../types";

const companies = companiesData as CompaniesData;
const curves = curvesData as CurvesData;

/*
 * E0（#174・ADR-0013）で、全社ぶんのデータは HTML への埋め込みをやめて
 * `/data/companies.json?v=…` から取るようになった。ここで固定するのは
 * **取れたものを受け入れてよいかの判断**と、**届く前と届いた後で画面が食い違わない
 * こと**の2つ。
 */
describe("acceptCompaniesDataset", () => {
  it("版が一致すればそのまま受け入れる", () => {
    expect(acceptCompaniesDataset(companies, companies.meta.version)).toBe(companies);
  });

  /*
   * `/` はブラウザ1時間・エッジ24時間キャッシュされる（ADR-0004）ので、
   * 古いHTMLが新しいJSONを引く組み合わせが起きる。行の並びは stats.json の
   * 順位表やロゴのマスクと添字で結びついているため、ずれると別の会社の順位を出す。
   */
  it("版が食い違えば捨てる", () => {
    expect(acceptCompaniesDataset(companies, "別の版")).toBeNull();
  });

  it("版が合っていても rows が配列でなければ捨てる", () => {
    const broken = { meta: { ...companies.meta }, rows: null };
    expect(acceptCompaniesDataset(broken, companies.meta.version)).toBeNull();
  });

  it("meta を持たないもの・null でも落ちない", () => {
    expect(acceptCompaniesDataset(null, companies.meta.version)).toBeNull();
    expect(acceptCompaniesDataset({}, companies.meta.version)).toBeNull();
    expect(acceptCompaniesDataset("", companies.meta.version)).toBeNull();
  });
});

describe("届く前と届いた後でロゴの有無が変わらない", () => {
  const urls = ["", "age=35", "ind=銀行業", "page=2", "age=30&sort=age-asc"];

  /*
   * ロゴの経路は2つある——届く前はサーバーが挙げた `pageLogoIds`、届いた後は
   * マスクを `rows` で開いた集合（`logos.json` は gzip 62KB あって渡せない）。
   * **食い違うと、データが届いた瞬間にロゴが消える／現れる。**
   */
  it.each(urls)("?%s", (search) => {
    const state = { ...INITIAL_STATE, ...parseSearchParams(new URLSearchParams(search)) };
    const page = buildRankedCompanies(companies, curves, state);

    const hasLogo = new Set(Object.keys(logosData.byId));
    const before = page.companies.filter((c) => hasLogo.has(c.id)).map((c) => c.id);

    const mask = buildLogoMask(companies.rows, logosData.byId);
    const after = logoIdSet(companies.rows, mask);
    expect(page.companies.filter((c) => after.has(c.id)).map((c) => c.id)).toEqual(before);
  });
});
