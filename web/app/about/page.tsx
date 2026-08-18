import type { Metadata } from "next";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/design-system/ui/table";
import { Badge } from "@/design-system/ui/badge";
import { buildAboutFacts } from "@/features/ranking/lib/aboutFacts";
import { formatDecimal1, formatInt, formatManYen } from "@/features/ranking/lib/format";
import type { CompaniesData, CurvesData } from "@/features/ranking/types";
import companiesData from "../../public/data/companies.json";
import curvesData from "../../public/data/curves.json";

export const metadata: Metadata = {
  title: "計算方法 | 年齢補正年収ランキング",
  description:
    "年齢補正の式、賃金カーブの作り方と出典、対象範囲、そしてこの方法で何が言えて何が言えないかを全部公開しています。",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="border-border border-b pb-1 text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

export default function AboutPage() {
  const facts = buildAboutFacts(companiesData as CompaniesData, curvesData as CurvesData);
  const { formulaExample: ex, holdingExample, operatingExample, modelBias: bias } = facts;
  const extrapolation = new Map(bias.meanExtrapolationByAge.map((x) => [x.age, x.distance]));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-4 leading-relaxed">
      <header className="flex flex-col gap-3">
        <Link href="/" className="text-muted-foreground hover:text-foreground text-sm underline">
          ← ランキングに戻る
        </Link>
        <h1 className="text-2xl font-bold">計算方法</h1>
        <p>
          このサイトは、有価証券報告書に載っている「平均年間給与」を、賃金カーブを使って
          <strong>選んだ年齢の時点の金額に読み替えて</strong>並べています。
          ここではその計算を全部公開します。数字の出どころも、
          この方法で何が言えて何が言えないかも隠しません。
        </p>
      </header>

      <Section title="補正の式">
        <p className="bg-muted rounded-md p-4 font-mono text-sm">
          推定年収（目標年齢）＝ 平均年間給与 × カーブ（目標年齢）÷ カーブ（その会社の平均年齢）
        </p>
        <p>
          実例として、{ex.company.name}を目標年齢{ex.targetAge}歳で見た場合の計算をそのまま示します。
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            平均年間給与 <strong>{formatManYen(ex.company.avgSalary)}</strong>（平均年齢
            {formatDecimal1(ex.company.avgAge)}歳）
          </li>
          <li>
            カーブ（{ex.targetAge}歳）＝ {formatManYen(ex.curveAtTargetAge)}
          </li>
          <li>
            カーブ（{formatDecimal1(ex.company.avgAge)}歳）＝ {formatManYen(ex.curveAtAvgAge)}
          </li>
          <li>
            補正倍率 ＝ {formatManYen(ex.curveAtTargetAge)} ÷ {formatManYen(ex.curveAtAvgAge)} ＝{" "}
            <strong>{ex.factor.toFixed(3)}</strong>
          </li>
          <li>
            推定年収 ＝ {formatManYen(ex.company.avgSalary)} × {ex.factor.toFixed(3)} ＝{" "}
            <strong>{formatManYen(ex.estimatedSalary)}</strong>
          </li>
        </ul>
        <p>
          平均{formatDecimal1(ex.company.avgAge)}歳の会社の平均給与を、{ex.targetAge}
          歳時点の水準に引き直しています。
        </p>
      </Section>

      <Section title="賃金カーブの作り方と出典">
        <p>
          出典は厚生労働省「<strong>令和5年賃金構造基本統計調査</strong>」です（e-Stat 経由、統計表ID
          0003425893）。一般労働者・男女計・学歴計・企業規模計・民営事業所の値を使っています。
        </p>
        <p>年収は次の定義で組み立てています。</p>
        <p className="bg-muted rounded-md p-4 font-mono text-sm">
          年収 ＝ きまって支給する現金給与額 × 12 ＋ 年間賞与その他特別給与額
        </p>
        <p>
          有価証券報告書の「平均年間給与」も賞与と時間外手当を含むため、定義を揃えています。
        </p>
        <p>
          年齢階級の代表値である{facts.agePoints.join("、")}歳の{facts.agePoints.length}
          点を取り、その間は直線でつなぎます（区分線形補間）。
          {facts.agePoints[0]}歳未満と{facts.agePoints[facts.agePoints.length - 1]}
          歳超は端の値で頭打ちにします。
        </p>
        <p>
          カーブは<strong>産業大分類{facts.curveCount}系列</strong>で引いています。表に出している東証
          {facts.industryCount}
          業種は、この{facts.curveCount}系列に機械的に対応づけています。つまり
          <strong>
            {facts.industryCount}業種が{facts.curveCount}本のカーブに集約されている
          </strong>
          ので、同じカーブを共有する業種同士では年齢の効き方が同じになります。
        </p>
      </Section>

      <Section title="対象範囲">
        <ul className="ml-5 list-disc space-y-1">
          <li>EDINET に 2026年6月1日〜7月10日に提出された有価証券報告書</li>
          <li>単体従業員100人以上（数人しかいない持株会社が上位を埋めるのを避けるため）</li>
          <li>平均年齢20〜65歳、平均年間給与100万円超</li>
          <li>非上場の会社も含む</li>
        </ul>
        <p>
          この条件で <strong>{formatInt(facts.companyCount)}社</strong> を掲載しています。
        </p>
        <p>
          「平均年間給与」は<strong>提出会社1社ぶん（単体）</strong>
          の数字です。連結子会社の社員は入りません。
        </p>
      </Section>

      <Section title="「本社のみ」バッジの意味">
        <p>
          単体従業員数が連結従業員数の10%未満の会社に付けています（
          {formatInt(facts.badgeCount)}社）。その会社の数字がグループ全体を代表していないことを示します。
        </p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>会社</TableHead>
                <TableHead>平均年間給与</TableHead>
                <TableHead>単体従業員数</TableHead>
                <TableHead>バッジ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[holdingExample, operatingExample].map((c) => (
                <TableRow key={c.name}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>{formatManYen(c.avgSalary)}</TableCell>
                  <TableCell>{formatInt(c.employees)}人</TableCell>
                  <TableCell>
                    {c.hasBadge ? <Badge variant="outline">本社のみ</Badge> : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p>
          持株会社の本体には管理職が中心に在籍するため、平均年間給与は高く出ます。実際に人を雇っている事業会社のほうが、その会社で働く実態に近い数字になります。同じグループでも
          {/* 表に出している丸め後の金額どうしの差にする。丸める前の差を取ると表の数字と1万円ずれる */}
          {formatInt(
            Math.round(holdingExample.avgSalary / 10000) -
              Math.round(operatingExample.avgSalary / 10000)
          )}
          万円の差があります。
        </p>
      </Section>

      <Section title="年齢スイッチは同業種内の順位を動かしません">
        <p>これは仕様であって不具合ではありません。式の比を取ると分かります。</p>
        <p className="bg-muted rounded-md p-4 font-mono text-sm">
          推定年収A ÷ 推定年収B ＝ （平均給与A ÷ カーブ(平均年齢A)）÷（平均給与B ÷ カーブ(平均年齢B)）
        </p>
        <p>
          同じカーブを引く2社では、分子のカーブ（目標年齢）が両方に同じだけ掛かるので約分され、
          <strong>目標年齢が式から消えます</strong>。東証{facts.industryCount}
          業種はどれも産業大分類に多対一で対応するので、同じ業種の2社は必ず同じカーブを引きます。したがって同業種内の並び順は目標年齢によらず変わりません。
        </p>
        <p>
          順位が動くのは業種をまたぐ比較だけです。実際、上位50社の顔ぶれは
          {bias.youngestTargetAge}歳時点と{bias.oldestTargetAge}歳時点で
          <strong>{bias.top50Overlap}社</strong>が重なります。
        </p>
        <p>
          年齢スイッチが変えるのは順位ではなく<strong>金額</strong>
          です。「その年齢ならいくらか」を知るための機能で、「年齢を変えると順位が入れ替わる」機能ではありません。
        </p>
      </Section>

      <Section title="この方法の限界">
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="font-bold">平均値であって分布ではありません</h3>
            <p>
              出せるのは会社の平均です。同じ会社でも職種や等級によって実際にはかなり散ります。
            </p>
          </div>

          <div>
            <h3 className="font-bold">単体の数字です</h3>
            <p>
              連結子会社の社員は入りません。「本社のみ」バッジはその極端な場合を示しますが、バッジが付かない会社でも単体と連結の差はあります。
            </p>
          </div>

          <div>
            <h3 className="font-bold">カーブは会社間の差から作っています</h3>
            <p>
              「平均年齢の高い会社ほど年収も高い」という会社をまたいだ関係を、年功カーブと読み替えています。1社の中で実際に昇給していく軌跡ではありません。
            </p>
          </div>

          <div>
            <h3 className="font-bold">
              {facts.industryCount}業種が{facts.curveCount}本のカーブに集約されています
            </h3>
            <p>
              同じカーブを共有する業種同士では、年齢の効き方の違いを表現できません。
            </p>
          </div>

          <div>
            <h3 className="font-bold">
              平均年齢から離れた年齢ほど不確実です。特に若い側は高く出ます
            </h3>
            <p>
              この式は<strong>「その会社の産業平均に対する倍率は何歳でも同じ」</strong>
              と仮定しています。実際の倍率は中央値{bias.premiumMedian.toFixed(2)}倍、上位10%で
              {bias.premiumP90.toFixed(2)}倍、最大は{bias.premiumMaxCompanyName}の
              {bias.premiumMax.toFixed(2)}倍で、産業平均より大幅に高い会社があります。
            </p>
            <p className="mt-2">
              しかし会社ごとの給与の差は、
              <strong>若いうちは小さく、年次や等級を重ねるにつれて開いていきます</strong>
              。倍率を全年齢で一定と置くと、
              <strong>産業平均より大幅に高い会社ほど、若い側の推定が過大になります</strong>。
            </p>
            <p className="mt-2">
              掲載企業の平均年齢は中央値{formatDecimal1(bias.avgAgeMedian)}
              歳です。目標年齢25歳を選ぶと平均{extrapolation.get(25)?.toFixed(1)}
              歳ぶん外挿することになり、40歳（{extrapolation.get(40)?.toFixed(1)}
              歳）に比べて仮定への負荷がはるかに大きくなります。60歳側も
              {extrapolation.get(60)?.toFixed(1)}
              歳離れているうえ、カーブが定年・再雇用で賃金の下がった人を含む形になっています。
            </p>
            <p className="mt-2">
              <strong>平均年齢に近い年齢ほど確からしく、離れるほど幅を持って読んでください。</strong>
              この点は改善すべき課題として認識しています。
            </p>
          </div>

          <div>
            <h3 className="font-bold">推定値であって実測ではありません</h3>
            <p>
              補正後の金額は、ここに書いた方法で計算した推定値です。実際に支払われた額ではありません。
            </p>
          </div>
        </div>
      </Section>

      <Section title="出典">
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <a
              href="https://disclosure2.edinet-fsa.go.jp/"
              className="underline"
              target="_blank"
              rel="noreferrer"
            >
              EDINET（金融庁）
            </a>
            — 有価証券報告書。平均年間給与・平均年齢・平均勤続年数・従業員数
          </li>
          <li>
            <a
              href="https://www.mhlw.go.jp/toukei/list/chinginkouzou.html"
              className="underline"
              target="_blank"
              rel="noreferrer"
            >
              賃金構造基本統計調査（厚生労働省）
            </a>
            — 賃金カーブ。
            <a href="https://www.e-stat.go.jp/" className="underline" target="_blank" rel="noreferrer">
              e-Stat
            </a>
            経由で取得
          </li>
        </ul>
      </Section>

      <footer>
        <Link href="/" className="text-muted-foreground hover:text-foreground text-sm underline">
          ← ランキングに戻る
        </Link>
      </footer>
    </div>
  );
}
