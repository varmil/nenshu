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

export function CompanyLogoMark({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="border-border text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md border border-dashed text-sm"
    >
      {initialOf(name)}
    </span>
  );
}
