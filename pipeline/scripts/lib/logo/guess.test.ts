import { describe, it, expect } from "vitest";
import { domainCandidates, verifySite, coreJa, coreEn, sameSite } from "./guess";

describe("英字社名からのドメイン候補（L2・Issue #243）", () => {
  it("法人格語を落として先頭語から作る", () => {
    const c = domainCandidates("Kioxia Holdings Corporation");
    expect(c[0]).toBe("kioxia.co.jp");
    expect(c).toContain("kioxia.com");
  });

  it("複数語は連結とハイフンの両方を作る", () => {
    const c = domainCandidates("Tokyo Electron Device Limited");
    expect(c).toContain("tokyo.co.jp");
    expect(c).toContain("tokyoelectrondevice.co.jp");
    expect(c).toContain("tokyo-electron-device.co.jp");
  });

  it("英字名が空なら候補を作らない（グロービングがこれ）", () => {
    expect(domainCandidates("")).toEqual([]);
    expect(domainCandidates("   ")).toEqual([]);
  });

  it("候補は上限で頭を切る", () => {
    expect(domainCandidates("Alpha Beta Gamma Delta Epsilon").length).toBeLessThanOrEqual(6);
    expect(domainCandidates("Alpha Beta", 2)).toHaveLength(2);
  });

  it("1文字の語はドメインにしない", () => {
    expect(domainCandidates("A Corporation")).toEqual([]);
  });

  it("記号は落とす（`&` を `and` にはしない）", () => {
    const c = domainCandidates("Mitsui & Co., Ltd.");
    expect(c[0]).toBe("mitsui.co.jp");
    expect(c.some((h) => h.includes("and"))).toBe(false);
  });

  it("同じホストは1つに畳む", () => {
    const c = domainCandidates("Kioxia");
    expect(new Set(c).size).toBe(c.length);
  });
});

describe("推定したサイトがその会社のものかの検証（precision を決める）", () => {
  const names = { ja: "株式会社ほくほくフィナンシャルグループ", en: "Hokuhoku Financial Group, Inc." };

  it("`<title>` に社名があれば通す", () => {
    expect(verifySite("<title>ほくほくフィナンシャルグループ</title>", names)).toBe(true);
  });

  it("法人格の有無で落とさない", () => {
    expect(verifySite("<title>株式会社ほくほくフィナンシャルグループ｜公式</title>", names)).toBe(true);
  });

  it("JSON-LD の name でも通す", () => {
    const html = `<script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Organization","name":"ほくほくフィナンシャルグループ"}
    </script>`;
    expect(verifySite(html, names)).toBe(true);
  });

  it("コピーライト行でも通す", () => {
    expect(verifySite("<footer>© ほくほくフィナンシャルグループ</footer>", names)).toBe(true);
  });

  it("英字名だけの一致では通さない（同じ英単語を持つ海外の会社を拾うため）", () => {
    // 実測: ワークマン → Workman Publishing を抱える hachettebookgroup.com、
    // ルネサンス → renaissance.com、エイチ・アイ・エス → his.com
    expect(verifySite("<title>Hokuhoku Financial Group</title>", names)).toBe(false);
  });

  it("推定に使ったドメイン名の再掲では通さない（パーキングページ）", () => {
    // 実測: `hugedomains.com` が5件・`forsale.dynadot.com` が1件、これで通っていた
    const html = "<title>hokuhoku.com is for sale | HugeDomains</title>";
    expect(verifySite(html, { ja: "hokuhoku", en: "" }, "hokuhoku.com")).toBe(false);
  });

  it("ドメイン名を取り除いても社名が残っていれば通す", () => {
    const html = "<title>hokuhoku.com — ほくほくフィナンシャルグループ</title>";
    expect(verifySite(html, names, "hokuhoku.com")).toBe(true);
  });

  it("別の会社のサイトは落とす", () => {
    expect(verifySite("<title>三菱商事株式会社</title>", names)).toBe(false);
  });

  it("ドメイン売却のパーキングページは落とす", () => {
    expect(verifySite("<title>This domain is for sale</title>", names)).toBe(false);
  });

  it("社名が本文にあるだけでは通さない（取引先や親会社が出るため）", () => {
    const html = "<title>別会社</title><p>ほくほくフィナンシャルグループ様と取引しています</p>";
    expect(verifySite(html, names)).toBe(false);
  });

  it("`<title>` も JSON-LD もコピーライトも無ければ落とす", () => {
    expect(verifySite("<html><body><h1>ほくほくフィナンシャルグループ</h1></body></html>", names)).toBe(
      false
    );
  });

  it("JSON-LD が壊れていても落ちない（他の手掛かりで判定する）", () => {
    const html = `<script type="application/ld+json">{壊れている</script><title>ほくほくフィナンシャルグループ</title>`;
    expect(verifySite(html, names)).toBe(true);
  });

  it("社名が本文にあるだけでは通さない（コピーライト行は例外的に見る）", () => {
    expect(verifySite("<div>ほくほくフィナンシャルグループ</div>", names)).toBe(false);
  });

  it("社名が2文字未満なら判定しない（何にでも当たるため）", () => {
    expect(verifySite("<title>なんでも</title>", { ja: "あ", en: "" })).toBe(false);
  });

  it("全角・中黒・大文字小文字の揺れを吸収する", () => {
    const n = { ja: "株式会社コスモ・バイオ", en: "Cosmo Bio Co., Ltd." };
    expect(verifySite("<title>コスモバイオ株式会社</title>", n)).toBe(true);
  });

  it("和文社名が英字の会社でも通る（NFKC で全角英字が半角になる）", () => {
    const n = { ja: "ＳＣＳＫ株式会社", en: "SCSK Corporation" };
    expect(verifySite("<title>SCSK株式会社</title>", n)).toBe(true);
    // ただしパーキングページは落とす
    expect(verifySite("<title>scsk.com is for sale</title>", n, "scsk.com")).toBe(false);
  });
});

describe("社名から法人格を落とす", () => {
  it("前株・後株の両方を落とす", () => {
    expect(coreJa("株式会社キーエンス")).toBe("キーエンス");
    expect(coreJa("トヨタ自動車株式会社")).toBe("トヨタ自動車");
  });

  it("英字名は法人格語を落として連結する", () => {
    expect(coreEn("Hokuhoku Financial Group, Inc.")).toBe("hokuhokufinancial");
  });
});

describe("ホスト名の突き合わせ", () => {
  it("`www.` の有無を無視する", () => {
    expect(sameSite("https://www.kioxia.com/ja-jp/", "https://kioxia.com/")).toBe(true);
  });

  it("別のホストは別のサイト", () => {
    expect(sameSite("https://kioxia.com/", "https://kioxia.co.jp/")).toBe(false);
  });

  it("URLとして読めないものは一致させない", () => {
    expect(sameSite("kioxia.com", "https://kioxia.com/")).toBe(false);
  });
});
