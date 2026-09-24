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
 * 図の**右に出す指標リストの並び**（アートボード 6b）。図の時計回りとは違う。
 *
 * **稼ぐ力を最後に置く**（Issue #191）。この行だけが2行ぶんの高さを持つ
 * （下に「1人あたり経常利益」と業種中央値が付く）ので、途中に挟むと
 * そこで行の間隔が崩れる。**末尾なら下に続く行が無い。**
 */
export const RADAR_LIST_ORDER = [
  "salary",
  "overtime",
  "paidLeave",
  "tenure",
  "profit",
] as const satisfies readonly RadarAxisKey[];

/**
 * 雇用管理区分から**軸に打つ1点**を選ぶ規則。
 *
 * 節の表示（W1）は「代表を選ばない」——区分をそのまま全部並べる（spec 2.2b）。
 * だがレーダーは1軸に1点しか打てないので、ここだけは1つに決める必要がある。
 *
 * 1. **全体値があればそれ**
 * 2. 無ければ、**値のある区分のうち先頭**（会社が登録した順。節の先頭の行と同じ）
 * 3. 区分にも値が無ければ掲載なし
 *
 * **区分が2つ以上ある会社でも先頭の値で点を打つ**（W3・#802）。W2 までは
 * 頂点を打たずに「区分別」と書いていたが、有給222社・残業112社の図から軸が
 * 1本欠けていた。先頭には正社員・総合職のような主たる区分が来ていることが多く
 * （有給の76%・残業の72%）、全体値と両方持つ会社で測ると先頭とのずれは小さい
 * （有給 −1.5pt・残業 +0.2h。中央値）。
 *
 * **区分名で振り分けない。** 先頭が管理職・男性・部門の会社もある（有給54社・
 * 残業31社）が、名前で飛ばす判定は spec 2.2b が禁じた「区分名を分類する」ことに
 * なる。代わりに**どの区分の値かを画面に書く**（`unitPickNote`）。**平均もしない**
 * （spec 1.4）——人数の重みが無いぶん実際の全体値とずれる。
 *
 * キーエンスの有給（区分「正社員」1件・38.8%）はこの規則で軸に出る
 * ——アートボード 6a・6b がそう描いている。
 */
export function representativeValue(
  all: number | null,
  units: readonly { value: number | null }[]
): number | null {
  return representative(all, units).value;
}

/**
 * `representativeValue` に**先頭の区分を選んだかどうか**を添えた版（W3・#802）。
 *
 * `pickedUnit` は**2つ以上ある区分から先頭を選んだとき**だけ、その区分名になる。
 * 区分がちょうど1つの会社は選んでいない（登録された値が1つしか無い）ので `null`
 * ——W2 までと同じく断りを出さない。
 */
export function representative(
  all: number | null,
  units: readonly { unit?: string; value: number | null }[]
): { value: number | null; pickedUnit: string | null } {
  if (all !== null) return { value: all, pickedUnit: null };
  const values = units.filter((u) => u.value !== null);
  if (values.length === 0) return { value: null, pickedUnit: null };
  return {
    value: values[0].value as number,
    pickedUnit: values.length > 1 ? (values[0].unit ?? "") : null,
  };
}

/*
 * ~~`representativeUnitLabel`~~ — その値がどの雇用管理区分のものかをリストに
 * 添えていたが、**落とした**（運営者の指示）。`対象とする労働者すべて` のような
 * 長い区分名で行が2行になり、そのぶんの情報量に見合わない。**区分名は
 * W1 の節が行ごとに出している**ので、この画面から消えるわけではない。
 */

/**
 * 値の並びを**順位（1が最上位）**に直す。欠測は `-1`。
 *
 * 各軸は「その指標を公表している会社の中での相対位置」（アートボード 6a の
 * 説明文）なので、**その軸に値がある会社だけを母集団にする。** 欠測を最下位として
 * 数えると、掲載率6割の軸（有給・残業）で公表している会社が軒並み上位に寄る。
 *
 * `ascendingIsBetter` が `true` の軸（残業時間）は**小さいほど上位**。5軸すべてが
 * 「外側＝良い」で揃っていないとレーダーは図として読めない（#154）。**軸の名前は
 * 指標名そのものに戻したが、位置の決め方は変えていない**——向きは図の説明文
 * （`外側ほど上位`）と、隣に出る順位が担う。
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
 * **値そのものは持たない。** 軸の4つの値はすべて別のファイルから
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
  /**
   * ラベルの隣に添える小さな注記（アートボード 6b）。いまは稼ぐ力の
   * `1人当たり経常利益` だけ。無ければ空文字。
   */
  subLabel: string;
  /** 値の下に**右寄せで**添える注記（`電気機器の中央値 191万円`）。無ければ空文字。 */
  note: string;
  /**
   * **2つ以上ある区分から先頭を選んで点を打った**ときの区分名（W3・#802）。
   * 有給・残業の2軸だけが持ちうる。無ければ空文字。行には出さず、
   * 図の下の断り（`unitPickNote`）に入る。
   */
  pickedUnit: string;
}

