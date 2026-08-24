/**
 * レーダーチャート「公開資料による全体像」の5軸（P1・Issue #167・アートボード 6a/6b/6d）。
 *
 * **男女の賃金の差異は軸にしない**（親 Issue #154）。数値は W1 が作った
 * 「残業・有給・男女の賃金の差異」の節に残る。図から降ろすだけで、
 * 法定開示をそのまま見せる立場は変えていない。
 *
 * **このファイルの前半（代表値と順位）は `pipeline/scripts/build-data.ts` も import する。**
 * パーセンタイルはビルド時に確定させるので、規則が2か所にあると
 * 「図の頂点」と「図の下に出る値」が別の規約で選ばれることになる。
 * **alias（`@/`）を使わない**——pipeline 側から相対パスで読むため。
 */

/** 軸の並び。**12時から時計回り**（アートボード 6a）。 */
export const RADAR_AXES = ["salary", "paidLeave", "tenure", "profit", "overtime"] as const;
export type RadarAxisKey = (typeof RADAR_AXES)[number];

/**
 * 雇用管理区分から**軸に打つ1点**を選ぶ規則。
 *
 * 節の表示（W1）は「代表を選ばない」——区分をそのまま全部並べる（spec 2.2b）。
 * だがレーダーは1軸に1点しか打てないので、ここだけは1つに決める必要がある。
 *
 * **全体値があればそれ。無ければ区分がちょうど1つのときだけその値。**
 * 区分が2つ以上ある会社は「掲載なし」にする——そこで1つを選ぶことは
 * spec 2.2b が禁じた「代表の1区分を選んで残りを捨てる」ことそのものになる。
 * **平均もしない**（spec 1.4）。
 *
 * キーエンスの有給（区分「正社員」1件・38.8%）はこの規則で軸に出る
 * ——アートボード 6a・6b がそう描いている。
 */
export function representativeValue(
  all: number | null,
  units: readonly { value: number | null }[]
): number | null {
  if (all !== null) return all;
  const values = units.filter((u) => u.value !== null);
  return values.length === 1 ? (values[0].value as number) : null;
}

/**
 * 値の並びを**順位（1が最上位）**に直す。欠測は `-1`。
 *
 * 各軸は「その指標を公表している会社の中での相対位置」（アートボード 6a の
 * 説明文）なので、**その軸に値がある会社だけを母集団にする。** 欠測を最下位として
 * 数えると、掲載率6割の軸（有給・残業）で公表している会社が軒並み上位に寄る。
 *
 * `ascendingIsBetter` が `true` の軸（残業の少なさ）は**小さいほど上位**。5軸すべてが
 * 「外側＝良い」で揃っていないとレーダーは図として読めない（#154）。
 *
 * **同値は同順位**（ランキング表の `rankAll` と同じ扱い）。
 *
 * **パーセンタイルではなく順位を持つ。** 図の頂点を打つだけならパーセンタイルで
 * 足りるが、画面には「1,867社中38位」と出すので、丸めた比から逆算すると
 * 数社ぶんずれる。
 */
export function ranks(
  values: readonly (number | null)[],
  ascendingIsBetter = false
): { rank: number[]; population: number } {
  const present = values.filter((v): v is number => v !== null);
  const sorted = [...present].sort((a, b) => (ascendingIsBetter ? a - b : b - a));
  const rankOf = new Map<number, number>();
  for (let i = 0; i < sorted.length; i++) {
    if (!rankOf.has(sorted[i])) rankOf.set(sorted[i], i + 1);
  }
  return {
    rank: values.map((v) => (v === null ? -1 : rankOf.get(v)!)),
    population: present.length,
  };
}

/**
 * 順位 → 頂点の位置（0〜1）。**1位が最も外側。**
 *
 * **最下位でも中心には置かない**（下限 `MIN_POSITION`）。中心に貼り付けると、
 * 頂点を打たない軸（掲載なし・AC-7）と見分けがつかなくなる——「掲載なし」を
 * 最低評価に見せないという #154 の判断は、逆側からも要る。
 */
export const MIN_POSITION = 0.1;

export function axisPosition(rank: number, population: number): number | null {
  if (rank < 1 || population < 1) return null;
  if (population === 1) return 1;
  const share = (population - rank) / (population - 1);
  return MIN_POSITION + (1 - MIN_POSITION) * share;
}

