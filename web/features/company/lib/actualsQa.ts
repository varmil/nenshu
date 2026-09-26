import { formatDecimal1, formatInt, formatManYen } from "@/features/ranking/lib/format";
import type { CompanyView } from "../types";

/**
 * 回答の1文。**値だけを太字にする**ので、値の前後で3つに割って持つ。つなげると
 * 「◯◯の平均年収は2,178万円です。」の1文になる。
 */
export interface ActualsAnswer {
  before: string;
  value: string;
  after: string;
}

/** 1問。質問は見出し（h3）、回答はその直後の段落になる。 */
export interface ActualsQaItem {
  question: string;
  answer: ActualsAnswer;
}

/** 「{社名}の年収に関するQ&A」の節の文言すべて。 */
export interface ActualsQa {
  heading: string;
  note: string;
  items: ActualsQaItem[];
}

/**
 * 実測値の4項目を1問ずつの質問と回答にする（C16・Issue #838、`docs/company/spec.md` 1.22）。
 * C1 の4セルの表と C4 の地の文を置き換えた。**新しい数値は1つも出さない。**
 *
 * - **質問も回答も社名から始める。** 回答の1文だけが検索結果や AI の回答に切り出されても、
 *   どの会社の話かが残る
 * - **在籍年数は「平均勤続年数」と書く**（glossary の例外）。質問は読者が検索に打つ語に合わせる
 * - **決算期は説明（`note`）にだけ置く。** 企業詳細の決算期はこの1行と要約の節の説明の2か所
 *   （`docs/site-chrome/spec.md` 5.1）。見出し・質問・回答には入れない
 * - **従業員数の回答にだけ単体の断りを重ねる。** 説明と同じ内容だが、「◯◯の従業員数」を
 *   探す読者は連結の人数を思い浮かべていることが多く、回答だけが引用されたときに断りが落ちる
 *   と別の数字として読まれる
 * - **「推定」の語を置かない。** どれも有報の値そのもので、表示基準でも年齢でも変わらない
 *
 * **構造化データ（`FAQPage`）には流さない**（`lib/seo/jsonLd.ts`）。必要になったら、この
 * 配列から出す——画面と別に組み立てると、片方だけ直したときに食い違う。
 */
export function buildActualsQa(
  view: Pick<CompanyView, "name" | "avgSalary" | "avgAge" | "avgTenure" | "employees">,
  fiscalPeriod: string
): ActualsQa {
  const { name } = view;
  return {
    heading: `${name}の年収に関するQ&A`,
    note: `${fiscalPeriod}の有価証券報告書の値です。提出会社（単体）のもので、連結子会社の従業員は入りません。`,
    items: [
      {
        question: `${name}の平均年収はいくらですか？`,
        answer: { before: `${name}の平均年収は`, value: formatManYen(view.avgSalary), after: "です。" },
      },
      {
        question: `${name}の平均年齢は何歳ですか？`,
        answer: { before: `${name}の平均年齢は`, value: `${formatDecimal1(view.avgAge)}歳`, after: "です。" },
      },
      {
        question: `${name}の平均勤続年数は何年ですか？`,
        answer: {
          before: `${name}の平均勤続年数は`,
          value: `${formatDecimal1(view.avgTenure)}年`,
          after: "です。",
        },
      },
      {
        question: `${name}の従業員数は何人ですか？`,
        answer: {
          before: `${name}の従業員数は`,
          value: `${formatInt(view.employees)}人`,
          after: "です（提出会社単体。連結子会社の従業員は含みません）。",
        },
      },
    ],
  };
}
