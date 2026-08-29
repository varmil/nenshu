"""`gate.py` の単体テスト。

  cd pipeline && npm test
  python3 -m unittest discover -s summary -t summary -p 'test_*.py'

**LLM を呼ぶ工程で固定入力のテストが書けるのはここだけ**（C6・#160）。生成と検証は
セッションのエージェントが担うので、規則を留められるのは機械ゲートの側になる。
"""

import unittest

import gate

# キーエンスの原文（抜粋）。ADR-0010 決定2 が名指しした回帰ケースの材料。
KEYENCE = (
    "３【事業の内容】\n"
    "当社の関係会社は、当社、連結子会社39社、関連会社1社により構成され、"
    "その主な事業内容は、電子応用機器の製造及び販売であります。\n"
    "当社が商品の開発、製造及び販売を行っているほか、キーエンスソフトウェア㈱は"
    "当社商品のソフトウェア開発、キーエンスエンジニアリング㈱は当社商品の製造を"
    "行っております。さらに北米・欧州・アジアの子会社等を通じて販売を行っております。"
)
OK = (
    "電子応用機器の開発、製造及び販売を主な事業とする。"
    "商品の開発から販売までを自社で担い、製造とソフトウェア開発は子会社が分担する。"
    "海外では現地の子会社を通じて販売する。"
)


class Width(unittest.TestCase):
    def test_全角は1字(self):
        self.assertEqual(gate.width("あいう"), 3)

    def test_半角は半字で切り上げ(self):
        self.assertEqual(gate.width("abc"), 2)
        self.assertEqual(gate.width("abcd"), 2)


class Sentences(unittest.TestCase):
    def test_句点で切り句点は文に残す(self):
        self.assertEqual(gate.sentences("あ。い。"), ["あ。", "い。"])

    def test_空は空(self):
        self.assertEqual(gate.sentences(""), [])
        self.assertEqual(gate.sentences(None), [])


class NameTokens(unittest.TestCase):
    def test_株式会社を外した形も見る(self):
        self.assertEqual(gate.name_tokens("株式会社キーエンス"),
                         {"株式会社キーエンス", "キーエンス"})

    def test_1字になるものは見ない(self):
        # 「株式会社ノ」のような社名で1字が残ると、地の文の助詞に当たってしまう。
        self.assertNotIn("ノ", gate.name_tokens("株式会社ノ"))


class UnsupportedTerms(unittest.TestCase):
    def test_原文に無いカタカナ語を挙げる(self):
        self.assertEqual(gate.unsupported_terms("ファブレス体制をとる。", KEYENCE), ["ファブレス"])

    def test_原文にあるカタカナ語は挙げない(self):
        self.assertEqual(gate.unsupported_terms("ソフトウェア開発を担う。", KEYENCE), [])

    def test_3文字のカタカナは見ない(self):
        # 「センサ」のような短い語まで見ると、原文の言い換えが通らなくなる。
        self.assertEqual(gate.unsupported_terms("センサを作る。", KEYENCE), [])

    def test_原文に無い欧文の略語を挙げる(self):
        self.assertEqual(gate.unsupported_terms("CRO事業を営む。", KEYENCE), ["CRO"])

    def test_全角と半角の食い違いで落とさない(self):
        # 有報は略語を全角で書くことが多く、説明文は半角で書く。**素で比べると
        # 「原文に無い固有名詞」になる**——実測で60社中8社がこれで落ちた。
        self.assertEqual(gate.unsupported_terms("ＤＸを支援する。", "DXの推進を支援する。"), [])
        self.assertEqual(gate.unsupported_terms("ITを支援する。", "ＩＴの活用を支援する。"), [])

    def test_大文字と小文字も区別しない(self):
        self.assertEqual(gate.unsupported_terms("SaaSを提供する。", "各種saasを提供する。"), [])

    def test_略語を展開した語は挙げる(self):
        # 原文の「ＦＡ」を「ファクトリーオートメーション」と書くのは、標準的な展開でも
        # **原文に無い語**になる。ファナックが実際にこれで落ちた。
        self.assertEqual(
            gate.unsupported_terms("ファクトリーオートメーションを手がける。", "ＦＡを手がける。"),
            ["ファクトリーオートメーション"],
        )


