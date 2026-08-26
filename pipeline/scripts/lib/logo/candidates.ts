export type LogoSource = "commons" | "jsonld" | "header" | "icon" | "ogp";

export type Candidate = {
  source: LogoSource;
  url: string;
  /** 宣言されたサイズ（`sizes` 属性・manifest の `sizes`）。実寸ではない */
  declared?: { w: number; h: number };
};

/**
 * 会社ごとに「この候補を使う」と決めた指定。**優先順（`sortCandidates`）より先に置く。**
 *
 * **`image.ts` の判定では選び直せないものだけを置く。** あちらが落とすのは画像として
 * 壊れているものと、明るい器で消えるものの2つで、**「絵としては正しいが、この器に置く
 * ロゴとしては不適当」はどちらにも当たらない**。余白の割合で機械的に落とす線も引けなかった
 * ——実測で、配っている 2,509枚のうち「インクの外接矩形が画像の半分未満」は52枚あり、
 * その大半は薄い色のワードマークを持つ正しいロゴだった。
 *
 * **指定として持つのは、次の全周でも同じ結論を再現するため。** `web/public/logos/` の
 * 画像を手で置き換えると、取り直した瞬間に元へ戻る。
 */
const PINNED: Record<string, Candidate> = {
  // 豊田通商（8015）。Wikidata の公式サイト（P856）が**英語版**を指しているので、
  // 候補が英語版のページから集まる。そこの JSON-LD の `Organization.logo` は
  // 1200×630 の共有用の絵で、ロゴは上端の帯にしか無く残りはグラデーションの余白
  // （`sharp` の `trim` は単色の縁しか落とせないため、器の中でロゴが上に寄って小さく出る）。
  // 英語版ヘッダの `TOYOTA TSUSHO CORPORATION` は 3828×192＝19.9:1 で、
  // 88×50 の器に入れると読めない。**日本語版ヘッダの 680×107 を指す。**
  "8015": { source: "header", url: "https://www.toyota-tsusho.com/app-files/img/cmn_logo01.svg" },
  // 日本コークス工業（3315）。ヘッダは `logo_w.png`（白）で、明るい器では社章しか見えない
  // （Issue #221）。**同じディレクトリに `logo_b.png`（濃色版）が並んでいる**——サイトが
  // 濃淡2つを持っているのに構造だけを見ると白いほうが1位に来る。判定で白いほうを落とすと
  // 次の候補は 32×32 の favicon で、社名が読めないところまで落ちる。
  "3315": { source: "header", url: "https://www.n-coke.com/common/img/logo_b.png" },

  /*
    以下は**器の中でファビコンとして出ていた会社**（Issue #221 の続き・運営者の指摘）。
    公式サイトの構造からロゴが1つも取れず（ヘッダのロゴが CSS の背景画像・JSで後から
    差し込まれる・インライン SVG のいずれか）、最後の候補である favicon まで落ちていた。
    **`og:image` にはロゴだけが白地に置かれていることが多い**ので、それを名指しする。

    **`og:image` を自動で集める候補にはしない。** あれは共有用の絵で、ロゴとは限らない
    ——実測で、対象116社のうち画像として通った56件に写真・広告バナー・ページの
    スクリーンショットが10件混ざっていた（#220 の豊田通商もこの型である）。
    **機械的に切る線は引けなかった**：色の平坦さ（最頻2色が占める割合）で測ると、
    ロゴでないアイル（3854）が 0.599 でロゴのアイドママーケティング（9466）が 0.259 と
    逆転する。だから**1枚ずつ見て決め、その結論を指定として持つ。**
  */
  // ベルグアース（1383）。いまは 28×17 の favicon
  "1383": { source: "ogp", url: "https://bergearth.co.jp/wp-content/themes/bergearth/images/socialthumb.jpg" },
  // 明豊ファシリティワークス（1717）。いまは 32×19 の favicon
  "1717": { source: "ogp", url: "https://www.meiho.co.jp/assets/images/common/ogp.jpg" },
  // ＦＲＯＮＴＥＯ（2158）。いまは 16×16 の favicon
  "2158": { source: "ogp", url: "https://www.fronteo.com/hubfs/raw_assets/public/p-chan-fronteo/assets/images/common/FRONTEO_logo_FB.png" },
  // タイミー（215A）。いまは 48×46 の favicon
  "215A": { source: "ogp", url: "https://timee.co.jp/_assets/ogp.D2zkELIe.png" },
  // クエスト（2332）。いまは 14×15 の favicon
  "2332": { source: "ogp", url: "https://www.quest.co.jp/assets/images/common/logo/ogp.png" },
  // ディップ（2379）。いまは 32×19 の favicon
  "2379": { source: "ogp", url: "https://www.dip-net.co.jp/assets/images/dip_ogp.png" },
  // オールアバウト（2454）。いまは 16×16 の favicon
  "2454": { source: "ogp", url: "https://corp.allabout.co.jp/assets/images/ogp.gif" },
  // マルサンアイ（2551）。いまは 38×48 の favicon
  "2551": { source: "ogp", url: "https://www.marusanai.co.jp/assets_v2/img/common/ogp.png" },
  // 石井食品（2894）。いまは 16×16 の favicon
  "2894": { source: "ogp", url: "https://www.ishiifood.co.jp/assets/img/common/other/OGP.jpg" },
  // グンゼ（3002）。いまは 32×30 の favicon
  "3002": { source: "ogp", url: "https://www.gunze.co.jp/assets/ogp.jpg" },
  // ＭＩＣ（300A）。いまは 12×6 の favicon
  "300A": { source: "ogp", url: "https://www.mic-p.com/_wp2/wp-content/themes/mic/common/img/other/default_ogp.png" },
  // コスモ・バイオ（3386）。いまは 29×32 の favicon
  "3386": { source: "ogp", url: "https://www.cosmobio.co.jp/img/cosmobio.png" },
  // トリドールホールディングス（3397）。いまは 32×32 の favicon
  "3397": { source: "ogp", url: "https://www.toridoll.com/assets2022/img/OGP.png" },
  // グローバル・リンク・マネジメント（3486）。いまは 14×16 の favicon
  "3486": { source: "ogp", url: "https://www.global-link-m.com/ogp.png" },
  // アズーム（3496）。いまは 25×16 の favicon
  "3496": { source: "ogp", url: "https://azoom.jp/assets/img/ogp.png" },
  // ファインデックス（3649）。いまは 16×16 の favicon
  "3649": { source: "ogp", url: "https://findex.co.jp/img/ogp_26.png" },
  // ＪＩＧ－ＳＡＷ（3914）。いまは 48×48 の favicon
  "3914": { source: "ogp", url: "https://www.jig-saw.com/wp-content/themes/jig-saw/assets/img/common/ogp.png" },
  // マイネット（3928）。いまは 42×42 の favicon
  "3928": { source: "ogp", url: "https://www.mynet.co.jp/media/Se1NoND1jyrycwzDfAh4WqwXqDL7u8PaB9NsV5Pl.png" },
  // ＰＫＳＨＡ　Ｔｅｃｈｎｏｌｏｇｙ（3993）。いまは 24×22 の favicon
  "3993": { source: "ogp", url: "https://www.pkshatech.com/assets/img/ogp.jpg" },
  // インフキュリオン（438A）。いまは 40×40 の favicon
  "438A": { source: "ogp", url: "https://infcurion.com/ogp/og.png" },
  // Ｓａｎｓａｎ（4443）。いまは 16×26 の favicon
  "4443": { source: "ogp", url: "https://www.corp-sansan.com/corp/wp-content/themes/sansan-corp4/img/og.png" },
  // ダイサン（4750）。いまは 48×38 の favicon
  "4750": { source: "ogp", url: "https://www.daisan-g.co.jp/common/img/ogp.jpg" },
  // 日本ビジネスシステムズ（5036）。いまは 48×48 の favicon
  "5036": { source: "ogp", url: "https://www.jbs.co.jp/-/media/JBS/image/common/jbs-ogp.ashx?sc_lang=ja-JP" },
  // ＢＴＭ（5247）。いまは 46×34 の favicon
  "5247": { source: "ogp", url: "https://www.b-tm.co.jp/wp-content/themes/BTM/images/ogp.png" },
  // ＳＯＬＩＺＥ　Ｈｏｌｄｉｎｇｓ（5871）。いまは 14×14 の favicon
  "5871": { source: "ogp", url: "https://www.solize.com/common/img/common/ogp.jpg" },
  // エムケー精工（5906）。いまは 47×45 の favicon
  "5906": { source: "ogp", url: "https://www.mkseiko.co.jp/images/common/ogp.jpg" },
  // リブセンス（6054）。いまは 12×20 の favicon
  "6054": { source: "ogp", url: "https://www.livesense.co.jp/wp-content/uploads/2018/06/og.png" },
  // トレンダーズ（6069）。いまは 34×34 の favicon
  "6069": { source: "ogp", url: "https://www.trenders.co.jp/wp-content/themes/trds-corp/images/global_top/OGP.jpg" },
  // 石川製作所（6208）。いまは 48×26 の favicon
  "6208": { source: "ogp", url: "https://www.ishiss.co.jp/common/img/ogp/ogp.png" },
  // グローリー（6457）。いまは 32×30 の favicon
  "6457": { source: "ogp", url: "https://www.glory.co.jp/files/user/common/images/ogp_image.png" },
  // ＹＵＳＨＩＮ（6482）。いまは 42×10 の favicon
  "6482": { source: "ogp", url: "https://www.yushincompany.jp/files/img/ogp.png" },
  // ＰＨＣホールディングス（6523）。いまは 24×28 の favicon
  "6523": { source: "ogp", url: "https://www.phchd.com/-/media/Images/PHC_ogimage.png?rev=c16c9c71ec56487f83fbf987a8a87429&sc_lang=ja-JP" },
  // 千代田インテグレ（6915）。いまは 28×40 の favicon
  "6915": { source: "ogp", url: "https://www.chiyoda-i.co.jp/wp-content/themes/chiyoda-i/lib/img/common/ogp.png" },
  // ＧＭＯフィナンシャルホールディングス（7177）。いまは 16×16 の favicon
  "7177": { source: "ogp", url: "https://www.gmofh.com/assets/images/ogp-gmofh-jp-large.png" },
  // フジオーゼックス（7299）。いまは 30×10 の favicon
  "7299": { source: "ogp", url: "https://www.oozx.co.jp/assets/images/common/ogp.jpg" },
  // ＬＩＴＡＬＩＣＯ（7366）。いまは 14×16 の favicon
  "7366": { source: "ogp", url: "https://litalico.co.jp/ogp.png" },
  // Ｚｅｎｋｅｎ（7371）。いまは 42×38 の favicon
  "7371": { source: "ogp", url: "https://www.zenken.co.jp/img/ogp.png" },
  // アールビバン（7523）。いまは 45×27 の favicon
  "7523": { source: "ogp", url: "https://www.artvivant.co.jp/assets/img/common/ogp.png?1787743001" },
  // いつも（7694）。いまは 10×16 の favicon
  "7694": { source: "ogp", url: "https://itsumo365.co.jp/official/system/wp-content/themes/itsumo-theme/common/img/base/ogimage02.png" },
  // ＩＭＶ（7760）。いまは 32×32 の favicon
  "7760": { source: "ogp", url: "https://we-are-imv.com/assets/images/common/ogp_img.png" },
  // 内田洋行（8057）。いまは 32×14 の favicon
  "8057": { source: "ogp", url: "https://www.uchida.co.jp/common2/images/og-image.png" },
  // ほくほくフィナンシャルグループ（8377）。いまは 16×16 の favicon
  "8377": { source: "ogp", url: "https://www.hokuhoku-fg.co.jp/ogp.jpg" },
  // 中道リース（8594）。いまは 16×16 の favicon
  "8594": { source: "ogp", url: "https://www.nakamichi-leasing.co.jp/common/images/OGP.jpg" },
  // セイノーホールディングス（9076）。いまは 16×15 の favicon
  "9076": { source: "ogp", url: "https://www.seino.co.jp/seino/stc-og.png" },
  // アイドママーケティングコミュニケーション（9466）。いまは 13×14 の favicon
  "9466": { source: "ogp", url: "https://www.e-aidma.co.jp/ogp.jpg" },
  // 白洋舍（9731）。いまは 41×34 の favicon
  "9731": { source: "ogp", url: "https://www.hakuyosha.co.jp/dcms_media/image/ogp.png" },
};

