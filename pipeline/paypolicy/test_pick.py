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
        self.assertEqual(rec["range"], {"title": "b4", "start": "b5s1", "end": "b5s2"})
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


class TestBodyMismatch(unittest.TestCase):
    """AC-35: 書き出した本文が原文の連続した一部で、段落の区切りが原文と一致すること。"""

    def test_cut_bodies_pass(self):
        for start, end in [("b5s1", "b5s2"), ("b5s2", "b5s2"), ("b3", "b5s1"), ("b2", "b5")]:
            with self.subTest(start=start, end=end):
                self.assertIsNone(pick.body_mismatch(BLOCKS, B.cut(BLOCKS, start, end)))

    def test_changed_text_fails(self):
        body = B.cut(BLOCKS, "b3", "b5")
        body[1] = {"kind": "heading", "text": "②従業員給与の決定方針"}  # 1字落とした
        self.assertIsNotNone(pick.body_mismatch(BLOCKS, body))

    def test_merged_paragraphs_fail(self):
        # 段落の区切りを落として2つの段落を1つにした
        body = [{"kind": "para", "text": "人材を最も重要な資産と考えています。給与は役割に応じて決めます。"}]
        self.assertIsNotNone(pick.body_mismatch(BLOCKS, body))

    def test_skipped_block_fails(self):
        # 間の塊（小見出し）を飛ばした。文字は全部原文にあるが連続していない
        body = [{"kind": "para", "text": "人材を最も重要な資産と考えています。"},
                {"kind": "para", "text": "給与は役割に応じて決めます。"}]
        self.assertIsNotNone(pick.body_mismatch(BLOCKS, body))

    def test_empty_fails(self):
        self.assertIsNotNone(pick.body_mismatch(BLOCKS, []))


class TestMerge(unittest.TestCase):
    """参照の会社は2回に分けて回す。2回目の結果で1回目を置き換える。

    対象の会社は合成する。`merge` は社名などを対象の会社の表（`pick.companies`）から引くので、
    実データの書類 ID を使うと、その会社が次の有報を出して書類 ID が変わった日に落ちる。
    """

    DOC = "D1"  # 兼松の形（節の中は1文の要約で、詳しい記載はサステナビリティの節）

    def setUp(self):
        import tempfile
        from pathlib import Path
        self.tmp = Path(tempfile.mkdtemp())
        self.saved = pick.OUT, pick.WORK, pick.companies
        pick.OUT, pick.WORK = self.tmp / "out.json", self.tmp / "work"
        pick.WORK.mkdir()
        pick.companies = lambda: {self.DOC: {"edinet_code": "E00001", "sec_code": "0001",
                                             "name": "テスト株式会社", "period_end": "2026-03-31"}}

    def tearDown(self):
        import shutil
        pick.OUT, pick.WORK, pick.companies = self.saved
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


class TestMergeReplacesThePreviousFiling(unittest.TestCase):
    """新しい書類で取り込んだら、同じ会社の前の書類の記録を外す（refresh の D6）。

    記録は書類 ID で持つので、外さないと1社に2行残り、ビルドが古いほうを読む。ただし参照先で
    答え直す前（`referenced`）は外さない——2回目が通らなければ前の書類の記録を残す。
    """

    OLD, NEW = "OLD", "NEW"

    def setUp(self):
        import json
        import tempfile
        from pathlib import Path
        self.tmp = Path(tempfile.mkdtemp())
        self.saved = pick.OUT, pick.WORK, pick.companies
        pick.OUT, pick.WORK = self.tmp / "out.json", self.tmp / "work"
        pick.WORK.mkdir()
        company = {"edinet_code": "E00001", "sec_code": "0001", "name": "テスト株式会社"}
        pick.companies = lambda: {self.NEW: {**company, "period_end": "2027-03-31"}}
        old = {"doc_id": self.OLD, **company, "period_end": "2026-03-31", "verdict": "own", "source": "section",
               "title": None, "blocks": [{"kind": "para", "text": "前の期の方針。"}]}
        pick.OUT.write_text(json.dumps([old], ensure_ascii=False), encoding="utf-8")

    def tearDown(self):
        import shutil
        pick.OUT, pick.WORK, pick.companies = self.saved
        shutil.rmtree(self.tmp)

    def _merge(self, rec, model=""):
        import argparse
        import contextlib
        import io
        import json
        (pick.WORK / "gated_0001.json").write_text(json.dumps({"results": [rec], "errors": []}, ensure_ascii=False))
        with contextlib.redirect_stdout(io.StringIO()):
            pick.cmd_merge(argparse.Namespace(model=model))
        return pick.read_out()

    def test_own_replaces_the_previous_filing_and_records_the_model(self):
        body = [{"kind": "para", "text": "今期の方針。"}]
        out = self._merge({"doc_id": self.NEW, "source": "section", "source_sha1": "a", "verdict": "own",
                           "title": None, "blocks": body, "note": ""}, model="claude-opus-5-5@xhigh")
        self.assertEqual(list(out), [self.NEW])
        self.assertEqual(out[self.NEW]["model"], "claude-opus-5-5@xhigh")

    def test_referenced_keeps_the_previous_filing_until_answered(self):
        out = self._merge({"doc_id": self.NEW, "source": "section", "source_sha1": "a", "verdict": "referenced",
                           "title": None, "blocks": [], "note": ""})
        self.assertEqual(sorted(out), [self.NEW, self.OLD])


