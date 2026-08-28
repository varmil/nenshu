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


if __name__ == "__main__":
    unittest.main()
