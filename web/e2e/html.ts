/**
 * 生の HTML と文字列を突き合わせるときの形（refresh の D0・Issue #870）。社名・区分名の `&`
 * （「Q&A」「P&PM職」）や `<` `>` は escape されて届くので、データから引いた文字列は
 * これを通してから HTML の中を探す。
 */
export const htmlText = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
