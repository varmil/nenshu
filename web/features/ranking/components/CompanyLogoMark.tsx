/**
 * 社名の頭文字を入れた枠（アートボード 4a）。ロゴ画像は持っていないので、
 * **破線の枠**にして「ここに何かが入る予定の空き」ではなく意図した表現に見せる。
 *
 * 法人格を落としてから1文字目を採る。「株式会社キーエンス」で「株」が並ぶと
 * どの行も同じ見た目になり、目印として働かない。
 */
const LEGAL_FORMS = /^(株式会社|有限会社|合同会社|合資会社|合名会社|\(株\)|（株）|㈱)/;

export function initialOf(name: string): string {
  return name.replace(LEGAL_FORMS, "").trim().charAt(0) || name.charAt(0);
}

export function CompanyLogoMark({
  name,
  size = "default",
}: {
  name: string;
  /** `lg` は企業詳細ページの見出し用（C3、アートボード 4b の60px）。 */
  size?: "default" | "lg";
}) {
  const box =
    size === "lg" ? "size-15 rounded-lg text-2xl" : "size-8 text-sm md:size-10 md:text-base";

  return (
    <span
      aria-hidden="true"
      className={`border-border text-muted-foreground bg-muted flex shrink-0 items-center justify-center rounded-md border border-dashed font-bold ${box}`}
    >
      {initialOf(name)}
    </span>
  );
}
