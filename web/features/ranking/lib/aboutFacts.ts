import type { CompaniesData, CompanyRow, CurvesData } from "../types";
import { interpolate } from "./curve";
import { TARGET_AGES } from "../types";

/** 計算方法ページで実例として挙げる会社。 */
export interface CompanyExample {
  name: string;
  avgSalary: number;
  avgAge: number;
  employees: number;
  hasBadge: boolean;
}

/**
 * 補正の式を実データで1本たどって見せるための材料。
 * 読者が自分で電卓を叩いて確かめられるように、途中の値まで持つ。
 */
export interface FormulaExample {
  company: CompanyExample;
  targetAge: number;
  /** 賃金カーブを引く産業大分類（例: 金融業・保険業）。 */
  curveKey: string;
  /** カーブの目標年齢での値（円）。 */
  curveAtTargetAge: number;
  /** カーブのその会社の平均年齢での値（円）。 */
  curveAtAvgAge: number;
  /** 補正倍率 = curveAtTargetAge ÷ curveAtAvgAge。 */
  factor: number;
  estimatedSalary: number;
}

/**
 * 「平均年齢から離れた年齢ほど不確実」という限界を、印象ではなく数字で書くための材料。
 * 詳しい経緯は Issue #42 と `docs/ranking/about-page/plan.md` にある。
 */
export interface ModelBiasFacts {
  /** 産業平均に対する倍率の分布。式はこれが全年齢で一定だと仮定している。 */
  premiumMedian: number;
  premiumP90: number;
  premiumMax: number;
  premiumMaxCompanyName: string;
  /** 掲載企業の平均年齢の中央値。ここから離れるほど外挿になる。 */
  avgAgeMedian: number;
  /** 目標年齢ごとの「その会社の平均年齢からの距離」の平均。 */
  meanExtrapolationByAge: { age: number; distance: number }[];
  /** 上位50社のうち、最年少の目標年齢と最年長の目標年齢で顔ぶれが重なる社数。 */
  top50Overlap: number;
  youngestTargetAge: number;
  oldestTargetAge: number;
}

/** 計算方法ページの本文に埋める数値。 */
export interface AboutFacts {
  companyCount: number;
  badgeCount: number;
  industryCount: number;
  curveCount: number;
  agePoints: number[];
  /** 持株会社の例（「本社のみ」バッジが付く側）。 */
  holdingExample: CompanyExample;
  /** 同じグループの事業会社の例（バッジが付かない側）。式の実例も兼ねる。 */
  operatingExample: CompanyExample;
  /** 補正の式を1本たどって見せる実例。 */
  formulaExample: FormulaExample;
  /** 限界の節で使う、モデルの偏りを表す数値。 */
  modelBias: ModelBiasFacts;
}

/** 式の実例で使う目標年齢。ランキングの初期値と揃える。 */
const FORMULA_EXAMPLE_TARGET_AGE = 35;

const HOLDING_EXAMPLE_NAME = "株式会社みずほフィナンシャルグループ";
const OPERATING_EXAMPLE_NAME = "株式会社みずほ銀行";

function toExample(row: CompanyRow): CompanyExample {
  const [, name, , , avgAge, , avgSalary, employees, badge] = row;
  return { name, avgSalary, avgAge, employees, hasBadge: badge === 1 };
}

/**
 * 会社名で引く。`id` は非上場だと doc_id 由来（例: みずほ銀行の `s100yfah`）で
 * データ更新のたびに変わるため、会社名のほうが安定する。
 *
 * 見つからなければ throw する。計算方法ページはServer Componentなのでビルド時に
 * 落ち、実例だけが静かに消えた本文が公開されるのを防げる。
 * `pipeline/scripts/build-data.ts` がデータ異常で落とすのと同じ方針。
 */
function findByName(companies: CompaniesData, name: string): CompanyRow {
  const row = companies.rows.find((r) => r[1] === name);
  if (row === undefined) {
    throw new Error(
      `計算方法ページの実例に使う「${name}」がデータに見つからない。` +
        `データ更新で社名が変わったか対象から外れた可能性がある。` +
        `features/ranking/lib/aboutFacts.ts の実例を選び直すこと。`
    );
  }
  return row;
}

