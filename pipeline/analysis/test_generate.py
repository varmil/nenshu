"""`generate.py` のうち、原文をどちらから読むかを決めるところの単体テスト。

生成と検証はセッションのエージェントが担うので、ここで確かめられるのは
**ファイルの選び方と読み方**だけになる（`gate.py` と同じ位置づけ）。

  cd pipeline && npm test
  python3 -m unittest discover -s analysis -t analysis -p 'test_*.py'
"""

import csv
import gzip
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import generate

ROWS = [{"edinet_code": "E00001", "mdna": "本文"},
        {"edinet_code": "E00002", "mdna": "本文2"}]


def _write(path, rows, gzipped=False):
    opener = (lambda: gzip.open(path, "wt", encoding="utf-8", newline="")) if gzipped \
        else (lambda: open(path, "w", encoding="utf-8", newline=""))
    with opener() as f:
        w = csv.DictWriter(f, fieldnames=["edinet_code", "mdna"])
        w.writeheader()
        for r in rows:
            w.writerow(r)


class ReadCsv(unittest.TestCase):
    def test_素のCSVを読む(self):
        with TemporaryDirectory() as d:
            p = Path(d) / "a.csv"
            _write(p, ROWS)
            self.assertEqual([r["edinet_code"] for r in generate.read_csv(p)],
                             ["E00001", "E00002"])

    def test_gzを展開しながら読む(self):
        # **切った版は `.gz` で置いてある**（15.8MB。素だと56.7MB）。
        with TemporaryDirectory() as d:
            p = Path(d) / "a.csv.gz"
            _write(p, ROWS, gzipped=True)
            self.assertEqual([r["edinet_code"] for r in generate.read_csv(p)],
                             ["E00001", "E00002"])

    def test_無いファイルは空(self):
        self.assertEqual(generate.read_csv(Path("/nonexistent/a.csv")), [])


class SourcePath(unittest.TestCase):
    def setUp(self):
        self._dir = TemporaryDirectory()
        self._saved = (generate.SOURCE, generate.CUT_SOURCE)
        generate.SOURCE = Path(self._dir.name) / "analysis_text_2026.csv"
        generate.CUT_SOURCE = Path(self._dir.name) / "analysis_text_head1800_2026.csv.gz"

    def tearDown(self):
        generate.SOURCE, generate.CUT_SOURCE = self._saved
        self._dir.cleanup()

    def test_切らない版があればそちらを使う(self):
        # `--max-chars 0` で切らずに読ませる余地を残すため。
        _write(generate.SOURCE, ROWS)
        _write(generate.CUT_SOURCE, ROWS, gzipped=True)
        path, is_cut = generate.source_path()
        self.assertEqual(path, generate.SOURCE)
        self.assertFalse(is_cut)

    def test_切らない版が無ければ切った版に落ちる(self):
        # **ZIP キャッシュはコンテナが変わると消える。** git にあるのは切った版だけなので、
        # そこから回せることが C9 のセッションを持ち運べるかどうかを決める。
        _write(generate.CUT_SOURCE, ROWS, gzipped=True)
        path, is_cut = generate.source_path()
        self.assertEqual(path, generate.CUT_SOURCE)
        self.assertTrue(is_cut)


class PairOrDrop(unittest.TestCase):
    """**要約と分析は対で出す**（spec 1.19・AC-28）。"""

    def test_両方あればそのまま(self):
        got = generate.pair_or_drop("要約", "見出し", "本文", "", "")
        self.assertEqual(got, ("要約", "見出し", "本文", "", ""))

    def test_分析が無ければ要約も落とす(self):
        s, h, a, sr, ar = generate.pair_or_drop("要約", "", "", "", "材料から導けない")
        self.assertEqual((s, h, a), ("", "", ""))
        self.assertIn("対で落とした", sr)
        # **落ちた元の理由を残す。** 「対で落とした」だけだと、なぜ分析が付かなかったのかが
        # 実行ログから消える。
        self.assertIn("材料から導けない", sr)

    def test_要約が無ければ分析も落とす(self):
        # 原文に書いてあることすら書けなかった会社の解釈は据わりが悪い。**両方向で対にする。**
        s, h, a, sr, ar = generate.pair_or_drop("", "見出し", "本文", "原文から支持されない", "")
        self.assertEqual((s, h, a), ("", "", ""))
        self.assertIn("対で落とした", ar)
        self.assertIn("原文から支持されない", ar)

    def test_両方無ければそのまま(self):
        got = generate.pair_or_drop("", "", "", "要約が空", "分析が空")
        self.assertEqual(got, ("", "", "", "要約が空", "分析が空"))


