import { formatDecimal1, formatInt, formatManYen } from "@/features/ranking/lib/format";
import type { CompanyRow } from "@/features/ranking/types";
import { periodLabel } from "@/lib/data/period";
import type { WorklifeData } from "@/lib/data/worklife";
import type { PageMeta } from "@/lib/seo/pageMeta";
import type { CardFact } from "./cardFacts";

/**
 * ランキングの外にいる理由（refresh の D9・#879・D11・#903）。`pipeline/scripts/lib/ledger.ts` の
 * `UnrankedReason` と同じ値。
 *
 * - `lapsed`: 最後の有報の提出から24か月たった（ADR-0018）。数字は最後の有報のもの
 * - `belowLine`: 載っていた会社の最新の有報が、単体従業員の線を割った（ADR-0018 の 2026-09-30 の
 *   追記）。数字はその最新の有報のもの
 */
export type UnrankedReason = "lapsed" | "belowLine";

/**
 * ランキングの外の会社。`pipeline/scripts/build-data.ts` が `unranked.json` に書く。**ランキングにも
 * 母集団の統計にも入らない**が、企業ページは残す。
 *
 * 行の形は `companies.rows` と同じで、**業種と決算期の添字はこのファイルの中のプールを指す**
 * （`companies.json` の添字ではない）。
 */
export interface UnrankedData {
  industries: string[];
  periods: string[];
  rows: CompanyRow[];
  reasonById: Record<string, UnrankedReason>;
  /** 最後の有報の提出日（`YYYY-MM-DD`）。 */
  filedById: Record<string, string>;
  /** 連結の従業員数。**単体より多い会社だけ**持つ。 */
  consolidatedById: Record<string, number>;
  /** 働きやすさ。`worklife.json` と同じ形で、行は `rows` と同じ並び。 */
  worklife: WorklifeData;
}

/** ランキングの外の会社のページが使う1社ぶんの値。`buildActualsQa` にそのまま渡せる形。 */
export interface UnrankedCompany {
  id: string;
  name: string;
  tse33: string;
  avgAge: number;
  avgTenure: number;
  avgSalary: number;
  employees: number;
  /** 連結の従業員数。単体より多いときだけ。 */
  employeesConsolidated: number | null;
  hasBadge: boolean;
  reason: UnrankedReason;
  /** 数字の有報の決算期（`2026年6月期`）。 */
  fiscalPeriod: string;
  /** 数字の有報の提出日（`2025年8月26日`）。 */
  filed: string;
}

