"""`blocks.py` のテスト（C18・#851）。

守っているのは「生成AIが範囲を選んでも、本文は原文から1字も変わらない」こと。
塊への分解が空白以外の文字を落とさないこと、文をつなぎ直すと段落に戻ること、
`cut` が選ばれた文をそのまま返すことを固定する。
"""

import unittest

import blocks as B

NTT_LIKE = """
<h4>（1）【人材戦略に関する基本方針等】</h4>
<p style="text-indent: 12px">当社は、人材戦略を経営戦略を支える重要な柱と認識しています。詳細は「第2 事業の状況」をご参照ください。</p>
<p style="text-indent: 12px">月例賃金については、13年連続で改定しており、2026年度は平均約６％の改定を行いました。</p>
<p style="text-indent: 12px">&#160;</p>
"""

HAMEE_LIKE = """
<h4>(1) 【人材戦略に関する基本方針等】</h4>
<h5>①　人材育成方針</h5>
<h6>優秀な人材を継続的に雇用するとともに、その成長機会を提供してまいります。</h6>
<h5>③　従業員の給与等の額及び内容の決定方針</h5>
<h6>当社は、各人の職務、役割及び成果に応じた公正な処遇を基本方針とし、外部の給与水準の動向を総合的に勘案して決定しています。</h6>
"""

NESTED_TABLE = """
<p>指標は次のとおりです。</p>
<table><tr><td>指標</td><td><table><tr><td>目標</td><td>実績</td></tr></table></td></tr>
<tr><td>女性管理職比率</td><td>10％</td></tr></table>
<p>以上です。</p>
"""


def texts(blocks):
    return [(b["kind"], B.block_text(b)) for b in blocks]


class TestParse(unittest.TestCase):
    def test_title_and_paragraphs(self):
        bl = B.parse(NTT_LIKE)
        self.assertEqual(
            [b["kind"] for b in bl], ["title", "para", "para"],
            "中身が &#160; だけの段落は落とす",
        )
        self.assertEqual(bl[1]["sentences"], [
            "当社は、人材戦略を経営戦略を支える重要な柱と認識しています。",
            "詳細は「第2 事業の状況」をご参照ください。",
        ])

    def test_title_with_jinzai_kanji(self):
        # 「人財戦略」と書く会社がある
        bl = B.parse("<h4>（１）【人財戦略に関する基本方針等】</h4><p>本文です。</p>")
        self.assertEqual(bl[0]["kind"], "title")

    def test_heading_is_judged_by_text_not_tag(self):
        # h6 を本文に使う会社がある（Hamee）。タグでは小見出しを判定しない
        bl = B.parse(HAMEE_LIKE)
        self.assertEqual([b["kind"] for b in bl], ["title", "heading", "para", "heading", "para"])

    def test_long_line_without_period_is_a_paragraph(self):
        line = "・エンゲージメント向上：従業員意識調査（目安箱）の設置と改善サイクルの運用、従業員持株会向けRSの"
        self.assertGreater(len(line), B.HEADING_MAX)
        self.assertEqual(B.parse(f"<p>{line}</p>")[0]["kind"], "para")

    def test_long_policy_heading(self):
        # 府令の文言そのままの見出し（45字）。丸藤シートパイル
        line = "②提出会社の従業員の給与（賞与を含む。）その他の給付の額及び内容の決定に関する方針"
        self.assertGreater(len(line), B.HEADING_MAX)
        self.assertEqual(B.parse(f"<p>{line}</p>")[0]["kind"], "heading")
        self.assertEqual(B.parse(f"<p>（{line}）</p>")[0]["kind"], "heading")

    def test_paragraph_split_in_the_middle_of_a_sentence_is_joined(self):
        # ケルは行ごとに p を割っている（「…実現してまいり」／「ます。」）
        head = "当社は、従業員一人ひとりが能力を発揮できる環境を整え、持続的な成長を実現してまいり"
        bl = B.parse(f"<p>{head}</p><p>ます。</p><p>なお、賞与は業績に連動します。</p>")
        self.assertEqual([b["text"] for b in bl], [head + "ます。", "なお、賞与は業績に連動します。"])

    def test_heading_is_not_joined_to_the_next_paragraph(self):
        bl = B.parse("<p>④指標の活用と今後の考え方</p><p>これらの指標を通じて、組織を強くします。</p>")
        self.assertEqual([b["kind"] for b in bl], ["heading", "para"])

    def test_nested_table_keeps_every_character(self):
        bl = B.parse(NESTED_TABLE)
        self.assertEqual([b["kind"] for b in bl], ["para", "table", "para"])
        self.assertEqual(B.squash("".join(B.block_text(b) for b in bl)), B.squash(B.plain_text(NESTED_TABLE)))
        self.assertEqual(bl[2]["text"], "以上です。", "内側の表で外側の表を閉じない")

    def test_text_outside_cells_is_kept(self):
        html = "<table><caption>表の題</caption><tr><td>A</td></tr></table>"
        self.assertEqual(B.parse(html)[0]["rows"], [["表の題"], ["A"]])

    def test_image(self):
        bl = B.parse('<p>図のとおり。</p><p><img src="a.png" alt="報酬体系図"/></p>')
        self.assertEqual(bl[1], {"kind": "image", "alt": "報酬体系図"})

    def test_line_breaks_inside_paragraph(self):
        bl = B.parse("<p>一行目です。<br/>\n二行目です。</p>")
        self.assertEqual(bl[0]["text"], "一行目です。\n二行目です。")
        self.assertEqual("".join(bl[0]["sentences"]), bl[0]["text"])

    def test_source_newlines_and_entities(self):
        html = "<p>当社は、&amp;\n給与を&#160;決める。</p>"
        self.assertEqual(B.parse(html)[0]["text"], "当社は、&給与を 決める。")

    def test_full_width_space_inside_paragraph_is_kept(self):
        # 見出しと本文を1つの p に全角空白で並べる会社がある（ユニリタ）
        text = "② 従業員の給料その他の給付の額及び内容の決定に関する方針　当社における従業員の給与は、役割に応じて決めています。"
        self.assertEqual(B.parse(f"<p>{text}</p>")[0]["text"], text)


