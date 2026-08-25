import type { Metadata } from "next";
import { NavLink } from "@/features/navigation/components/NavLink";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/design-system/ui/table";
import { Badge } from "@/design-system/ui/badge";
import { TABLE_NO_VERTICAL_SCROLL } from "@/design-system/tableContainer";
import { buildAboutFacts } from "@/features/ranking/lib/aboutFacts";
import { attributionCredits, creditCounts, type LogoEntry } from "@/features/logo/lib/credits";
import {
  formatDecimal1,
  formatInt,
  formatManYen,
  formatManYen1,
} from "@/features/ranking/lib/format";
import type { CompaniesData, CurvesData } from "@/features/ranking/types";
import { fiscalPeriodLabel, filingWindowLabel, periodLabel } from "@/lib/data/period";
import companiesData from "../../public/data/companies.json";
import curvesData from "../../public/data/curves.json";
import logosData from "../../public/data/logos.json";

const companies = companiesData as CompaniesData;
const logoEntries = logosData.byId as Record<string, LogoEntry>;
/**
 * ロゴの帰属表示（AC-14）。**ビルド時に確定する**——`/about` は静的ページで、
 * `logos.json`（gzip 41.7KB）はここで消費されクライアントには渡らない。
 */
const logoCredits = attributionCredits(companies.rows, logoEntries);
const logoCounts = creditCounts(logoEntries);