/**
 * 1軸ぶん。`rank` は `companies.rows` と同じ並びで、**欠測は `-1`**。
 *
 * **値そのものは持たない**（ADR-0011）。軸の4つの値はすべて別のファイルから
 * 引ける——在籍年数は `companies.json`、稼ぐ力とその業種中央値は
 * `performance.json`、有給と残業は `worklife.json` から `representativeValue` で。
 * **同じ数字を2か所に置くと、`radar.json` の `JSON.parse` が倍になる**
 * （実測 0.524ms → 0.264ms）。`import` したファイルは1バイトしか使わなくても
 * 丸ごと解析され、isolate の初回リクエストに課金される。
 */
export interface RadarAxisData {
  rank: number[];
  /** その軸に値がある会社の数。**軸ごとに違う**（有給と残業は6割前後）。 */
  population: number;
}

/**
 * `radar.json` の中身。
 *
 * **平均年収の軸は入っていない。** あれだけは表示基準（実測値 / 年齢そろえ）で
 * 変わるので、`stats.json` の `rankAll` から表示時に出す（AC-11）。
 */
export interface RadarData {
  meta: { count: number; axes: string[] };
  paidLeave: RadarAxisData;
  tenure: RadarAxisData;
  profit: RadarAxisData;
  overtime: RadarAxisData;
}

/** `performance.json` の中身（P0）。稼ぐ力の金額と業種中央値。 */
export interface PerformanceData {
  meta: { count: number; matched: number; years: number[] };
  /** `companies.rows` と同じ並び。 */
  perEmployee: (number | null)[];
  /** `companies.industries` と同じ並び。 */
  industryMedian: (number | null)[];
}

export interface RadarAxis {
  key: RadarAxisKey;
  label: string;
  /** 図に出す値（`2,178万円` / `掲載なし`）。 */
  valueText: string;
  /**
   * 頂点の位置（0〜1）。**`null` は掲載なしで、頂点を打たない**（AC-7）。
   * 中心まで引き込むと「掲載なし」と書いてあっても最低評価と同じ形に見える。
   */
  position: number | null;
  /**
   * 順位（`895社中883位`）。**モックの「上位◯%」は採らない**——
   * `上位82%` は上から82%の位置という意味だが、日本語としては上位＝良いに読める。
   * 「画面には数字だけを出し、水準は順位で読ませる」という既存の判断
   * （CLAUDE.md・偏差値の「上位◯%」を外した件）にも揃う。
   */
  rankText: string;
  /** 値の下に添える注記。無ければ空文字。 */
  note: string;
}

/** 1軸ぶんの入力。`rank` が `-1` なら掲載なし。 */
export interface RadarAxisInput {
  value: number | null;
  rank: number;
  population: number;
}

/**
 * サーバーがクライアントへ渡す1社ぶん。**平均年収は入っていない**——
 * 表示基準で変わるので、`CompanyDetail` が `stats` から作って足す（AC-11）。
 */
export interface CompanyRadarInput {
  paidLeave: RadarAxisInput;
  tenure: RadarAxisInput;
  profit: RadarAxisInput;
  overtime: RadarAxisInput;
  /** 業種の中央値（円）。稼ぐ力の軸に併記する。 */
  profitIndustryMedian: number | null;
}

const LABELS: Record<RadarAxisKey, string> = {
  salary: "平均年収（有報）",
  paidLeave: "有給の取得",
  tenure: "定着（在籍）",
  profit: "稼ぐ力",
  // **「残業の少なさ」。** 5軸すべてが「外側＝良い」で揃っていないと図として
  // 読めないので、軸の名前も少ないほうが良い向きに合わせる（#154）。
  overtime: "残業の少なさ",
};

/**
 * 5軸を組む。**書式はここで確定させる**——コンポーネントは受け取って置くだけにする。
 *
 * `format` は軸ごとの数値の書き方（万円・%・年・時間）を渡す。`features/ranking` の
 * `formatManYen` に依存させないのは、このファイルを pipeline 側も import するため。
 */
export function buildRadarAxes(
  inputs: Record<RadarAxisKey, RadarAxisInput>,
  format: Record<RadarAxisKey, (value: number) => string>,
  notes: Partial<Record<RadarAxisKey, string>> = {}
): RadarAxis[] {
  return RADAR_AXES.map((key) => {
    const { value, rank, population } = inputs[key];
    const missing = value === null || rank < 1;
    return {
      key,
      label: LABELS[key],
      valueText: missing ? "掲載なし" : format[key](value),
      position: missing ? null : axisPosition(rank, population),
      rankText: missing
        ? ""
        : `${population.toLocaleString("ja-JP")}社中${rank.toLocaleString("ja-JP")}位`,
      note: notes[key] ?? "",
    };
  });
}
