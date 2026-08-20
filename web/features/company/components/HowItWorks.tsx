import { NavLink } from "@/features/navigation/components/NavLink";
import { Card, CardContent } from "@/design-system/ui/card";

const STEPS = [
  {
    title: "有価証券報告書を読む",
    body: "金融庁 EDINET から、提出会社（単体）の平均年間給与・平均年齢・平均勤続年数・従業員数を取ります。ここまでは補正のない実測値です。",
  },
  {
    title: "業種の賃金カーブを作る",
    body: "厚生労働省「賃金構造基本統計調査」から、業種ごとに年齢別の賃金水準を1本の形にします。会社間の差から作った平均的な形です。",
  },
  {
    title: "目標年齢の水準に置き換える",
    body: "その会社の平均年齢での実測値がカーブ上のどこに当たるかを見て、選んだ年齢の水準に置き換えます。これが推定年収です。",
  },
];

/**
 * 「この数字の作り方」（spec 1.15）。
 *
 * **詳細は `/about` に置いたまま、ここでは流れだけを見せて導線にする。** 出典と
 * 計算方法へのリンクは footer にもあるが読み飛ばされる。根拠の公開そのものが
 * 差別化だという立て方（`docs/ranking/spec.md` 2.）に対して導線が弱かった。
 */
export function HowItWorks() {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-bold">この数字の作り方</h2>
      {/*
        番号は丸の中の数字にする（C3、アートボード 4b）。「STEP 1」という文字列より
        1文字ぶんで済み、3枚が横に並んだときに順番が形で分かる。
      */}
      <ol className="grid gap-2 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step.title}>
            <Card className="h-full">
              <CardContent className="flex flex-col gap-1.5 p-4">
                <span
                  aria-hidden="true"
                  className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-full text-xs font-bold tabular-nums"
                >
                  {i + 1}
                </span>
                <h3 className="text-sm font-bold">{step.title}</h3>
                <p className="text-muted-foreground text-xs">{step.body}</p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
      <p className="text-muted-foreground text-xs">
        式・対象範囲・限界は
        <NavLink href="/about" className="text-primary mx-1 underline">
          計算方法
        </NavLink>
        にすべて書いています。
      </p>
    </section>
  );
}
