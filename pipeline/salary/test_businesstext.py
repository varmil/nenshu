"""`businesstext.py` の単体テスト。

  cd pipeline && npm test        # vitest と一緒に走る
  python3 -m unittest discover -s salary -t salary -p 'test_*.py'

**固定入力で規則を留めるのがここの役目。** 実物の有報を読むテストは書かない
（`cache/` は `.gitignore` 済みで、まっさらなコンテナでは1件も無い）。
"""

import unittest

import businesstext as bt


class ToPlainText(unittest.TestCase):
    def test_空(self):
        self.assertEqual(bt.to_plain_text(""), "")
        self.assertEqual(bt.to_plain_text(None), "")

    def test_タグを落とす(self):
        self.assertEqual(bt.to_plain_text("<span>当社は</span>製造業です。"), "当社は製造業です。")

    def test_ブロックの終わりは改行になる(self):
        self.assertEqual(bt.to_plain_text("<p>あ</p><p>い</p>"), "あ\nい")
        self.assertEqual(bt.to_plain_text("あ<br>い"), "あ\nい")

    def test_実体参照を戻す(self):
        self.assertEqual(bt.to_plain_text("Ｍ&amp;Ａ仲介"), "Ｍ&Ａ仲介")

    def test_escape済みのタグは文字として残る(self):
        # タグを落としてから実体参照を戻すので、`&lt;p&gt;` は文字列のまま残る。
        # 逆順にすると原文にあった「<p>」という表記まで消える。
        self.assertEqual(bt.to_plain_text("記号は &lt;p&gt; です。"), "記号は <p> です。")

    def test_全角空白は段落の切れ目として改行になる(self):
        self.assertEqual(bt.to_plain_text("３【事業の内容】　当社は、"), "３【事業の内容】\n当社は、")

    def test_半角の連続空白は1つに畳む(self):
        # 欧文の社名の中の空白は改行にしない（`Lasertec U.S.A., Inc.`）。
        self.assertEqual(bt.to_plain_text("Lasertec  U.S.A., Inc."), "Lasertec U.S.A., Inc.")

    def test_全角を含む並びは改行になる(self):
        self.assertEqual(bt.to_plain_text("です。 　なお、"), "です。\nなお、")
        self.assertEqual(bt.to_plain_text("です。　　　　なお、"), "です。\nなお、")

    def test_NBSPも空白として畳む(self):
        self.assertEqual(bt.to_plain_text("当社  は"), "当社 は")

    def test_行の前後の空白と空行を落とす(self):
        self.assertEqual(bt.to_plain_text("<p> あ </p><p>　</p><p>い</p>"), "あ\nい")

    def test_改行は落とさない(self):
        self.assertEqual(bt.to_plain_text("あ\r\nい\nう"), "あ\nい\nう")


class Pick(unittest.TestCase):
    def test_無ければ空文字(self):
        self.assertEqual(bt.pick(None), "")
        self.assertEqual(bt.pick([]), "")
        self.assertEqual(bt.pick(["", "  ", "　"]), "")

    def test_最も長いものを採る(self):
        self.assertEqual(bt.pick(["短い", "もっと長い文章"]), "もっと長い文章")

    def test_長さは平文にしてから比べる(self):
        # タグのぶんで長く見える値に倒れない。
        self.assertEqual(bt.pick(["<span><b>あ</b></span>", "いろは"]), "いろは")


if __name__ == "__main__":
    unittest.main()
