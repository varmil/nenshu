import type { RankedCompany } from "../types";
import { formatDecimal1, formatInt } from "../lib/format";

/**
 * 社名の下に添える1行（U13、アートボード 5a）。
 * `平均42.3歳 ・ 在籍17.0年 ・ 4,456人`。
 *
 * **業種は出さない**（運営者の指示）。左のサイドバーで業種を選んでいる最中に
 * 同じ語が全行に並ぶうえ、この行が長くなって末尾の従業員数が見切れていた。
 *
 * U12 まではこの4つが表の独立した列で、社名の列を 200px 弱まで押し込んでいた。
 * **どれも「この会社がどんな会社か」を言う属性で、金額のように行どうしを見比べる
 * ものではない**ので、1行にまとめて社名に寄せる。
 *
 * **年齢そろえでも実測値（`実績 ◯万円`）は添えない**（運営者の指示）。U13 ではアートボード 4a
 * に合わせて末尾に出していたが、冗長だった。元の数字は「実測値」へ切り替えれば並ぶ。
 */
export function CompanyMetaLine({
  company,
  compact = false,
}: {
  company: RankedCompany;
  /**
   * モバイルのランキング行向け。**残すのは平均年齢だけ**（アートボード 2a、Issue #119）。
   *
   * アートボード 5c の頃は従業員数も並べていたが、行を4カラムに分けて器を 48×68 に
   * 広げたぶん、社名の列は 390px で 160px 前後になった。ここに「平均42.3歳 ・ 4,456人」
   * と偏差値を同居させると、**省略記号が偏差値側に届く**。金額と偏差値は行の中で
   * 唯一「他社と見比べる」数値なので、削るのはこちら側にする。
   */
  compact?: boolean;
}) {
  /*
   * `block`。`truncate` は `overflow: hidden` を効かせるが、インラインのままでは
   * はみ出した文字がそのまま外へ出る（360px でページに横スクロールが出た）。
   *
   * `min-w-0`。モバイルの行ではこれが flex アイテムになる。**flex アイテムの最小幅は
   * 既定で中身の幅**なので、これが無いと縮まず、隣の偏差値を押し出す（`justify-between`
   * をやめて隣り合わせたので、押し出す先がある）。flex の外では何もしない。
   */
  return (
    <span className="text-muted-foreground block min-w-0 truncate text-[inherit]">
      平均{formatDecimal1(company.avgAge)}歳
      {!compact && (
        <>
          {` ・ 在籍${formatDecimal1(company.avgTenure)}年`} ・ {formatInt(company.employees)}人
        </>
      )}
    </span>
  );
}
