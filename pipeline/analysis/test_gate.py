"""`gate.py` の単体テスト。**LLM を呼ばない層なので、ここだけが固定入力で確かめられる。**

  cd pipeline && npm test
  python3 -m unittest discover -s analysis -t analysis -p 'test_*.py'
"""

import unittest

import gate

SOURCE = (
    "当社グループは、電子応用機器の開発、製造及び販売を行っております。"
    "当連結会計年度の売上高は58,448百万円となり、前期比3.4%減となりました。"
    "営業利益は1,298百万円で52.2%減であります。"
)


def _summary(n_sentences=4, filler="事業の状況を述べる文である。"):
    return filler * n_sentences


class SummaryGate(unittest.TestCase):
    def test_評価語を落とす(self):
        bad = gate.summary_sentence_problems("業界最大手として販売を行う。", SOURCE)
        self.assertTrue(any(b.startswith("評価語") for b in bad))

    def test_社名は通す(self):
        # **50回目に外した**（運営者の指示）。C6 から引き継いだ「h1 にあるから書かない」は、
        # 社名の語を含む子会社名・ブランド名まで巻き込んでいた（東急電鉄・楽天市場・太陽ファルマ）。
        # 要約が「何をしている会社か」を固有名詞で書く形になった以上、この規則は害のほうが大きい。
        self.assertEqual(gate.summary_sentence_problems("テストは販売を行う。", SOURCE), [])

    def test_原文にある数値は通す(self):
        self.assertEqual(gate.unsupported_numbers("売上高は58,448百万円である。", SOURCE), [])

    def test_桁区切りが違っても同じ数と見る(self):
        self.assertEqual(gate.unsupported_numbers("売上高は58448百万円である。", SOURCE), [])

    def test_原文に無い数値を落とす(self):
        # **要約は原文に書いてある事実だけなので、原文に無い数はそこで作られたもの。**
        # 返すのは**書かれたままの並び**（理由の文にそのまま出せる）。
        self.assertEqual(gate.unsupported_numbers("売上高は99,999百万円である。", SOURCE),
                         ["99,999"])

    def test_英字に隣り合う数字は数と見ない(self):
        self.assertEqual(gate.digit_runs("Web3 と 3PL を手がける。"), [])

    def test_カギ括弧の中の数字は数えない(self):
        # **具体的に書くほど上限に食い込む**のを避ける。止めたいのは量を並べることで、
        # 名前を出すことではない。
        self.assertEqual(gate.digit_runs("中期経営計画「変革2030」を掲げる。"), [])
        self.assertEqual(gate.digit_runs("家電の「S!mplus」と「R-2000シリーズ」。"), [])

    def test_カギ括弧の外の数字は数える(self):
        self.assertEqual(gate.digit_runs("「変革2030」のもとで2割伸びた。"), ["2"])

    def test_通った要約が返る(self):
        text = "電子応用機器の開発を行う。" * 3 + "売上高は58,448百万円であった。" * 12
        got, reasons = gate.apply_summary_gate(text, SOURCE)
        self.assertEqual(got, "")  # 文数の上限を超える
        self.assertTrue(any("文数" in r for r in reasons))

    def test_数値が多ければ落ちる(self):
        # **50回目に足した**。改める前の316社の実測は要約1本あたり中央27個で、
        # 168社（53.2%）が「当連結会計年度の売上高は…」で始まっていた。
        long = "電子応用機器の開発、製造及び販売を行い、幅広い顧客に届けている。"
        text = (long * 7 + "売上高は58,448百万円であった。"
                + "営業利益は1,298百万円であった。" + "前期比は3.4%減であった。")
        got, reasons = gate.apply_summary_gate(text, SOURCE)
        self.assertEqual(got, "")
        self.assertTrue(any("数値が多い" in r for r in reasons))

    def test_カギ括弧の中の数字は要約でも数えない(self):
        # `一太郎2025` は名前であって量ではない。**具体的に書くほど上限に食い込む**のを避ける。
        text = ("日本語ワープロソフト「一太郎2025」を開発し、幅広い利用者に届けている。"
                "クラウドサービス「ATOK Passport」も提供している。"
                "通信教育「スマイルゼミ」は幼児から高校生までを対象としている。"
                "ＥＣサイト「Just MyShop」も運営している。"
                "対話型の教材「Coachez」の提供も始めた。"
                "米国向けの学習サービス「Smile Zemi」も展開している。"
                "既存の事業で安定した収益をあげながら、新しい商品の企画と開発に取り組む。"
                "高機能で付加価値の高い商品とサービスを提供することにこだわっている。")
        got, _ = gate.apply_summary_gate(text, text)
        self.assertNotEqual(got, "")

    def test_字数が足りなければ落ちる(self):
        got, reasons = gate.apply_summary_gate("短い。短い。短い。", SOURCE)
        self.assertEqual(got, "")
        self.assertTrue(any("字数" in r for r in reasons))


