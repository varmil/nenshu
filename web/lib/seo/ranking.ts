import type { Metadata } from "next";
import { INITIAL_STATE, parseSearchParams } from "@/features/ranking/lib/urlState";
import { PAGE_SIZE } from "@/features/ranking/types";
import type { CompaniesData, RankingState, TargetAge } from "@/features/ranking/types";
import { fiscalPeriodLabel } from "@/lib/data/period";
import { toMetadata, type PageMeta } from "./pageMeta";
import { SITE_NAME } from "./site";

/** `/?age=N`。`age` は数値なのでエンコードは要らない。 */
export function agePath(age: TargetAge): string {
  return `/?age=${age}`;
}

/**
 * `/?ind=X`。**業種名は日本語なので必ずエンコードする。**
 * canonical も sitemap もここを通し、生の文字列を混ぜない。
 */
export function industryPath(industry: string): string {
  return `/?ind=${encodeURIComponent(industry)}`;
}

/**
 * ランキングURLの正規化。`path` が canonical で、`targetAge`・`industry`・`page` は
 * その canonical が表す状態（title・description はここから組み立てる）。
 */
export interface RankingCanonical {
  path: string;
  targetAge: TargetAge | null;
  industry: string | null;
  /** 1始まり。1 なら canonical にクエリとして出さない。 */
  page: number;
}

/**
 * canonical に `page` を付ける形。`buildSearchParams` と同じ並び（`page` は最後）に
 * そろえてある——ランキング側が作るURLと canonical の文字列が食い違わないため。
 */
function withPage(base: string, page: number): string {
  if (page <= 1) return base;
  return base === "/" ? `/?page=${page}` : `${base}&page=${page}`;
}

/**
 * ADR-0006 のインデックス戦略を関数にしたもの。インデックスさせるのは
 * `/`・`/?age=N`（8件）・`/?ind=X`（33件）だけで、それ以外は寄せる。
 *
 * **`?age=N&ind=X` は業種側（`/?ind=X`）に寄せる。** ADR-0006 は当初これを年齢側に
 * 置いていたが、ADR-0007 で既定が実測値になり「年齢補正が主軸」という前提が
 * 弱まったため、U8 の実装時に決め直した（ADR-0006 の追記）。業種は行の部分集合を
 * 決めるフィルタなので `/?ind=X` とは同じ会社が並ぶ near-duplicate になる。一方
 * `/?age=N` は1,867社が並ぶ別物で、重複しているのは業種側である。
 *
 * **ページ送りは寄せない。自己canonical にする。** `/?page=2` は `/` の複製ではなく、
 * 別の30社が並ぶ別のページである。**しかもページから `<a href>` で辿れる企業ページは
 * 30件しかなく、残り1,837社への内部リンクはページ2〜63の中にしか存在しない**
 * （`RankingPagination` は `<a href="?page=N">` の実体を持つ）。ここを `/` の複製だと
 * 宣言すると、Google はページ2以降のクロール頻度を落とし、1,837社への内部リンク経路を
 * 細める。Google のページネーション指針も「連番の各ページに自分自身の canonical を
 * 与え、先頭ページに寄せるな」と明記している。sitemap には1ページ目しか載せないので、
 * インデックスを勧めているわけではない——辿り着ける道を残すだけである。
 *
 * **不正な値は寄せる判断に使わない。** `parseSearchParams` が既定値に倒すので、
 * `?emp=xyz` は「emp が効いている」とは見なさず `/` そのものとして扱う。
 */
export function rankingCanonical(
  params: URLSearchParams,
  companies: CompaniesData,
  industryCount: (industry: string) => number
): RankingCanonical {
  const state: RankingState = { ...INITIAL_STATE, ...parseSearchParams(params) };

  // インデックスさせない絞り込みが1つでも効いていれば、フィルタ無しの一覧へ寄せる。
  // **`page` はここに入れない。** ページ2以降は `/` の複製ではなく、別の30社が
  // 並ぶ別のページである（上の「ページ送り」を参照）。
  const hasUnindexed =
    state.employeeSize !== null ||
    state.tenure !== null ||
    state.avgAgeBucket !== null ||
    state.query !== "" ||
    // 向きだけ違う `?sort=salary-asc` も並びが違うページなので寄せる（Issue #106）。
    state.sort.key !== INITIAL_STATE.sort.key ||
    state.sort.order !== INITIAL_STATE.sort.order;
  if (hasUnindexed) return { path: "/", targetAge: null, industry: null, page: 1 };

  // 33件のリスト外の業種名は、URLとしては通るがページとしては0件なので寄せる。
  const industry =
    state.industry !== null && companies.industries.includes(state.industry)
      ? state.industry
      : null;

  const base =
    industry !== null
      ? industryPath(industry)
      : state.targetAge !== null
        ? agePath(state.targetAge)
        : "/";

  // 総ページ数を超える `page` は落として先頭へ寄せる。`?page=999` は最終ページと
  // 同じ7社を200で返すので、自己canonical にすると実在しないURLを正規URLとして
  // 申告することになる。
  // 行数は業種でしか変わらない（年齢は金額を書き換えるだけで行は減らない）ので、
  // 総ページ数はフィルタを実際に走らせなくても出せる。
  const rows = industry !== null ? industryCount(industry) : companies.meta.count;
  const maxPage = Math.max(1, Math.ceil(rows / PAGE_SIZE));
  const page = state.page >= 2 && state.page <= maxPage ? state.page : 1;

  return {
    path: withPage(base, page),
    targetAge: industry !== null ? null : state.targetAge,
    industry,
    page,
  };
}

