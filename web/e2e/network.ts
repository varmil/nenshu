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
 */
const BRAND_ASSETS = new Set<string>(BRAND_ASSET_PATHS);

export function collectPageRequests(page: Page): string[] {
  const requests: string[] = [];
  page.on("request", (req) => {
    if (req.resourceType() === "image") return;
    if (BRAND_ASSETS.has(new URL(req.url()).pathname)) return;
    requests.push(req.url());
  });
  return requests;
}