export const metadata: Metadata = {
  title: "計算方法 | OpenReport",
  // 決算期は description に入れる（`docs/site-chrome/spec.md` 5.・AC-18）。
  // 社数と同じく `companies.meta` から引く——直書きするとデータ更新でここだけ古くなる。
  description:
    `金融庁 EDINET の有価証券報告書（${fiscalPeriodLabel(companies.meta)}）から平均年収をどう取り、` +
    "年齢でどう補正しているか。式と賃金カーブの出典、対象範囲、そしてこの方法で何が言えて何が言えないかまで全部公開しています。",
  // 自己canonical（ADR-0006 の表）。`metadataBase` は `app/layout.tsx`。
  alternates: { canonical: "/about" },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="border-border border-b pb-1 text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

/**
 * 計算式の器（Issue #120）。**折り返さず、はみ出したら器の中だけを横に送る。**
 *
 * `<p>` に `<br />` で組んでいた頃は、390px で
 * `×（カーブ（目標年齢）− カーブ（22` / `歳））` のように行の途中で折り返し、
 * 続きの行では字下げが消えて式の構造が読めなくなっていた（Issue #120 の報告）。
 * 折り返しを止めるだけでは画面ごとはみ出すので、`overflow-x-auto` と対で使う。
 *
 * `<pre>` にしているのは、字下げ（全角スペース）と改行をそのまま残すため。
 * **JSX のテキストは行頭の空白と改行を畳んでしまう**ので、中身はテンプレート
 * リテラルで渡す。
 *
 * スクロールする器はキーボードでも送れる必要があるため `tabIndex` を持たせ、
 * 素の `<pre>` に焦点が当たっても何なのか分かるよう名前を付ける。
 */
function Formula({ label, children }: { label: string; children: string }) {
  return (
    <pre
      role="group"
      aria-label={label}
      tabIndex={0}
      className="bg-muted overflow-x-auto rounded-md p-4 font-mono text-sm"
    >
      {children}
    </pre>
  );
}

export default function AboutPage() {
  const facts = buildAboutFacts(companies, curvesData as CurvesData);
  const { formulaExample: ex, holdingExample, operatingExample, modelBias: bias } = facts;
  const extrapolation = new Map(bias.meanExtrapolationByAge.map((x) => [x.age, x.distance]));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-4 leading-relaxed">
      <header className="flex flex-col gap-3">
        <NavLink href="/" className="text-primary text-sm underline">
          ← ランキングに戻る
        </NavLink>
        <h1 className="text-2xl font-bold">計算方法</h1>
        <p>
          このサイトは、有価証券報告書に載っている「平均年間給与」をそのまま並べることを
          <strong>既定</strong>にしています。そのうえで、賃金カーブを使って
          <strong>選んだ年齢の時点の金額に読み替える</strong>モードを用意しています。
          ここではその計算を全部公開します。数字の出どころも、
          この方法で何が言えて何が言えないかも隠しません。
        </p>
      </header>

      <Section title="2つの表示基準">
        <p>
          ランキングにも企業詳細ページにも、金額の出し方が2つあります。
          <strong>既定は「実測値」</strong>です。
        </p>
        <div className={TABLE_NO_VERTICAL_SCROLL}>
          <Table>
          <TableHeader>
            <TableRow>
              <TableHead>表示基準</TableHead>
              <TableHead>出している数字</TableHead>
              <TableHead>URL</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">実測値（既定）</TableCell>
              <TableCell>
                有価証券報告書の平均年間給与（提出会社単体）そのまま。補正を一切かけていません
              </TableCell>
              <TableCell className="font-mono text-xs">/</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">年齢そろえ</TableCell>
              <TableCell>
                下の式で、選んだ年齢の時点に読み替えた<strong>推定値</strong>
              </TableCell>
              <TableCell className="font-mono text-xs">/?age=35</TableCell>
            </TableRow>
          </TableBody>
          </Table>
        </div>
        <p>
          実測値を既定にしているのは、それが<strong>検証できる一次情報</strong>だからです。
          EDINET で有価証券報告書を開けば同じ数字が載っています。
          ただし会社によって従業員の平均年齢が違うので（
          {formatDecimal1(facts.coverage.minAvgAge)}歳から
          {formatDecimal1(facts.coverage.maxAvgAge)}歳まであります）、
          <strong>実測値のままだと平均年齢の高い会社が上に来ます。</strong>
          年齢をそろえて比べたいときに「年齢そろえ」を選んでください。
        </p>
        <p>
          順位と年収偏差値も表示基準ごとに計算し直しています。母集団の平均は実測値で
          {formatManYen(facts.population.rawMean)}、35歳そろえで
          {formatManYen(facts.population.age35Mean)}です。同じ会社でも、
          どちらで見ているかによって順位が変わります。
        </p>
        <p>
          <strong>年齢別に出している「推定範囲 ±20%」は、目安の幅であって統計的な信頼区間ではありません。</strong>
          賃金カーブは会社間の差から作った1本の平均的な形で、1社ごとのばらつきを推定する仕組みを持っていません。
          「この範囲に◯%の確からしさで収まる」という意味には読めない数字です。
        </p>
        <p>
          <strong>年収偏差値は100を超えることがあります。</strong>
          偏差値は正規分布を前提にした指標ですが、年収の分布は右に強く裾を引くため、
          上位のごく一部が平均から大きく離れます（35歳そろえのキーエンスで150.0）。
          水準を読むときは隣に添えた<strong>「上位◯%」</strong>のほうが確かです。
        </p>
      </Section>

      <Section title="補正の式">
        <p>
          式は2つあります。選んだ目標年齢が、その会社の平均年齢より
          <strong>下（若い側）か上か</strong>で変わります。
        </p>
        <Formula label="補正の式">{`目標年齢 ≦ 平均年齢:
推定年収 ＝ カーブ（${ex.anchorAge}歳）
　　　　　＋（平均年間給与 − カーブ（${ex.anchorAge}歳））
　　　　　　×（カーブ（目標年齢）− カーブ（${ex.anchorAge}歳））
　　　　　　÷（カーブ（平均年齢）− カーブ（${ex.anchorAge}歳））

目標年齢 ＞ 平均年齢:
推定年収 ＝ 平均年間給与 × カーブ（目標年齢）÷ カーブ（平均年齢）`}</Formula>
        <p>
          若い側は、その会社の賃金カーブが<strong>2つの点を通る</strong>と置いています。
          {ex.anchorAge}歳では業種平均の水準、平均年齢ではその会社の実測の平均年間給与。
          この2点の間を、業種カーブの形でつないでいます。
        </p>
        <p>
          会社ごとの給与の差は、
          <strong>若いうちは小さく、年次や等級を重ねるにつれて開いていきます</strong>
          。「産業平均に対する倍率は何歳でも同じ」と置くと、産業平均より大幅に高い会社では若い側が過大に出ます。それを避けるための式です。
        </p>
        <p>
          実例として、{ex.company.name}を目標年齢{ex.targetAge}歳で見た場合の計算をそのまま示します。
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            平均年間給与 <strong>{formatManYen1(ex.company.avgSalary)}</strong>（平均年齢
            {formatDecimal1(ex.company.avgAge)}歳）
          </li>
          <li>
            カーブ（{ex.anchorAge}歳）＝ {formatManYen1(ex.curveAtAnchorAge)}
          </li>
          <li>
            カーブ（{ex.targetAge}歳）＝ {formatManYen1(ex.curveAtTargetAge)}
          </li>
          <li>
            カーブ（{formatDecimal1(ex.company.avgAge)}歳）＝ {formatManYen1(ex.curveAtAvgAge)}
          </li>
          <li>
            推定年収 ＝ {formatManYen1(ex.curveAtAnchorAge)} ＋（
            {formatManYen1(ex.company.avgSalary)} −{formatManYen1(ex.curveAtAnchorAge)}）×（
            {formatManYen1(ex.curveAtTargetAge)} −{formatManYen1(ex.curveAtAnchorAge)}）÷（
            {formatManYen1(ex.curveAtAvgAge)} −{formatManYen1(ex.curveAtAnchorAge)}）＝{" "}
            <strong>{formatManYen(ex.estimatedSalary)}</strong>
          </li>
        </ul>
        <p>
          平均{formatDecimal1(ex.company.avgAge)}歳の会社の平均給与を、{ex.targetAge}
          歳時点の水準に引き直しています。
          {/* 万円に丸めた値どうしで引き算すると答えが1万円ずれるため、途中の値は小数第1位まで出している */}
        </p>
      </Section>

      <Section title="賃金カーブの作り方と出典">
        <p>
          出典は厚生労働省「<strong>令和5年賃金構造基本統計調査</strong>」です（e-Stat 経由、統計表ID
          0003425893）。一般労働者・男女計・学歴計・企業規模計・民営事業所の値を使っています。
        </p>
        <p>年収は次の定義で組み立てています。</p>
        <Formula label="年収の定義">{`年収 ＝ きまって支給する現金給与額 × 12 ＋ 年間賞与その他特別給与額`}</Formula>
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
          {/*
            **データの時点はここが本文側の正**（S3・`docs/site-chrome/spec.md` 5.、
            E1・`docs/expansion/spec.md` 1.4）。決算期は全社が同じではないので幅で出す。
            **幅だけだと端（いまは4月期の2社）が全体を代表しているように読める**ので、
            どこに寄っているかをこの場所でだけ数字で断る。社数と割合はデータから引く。
          */}
          <li>
            <strong>{fiscalPeriodLabel(companies.meta)}</strong>
            {`の有価証券報告書（EDINET に${filingWindowLabel(companies.meta)}に提出されたもの）。決算期は会社ごとに違い、いちばん多いのは${periodLabel(facts.fiscalPeriodTop.period)}の${formatInt(facts.fiscalPeriodTop.count)}社（全体の${((facts.fiscalPeriodTop.count / facts.companyCount) * 100).toFixed(1)}%）です`}
          </li>
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
          <div className={TABLE_NO_VERTICAL_SCROLL}>
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

      <Section title="年齢スイッチで順位はほとんど動きません">
        <p>これは仕様であって不具合ではありません。</p>
        <p>
          東証{facts.industryCount}業種はどれも産業大分類に多対一で対応するので、
          <strong>同じ業種の2社は必ず同じカーブを引きます</strong>
          。同じカーブを引き、かつ平均年齢も同じ2社では、目標年齢を変えても両社に同じ変換が掛かるだけなので、大小関係は動きません。
        </p>
        <p>
          平均年齢が違う会社どうしなら入れ替わりえます。実際に全組み合わせを数えると、同じ業種の2社の組のうち目標年齢によって順序が変わるのは
          <strong>{bias.sameIndustrySwapPercent.toFixed(1)}%</strong>
          だけです。上位50社の顔ぶれも、{bias.youngestTargetAge}歳時点と{bias.oldestTargetAge}
          歳時点で<strong>{bias.top50Overlap}社</strong>が重なります。
        </p>
        <p>
          年齢スイッチが変えるのは、順位というより<strong>金額</strong>
          です。「その年齢ならいくらか」を知るための機能で、「年齢を変えると順位が大きく入れ替わる」機能ではありません。
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
            <h3 className="font-bold">カーブはある時点の断面です</h3>
            <p>
              賃金カーブは、調査時点にいた労働者を年齢階級ごとに平均したものです。
              <strong>同じ人が歳を取っていく軌跡でも、1社の中で昇給していく軌跡でもありません。</strong>
              中途入社の人も含まれるため、同じ会社に勤め続けた場合の昇給より傾きは緩やかになります。
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
              {ex.anchorAge}歳の水準を業種平均と置いています
            </h3>
            <p>
              若い側の式は、その会社の{ex.anchorAge}
              歳時点の給与が業種平均と同じだと仮定しています。会社ごとの給与の開きは実際には中央値
              {bias.premiumMedian.toFixed(2)}倍、上位10%で{bias.premiumP90.toFixed(2)}倍、最大は
              {bias.premiumMaxCompanyName}の{bias.premiumMax.toFixed(2)}
              倍まであり、この開きが{ex.anchorAge}歳では無くなると置いていることになります。
            </p>
            <p className="mt-2">
              初任給の水準が業種平均より高い会社では、
              <strong>若い側の推定は逆に低めに出ます</strong>
              。倍率を全年齢で一定と置いていた以前の式では、最も開きの大きい会社で25歳の推定が2倍を超えて出ていました。それに比べれば小さなずれですが、ゼロではありません。
            </p>
          </div>

          <div>
            <h3 className="font-bold">
              平均年齢より上は、いまも倍率を一定と置いています
            </h3>
            <p>
              若い側と違い、平均年齢より上では「産業平均に対する倍率は変わらない」という仮定が残っています。
              {bias.oldestTargetAge}歳時点の推定は最大で{bias.oldestMaxCompanyName}の
              {formatManYen(bias.oldestMaxEstimate)}
              になります。ここを直すだけの根拠になるデータを見つけられていないため、置き換えていません。
            </p>
            <p className="mt-2">
              加えて{bias.oldestTargetAge}
              歳付近のカーブは、定年や再雇用で賃金の下がった人を含む産業平均の形です。それをそのままその会社の
              {bias.oldestTargetAge}歳に当てています。
            </p>
          </div>

          <div>
            <h3 className="font-bold">平均年齢から離れた年齢ほど不確実です</h3>
            <p>
              掲載企業の平均年齢は中央値{formatDecimal1(bias.avgAgeMedian)}
              歳です。目標年齢{bias.youngestTargetAge}歳を選ぶと平均
              {extrapolation.get(25)?.toFixed(1)}歳ぶん、{bias.oldestTargetAge}歳なら
              {extrapolation.get(60)?.toFixed(1)}
              歳ぶん、実測から離れた場所を推定することになります。40歳（
              {extrapolation.get(40)?.toFixed(1)}歳）が最も近く、両端が最も遠くなります。
            </p>
            <p className="mt-2">
              <strong>平均年齢に近い年齢ほど確からしく、離れるほど幅を持って読んでください。</strong>
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
              className="text-primary underline"
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
              className="text-primary underline"
              target="_blank"
              rel="noreferrer"
            >
              賃金構造基本統計調査（厚生労働省）
            </a>
            — 賃金カーブ。
            <a href="https://www.e-stat.go.jp/" className="text-primary underline" target="_blank" rel="noreferrer">
              e-Stat
            </a>
            経由で取得
          </li>
        </ul>
      </Section>

      <Section title="企業ロゴの出典">
        <p>
          会社名の左に出しているロゴは、{formatInt(logoCounts.total)}社ぶんを2つの出典から取得し、当サイトで配信しています。
          {formatInt(logoCounts.commons)}社は Wikimedia Commons に自由なライセンスで公開されているもの、
          {formatInt(logoCounts.site)}社は各社の公式サイトに掲載されているものです。
          いずれも大きさをそろえる以外の加工はしていません。ロゴを持たない会社は社名の頭文字を代わりに出しています。
        </p>
        <p>
          <strong>ロゴは各社の商標です。</strong>
          掲載は当該企業を識別するためのもので、当サイトと各社の提携・推奨を示すものではありません。
        </p>
        {logoCredits.length > 0 && (
          <>
            <p>
              このうち次の{formatInt(logoCredits.length)}社のロゴは、作者の表示が求められるライセンスで公開されているものです。
            </p>
            <ul className="flex flex-col gap-1 text-sm">
              {logoCredits.map((credit) => (
                <li key={credit.id}>
                  {credit.name} —{" "}
                  <a href={credit.from} className="text-primary underline" target="_blank" rel="noreferrer">
                    {credit.license}
                  </a>
                  {credit.author && `（${credit.author}）`}
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <footer>
        <NavLink href="/" className="text-primary text-sm underline">
          ← ランキングに戻る
        </NavLink>
      </footer>
    </div>
  );
}