/** `2025-08-26` → `2025年8月26日`。 */
export function dateLabel(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (match === null) throw new Error(`日付が YYYY-MM-DD の形でありません: ${date}`);
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`;
}

/** 1社ぶんを引く。**無ければ `null`**（母集団の会社）。 */
export function findUnranked(data: UnrankedData, id: string): UnrankedCompany | null {
  const row = data.rows.find((r) => r[0] === id);
  if (row === undefined) return null;
  const period = data.periods[row[9]];
  const tse33 = data.industries[row[2]];
  const filed = data.filedById[id];
  const reason = data.reasonById[id];
  if (period === undefined || tse33 === undefined || filed === undefined || reason === undefined) {
    throw new Error(`unranked.json の ${id} の業種・決算期・提出日・理由が引けません`);
  }
  return {
    id,
    name: row[1],
    tse33,
    avgAge: row[4],
    avgTenure: row[5],
    avgSalary: row[6],
    employees: row[7],
    employeesConsolidated: data.consolidatedById[id] ?? null,
    hasBadge: row[8] === 1,
    reason,
    fiscalPeriod: periodLabel(period),
    filed: dateLabel(filed),
  };
}

/**
 * 社名の直下に置く断り（refresh spec 1.16・AC-7）。ランキング・順位・偏差値に入っていない理由を
 * 見出しで言い切る（ページの下のほうで順位の無さに気づいた読者が、上に戻らなくても分かるように）。
 *
 * - 提出が途切れた会社: **最後の有報の決算期と提出日、提出が途切れていること**
 * - 線を割った会社: **単体の従業員数と線、数字が提出会社だけのものであること**。持株会社に移った
 *   会社は単体が数十人の管理部門だけになり、その平均はグループの社員の平均とは別物になる
 *   （サイバーステップＨＤ・#893）ので、連結の人数があれば並べる
 *
 * `minEmployees` は掲載の条件の線（`companies.meta.excluded.minEmployees`）。
 */
export function unrankedNotice(
  company: UnrankedCompany,
  minEmployees: number
): { heading: string; body: string } {
  if (company.reason === "lapsed") {
    return {
      heading: "有価証券報告書の提出が途切れています",
      body:
        `${company.name}の最後の有価証券報告書は、${company.filed}に提出された${company.fiscalPeriod}のものです。` +
        "それから2年以上、新しい有報が出ていないため、ランキングと順位・偏差値の計算から外しています。" +
        "このページの数字は、その最後の有報のものです。",
    };
  }
  const employees = formatInt(company.employees);
  return {
    heading: `単体の従業員が${formatInt(minEmployees)}人を下回っています`,
    body:
      `${company.name}の${company.fiscalPeriod}の有価証券報告書では、提出会社（単体）の従業員が${employees}人です。` +
      `ランキングは単体の従業員が${formatInt(minEmployees)}人以上の会社で作っているため、` +
      "ランキングと順位・偏差値の計算から外しています。" +
      (company.employeesConsolidated === null
        ? `このページの数字は、提出会社の${employees}人の平均です。`
        : `このページの数字は提出会社の${employees}人の平均で、` +
          `グループ全体（連結${formatInt(company.employeesConsolidated)}人）の平均ではありません。`),
  };
}

/**
 * カードの金額の下の1文。**決算期は書かない**——すぐ上の断りが言っており、企業詳細で決算期を出すのは
 * 2か所まで（`docs/site-chrome/spec.md` 5.1。この画面では断りと Q&A の説明）。
 *
 * 提出が途切れた会社は**「最新の」とは書かない**。線を割った会社の数字は最新の有報のものなので、
 * 通常の企業詳細（`buildCardLead`）と同じ言い方にする。
 */
export function unrankedCardLead(company: UnrankedCompany): string {
  const amount = ` 約${formatManYen(company.avgSalary)}（平均年齢${formatDecimal1(company.avgAge)}歳）です。`;
  return company.reason === "lapsed"
    ? `${company.name}の最後の有価証券報告書に載っている平均年収は${amount}`
    : `${company.name}の最新の有価証券報告書に基づく平均年収は${amount}`;
}

/** カードの1段（平均年齢・従業員数）。通常の企業詳細の1段目と同じ（順位の段は無い）。 */
export function unrankedCardFacts(company: UnrankedCompany): CardFact[] {
  return [
    { label: "平均年齢", value: `${formatDecimal1(company.avgAge)}歳` },
    { label: "従業員数（単体）", value: `${formatInt(company.employees)}人` },
  ];
}

/**
 * title・description・canonical。**順位は出さない**（母集団の外）。ランキングにいない理由を
 * description の中で言う——検索結果の抜粋だけを読んだ人に、いまの数字だと思わせない（提出が
 * 途切れた会社）・ランキングに載っていると思わせない（線を割った会社）。
 */
export function unrankedPageMeta(company: UnrankedCompany, minEmployees: number): PageMeta {
  const head =
    `${company.name}（${company.tse33}）の平均年間給与は${formatManYen(company.avgSalary)}` +
    `（平均年齢${formatDecimal1(company.avgAge)}歳・平均勤続${formatDecimal1(company.avgTenure)}年）。`;
  return {
    canonical: `/company/${company.id}`,
    title: `${company.name}の平均年収 | 有価証券報告書は${formatManYen(company.avgSalary)}`,
    description:
      company.reason === "lapsed"
        ? head +
          `${company.filed}に提出された${company.fiscalPeriod}の有価証券報告書を最後に、有報の提出が途切れています。` +
          "金融庁 EDINET の有価証券報告書に載っている提出会社単体の実測値です。"
        : head +
          `単体の従業員が${formatInt(minEmployees)}人を下回ったため、ランキングには載せていません。` +
          `金融庁 EDINET の有価証券報告書（${company.fiscalPeriod}）に載っている提出会社単体の実測値です。`,
  };
}