class TestSentences(unittest.TestCase):
    def test_period_inside_brackets_does_not_split(self):
        s = "当社は「成果に報いる。挑戦を促す。」を方針としています。賞与は業績に連動します。"
        self.assertEqual(B.split_sentences(s), [
            "当社は「成果に報いる。挑戦を促す。」を方針としています。",
            "賞与は業績に連動します。",
        ])

    def test_trailing_text_without_period(self):
        self.assertEqual(B.split_sentences("給与を決める。詳細は下表"), ["給与を決める。", "詳細は下表"])

    def test_rejoin(self):
        for s in ["", "a", "一。二。", "一。 ", "（注。）二。三"]:
            self.assertEqual("".join(B.split_sentences(s)), s)


class TestCut(unittest.TestCase):
    def setUp(self):
        # 日立の形: 人材戦略の文に続けて、同じ段落の中で給与の決定方針が始まる
        self.bl = B.parse(
            "<h4>（１）【人材戦略に関する基本方針等】</h4>"
            "<p>人財戦略については、第２に記載しています。また、当グループでは、給与の方針として三原則を定めています。</p>"
            "<p>（市場競争力の確保）</p>"
            "<p>報酬の水準は市場に照らして適切なものとします。</p>"
            "<p>（透明性の維持）</p>"
            "<p>評価の理由を本人に伝えます。以上の方針は毎年見直します。</p>"
        )

    def test_units(self):
        ids = [u["id"] for u in B.units(self.bl)]
        self.assertEqual(ids, ["b1", "b2s1", "b2s2", "b3", "b4s1", "b5", "b6s1", "b6s2"])

    def test_cut_from_the_middle_of_a_paragraph(self):
        out = B.cut(self.bl, "b2s2", "b6s2")
        self.assertEqual(texts(out), [
            ("para", "また、当グループでは、給与の方針として三原則を定めています。"),
            ("heading", "（市場競争力の確保）"),
            ("para", "報酬の水準は市場に照らして適切なものとします。"),
            ("heading", "（透明性の維持）"),
            ("para", "評価の理由を本人に伝えます。以上の方針は毎年見直します。"),
        ])

    def test_cut_ending_in_the_middle(self):
        out = B.cut(self.bl, "b5", "b6s1")
        self.assertEqual(texts(out), [("heading", "（透明性の維持）"), ("para", "評価の理由を本人に伝えます。")])

    def test_block_id_of_a_paragraph_means_whole_paragraph(self):
        self.assertEqual(texts(B.cut(self.bl, "b6", "b6")), [("para", "評価の理由を本人に伝えます。以上の方針は毎年見直します。")])

    def test_cut_is_a_contiguous_part_of_the_original(self):
        whole = B.squash("".join(B.block_text(b) for b in self.bl))
        for start, end in [("b2s2", "b6s2"), ("b3", "b4s1"), ("b6s2", "b6s2")]:
            got = B.squash("".join(B.block_text(b) for b in B.cut(self.bl, start, end)))
            self.assertIn(got, whole)

    def test_errors(self):
        with self.assertRaises(ValueError):
            B.cut(self.bl, "b1", "b2s1")  # 節の見出しを含めた
        with self.assertRaises(ValueError):
            B.cut(self.bl, "b4s1", "b2s1")  # 始まりが後ろ
        with self.assertRaises(ValueError):
            B.cut(self.bl, "b2s3", "b4s1")  # 文の番号が範囲外
        with self.assertRaises(ValueError):
            B.cut(self.bl, "b3s1", "b4s1")  # 段落でない塊に文の番号
        with self.assertRaises(ValueError):
            B.cut(self.bl, "b9", "b9")  # 塊の番号が範囲外
        with self.assertRaises(ValueError):
            B.cut(self.bl, "p2", "b4")  # 形が違う


if __name__ == "__main__":
    unittest.main()
