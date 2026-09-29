import { formatDecimal1, formatInt, formatManYen } from "@/features/ranking/lib/format";
import type { CompanyRow } from "@/features/ranking/types";
import { periodLabel } from "@/lib/data/period";
import type { WorklifeData } from "@/lib/data/worklife";
import type { PageMeta } from "@/lib/seo/pageMeta";
import type { CardFact } from "./cardFacts";

/**
 * 最後の有報から24か月を過ぎて母集団から外れた会社（refresh の D9・#879・ADR-0018）。
 * `pipeline/scripts/build-data.ts` が `lapsed.json` に書く。**ランキングにも母集団の統計にも入らない**
 * が、企業ページは残す。
 *
 * 行の形は `companies.rows` と同じで、**業種と決算期の添字はこのファイルの中のプールを指す**
 * （`companies.json` の添字ではない）。
 */
export interface LapsedData {
  industries: string[];
  periods: string[];
  rows: CompanyRow[];
  /** 最後の有報の提出日（`YYYY-MM-DD`）。 */
  filedById: Record<string, string>;
  /** 働きやすさ。`worklife.json` と同じ形で、行は `rows` と同じ並び。 */
  worklife: WorklifeData;
}

/** 外れた会社のページが使う1社ぶんの値。`buildActualsQa` にそのまま渡せる形。 */
export interface LapsedCompany {
  id: string;
  name: string;
  tse33: string;
  avgAge: number;
  avgTenure: number;
  avgSalary: number;
  employees: number;
  hasBadge: boolean;
  /** 最後の有報の決算期（`2026年6月期`）。 */
  fiscalPeriod: string;
  /** 最後の有報の提出日（`2025年8月26日`）。 */
  filed: string;
}

/** `2025-08-26` → `2025年8月26日`。 */
export function dateLabel(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (match === null) throw new Error(`日付が YYYY-MM-DD の形でありません: ${date}`);
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`;
}

/** 1社ぶんを引く。**無ければ `null`**（母集団の会社）。 */
export function findLapsed(data: LapsedData, id: string): LapsedCompany | null {
  const row = data.rows.find((r) => r[0] === id);
  if (row === undefined) return null;
  const period = data.periods[row[9]];
  const tse33 = data.industries[row[2]];
  const filed = data.filedById[id];
  if (period === undefined || tse33 === undefined || filed === undefined) {
    throw new Error(`lapsed.json の ${id} の業種・決算期・提出日が引けません`);
  }
  return {
    id,
    name: row[1],
    tse33,
    avgAge: row[4],
    avgTenure: row[5],
    avgSalary: row[6],
    employees: row[7],
    hasBadge: row[8] === 1,
    fiscalPeriod: periodLabel(period),
    filed: dateLabel(filed),
  };
}

/**
 * 社名の直下に置く断り（spec 1.16・AC-7）。**最後の有報の決算期と、提出が途切れていること**が
 * 読める。ランキング・順位・偏差値に入っていない理由もここで言う（ページの下のほうで順位の無さに
 * 気づいた読者が、上に戻らなくても分かるように見出しで言い切る）。
 */
export function lapsedNotice(company: LapsedCompany): { heading: string; body: string } {
  return {
    heading: "有価証券報告書の提出が途切れています",
    body:
      `${company.name}の最後の有価証券報告書は、${company.filed}に提出された${company.fiscalPeriod}のものです。` +
      "それから2年以上、新しい有報が出ていないため、ランキングと順位・偏差値の計算から外しています。" +
      "このページの数字は、その最後の有報のものです。",
  };
}

/** カードの金額の下の1文。**「最新の」とは書かない**（通常の `buildCardLead` との違い）。 */
export function lapsedCardLead(company: LapsedCompany): string {
  return (
    `${company.name}の最後の有価証券報告書（${company.fiscalPeriod}）に載っている平均年収は ` +
    `約${formatManYen(company.avgSalary)}（平均年齢${formatDecimal1(company.avgAge)}歳）です。`
  );
}

/** カードの1段（平均年齢・従業員数）。通常の企業詳細の1段目と同じ（順位の段は無い）。 */
export function lapsedCardFacts(company: LapsedCompany): CardFact[] {
  return [
    { label: "平均年齢", value: `${formatDecimal1(company.avgAge)}歳` },
    { label: "従業員数（単体）", value: `${formatInt(company.employees)}人` },
  ];
}

/**
 * title・description・canonical。**順位は出さない**（母集団の外）。提出が途切れていることを
 * description の中で言う——検索結果の抜粋だけを読んだ人に、いまの数字だと思わせない。
 */
export function lapsedPageMeta(company: LapsedCompany): PageMeta {
  return {
    canonical: `/company/${company.id}`,
    title: `${company.name}の平均年収 | 有価証券報告書は${formatManYen(company.avgSalary)}`,
    description:
      `${company.name}（${company.tse33}）の平均年間給与は${formatManYen(company.avgSalary)}` +
      `（平均年齢${formatDecimal1(company.avgAge)}歳・平均勤続${formatDecimal1(company.avgTenure)}年）。` +
      `${company.filed}に提出された${company.fiscalPeriod}の有価証券報告書を最後に、有報の提出が途切れています。` +
      "金融庁 EDINET の有価証券報告書に載っている提出会社単体の実測値です。",
  };
}