class TestLocate(unittest.TestCase):
    def test_finds_the_same_text_after_the_numbers_shift(self):
        body = B.cut(BLOCKS, "b4", "b5s1")
        # 前に塊が1つ増えて番号がずれた
        shifted = B.parse("<p>前置きの段落です。</p>" + "".join(
            f"<p>{B.block_text(b)}</p>" for b in BLOCKS))
        self.assertEqual(pick.locate(shifted, body), ("b5", "b6s1"))

    def test_keeps_a_trailing_image(self):
        # 画像は文字を持たないので、文字だけで探すと画像の手前で一致して画像を落とす（日産車体）
        bl = B.parse('<p>給与は役割で決める。</p><p><img src="a.png" alt="図"/></p><p>研修の話。</p>')
        body = B.cut(bl, "b1", "b2")
        self.assertEqual(pick.locate(bl, body), ("b1s1", "b2"))

    def test_none_when_the_text_is_not_there(self):
        self.assertIsNone(pick.locate(BLOCKS, [{"kind": "para", "text": "どこにも無い文。"}]))


class TestGateUnits(unittest.TestCase):
    """分解の規則を変えたあとの古いバッチは、ずれた番号で別の範囲を切るので受け取らない。"""

    HTML = "<p>②給与の決定方針</p><p>給与は役割で決める。</p>"

    def setUp(self):
        import tempfile
        from pathlib import Path
        self.tmp = Path(tempfile.mkdtemp())
        self.saved = pick.WORK, pick.cached
        pick.WORK = self.tmp
        pick.cached = lambda d: {"section": [{"html": self.HTML}]}

    def tearDown(self):
        import shutil
        pick.WORK, pick.cached = self.saved
        shutil.rmtree(self.tmp)

    def _gate(self, units):
        import argparse
        import contextlib
        import io
        import json
        batch = {"companies": [{"doc_id": "D1", "source": "section", "units": units}]}
        (self.tmp / "batch_0001.json").write_text(json.dumps(batch, ensure_ascii=False))
        (self.tmp / "pick_0001.jsonl").write_text(json.dumps(
            {"doc_id": "D1", "verdict": "own", "title": "b1", "start": "b2s1", "end": "b2s1"}, ensure_ascii=False))
        with contextlib.redirect_stdout(io.StringIO()):
            pick.cmd_gate(argparse.Namespace(batch=""))
        return json.loads((self.tmp / "gated_0001.json").read_text())

    def test_accepts_when_the_units_are_the_same(self):
        got = self._gate(B.render(B.parse(self.HTML)))
        self.assertEqual(len(got["results"]), 1)

    def test_rejects_when_the_units_changed(self):
        got = self._gate("b1 ［見出し］②給与の決定方針")
        self.assertEqual(got["results"], [])
        self.assertIn("分解", got["errors"][0]["reason"])


class TestRecut(unittest.TestCase):
    """分解の規則を直したあと、書き出した番号から切り直す。"""

    HTML = ("<h4>（１）【人材戦略に関する基本方針等】</h4><p>②給与の決定方針</p>"
            "<table><tr><td>方針</td><td><p>給与は役割で決める。</p><p>賞与は業績に連動する。</p></td></tr></table>")

    def setUp(self):
        import tempfile
        from pathlib import Path
        self.tmp = Path(tempfile.mkdtemp())
        self.saved = pick.OUT, pick.cached, pick.companies
        pick.OUT = self.tmp / "out.json"
        pick.cached = lambda d: {"section": [{"html": self.HTML}]}
        pick.companies = lambda: {"D1": {}}

    def tearDown(self):
        import shutil
        pick.OUT, pick.cached, pick.companies = self.saved
        shutil.rmtree(self.tmp)

    def test_stale_table_is_recut_from_the_range(self):
        import argparse
        import contextlib
        import io
        # 表のセルの中の段落の区切りを落としていた頃の本文
        stale = [{"kind": "table", "rows": [["方針", "給与は役割で決める。賞与は業績に連動する。"]]}]
        pick.write_out({"D1": {"doc_id": "D1", "verdict": "own", "source": "section", "title": "②給与の決定方針",
                               "blocks": stale, "range": {"title": "b2", "start": "b3", "end": "b3"}}}, {"D1": {}})
        with contextlib.redirect_stdout(io.StringIO()):
            pick.cmd_recut(argparse.Namespace())
        row = pick.read_out()["D1"]
        self.assertEqual(row["blocks"], [{"kind": "table", "rows": [["方針", "給与は役割で決める。\n賞与は業績に連動する。"]]}])
        self.assertEqual(row["title"], "②給与の決定方針")
        self.assertTrue(row["has_table"])


class TestReferenceTarget(unittest.TestCase):
    def test_sustainability_by_default(self):
        html = "<p>人材戦略及び給与等の決定方針は「第２ 事業の状況 ２ サステナビリティ…」に記載のとおりです。</p>"
        self.assertEqual(pick.reference_target(html), "sustainability")

    def test_employees_when_the_pay_sentence_points_there(self):
        # LIXIL
        html = ("<h4>（１）【人材戦略に関する基本方針等】</h4>"
                "<p>人材戦略は「第２ 事業の状況 ２ サステナビリティに関する考え方及び取組」に記載のとおりです。"
                "また、従業員給与等の額及び内容の決定に関する方針は、「（２）従業員の状況 ⑤ 従業員給与等の額及び内容の"
                "決定に関する方針」に記載のとおりです。</p>")
        self.assertEqual(pick.reference_target(html), "employees")

    def test_mention_of_employees_without_pay_is_ignored(self):
        html = ("<p>給与等の決定方針はサステナビリティの節をご参照ください。</p>"
                "<p>指標の実績は「（２）従業員の状況 ④」に記載しています。</p>")
        self.assertEqual(pick.reference_target(html), "sustainability")


if __name__ == "__main__":
    unittest.main()
