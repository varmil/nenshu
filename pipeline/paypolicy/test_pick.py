"""`pick.judge` のテスト（C18・#851）。

エージェントの答えのうち、機械で落とせるものを落とす。範囲の取り違えそのもの
（人材戦略の文が混ざる・給与の文が落ちる）は機械では判定できないので、ここでは
番号の形と位置の矛盾だけを見る。
"""

import unittest

import blocks as B
import pick

BLOCKS = B.parse(
    "<h4>（１）【人材戦略に関する基本方針等】</h4>"
    "<p>①人材戦略</p>"
    "<p>人材を最も重要な資産と考えています。</p>"
    "<p>②従業員給与等の決定方針</p>"
    "<p>給与は役割に応じて決めます。賞与は業績に連動します。</p>"
)


class TestJudge(unittest.TestCase):
    def test_own_with_title(self):
        rec, err = pick.judge(BLOCKS, {"verdict": "own", "title": "b4", "start": "b5s1", "end": "b5s2"}, "section")
        self.assertIsNone(err)
        self.assertEqual(rec["title"], "②従業員給与等の決定方針")
        self.assertEqual(rec["blocks"], [{"kind": "para", "text": "給与は役割に応じて決めます。賞与は業績に連動します。"}])

    def test_referenced_and_none_have_no_body(self):
        for v in ("referenced", "none"):
            rec, err = pick.judge(BLOCKS, {"verdict": v, "note": "x"}, "section")
            self.assertIsNone(err)
            self.assertEqual(rec["blocks"], [])

    def test_referenced_is_not_allowed_in_sustainability(self):
        _, err = pick.judge(BLOCKS, {"verdict": "referenced"}, "sustainability")
        self.assertIsNotNone(err)

    def test_rejects(self):
        cases = [
            {"verdict": "yes"},
            {"verdict": "own", "start": "b5s2", "end": "b5s1"},
            {"verdict": "own", "start": "b1", "end": "b3"},
            {"verdict": "own", "title": "b5", "start": "b5s1", "end": "b5s2"},  # 題が段落
            {"verdict": "own", "title": "b2", "start": "b2", "end": "b3"},  # 題が始まりと同じ
            {"verdict": "own", "title": "b4s1", "start": "b5s1", "end": "b5s2"},  # 題に文の番号
            {"verdict": "own", "start": "b5s3", "end": "b5s3"},
        ]
        for p in cases:
            with self.subTest(p=p):
                rec, err = pick.judge(BLOCKS, p, "section")
                self.assertIsNone(rec)
                self.assertIsNotNone(err)

    def test_stats(self):
        body = [{"kind": "para", "text": "給与は 役割で決める。"}, {"kind": "table", "rows": [["a", "b"]]}]
        self.assertEqual(pick.stats(body), {"chars": 12, "has_table": True, "has_image": False})


if __name__ == "__main__":
    unittest.main()