class ApplyGate(unittest.TestCase):
    def test_規格を満たす説明文は通る(self):
        text, reasons = gate.apply_gate(OK, "株式会社キーエンス", KEYENCE)
        self.assertEqual(text, OK)
        self.assertEqual(reasons, [])

    def test_ADR0010が名指しした文は落ちる(self):
        # 「自社工場を持たないファブレス体制」は原文に無く、原文はむしろ逆を書いている。
        bad = OK + "自社工場を持たないファブレス体制で、高い収益性を保つ。"
        text, reasons = gate.apply_gate(bad, "株式会社キーエンス", KEYENCE)
        # 落ちるのはその1文だけで、残り3文は通る（AC-3 は「文を落とす」と決めている）。
        self.assertEqual(text, OK)
        self.assertTrue(any("ファブレス" in r for r in reasons))
        self.assertTrue(any("高い収益性" in r for r in reasons))

    def test_語形の違う評価語も落ちる(self):
        # 「高い収益性」は入っていたが「収益性の高い」は素通りしていた（C9 の15回目）。
        bad = OK + "収益性の高い事業を中心に展開している。"
        text, reasons = gate.apply_gate(bad, "株式会社キーエンス", KEYENCE)
        self.assertEqual(text, OK)
        self.assertTrue(any("収益性の高い" in r for r in reasons))

    def test_強みの語形違いも落ちる(self):
        # 「強みと」は入っていたが「強みである」は素通りしていた（C9 の42回目・住友化学）。
        bad = OK + "強みである有機合成技術を軸に事業を進める。"
        text, reasons = gate.apply_gate(bad, "株式会社キーエンス", KEYENCE)
        self.assertEqual(text, OK)
        self.assertTrue(any("強みである" in r for r in reasons))

    def test_社名が入った文は落ちる(self):
        bad = "キーエンスは電子応用機器を作る。" + OK
        text, _ = gate.apply_gate(bad, "株式会社キーエンス", KEYENCE)
        self.assertEqual(text, OK)

    def test_アラビア数字が入った文は落ちる(self):
        bad = OK + "連結子会社は39社ある。"
        text, reasons = gate.apply_gate(bad, "株式会社キーエンス", KEYENCE)
        self.assertEqual(text, OK)
        self.assertTrue(any("数値: 39" in r for r in reasons))

    def test_漢数字は助数詞が続くときだけ落とす(self):
        self.assertEqual(gate.sentence_problems("三社を傘下に置く。", "", ""),
                         ["数値: 三社"])
        self.assertEqual(gate.sentence_problems("十分な体制を敷く。", "", ""), [])

    def test_単一セグメントの一を数と見ない(self):
        # 有報の定型句で、数を述べているわけではない。**実測で4社がこれで落ちた。**
        src = "銀行業の単一セグメントであります。その一つとして貸出を行う。"
        self.assertEqual(gate.sentence_problems("銀行業の単一セグメントとしている。", "", src), [])
        self.assertEqual(gate.sentence_problems("その一つとして貸出を行う。", "", src), [])


class QuantityDigits(unittest.TestCase):
    def test_量を述べる数字は挙げる(self):
        self.assertEqual(gate.quantity_digits("連結子会社は39社ある。"), "39")

    def test_英字に隣り合う数字は語の一部として見逃す(self):
        # `3PL`・`Web3` は原文にある語で量ではない。ロジスティードが `３ＰＬ` で落ちた。
        self.assertEqual(gate.quantity_digits("３ＰＬ事業を行う。"), "")
        self.assertEqual(gate.quantity_digits("Web3を扱う。"), "")


class CoveredBySource(unittest.TestCase):
    def test_原文にある塊の繋ぎ合わせは通す(self):
        # 正規表現はカタカナの連なりを丸ごと1語で拾うので、原文の「インターネット」と
        # 「サービス」を繋いだ語まで「原文に無い」になる。**ＭＩＸＩがこれで落ちた。**
        self.assertEqual(
            gate.unsupported_terms("インターネットサービスを運営する。",
                                   "インターネットを活用したサービスの運営を行う。"),
            [],
        )

    def test_どう切っても原文に無い語は落とす(self):
        self.assertEqual(gate.unsupported_terms("ファブレス体制をとる。", "当社が製造する。"),
                         ["ファブレス"])

    def test_3文字以下の塊では覆わない(self):
        # 「メガ」のような短い塊まで許すと、造語がほぼ全部通ってしまう。
        self.assertEqual(gate.unsupported_terms("メガソーラーを持つ。", "メガとソーラーがある。"),
                         ["メガソーラー"])


class ApplyGate2(unittest.TestCase):
    def test_文が足りなくなれば不合格(self):
        text, reasons = gate.apply_gate("電子応用機器の製造及び販売を主な事業とする。",
                                        "株式会社キーエンス", KEYENCE)
        self.assertEqual(text, "")
        self.assertTrue(any("文数" in r for r in reasons))

    def test_短すぎる説明文は不合格(self):
        text, reasons = gate.apply_gate("機器を作る。機器を売る。", "", "機器を作る。機器を売る。")
        self.assertEqual(text, "")
        self.assertTrue(any("字数" in r for r in reasons))

    def test_空の説明文は不合格(self):
        text, reasons = gate.apply_gate("", "株式会社キーエンス", KEYENCE)
        self.assertEqual(text, "")
        self.assertEqual(reasons, ["説明文が空"])


if __name__ == "__main__":
    unittest.main()
