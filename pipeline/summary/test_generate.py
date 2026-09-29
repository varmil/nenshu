"""`generate.py` の単体テスト。**選び方・書き直しの回し方・取り込み方**を見る。

  cd pipeline && npm test
  python3 -m unittest discover -s summary -t summary -p 'test_*.py'

生成と検証はセッションのエージェントが担うので、ここで確かめられるのはファイルの
やり取りだけになる（`gate.py` と同じ位置づけ）。C17（#840）で書き直しを足したときに
書いた——**C6 で ok だった2,783社を選ばないこと**と、**書き直しの上限**は工程の側で
数えないと、回す人の手に任される。
"""

import argparse
import csv
import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import generate

SOURCE_HEADERS = ["edinet_code", "sec_code", "name", "doc_id", "period_end",
                  "text", "char_len", "text_sha1"]

# 4社。A は通る・B は検証で落ちる・C は生成側が空を返す・D は機械ゲートで落ちる。
SOURCES = [
    ("E00001", "1001", "株式会社エー", "当社は、電子応用機器の製造及び販売を行っております。"),
    ("E00002", "1002", "株式会社ビー", "当社は、宝飾品等の小売販売及び卸売販売を行っております。"),
    ("E00003", "1003", "株式会社シー", "当社グループの事業の系統図は次のとおりであります。"),
    ("E00004", "1004", "株式会社ディー", "当社は、ＦＡ機器の製造及び販売を行っております。"),
]


def _write_csv(path, headers, rows):
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=headers)
        w.writeheader()
        for r in rows:
            w.writerow(r)


def _jsonl(path, recs):
    path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in recs),
                    encoding="utf-8")


class Base(unittest.TestCase):
    def setUp(self):
        self._dir = TemporaryDirectory()
        root = Path(self._dir.name)
        self._saved = (generate.SOURCE, generate.OUT, generate.WORK)
        generate.SOURCE = root / "business_text.csv"
        generate.OUT = root / "company_summary.csv"
        generate.WORK = self.work = root / "work"
        _write_csv(generate.SOURCE, SOURCE_HEADERS, [
            {"edinet_code": c, "sec_code": s, "name": n, "doc_id": "S100", "period_end": "2026-03-31",
             "text": t, "char_len": len(t), "text_sha1": "sha-" + c}
            for c, s, n, t in SOURCES
        ])

    def tearDown(self):
        generate.SOURCE, generate.OUT, generate.WORK = self._saved
        self._dir.cleanup()

    def _done(self, rows):
        base = {"source_doc_id": "S100", "source_period_end": "2026-03-31",
                "model": "", "generated_at": ""}
        _write_csv(generate.OUT, generate.HEADERS, [{**base, **r} for r in rows])

    def _batch(self, n, codes, where=None):
        where = where or self.work
        where.mkdir(parents=True, exist_ok=True)
        (where / f"batch_{n:04d}.json").write_text(json.dumps(
            {"batch": n, "companies": [{"edinet_code": c} for c in codes]}), encoding="utf-8")


class Rejected(Base):
    def test_rejectedの会社だけを選ぶ(self):
        # **ok の会社を選ばない。** 選べてしまうと、通っていた文が回し直しで変わりうる。
        self._done([
            {"edinet_code": "E00001", "sec_code": "1001", "summary": "電子応用機器の製造及び販売を行う。",
             "source_sha1": "sha-E00001", "verdict": "ok", "reject_reason": ""},
            {"edinet_code": "E00002", "sec_code": "1002", "summary": "",
             "source_sha1": "sha-E00002", "verdict": "rejected", "reject_reason": "検証パス: 重み付け"},
            {"edinet_code": "E00003", "sec_code": "1003", "summary": "",
             "source_sha1": "sha-E00003", "verdict": "rejected", "reject_reason": "説明文が空"},
            # 原文が変わった会社は pending() の仕事。前回の理由は古い原文に対するもの。
            {"edinet_code": "E00004", "sec_code": "1004", "summary": "",
             "source_sha1": "古い", "verdict": "rejected", "reject_reason": "字数が範囲外"},
        ])
        picked = [row["edinet_code"] for row, _ in generate.rejected()]
        self.assertEqual(picked, ["E00002", "E00003"])

    def test_生成側が空を返した会社には前回の理由を添えない(self):
        self.assertEqual(generate.previous_reason("説明文が空"), "")
        self.assertEqual(generate.previous_reason(""), "")
        self.assertEqual(generate.previous_reason("検証パス: 重み付け"), "検証パス: 重み付け")

    def test_planはrejectedの会社に前回の理由を添える(self):
        self._done([
            {"edinet_code": "E00002", "sec_code": "1002", "summary": "",
             "source_sha1": "sha-E00002", "verdict": "rejected", "reject_reason": "検証パス: 重み付け"},
            {"edinet_code": "E00003", "sec_code": "1003", "summary": "",
             "source_sha1": "sha-E00003", "verdict": "rejected", "reject_reason": "説明文が空"},
        ])
        generate.cmd_plan(argparse.Namespace(
            rejected=True, force=False, pilot=False, size=10, batches=1, max_chars=2000, seed=0))
        batch = json.loads((self.work / "batch_0001.json").read_text(encoding="utf-8"))
        by_code = {c["edinet_code"]: c for c in batch["companies"]}
        self.assertEqual(by_code["E00002"]["previous_reason"], "検証パス: 重み付け")
        self.assertNotIn("previous_reason", by_code["E00003"])