/** 指定がある会社では、その候補を先頭に置く（同じURLが候補にあれば1つに畳む）。 */
export function prioritize(id: string, candidates: readonly Candidate[]): Candidate[] {
  const pin = PINNED[id];
  if (!pin) return [...candidates];
  return [pin, ...candidates.filter((c) => c.url !== pin.url)];
}

/** 指定そのもの（テストが形を検める）。 */
export const pinnedCandidates: Readonly<Record<string, Candidate>> = PINNED;

/**
 * **`ogp` は集めない。** `PINNED` から名指しで入るだけなので、ここに並ぶことは無い
 * （型を満たすために末尾に置く）。理由は下の `PINNED` の説明にある。
 */
const ORDER: Record<LogoSource, number> = { commons: 0, jsonld: 1, header: 2, icon: 3, ogp: 4 };

/**
 * 出典の確からしさを解像度より優先する。
 * 同じ出典の中でだけ、宣言サイズの大きいものを先に試す。
 */
export function sortCandidates(candidates: readonly Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return [...candidates]
    .filter((c) => {
      if (seen.has(c.url)) return false;
      seen.add(c.url);
      return true;
    })
    .sort((a, b) => {
      if (ORDER[a.source] !== ORDER[b.source]) return ORDER[a.source] - ORDER[b.source];
      return area(b) - area(a);
    });
}

function area(c: Candidate): number {
  return c.declared ? c.declared.w * c.declared.h : 0;
}

/** `sizes="180x180 32x32"` から最大のものを読む。 */
export function parseSizes(sizes: string | undefined): { w: number; h: number } | undefined {
  if (!sizes) return undefined;
  let best: { w: number; h: number } | undefined;
  for (const token of sizes.trim().split(/\s+/)) {
    const m = /^(\d+)[xX](\d+)$/.exec(token);
    if (!m) continue;
    const size = { w: Number(m[1]), h: Number(m[2]) };
    if (!best || size.w * size.h > best.w * best.h) best = size;
  }
  return best;
}

/** gBizINFO は採用ページ等の深いURLを返すことがあるので、オリジンに寄せる。 */
export function toOrigin(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.protocol}//${u.host}/`;
  } catch {
    return null;
  }
}
