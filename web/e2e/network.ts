import type { Page } from "@playwright/test";
import { BRAND_ASSET_PATHS } from "../lib/brand/assets";

/**
 * 操作の間に飛んだリクエストを集める。**ロゴ画像とブランドのアイコンは数えない。**
 *
 * 見たいのは「操作でページ（HTML・RSCペイロード）を取り直していないこと」で
 * （`docs/ranking/spec.md` AC-7）、ロゴを `loading="lazy"` で後から読むことは
 * これに反しない。L1 でロゴを載せるまでは画像自体が無かったので、リクエスト数を
 * 0 で固定できていた（`docs/logo/spec.md` AC-11）。
 *
 * ファビコンを外すのはブラウザのバージョン差を吸収するため。Chromium 141 は
 * `history.pushState()` でURLが変わるたびにファビコンを取り直す（Playwright
 * 1.62 が同梱する Chromium 151 は取り直さない）。URL同期は `pushState` で
 * やっているので、古いChromiumで走らせるとこの系統のテストが軒並み
 * `Received length: 2` で落ちる。**アプリが起こしたリクエストではない**ので、
 * ロゴ画像と同じく AC-7 に反しない。
 *
 * **除くのは `/favicon.ico` だけでは足りない**（S4・Issue #163）。SVG のファビコンを
 * 出すようにしたので、取り直される先は `/favicon.svg` にもなる。しかもファビコンの
 * リクエストは `resourceType()` が `image` にならないことがあるため、上の
 * 画像の除外にも掛からない。対象は `lib/brand/assets.ts` の表から引く。
 *
 * **devサーバーのオーバーレイが読むフォントも数えない。** Next.js の開発時の
 * オーバーレイは自前の Geist を `/__nextjs_font/` から読む。**アプリは webfont を
 * 1つも持たない**（Issue #64 で next/font をやめ、`e2e/theme.spec.ts` が
 * 「フォントを1件もダウンロードしない」ことを固定している）ので、ここに現れる
 * フォントは必ず開発ツール側のものになる。取りに来る時刻が一定でないため、
 * 操作の計測窓にたまたま入ると `Received length: 1` で落ちる（実際に落ちた）。
 * 本番のビルドには存在しない経路なので、AC-7 の担保は落ちない。
 */
const BRAND_ASSETS = new Set<string>(BRAND_ASSET_PATHS);

/** Next.js の開発オーバーレイが自分のフォントを置いている場所。 */
const DEV_OVERLAY_FONT_PREFIX = "/__nextjs_font/";

/**
 * ランキングが全件を手にするまで待つ（E0・ADR-0013）。
 *
 * **`/` は初回に1度だけ `/data/companies.json` を取りに行く。** 待たずに
 * `collectPageRequests` を仕掛けると、その1回を操作由来と取り違える——逆に、
 * 除外リストに足してしまうと**操作のたびに取りに行っていても気づけない**。
 * 「届いてから測る」ことで AC-6（操作でネットワークが発生しない）はそのまま残る。
 */
export async function waitForRankingReady(page: Page): Promise<void> {
  await page.locator("[data-ranking-ready]").waitFor({ state: "attached" });
}

export function collectPageRequests(page: Page): string[] {
  const requests: string[] = [];
  page.on("request", (req) => {
    if (req.resourceType() === "image") return;
    const { pathname } = new URL(req.url());
    if (BRAND_ASSETS.has(pathname)) return;
    if (pathname.startsWith(DEV_OVERLAY_FONT_PREFIX)) return;
    requests.push(req.url());
  });
  return requests;
}