class Retry(Base):
    """1回目: A は通る・B は検証で落ちる・C は空・D は機械ゲートで落ちる。"""

    def _round1(self):
        self._batch(1, ["E00001", "E00002", "E00003", "E00004"])
        _jsonl(self.work / "gen_0001.jsonl", [
            {"edinet_code": "E00001", "summary": "電子応用機器の製造及び販売を行う。"},
            {"edinet_code": "E00002", "summary": "宝飾品の小売販売を主力とし、卸売販売も行う。"},
            {"edinet_code": "E00003", "summary": ""},
            # 「ファクトリーオートメーション」は原文に無い（原文は「ＦＡ」）。
            {"edinet_code": "E00004", "summary": "ファクトリーオートメーション機器の製造及び販売を行う。"},
        ])
        generate.cmd_gate(argparse.Namespace(chunk=25))

    def _verify(self, verdicts, where=None):
        where = where or self.work
        _jsonl(where / "verify_0001.jsonl",
               [{"edinet_code": c, "supported": ok, "reason": "" if ok else "重み付け"}
                for c, ok in verdicts])

    def _retry(self):
        generate.cmd_retry(argparse.Namespace(size=60, max_chars=2000))

    def test_検証が済んでいなければ止める(self):
        # 検証の無い会社を「落ちた」と読むと、検証していない文を書き直しに回してしまう。
        self._round1()
        with self.assertRaises(SystemExit):
            self._retry()

    def test_落ちた会社だけを前回の文と理由を添えて戻す(self):
        self._round1()
        self._verify([("E00001", True), ("E00002", False)])
        self._retry()

        batch = json.loads((self.work / "batch_0001.json").read_text(encoding="utf-8"))
        by_code = {c["edinet_code"]: c for c in batch["companies"]}
        # 通った A と、生成側が自分で空を返した C は戻さない。
        self.assertEqual(sorted(by_code), ["E00002", "E00004"])
        self.assertEqual(by_code["E00002"]["previous"], "宝飾品の小売販売を主力とし、卸売販売も行う。")
        self.assertEqual(by_code["E00002"]["previous_reason"], "検証パス: 重み付け")
        self.assertIn("ファクトリーオートメーション", by_code["E00004"]["previous_reason"])
        # 前の回の中間ファイルは round_1/ へ移り、直下には次の回のバッチだけが残る。
        self.assertTrue((self.work / "round_1" / "gen_0001.jsonl").exists())
        self.assertEqual(sorted(p.name for p in self.work.iterdir() if p.is_file()),
                         ["batch_0001.json"])

    def test_後の回の結果で前の回を上書きして取り込む(self):
        self._round1()
        self._verify([("E00001", True), ("E00002", False)])
        self._retry()
        # 2回目: B は書き直して通る・D は書き直しても機械ゲートで落ちる。
        _jsonl(self.work / "gen_0001.jsonl", [
            {"edinet_code": "E00002", "summary": "宝飾品等の小売販売及び卸売販売を行う。"},
            {"edinet_code": "E00004", "summary": "ファクトリーオートメーション機器を作る。"},
        ])
        generate.cmd_gate(argparse.Namespace(chunk=25))
        self._verify([("E00002", True)])
        generate.cmd_merge(argparse.Namespace(model=""))

        with open(generate.OUT, encoding="utf-8") as f:
            rows = {r["edinet_code"]: r for r in csv.DictReader(f)}
        self.assertEqual(rows["E00001"]["verdict"], "ok")
        self.assertEqual(rows["E00002"]["summary"], "宝飾品等の小売販売及び卸売販売を行う。")
        self.assertEqual(rows["E00003"]["reject_reason"], "説明文が空")
        self.assertEqual(rows["E00004"]["verdict"], "rejected")
        self.assertIn("原文に無い固有名詞", rows["E00004"]["reject_reason"])

    def test_書き直しは2回まで(self):
        self._round1()
        self._verify([("E00001", True), ("E00002", False)])
        self._retry()
        for _ in range(2):
            _jsonl(self.work / "gen_0001.jsonl", [
                {"edinet_code": "E00002", "summary": "宝飾品の小売販売を主力とする。"},
                {"edinet_code": "E00004", "summary": "ファクトリーオートメーション機器を作る。"},
            ])
            generate.cmd_gate(argparse.Namespace(chunk=25))
            self._verify([("E00002", False)])
            if len(generate._round_dirs()) < generate.MAX_RETRIES:
                self._retry()
        # 2回書き直した後の3回目は止める。
        with self.assertRaises(SystemExit):
            self._retry()

    def test_clearは退避した回も消す(self):
        self._round1()
        self._verify([("E00001", True), ("E00002", False)])
        self._retry()
        generate.cmd_clear(argparse.Namespace())
        self.assertEqual(list(self.work.iterdir()), [])


