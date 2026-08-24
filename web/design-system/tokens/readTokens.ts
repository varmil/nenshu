import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * `tokens.css` の `:root { ... }` / `.dark { ... }` から custom property を取り出す。
 *
 * **トークンを検算する側の入口を1か所にする。** 読み手は `tokens.test.ts`（配色の
 * コントラスト）と `lib/brand/colors.test.ts`（ファビコンの hex）で、どちらも
 * 「tokens.css が正」を前提にしている。読み方が2つあると、片方だけが古い書式に
 * 取り残されても気づけない。
 */
export type Tokens = Record<string, string>;

const cssPath = fileURLToPath(new URL("./tokens.css", import.meta.url));

export function readTokenBlock(selector: ":root" | ".dark"): Tokens {
  const css = readFileSync(cssPath, "utf8");
  const pattern = new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([\\s\\S]*?)\\n\\}`);
  const body = css.match(pattern)?.[1];
  if (body === undefined) {
    throw new Error(`tokens.css に ${selector} ブロックが見つからない`);
  }
  const tokens: Tokens = {};
  for (const [, name, value] of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    tokens[name] = value.trim();
  }
  return tokens;
}