class PreferGated(unittest.TestCase):
    """**検証パスが読むのは `gated_*.json`** なので、書き直しはそちらに当たる。

    140回目、`merge` が `gen_*.jsonl` だけを読んでいたため、**検証を受けて直した
    26箇所が CSV に入らず、直す前の本文が公開待ちで残っていた**。二段構えの
    2段目が見ていない文を通すことになるので、`merge` は書き直しのほうを採る。
    """

    def _work(self, tmp, gen, gated):
        work = Path(tmp)
        (work / "gen_0001.jsonl").write_text(
            "\n".join(__import__("json").dumps(r, ensure_ascii=False) for r in gen),
            encoding="utf-8")
        (work / "gated_0001.json").write_text(
            __import__("json").dumps({"companies": gated}, ensure_ascii=False),
            encoding="utf-8")
        return work

    def test_書き直しを採る(self):
        with TemporaryDirectory() as tmp:
            work = self._work(
                tmp,
                [{"edinet_code": "E00001", "summary": "旧", "headline": "旧見出し",
                  "analysis": "旧本文"}],
                [{"edinet_code": "E00001", "summary": "新", "headline": "旧見出し",
                  "analysis": "新本文"}])
            old_work = generate.WORK
            generate.WORK = work
            try:
                got = generate._prefer_gated([
                    {"edinet_code": "E00001", "summary": "旧", "headline": "旧見出し",
                     "analysis": "旧本文"}])
            finally:
                generate.WORK = old_work
        self.assertEqual(got[0]["summary"], "新")
        self.assertEqual(got[0]["analysis"], "新本文")
        self.assertEqual(got[0]["headline"], "旧見出し")

    def test_gate_は書き直しを拾わない(self):
        """**`_load_generated()` の既定は生成物そのもの。** 142回目、生成の途中で
        本文を直して `gate` を回し直したところ、**前の実行が残した
        `gated_*.json` の古い本文で上書きされた**（`prefer_gated` を既定で
        立てていたため）。ゲートが見るのは生成物、`merge` が見るのは検証パスが
        読んだ本文。
        """
        import json as _json
        with TemporaryDirectory() as tmp:
            work = Path(tmp)
            (work / "batch_0001.json").write_text(
                _json.dumps({"companies": [{"edinet_code": "E00001"}]}, ensure_ascii=False),
                encoding="utf-8")
            (work / "gen_0001.jsonl").write_text(
                _json.dumps({"edinet_code": "E00001", "summary": "新"}, ensure_ascii=False),
                encoding="utf-8")
            (work / "gated_0001.json").write_text(
                _json.dumps({"companies": [{"edinet_code": "E00001", "summary": "古"}]},
                            ensure_ascii=False), encoding="utf-8")
            old_work = generate.WORK
            generate.WORK = work
            try:
                plain = generate._load_generated()
                merged = generate._load_generated(prefer_gated=True)
            finally:
                generate.WORK = old_work
        self.assertEqual(plain[0]["summary"], "新")
        self.assertEqual(merged[0]["summary"], "古")

    def test_書き直しが無ければそのまま(self):
        with TemporaryDirectory() as tmp:
            old_work = generate.WORK
            generate.WORK = Path(tmp)
            try:
                got = generate._prefer_gated([{"edinet_code": "E00001", "summary": "旧"}])
            finally:
                generate.WORK = old_work
        self.assertEqual(got[0]["summary"], "旧")

    def test_空の本文で上書きしない(self):
        # **機械ゲートが落とした社は `gated_*.json` に空で載る。** それで上書きすると、
        # 落ちた理由を `merge` 側で数え直せなくなる。
        with TemporaryDirectory() as tmp:
            work = self._work(
                tmp,
                [{"edinet_code": "E00001", "summary": "旧"}],
                [{"edinet_code": "E00001", "summary": ""}])
            old_work = generate.WORK
            generate.WORK = work
            try:
                got = generate._prefer_gated([{"edinet_code": "E00001", "summary": "旧"}])
            finally:
                generate.WORK = old_work
        self.assertEqual(got[0]["summary"], "旧")


if __name__ == "__main__":
    unittest.main()