HEADLINE = "業績は堅いが、平均年収は10年で13%下がっている。"
BODY = (
    "増収増益で財務も厚いのに、会社の好調が給与に回っていない期間が続いている。"
    "本業の稼ぐ力は落ちておらず、手元の資金にも厚みがあって、事業そのものが傾いている"
    "わけではない。一方で待遇の面では、在籍が長くなるほど報われるという形にはなって"
    "いない。今後は自動化の需要をどこまで取り込めるかが問われる局面にある。"
    "求職者にとっては、入ってからの伸びをどう見るかが判断の分かれ目になる。"
)
SOURCES = [{"url": "https://example.com/ir/news", "title": "決算発表", "accessed": "2026-08-28"}]


class AnalysisGate(unittest.TestCase):
    def test_評価語を通す(self):
        # **これが本体である**（ADR-0015 決定1）。要約とここが決定的に違う。
        h, b, reasons = gate.apply_analysis_gate(
            "本業は苦しく、最終利益の増加は本業の回復によるものではない。",
            "営業利益が半減し、値引きに頼った販売で粗利も落ちた。"
            "最終利益は増えているが、これは保有株の売却益によるもので、商売が上向いた"
            "わけではない。ブランドの立て直しと在庫の絞り込みを進めているが、"
            "その効果が損益に出るまでにはまだ時間がかかる。"
            "求職者にとっては、立て直しの途中に加わることになる。", SOURCES)
        self.assertEqual(reasons, [])
        self.assertTrue(b)

    def test_数値が多すぎると落とす(self):
        h, b, reasons = gate.apply_analysis_gate(
            HEADLINE,
            "売上は58,448百万円、営業利益は1,298百万円、経常利益は1,436百万円である。"
            "純利益は4,113百万円であった。前期比では3.4%減となった。", SOURCES)
        self.assertEqual(b, "")
        self.assertTrue(any("数値が多い" in r for r in reasons))

    def test_上限は引数で変えられる(self):
        # **上限はパイロットで決める**ので、値を1か所に固定しない。
        _, b, _ = gate.apply_analysis_gate(HEADLINE, BODY, SOURCES, max_digits=0)
        self.assertEqual(b, "")
        _, b, reasons = gate.apply_analysis_gate(HEADLINE, BODY, SOURCES, max_digits=2)
        self.assertEqual(reasons, [])
        self.assertTrue(b)

    def test_見出しが2文なら落とす(self):
        _, b, reasons = gate.apply_analysis_gate("堅い。しかし年収は下がる。", BODY, SOURCES)
        self.assertEqual(b, "")
        self.assertTrue(any("見出しが1文でない" in r for r in reasons))

    def test_出典がURLでなければ落とす(self):
        _, b, reasons = gate.apply_analysis_gate(
            HEADLINE, BODY, [{"url": "公式サイト", "title": "会社概要"}])
        self.assertEqual(b, "")
        self.assertTrue(any("URLでない" in r for r in reasons))

    def test_出典が空でも通す(self):
        # 有報と同じページの数値だけで書けた会社がある。**外部の材料は必須ではない。**
        _, b, reasons = gate.apply_analysis_gate(HEADLINE, BODY, [])
        self.assertEqual(reasons, [])
        self.assertTrue(b)

    def test_分析ごと落とす(self):
        # **文ごとには落とさない**——一言と地の文が1つの筋なので、途中を抜くと宙に浮く。
        h, b, _ = gate.apply_analysis_gate(HEADLINE, "短い。", SOURCES)
        self.assertEqual((h, b), ("", ""))


# ファナックの実データに近い形（2017年 1,318万 → 2026年 1,144万 で −13.2%）。
# **端から端が「10年で」**——差は9年だが、日本語ではそう書く。
HISTORY = {2017: 13180000, 2020: 12500000, 2026: 11440000}


class TrendClaims(unittest.TestCase):
    def test_主張を拾う(self):
        self.assertEqual(gate.trend_claims("平均年収は10年で13%下がっている。"),
                         [(10, 13.0, "down")])

    def test_全角でも拾う(self):
        self.assertEqual(gate.trend_claims("１０年で１３％下がった。"), [(10, 13.0, "down")])

    def test_支持される主張は通る(self):
        # 2017年 1,318万 → 2026年 1,144万 は −13.2%。
        self.assertEqual(gate.check_trend_claims("10年で13%下がっている。", HISTORY), [])

    def test_向きが逆なら落ちる(self):
        bad = gate.check_trend_claims("10年で13%上がっている。", HISTORY)
        self.assertEqual(len(bad), 1)
        self.assertIn("実際は-13.2%", bad[0])

    def test_桁が違えば落ちる(self):
        bad = gate.check_trend_claims("10年で50%下がっている。", HISTORY)
        self.assertEqual(len(bad), 1)
        self.assertIn("実際は13.2%", bad[0])

    def test_基準年はどちらの数え方でも通す(self):
        # 2017〜2026 を「10年で」と書いても「9年で」と書いても支持される。
        self.assertEqual(gate.check_trend_claims("9年で13%下がっている。", HISTORY), [])

    def test_照合できない年は黙って通す(self):
        # **「照合できない」を「誤り」と数えない**——10年ぶんを持たない会社の分析が
        # 理由なく落ちる。
        self.assertEqual(gate.check_trend_claims("4年で5%下がっている。", HISTORY), [])
        self.assertEqual(gate.check_trend_claims("10年で13%下がっている。", {}), [])


if __name__ == "__main__":
    unittest.main()
