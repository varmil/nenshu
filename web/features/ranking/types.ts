export type TargetAge = 25 | 30 | 35 | 40 | 45 | 50 | 55 | 60;

export const TARGET_AGES: readonly TargetAge[] = [25, 30, 35, 40, 45, 50, 55, 60];

/**
 * 1ページあたりの表示件数（Issue #103）。
 *
 * **100件は1画面のスクロール量として多すぎる**という指摘を受けて30件にした。
 * **この値は送るデータ量を決めない**——全件は初回に1度だけアセットとして届き
 * （E0・ADR-0013）、HTML に入るのは1ページぶんだけになる。変わるのは描画する
 * 行数と、サーバーが直列化する行数の両方。
 */
export const PAGE_SIZE = 30;

/**
 * 並び替えのキー（spec.md 1.10）。既定は `salary`。
 *
 * **並び替えても順位は振り直さない。** 順位は「表示基準の金額で何位か」を意味する
 * ので、`age` で並べた表の順位列は 1,204位 / 87位 … と飛ぶのが正しい。
 */
export type SortKey = "salary" | "age" | "employees";

export const SORT_KEYS: readonly SortKey[] = ["salary", "age", "employees"];

/** 並びの向き（Issue #106）。 */
export type SortOrder = "asc" | "desc";

/**
 * 並びの選択。**軸と向きは1つの値で持つ**（Issue #106）。
 *
 * `RankingState` に `sort` と `sortOrder` を並べて置くと、`Partial<RankingState>` の
 * 差分で片方だけ当てられてしまう——`{ sort: "age" }` だけを当てると向きは前の軸の
 * ものが残り、「平均年齢を降順で」という誰も選んでいない並びになる（実際に一度そう
 * 書いて、既存のテストがその形で落ちた）。軸を変える操作は必ず向きも決めるので、
 * 型の上でも一緒にしておく。
 *
 * 軸に向きを混ぜた文字列（`"age-desc"` を `SortKey` に足す）にはしない。「同じ軸を
 * もう一度押したか」の判定が毎回の文字列の切り出しになる。それはURLの綴りの話なので
 * `lib/urlState.ts` に閉じておく。
 */
export interface SortSelection {
  key: SortKey;
  order: SortOrder;
}

export type EmployeeSizeBucket = "under300" | "300to1000" | "1000plus";
export type TenureBucket = "under13" | "13to17" | "17plus";
export type AvgAgeBucket = "under40" | "40to43" | "43plus";

export type CompanyRow = [
  id: string,
  name: string,
  tse33Idx: number,
  curveIdx: number,
  avgAge: number,
  avgTenure: number,
  avgSalary: number,
  employees: number,
  badge: 0 | 1,
  /** その会社の決算期。`CompaniesData.periods` への添字（E1）。 */
  periodIdx: number,
];

/**
 * `companies.json` の `meta`。**画面と title・description に出る「社数」と
 * 「決算期」はどちらもここから引く**——直書きすると年1回のデータ更新で
 * そこだけ古い数字が残る（`docs/site-chrome/spec.md` 1.4・5.3）。
 */
export interface CompaniesMeta {
  /** データの版（提出期。`YYYY-MM`）。 */
  version: string;
  count: number;
  /**
   * 掲載データの決算期の**幅**（`YYYY-MM` の最古と最新。E1）。文字列にするのは
   * `lib/data/period.ts`。**代表を1つ選ぶのはやめた**——母集団を広げると最頻は
   * 63.5% まで下がり、1,081社の決算期が違うまま代表を名乗ることになる。
   */
  fiscalPeriodRange: { from: string; to: string };
  /**
   * 有報を取りに行った窓（`YYYY-MM-DD`。E2・ADR-0011）。**回した日から遡って
   * 12か月**なので、日付を直書きできない——`/about` の「EDINET に◯◯に提出された
   * もの」はここから組み立てる。**決算期（`fiscalPeriodRange`）とは別物**で、
   * あちらは会社ごとの期末、こちらは提出日の範囲になる。
   */
  filingWindow: { from: string; to: string };
  /**
   * 掲載しなかった会社（E2・`docs/expansion/spec.md` 1.3）。**条件そのものは
   * `/about` に理由付きで書いてあるが、それが何社を落としているかは書いていな
   * かった**——窓を広げると掲載社数の3分の1を超える会社がこの線で落ちるので、
   * 数を出さないと「有報を出している会社は全部載っている」と読めてしまう
   * （運営者の指示・2026-08-24）。**社数と同じく直書きせずデータから引く。**
   */
  excluded: {
    /** 単体従業員数の下限（人）。 */
    minEmployees: number;
    /** その線で省いた社数。 */
    byEmployees: number;
  };
  generatedAt: string;
}