/**
 * canonical と、その canonical が表すページの title・description。
 *
 * **「有価証券報告書」は全ページの description に入れる。** description は順位を
 * 動かさないが SERP のスニペットに出る。OpenWork の口コミベースの数字と並んだ
 * ときに読者が見分けられるかどうかがそこで決まる（`docs/ranking/intent.md` の
 * 差別化要因）。**タイトルに入れるのは `/` だけ**——競合6社を実測すると、
 * タイトルで競っているのは鮮度（「2026年8月最新」）と規模（TOP100・21626社）で、
 * 出所をタイトルに置いている競合は1つも無い。8件・33件のファセットページでは
 * 「◯歳」「業種名」のほうが情報量が高く、限られた文字数をそちらに使う。
 *
 * **年齢そろえの description には推定であることを書く**（`docs/ranking/spec.md` AC-9）。
 * 実測値のページには推定の語を1つも出さない。
 *
 * **決算期は全ページの description に入れ、タイトルには `/` の末尾にだけ置く**
 * （`docs/site-chrome/spec.md` 5.・AC-17/AC-18）。前に置くと、差別化要因である
 * 「有価証券報告書」がSERPで見える位置から押し出される。社数と同じく
 * `companies.meta` から引く——直書きすると年1回のデータ更新でそこだけ古い年が残る。
 */
export function rankingPageMeta(
  params: URLSearchParams,
  companies: CompaniesData,
  industryCount: (industry: string) => number
): PageMeta {
  const canonical = rankingCanonical(params, companies, industryCount);
  const total = companies.meta.count.toLocaleString("ja-JP");
  const period = fiscalPeriodLabel(companies.meta);

  /**
   * ページ2以降のタイトルに付ける印。Google は「連番のページは同じタイトルで
   * よい」としているので必須ではないが、63枚が同一タイトルだと Search Console の
   * 重複タイトル警告に埋もれて、本当の重複を見落とす。
   */
  const pageSuffix = canonical.page >= 2 ? `（${canonical.page}ページ目）` : "";

  if (canonical.industry !== null) {
    const count = industryCount(canonical.industry).toLocaleString("ja-JP");
    return {
      title: `${canonical.industry}の平均年収ランキング${pageSuffix} | ${SITE_NAME}`,
      description:
        `${canonical.industry}${count}社の平均年収ランキング。` +
        `金融庁 EDINET の有価証券報告書（${period}）に載っている平均年間給与そのままの実測値を、` +
        `順位・偏差値・平均年齢つきで比較できる。`,
      canonical: canonical.path,
    };
  }

  if (canonical.targetAge !== null) {
    return {
      title: `${canonical.targetAge}歳年収ランキング${pageSuffix} | ${SITE_NAME}`,
      description:
        `有価証券報告書（${period}）の平均年間給与を${canonical.targetAge}歳時点に補正した推定年収のランキング。` +
        `平均年齢の違いをならしたうえで、上場・非上場${total}社を比較できる。`,
      canonical: canonical.path,
    };
  }

  // `/`（実測値・フィルタ無しの一覧）。ブランドを先頭に置く形は
  // `docs/site-chrome/spec.md` の決めどおりで、その後ろを主軸キーワードにした。
  // 社数は `companies.meta.count` から引く——直書きすると、年1回のデータ更新の
  // たびにタイトルだけ古い数字で残る。
  // ページ2以降は社数を出さない。「1,867社（3ページ目）」は読みにくいうえ、
  // そもそも2ページ目以降が検索結果に出ることはほぼ無い。
  // 決算期は社数と同じ「規模と鮮度」の情報なので、社数の隣＝末尾に置く（spec 1.4・5.）。
  // ページ番号はさらにその後ろ——2ページ目以降が検索結果に出ることはほぼ無いので、
  // 限られた文字数の先を鮮度に使う。
  return {
    title:
      canonical.page >= 2
        ? `${SITE_NAME} | 有価証券報告書ベースの平均年収ランキング【${period}】${pageSuffix}`
        : `${SITE_NAME} | 有価証券報告書ベースの平均年収ランキング ${total}社【${period}】`,
    description:
      `金融庁 EDINET の有価証券報告書（${period}）に載っている平均年間給与そのままの実測値で、` +
      `上場・非上場${total}社の年収を比較する。` +
      `平均年齢の違いをならした推定年収に切り替えて並べ直すこともできる。`,
    canonical: canonical.path,
  };
}

/**
 * `app/page.tsx` の `generateMetadata` が返す形。**文言は `rankingPageMeta` が持ち、
 * ここは包むだけ**——同じ文言をクライアント（`RankingApp`）も引くため（U16）。
 */
export function rankingMetadata(
  params: URLSearchParams,
  companies: CompaniesData,
  industryCount: (industry: string) => number
): Metadata {
  return toMetadata(rankingPageMeta(params, companies, industryCount));
}
