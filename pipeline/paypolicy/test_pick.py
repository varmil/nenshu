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

    def test_referenced_with_a_short_summary_keeps_the_range(self):
        # 兼松: 節の中は1文の要約で、詳しい記載はサステナビリティの節
        rec, err = pick.judge(BLOCKS, {"verdict": "referenced", "title": "b4", "start": "b5s1", "end": "b5s1"}, "section")
        self.assertIsNone(err)
        self.assertEqual(rec["verdict"], "referenced")
        self.assertEqual(rec["blocks"], [{"kind": "para", "text": "給与は役割に応じて決めます。"}])

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


class TestMerge(unittest.TestCase):
    """参照の会社は2回に分けて回す。2回目の結果で1回目を置き換える。"""

    DOC = "S100YGCZ"  # 兼松（対象の書類。社名などは ranking_unified_2026.csv から引く）

    def setUp(self):
        import tempfile
        from pathlib import Path
        self.tmp = Path(tempfile.mkdtemp())
        self.saved = pick.OUT, pick.WORK
        pick.OUT, pick.WORK = self.tmp / "out.json", self.tmp / "work"
        pick.WORK.mkdir()

    def tearDown(self):
        import shutil
        pick.OUT, pick.WORK = self.saved
        shutil.rmtree(self.tmp)

    def _gated(self, n, rec):
        import json
        (pick.WORK / f"gated_{n:04d}.json").write_text(json.dumps({"results": [rec], "errors": []}, ensure_ascii=False))

    def _run(self):
        import argparse
        import contextlib
        import io
        with contextlib.redirect_stdout(io.StringIO()):
            pick.cmd_merge(argparse.Namespace())
        return pick.read_out()[self.DOC]

    def _round1(self):
        summary = [{"kind": "para", "text": "公正かつ透明性の高い報酬制度を構築しております。"}]
        self._gated(1, {"doc_id": self.DOC, "source": "section", "source_sha1": "a", "verdict": "referenced",
                        "title": "(2) 従業員給与・報酬の決定に関する方針", "blocks": summary, "note": ""})
        return summary

    def test_round1_referenced_has_no_body_yet(self):
        summary = self._round1()
        row = self._run()
        self.assertEqual(row["verdict"], "referenced")
        self.assertEqual(row["blocks"], [])
        self.assertEqual(row["fallback"]["blocks"], summary)

    def test_round2_found_in_sustainability(self):
        self._round1()
        body = [{"kind": "para", "text": "基本給は役割に連動した等級に応じて決定します。"}]
        self._gated(2, {"doc_id": self.DOC, "source": "sustainability", "source_sha1": "b", "verdict": "own",
                        "title": "(ⅲ)従業員給与・報酬の決定に関する方針", "blocks": body, "note": ""})
        row = self._run()
        self.assertEqual((row["verdict"], row["source"]), ("own", "sustainability"))
        self.assertEqual(row["blocks"], body)
        self.assertEqual(row["section_sha1"], "a")

    def test_round2_not_found_falls_back_to_the_summary(self):
        summary = self._round1()
        self._gated(2, {"doc_id": self.DOC, "source": "sustainability", "source_sha1": "b", "verdict": "none",
                        "title": None, "blocks": [], "note": ""})
        row = self._run()
        self.assertEqual((row["verdict"], row["source"]), ("own", "section"))
        self.assertEqual(row["blocks"], summary)


if __name__ == "__main__":
    unittest.main()