/**
 * 計算方法ページの本文に埋める数値を実データから算出する。
 *
 * ハードコードすると、年1回のデータ更新でこのページの数字だけが静かに古くなる。
 * 逆に、データから出せない値（提出期間・従業員数の下限・カーブの調査年など
 * パイプライン側の定数）はページ本文に直書きする。線引きは
 * `docs/ranking/about-page/design.md` にある。
 */
export function buildAboutFacts(companies: CompaniesData, curves: CurvesData): AboutFacts {
  const operatingRow = findByName(companies, OPERATING_EXAMPLE_NAME);
  const operatingExample = toExample(operatingRow);

  return {
    companyCount: companies.rows.length,
    badgeCount: companies.rows.filter((row) => row[8] === 1).length,
    industryCount: companies.industries.length,
    curveCount: companies.curveKeys.length,
    agePoints: curves.agePoints,
    holdingExample: toExample(findByName(companies, HOLDING_EXAMPLE_NAME)),
    operatingExample,
    formulaExample: buildFormulaExample(companies, curves, operatingRow, operatingExample),
    modelBias: buildModelBiasFacts(companies, curves),
  };
}

function quantile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function curveValuesFor(companies: CompaniesData, curves: CurvesData, row: CompanyRow): number[] {
  return curves.curves[companies.curveKeys[row[3]]].map((v) => v * 1000);
}

function estimateFor(
  companies: CompaniesData,
  curves: CurvesData,
  row: CompanyRow,
  targetAge: number
): number {
  const values = curveValuesFor(companies, curves, row);
  const factor =
    interpolate(curves.agePoints, values, targetAge) / interpolate(curves.agePoints, values, row[4]);
  return row[6] * factor;
}

function buildModelBiasFacts(companies: CompaniesData, curves: CurvesData): ModelBiasFacts {
  const premiums = companies.rows.map((row) => ({
    name: row[1],
    // その会社の平均給与が、同じ産業・同じ年齢の平均の何倍か。
    value: row[6] / interpolate(curves.agePoints, curveValuesFor(companies, curves, row), row[4]),
  }));
  const sortedPremiums = premiums.map((p) => p.value).sort((a, b) => a - b);
  const top = premiums.reduce((a, b) => (b.value > a.value ? b : a));

  const sortedAges = companies.rows.map((row) => row[4]).sort((a, b) => a - b);

  const youngest = TARGET_AGES[0];
  const oldest = TARGET_AGES[TARGET_AGES.length - 1];
  const rankedIdsAt = (age: number) =>
    companies.rows
      .map((row) => ({ id: row[0], value: estimateFor(companies, curves, row, age) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 50)
      .map((r) => r.id);
  const youngestTop50 = new Set(rankedIdsAt(youngest));

  return {
    premiumMedian: quantile(sortedPremiums, 0.5),
    premiumP90: quantile(sortedPremiums, 0.9),
    premiumMax: top.value,
    premiumMaxCompanyName: top.name,
    avgAgeMedian: quantile(sortedAges, 0.5),
    meanExtrapolationByAge: TARGET_AGES.map((age) => ({
      age,
      distance:
        companies.rows.reduce((sum, row) => sum + Math.abs(age - row[4]), 0) / companies.rows.length,
    })),
    top50Overlap: rankedIdsAt(oldest).filter((id) => youngestTop50.has(id)).length,
    youngestTargetAge: youngest,
    oldestTargetAge: oldest,
  };
}

function buildFormulaExample(
  companies: CompaniesData,
  curves: CurvesData,
  row: CompanyRow,
  company: CompanyExample
): FormulaExample {
  const curveKey = companies.curveKeys[row[3]];
  // カーブは千円単位で持っているので、本文の金額と桁を揃えるため円に直す。
  const curveValues = curves.curves[curveKey].map((v) => v * 1000);
  const curveAtTargetAge = interpolate(curves.agePoints, curveValues, FORMULA_EXAMPLE_TARGET_AGE);
  const curveAtAvgAge = interpolate(curves.agePoints, curveValues, company.avgAge);

  return {
    company,
    targetAge: FORMULA_EXAMPLE_TARGET_AGE,
    curveKey,
    curveAtTargetAge,
    curveAtAvgAge,
    factor: curveAtTargetAge / curveAtAvgAge,
    estimatedSalary: Math.round(company.avgSalary * (curveAtTargetAge / curveAtAvgAge)),
  };
}
