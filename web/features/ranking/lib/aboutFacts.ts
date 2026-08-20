import type { CompaniesData, CompanyRow, CurvesData } from "../types";
import { curveValuesInYen, interpolate } from "./curve";
import { estimateSalary } from "./salary";
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
  /** カーブの起点（22歳）の値（円）。2点モデルの若い側のアンカー。 */
  curveAtAnchorAge: number;
  /** カーブの起点の年齢。`agePoints[0]`。 */
  anchorAge: number;
  /** カーブの目標年齢での値（円）。 */
  curveAtTargetAge: number;
  /** カーブのその会社の平均年齢での値（円）。 */
  curveAtAvgAge: number;
  estimatedSalary: number;
}

/**
 * この方法の限界を、印象ではなく数字で書くための材料。
 * 詳しい経緯は Issue #42 と `docs/ranking/estimation-model/design.md` にある。
 */
export interface ModelBiasFacts {
  /**
   * その会社の平均年間給与が、同じ産業・同じ年齢の平均の何倍か、の分布。
   * 2点モデルは、この開きが22歳の時点では無い（会社の初任給＝業種平均）と置いている。
   */
  premiumMedian: number;
  premiumP90: number;
  premiumMax: number;
  premiumMaxCompanyName: string;
  /** 掲載企業の平均年齢の中央値。ここから離れるほど推定の確からしさが落ちる。 */
  avgAgeMedian: number;
  /** 目標年齢ごとの「その会社の平均年齢からの距離」の平均。 */
  meanExtrapolationByAge: { age: number; distance: number }[];
  /** 上位50社のうち、最年少の目標年齢と最年長の目標年齢で顔ぶれが重なる社数。 */
  top50Overlap: number;
  youngestTargetAge: number;
  oldestTargetAge: number;
  /**
   * 同じ業種の2社の組のうち、目標年齢を変えると順序が入れ替わるものの割合（%）。
   * 平均年齢が同じなら順序は動かない。旧式では業種内の順序が完全に不変だった。
   */
  sameIndustrySwapPercent: number;
  /** 最年長の目標年齢での推定年収の最大値と、その会社。倍率一定が残っている側。 */
  oldestMaxEstimate: number;
  oldestMaxCompanyName: string;
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
  /** 掲載範囲。表示基準の節で「平均年齢は会社ごとに違う」ことを示すのに使う。 */
  coverage: { minAvgAge: number; maxAvgAge: number };
  /** 表示基準ごとの母集団の平均年収（円）。順位・偏差値が基準ごとに変わる根拠。 */
  population: { rawMean: number; age35Mean: number };
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
 * 会社名で引く。`id`（証券コード／EDINETコード、ADR-0006）でも引けるが、
 * 実例として本文に出るのは社名なので、参照するキーと表示する値を揃えておく。
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
    coverage: buildCoverage(companies),
    population: buildPopulationMeans(companies, curves),
  };
}

function buildCoverage(companies: CompaniesData): AboutFacts["coverage"] {
  const ages = companies.rows.map((row) => row[4]);
  return { minAvgAge: Math.min(...ages), maxAvgAge: Math.max(...ages) };
}

/**
 * 実測値と35歳そろえの母集団平均。ADR-0007 で表示基準が2つになり、順位も偏差値も
 * 基準ごとに別の分布に対して出るようになった。その差を本文で示すために使う。
 *
 * `stats.json` にも同じ値が入っているが、こちらは読まない——`/about` は静的
 * レンダリング（`○`）で、`stats.json` を import すると 1,867×9 の順位表まで
 * バンドルに引き込むことになる。ここで要るのは平均2つだけなので自分で出す。
 */
function buildPopulationMeans(
  companies: CompaniesData,
  curves: CurvesData
): AboutFacts["population"] {
  const mean = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  return {
    rawMean: mean(companies.rows.map((row) => row[6])),
    age35Mean: mean(
      companies.rows.map((row) =>
        estimateSalary(
          row[6],
          row[4],
          curveValuesFor(companies, curves, row),
          curves.agePoints,
          FORMULA_EXAMPLE_TARGET_AGE
        )
      )
    ),
  };
}

function quantile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function curveValuesFor(companies: CompaniesData, curves: CurvesData, row: CompanyRow): number[] {
  return curveValuesInYen(curves.curves[companies.curveKeys[row[3]]]);
}

function estimateFor(
  companies: CompaniesData,
  curves: CurvesData,
  row: CompanyRow,
  targetAge: number
): number {
  return estimateSalary(
    row[6],
    row[4],
    curveValuesFor(companies, curves, row),
    curves.agePoints,
    targetAge
  );
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

  const oldestTop = companies.rows
    .map((row) => ({ name: row[1], value: estimateFor(companies, curves, row, oldest) }))
    .reduce((a, b) => (b.value > a.value ? b : a));

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
    sameIndustrySwapPercent: sameIndustrySwapPercent(companies, curves),
    oldestMaxEstimate: oldestTop.value,
    oldestMaxCompanyName: oldestTop.name,
  };
}

/**
 * 同じ業種（東証33業種）の2社の組のうち、目標年齢を変えると大小が入れ替わるものの割合。
 *
 * 旧式（ADR-0003）では補正倍率が業種ごとの共通因子になり、業種内の順序は目標年齢に
 * よらず完全に不変だった。2点モデルでは平均年齢が違う会社どうしで入れ替わりうる。
 * 「順位は動かない」と書き続けないために、実測して本文に出す。
 *
 * 計算方法ページはビルド時に一度だけ描画されるので、O(n²) でも問題にならない。
 */
function sameIndustrySwapPercent(companies: CompaniesData, curves: CurvesData): number {
  const byIndustry = new Map<number, number[][]>();
  for (const row of companies.rows) {
    const estimates = TARGET_AGES.map((age) => estimateFor(companies, curves, row, age));
    const group = byIndustry.get(row[2]);
    if (group === undefined) byIndustry.set(row[2], [estimates]);
    else group.push(estimates);
  }

  let pairs = 0;
  let swapped = 0;
  for (const group of byIndustry.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        pairs++;
        const first = group[i][0] > group[j][0];
        if (TARGET_AGES.some((_, k) => group[i][k] > group[j][k] !== first)) swapped++;
      }
    }
  }
  return pairs === 0 ? 0 : (swapped / pairs) * 100;
}

function buildFormulaExample(
  companies: CompaniesData,
  curves: CurvesData,
  row: CompanyRow,
  company: CompanyExample
): FormulaExample {
  const curveKey = companies.curveKeys[row[3]];
  // カーブは千円単位で持っているので、本文の金額と桁を揃えるため円に直す。
  const curveValues = curveValuesInYen(curves.curves[curveKey]);
  const curveAtTargetAge = interpolate(curves.agePoints, curveValues, FORMULA_EXAMPLE_TARGET_AGE);
  const curveAtAvgAge = interpolate(curves.agePoints, curveValues, company.avgAge);

  return {
    company,
    targetAge: FORMULA_EXAMPLE_TARGET_AGE,
    curveKey,
    anchorAge: curves.agePoints[0],
    curveAtAnchorAge: curveValues[0],
    curveAtTargetAge,
    curveAtAvgAge,
    estimatedSalary: estimateSalary(
      company.avgSalary,
      company.avgAge,
      curveValues,
      curves.agePoints,
      FORMULA_EXAMPLE_TARGET_AGE
    ),
  };
}