/**
 * `/` がサーバーから受け取るもの（E0・ADR-0013）。**全社ぶんの配列は入っていない。**
 *
 * `RankingApp` は `"use client"` なので、props はハイドレーション用データとして
 * HTML に直列化される。**全2,961社を渡していた頃はそれが `/` の gzip の 85.8%
 * （78,722 B）を占めていた**——しかも `/?age=25`・`/?ind=銀行業`・`/?page=2` …の
 * どのURLのHTMLにも同じものが入っていた。
 *
 * **クライアントは初回に1度だけ `dataUrl` から全件を取る。** 届くまでは `page`
 * （そのURLで表示する1ページぶん）を出し、操作は実ナビゲーションに倒す——
 * すべての状態は URL にあり、`/` はどの URL でも正しく SSR できる（ADR-0004）。
 */
export interface RankingBootstrap {
  meta: CompaniesMeta;
  /** 業種名（33件）。フィルタの選択肢と業種チップに要る。 */
  industries: string[];
  /**
   * 業種ごとの社数。**母集団の内訳なので絞り込みでは変わらない**——全件が
   * 届いた後も数え直さず、この値を使い続ける。
   */
  industryCounts: number[];
  /** そのURLで表示する1ページぶん。全件が届くまでこれを出す。 */
  page: RankingPage;
  /**
   * ロゴの有無（`companies.rows` と同じ並びの1文字ずつ・gzip 約540B）。
   * **開くには `rows` が要る**ので、全件が届いてから `logoIdSet` に通す。
   */
  logoMask: string;
  /** いま出ている1ページぶんのうちロゴを持つID。全件が届くまでの代わり。 */
  pageLogoIds: string[];
  /**
   * 全件データの在り処。**クエリで版を切る**（`?v=<generatedAt のミリ秒>`）——
   * `/` はブラウザ1時間・エッジ24時間キャッシュされる（ADR-0004）ので、
   * 古いHTMLが新しいJSONを引く組み合わせが起きうる。
   */
  dataUrl: string;
}

/** 1ページぶんの描画に要るもの。サーバーもクライアントも同じ形で持つ。 */
export interface RankingPage {
  companies: RankedCompany[];
  totalCount: number;
  /** 年収バーの基準（そのページの1位の金額）。 */
  pageMaxSalary: number;
}

export interface CompaniesData {
  meta: CompaniesMeta;
  industries: string[];
  curveKeys: string[];
  /** 会社ごとの決算期（`YYYY-MM`・昇順）。`rows` の `periodIdx` がここを指す。 */
  periods: string[];
  rows: CompanyRow[];
}

export interface CurvesData {
  agePoints: number[];
  curves: Record<string, number[]>;
}

export interface RankingState {
  /**
   * 表示基準。`null` は「実測値」＝有報の平均年間給与そのまま（既定）で、
   * 数値なら「年齢そろえ」＝その年齢に補正した推定年収を出す（ADR-0007）。
   *
   * モードと年齢を別々のフィールドに分けていない。分けると「実測値なのに年齢が
   * 入っている」状態が表現できてしまい、どちらを優先するかの分岐がURL・state・
   * 描画のそれぞれに要る。1つの値にすれば矛盾した状態を型の上で作れない。
   */
  targetAge: TargetAge | null;
  industry: string | null;
  employeeSize: EmployeeSizeBucket | null;
  tenure: TenureBucket | null;
  avgAgeBucket: AvgAgeBucket | null;
  query: string;
  /** 表示の並び（軸と向き）。順位（＝金額での位置）とは別物。 */
  sort: SortSelection;
  /** 1始まり。 */
  page: number;
}

export interface RankedCompany {
  id: string;
  name: string;
  tse33: string;
  hasBadge: boolean;
  avgAge: number;
  avgTenure: number;
  avgSalary: number;
  employees: number;
  /** 年齢そろえのときの推定年収（円）。実測値のときは `null`（`avgSalary` を出す）。 */
  estimatedSalary: number | null;
  /** 絞り込み後の順位。1から振り直す（AC-3）。 */
  rank: number;
  /**
   * 絞り込みを掛けない全2,961社の中での順位。「上位◯%」の分子になる。
   *
   * `rank` と分けているのは、偏差値の隣に置く水準が**母集団の中での位置**でなければ
   * ならないため（`docs/product/glossary.md`: 偏差値は単独で出さない）。海運業7社に
   * 絞ったときの `rank` は1〜7で、これを分子にすると「上位14%」のような無意味な値になる。
   */
  populationRank: number;
}

/**
 * 偏差値と全体平均の線に要る母集団統計だけを抜いたもの（spec.md 1.11・1.12）。
 *
 * **`stats.json` 全体（raw 130KB）をクライアントに渡さない。** ランキングページは
 * 1,867社ぶんの行を既にHTMLに埋め込んでおり（gzip 66KB・Issue #22）、順位表
 * `rankAll` / `rankIndustry` まで載せると予算を大きく超える。ここで要るのは
 * 表示基準ごとの平均と標準偏差の9組だけで、`app/page.tsx` が抜いて渡す。
 */
export interface PopulationStats {
  /** 母集団の社数（1,867）。 */
  count: number;
  /** 表示基準の並び。先頭の `null` が実測値、続いて TARGET_AGES（ADR-0007）。 */
  bases: (number | null)[];
  /** 円。`bases` と同じ並び。sd は母標準偏差。 */
  population: { mean: number; sd: number }[];
}