/** 1軸ぶんの入力。`rank` が `-1` なら掲載なし。 */
export interface RadarAxisInput {
  value: number | null;
  rank: number;
  population: number;
  /**
   * **2つ以上ある区分から先頭を選んだ**ときの区分名（W3・#802。`representative`
   * の `pickedUnit`）。有給・残業の2軸だけが持ちうる。
   *
   * **選んでいないときはキーごと持たない。** この入力は島の props として
   * HTML の属性に直列化されるので、全軸にキーを並べると該当しない会社
   * （有給・残業とも9割以上）のページまで重くなる。
   */
  pickedUnit?: string;
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
  /*
   * **「残業時間」。** #154 は「5軸すべてが外側＝良いで揃っていないと図として
   * 読めない」として「残業の少なさ」にしていたが、運営者の指示で指標名そのものに
   * 戻した。**向きは図の説明文（`外側ほど上位`）と、隣に出る順位が担う**
   * ——`974社中941位` は「公表している974社の中で下から34番目」と読める。
   */
  overtime: "残業時間",
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
  notes: Partial<Record<RadarAxisKey, string>> = {},
  subLabels: Partial<Record<RadarAxisKey, string>> = {}
): RadarAxis[] {
  return RADAR_AXES.map((key) => {
    const { value, rank, population } = inputs[key];
    const missing = value === null || rank < 1;
    return {
      key,
      label: LABELS[key],
      /*
       * ~~「掲載なし」と「区分別」を分ける~~（W2）→ **区分ごとに公表している
       * 会社も先頭の区分で点を打つ**ようになったので（W3・#802）、値が無い軸は
       * 本当に何も公表していない軸だけになった。
       */
      valueText: missing ? "掲載なし" : format[key](value),
      position: missing ? null : axisPosition(rank, population),
      rankText: missing
        ? ""
        : `${population.toLocaleString("ja-JP")}社中${rank.toLocaleString("ja-JP")}位`,
      // **注記は掲載があるときだけ。** 「掲載なし」の隣に `1人当たり経常利益` が
      // 残ると、値が無いのに説明だけある行になる。
      subLabel: missing ? "" : (subLabels[key] ?? ""),
      note: missing ? "" : (notes[key] ?? ""),
      pickedUnit: missing ? "" : (inputs[key].pickedUnit ?? ""),
    };
  });
}

/** 断りの中での軸の呼び名。図のラベル（`有給の取得`・`残業時間`）より短くする。 */
const PICK_NAMES: Partial<Record<RadarAxisKey, string>> = {
  paidLeave: "有給",
  overtime: "残業",
};

/**
 * **先頭の区分で点を打った軸がある会社にだけ**出す断りの1文（W3・#802・AC-17）。
 * 該当しなければ `null`。
 *
 * **区分名を必ず入れる。** 先頭が管理職・男性・部門の会社でも点を打つので、
 * 何の値かを書かないと会社全体の数字に読める。**リストの行には入れない**——
 * 値の列は 76px 固定で長い区分名が入らず、行に区分名を添えるのは P1 の2巡目に
 * 運営者の指示で外している。
 *
 * **文はここで組む。ビューに持たせない。** 島の props は HTML の属性に直列化
 * されるので、文をビューに載せると同じ文が props と本文の2か所に出る
 * （W2・#224 の残業の注記と同じ扱い）。props に載るのは区分名だけになる。
 *
 * 「先頭の区分」は下の節で先頭に出ている行を指す。節も値の無い区分を
 * 飛ばして並べるので、`representative` が選ぶものと一致する。
 */
export function unitPickNote(axes: readonly RadarAxis[]): string | null {
  const picks = axes.flatMap((axis) => {
    const name = PICK_NAMES[axis.key];
    return name !== undefined && axis.pickedUnit !== "" ? [{ name, unit: axis.pickedUnit }] : [];
  });
  if (picks.length === 0) return null;
  const lead = "雇用管理区分ごとの公表で全体の値が無いため、";
  const tail = "区分ごとの値は下の節にあります。";
  if (picks.length === 1) {
    const [{ name, unit }] = picks;
    return `${name}は${lead}先頭の区分「${unit}」の値で点を打っています。${tail}`;
  }
  const names = picks.map((p) => p.name).join("・");
  const units = picks.map((p) => `${p.name}は「${p.unit}」`).join("、");
  return `${names}は${lead}先頭の区分の値で点を打っています（${units}）。${tail}`;
}