class Only(Base):
    """会社を名指したとき（refresh の D6・spec 1.8）。前の説明文がある会社は検証だけ、無い会社は書く。"""

    OLD_A = "電子応用機器の製造及び販売を行う。"

    def setUp(self):
        super().setUp()
        self._done([
            {"edinet_code": "E00001", "sec_code": "1001", "summary": self.OLD_A, "source_doc_id": "S099",
             "source_sha1": "古い", "verdict": "ok", "reject_reason": "",
             "model": "claude-opus-5", "generated_at": "2026-08-27T00:00:00+00:00"},
            {"edinet_code": "E00002", "sec_code": "1002", "summary": "宝飾品等の小売販売及び卸売販売を行う。",
             "source_doc_id": "S099", "source_sha1": "古い", "verdict": "ok", "reject_reason": "",
             "model": "claude-opus-5", "generated_at": "2026-08-27T00:00:00+00:00"},
            {"edinet_code": "E00003", "sec_code": "1003", "summary": "", "source_doc_id": "S099",
             "source_sha1": "古い", "verdict": "rejected", "reject_reason": "説明文が空"},
        ])

    def _plan(self, codes):
        generate.cmd_plan(argparse.Namespace(
            only=codes, rejected=False, force=False, pilot=False, size=20, batches=1, max_chars=2000, seed=0))

    def _rows(self):
        with open(generate.OUT, encoding="utf-8") as f:
            return {r["edinet_code"]: r for r in csv.DictReader(f)}

    def test_前の文がある会社は生成物まで置き_無い会社は書かせる(self):
        self._plan("E00001,E00003")
        recheck = json.loads((self.work / "batch_0001.json").read_text(encoding="utf-8"))
        write = json.loads((self.work / "batch_0002.json").read_text(encoding="utf-8"))
        self.assertTrue(recheck["recheck"])
        self.assertEqual([c["edinet_code"] for c in recheck["companies"]], ["E00001"])
        self.assertEqual([c["edinet_code"] for c in write["companies"]], ["E00003"])
        gen = (self.work / "gen_0001.jsonl").read_text(encoding="utf-8")
        self.assertIn(self.OLD_A, gen)
        # 書くほうの生成物は置かない（エージェントが書く）
        self.assertFalse((self.work / "gen_0002.jsonl").exists())

    def test_検証で通れば文と書いたモデルはそのままで出典が新しい書類になる(self):
        self._plan("E00001")
        generate.cmd_gate(argparse.Namespace(chunk=25))
        _jsonl(self.work / "verify_0001.jsonl", [{"edinet_code": "E00001", "supported": True, "reason": ""}])
        generate.cmd_merge(argparse.Namespace(model="claude-opus-5-5@xhigh"))
        row = self._rows()["E00001"]
        self.assertEqual((row["summary"], row["verdict"]), (self.OLD_A, "ok"))
        self.assertEqual((row["source_doc_id"], row["source_sha1"]), ("S100", "sha-E00001"))
        self.assertEqual((row["model"], row["generated_at"]), ("claude-opus-5", "2026-08-27T00:00:00+00:00"))

    def test_書き直した文は新しいモデルで記録する(self):
        self._plan("E00001")
        generate.cmd_gate(argparse.Namespace(chunk=25))
        _jsonl(self.work / "verify_0001.jsonl", [{"edinet_code": "E00001", "supported": False, "reason": "重み付け"}])
        generate.cmd_retry(argparse.Namespace(size=60, max_chars=2000))
        _jsonl(self.work / "gen_0001.jsonl", [{"edinet_code": "E00001", "summary": "電子応用機器を製造し、販売する。"}])
        generate.cmd_gate(argparse.Namespace(chunk=25))
        _jsonl(self.work / "verify_0001.jsonl", [{"edinet_code": "E00001", "supported": True, "reason": ""}])
        generate.cmd_merge(argparse.Namespace(model="claude-opus-5-5@xhigh"))
        row = self._rows()["E00001"]
        self.assertEqual(row["summary"], "電子応用機器を製造し、販売する。")
        self.assertEqual((row["model"], row["source_doc_id"]), ("claude-opus-5-5@xhigh", "S100"))

    def test_書き直しても落ちたら前の文と前の書類を残す(self):
        # spec 1.5。書き直しで「あったものが消える」のを防ぐ。出典も前の書類のまま（D3）
        self._plan("E00002")
        generate.cmd_gate(argparse.Namespace(chunk=25))
        _jsonl(self.work / "verify_0001.jsonl", [{"edinet_code": "E00002", "supported": False, "reason": "重み付け"}])
        generate.cmd_merge(argparse.Namespace(model="claude-opus-5-5@xhigh"))
        row = self._rows()["E00002"]
        self.assertEqual((row["summary"], row["verdict"]), ("宝飾品等の小売販売及び卸売販売を行う。", "ok"))
        self.assertEqual((row["source_doc_id"], row["model"]), ("S099", "claude-opus-5"))
        self.assertIn("前の版を残した", row["reject_reason"])


if __name__ == "__main__":
    unittest.main()
