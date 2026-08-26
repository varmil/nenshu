/**
 * 「この応答を Worker が描いたか」を外から見えるようにする印（F1・Issue #209）。
 *
 * **spec AC-1 は「Worker を起こさずに返る」ことを求めているが、それは応答からは
 * 分からなかった。** OpenNext の頃は `x-opennext-*`・`x-nextjs-*` が偶然その役を
 * 果たしていて（`e2e/asset-routing.spec.ts` がそれを使っていた）、Astro に移ると
 * 手がかりごと消える。**フレームワークの副産物に頼るのをやめ、自分で1つ置く。**
 *
 * **付けるのは `/` だけ。** 事前生成したページは静的アセットとして返るので、
 * この印が付く経路そのものを通らない——**`run_worker_first`（`wrangler.jsonc`）を
 * 広げすぎると印が増える**ので、そこの漏れがそのまま検出できる。
 *
 * 代償は `/` の応答が約35バイト増えること。**それで「どのURLが Worker を起こすか」
 * が実行時に確かめられるようになる**（この施策の KPI そのもの）。
 */
export const RENDERED_BY_HEADER = "x-openreport-rendered";

/** Worker が描いた応答に入る値。 */
export const RENDERED_BY_WORKER = "worker";
