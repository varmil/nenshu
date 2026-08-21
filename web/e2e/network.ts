import type { Page } from "@playwright/test";

/**
 * 操作の間に飛んだリクエストを集める。**ロゴ画像だけは数えない。**
 *
 * 見たいのは「操作でページ（HTML・RSCペイロード）を取り直していないこと」で
 * （`docs/ranking/spec.md` AC-7）、ロゴを `loading="lazy"` で後から読むことは
 * これに反しない。L1 でロゴを載せるまでは画像自体が無かったので、リクエスト数を
 * 0 で固定できていた（`docs/logo/spec.md` AC-11）。
 */
export function collectPageRequests(page: Page): string[] {
  const requests: string[] = [];
  page.on("request", (req) => {
    if (req.resourceType() === "image") return;
    requests.push(req.url());
  });
  return requests;
}
