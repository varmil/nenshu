"""`gate.py` の単体テスト。**LLM を呼ばない層なので、ここだけが固定入力で確かめられる。**

  cd pipeline && npm test
  python3 -m unittest discover -s analysis -t analysis -p 'test_*.py'
"""

import unittest

import gate

NAME = "株式会社テスト"
SOURCE = (
    "当社グループは、電子応用機器の開発、製造及び販売を行っております。"
    "当連結会計年度の売上高は58,448百万円となり、前期比3.4%減となりました。"
    "営業利益は1,298百万円で52.2%減であります。"
)


def _summary(n_sentences=4, filler="事業の状況を述べる文である。"):
    return filler * n_sentences


class SummaryGate(unittest.TestCase):
    def test_評価語を落とす(self):
        bad = gate.summary_sentence_problems("業界最大手として販売を行う。", NAME, SOURCE)
        self.assertTrue(any(b.startswith("評価語") for b in bad))

    def test_社名を落とす(self):
        bad = gate.summary_sentence_problems("テストは販売を行う。", NAME, SOURCE)
        self.assertTrue(any(b.startswith("社名") for b in bad))

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

    def test_通った要約が返る(self):
        text = "電子応用機器の開発を行う。" * 3 + "売上高は58,448百万円であった。" * 12
        got, reasons = gate.apply_summary_gate(text, NAME, SOURCE)
        self.assertEqual(got, "")  # 文数の上限を超える
        self.assertTrue(any("文数" in r for r in reasons))

    def test_字数が足りなければ落ちる(self):
        got, reasons = gate.apply_summary_gate("短い。短い。短い。", NAME, SOURCE)
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
