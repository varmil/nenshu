"""分析の品質の見張り（refresh の D10・#880）。合成データで、数え方・月の切り方・線・モデルの内訳を見る。

  cd pipeline && npm test
  python3 -m unittest discover -s analysis -t analysis -p 'test_*.py'
"""

import json
import unittest
from datetime import date
from pathlib import Path
from tempfile import TemporaryDirectory

import quality

LINES = {"minCompanies": 3, "maxRelativeShift": 0.3, "maxExternalDrop": 0.1}


def row(generated_at, headline="", analysis="本文。", sources="[]", model="m", verdict="ok"):
    return {"generated_at": generated_at, "headline": headline, "analysis": analysis, "sources": sources,
            "model": model, "analysis_verdict": verdict}


class Measure(unittest.TestCase):
    def test_counts_subjective_and_fact_words_in_headline_and_body(self):
        m = quality.measure("強みは海外にある。", "当期の営業利益は12.5億円で、入るなら覚悟しておくべきだ。", [])
        self.assertEqual(m["subjective"], 2)  # 強み・べきだ
        self.assertEqual(m["fact"], 4)  # 当期・営業利益・12.5・億円
        self.assertEqual(m["external"], 0)

    def test_full_width_digits_are_facts(self):
        self.assertEqual(quality.measure("", "２０２６年", [])["fact"], 1)

    def test_external_is_whether_sources_are_present(self):
        self.assertEqual(quality.measure("", "本文。", [{"url": "https://example.com"}])["external"], 1)


class Months(unittest.TestCase):
    def test_month_is_japan_time(self):
        # UTC の9月30日15時は、日本時間の10月1日0時
        self.assertEqual(quality.month_of("2026-09-30T14:59:59+00:00"), "2026-09")
        self.assertEqual(quality.month_of("2026-09-30T15:00:00+00:00"), "2026-10")

    def test_previous_month(self):
        self.assertEqual(quality.previous_month(date(2026, 11, 1)), "2026-10")
        self.assertEqual(quality.previous_month(date(2027, 1, 15)), "2026-12")


class Drifts(unittest.TestCase):
    BASE = {"subjective": 1.0, "fact": 6.0, "external": 0.15}

    def stats(self, **over):
        return {"n": 10, "subjective": 1.0, "fact": 6.0, "external": 0.15, **over}

    def test_within_the_lines(self):
        self.assertEqual(quality.drifts(self.stats(subjective=0.75, fact=7.5, external=0.06), self.BASE, LINES), [])

    def test_relative_shift_in_both_directions(self):
        got = quality.drifts(self.stats(subjective=0.6, fact=8.0), self.BASE, LINES)
        self.assertEqual([d["metric"] for d in got], ["subjective", "fact"])
        self.assertEqual([d["metric"] for d in quality.drifts(self.stats(subjective=1.4), self.BASE, LINES)],
                         ["subjective"])

    def test_external_only_a_drop_counts(self):
        # 増えるのは規格どおり（gen_task.md が外部を見に行かせる）。C9 で起きたのは減るほう
        self.assertEqual(quality.drifts(self.stats(external=0.9), self.BASE, LINES), [])
        self.assertEqual([d["metric"] for d in quality.drifts(self.stats(external=0.02), self.BASE, LINES)],
                         ["external"])

    def test_small_months_are_not_judged(self):
        self.assertEqual(quality.drifts(self.stats(n=2, subjective=0.1), self.BASE, LINES), [])


class Report(unittest.TestCase):
    BASELINE = {"yardstick": quality.YARDSTICK,
                "stats": {"n": 100, "subjective": 1.0, "fact": 1.0, "external": 0.5, "reader": 0, "escape": 0,
                          "chars": 10}}

    def test_counts_only_the_month_and_published_rows_by_model(self):
        rows = [
            row("2026-10-01T00:00:00+00:00", "強み。", model="a"),
            row("2026-10-02T00:00:00+00:00", "当期。", model="b"),
            row("2026-10-03T00:00:00+00:00", model="b", verdict="rejected"),  # 落ちた行は数えない
            row("2026-11-01T00:00:00+00:00", model="a"),  # 別の月
        ]
        report = quality.build_report(rows, "2026-10", self.BASELINE, LINES)
        self.assertEqual(report["stats"]["n"], 2)
        self.assertEqual({m: s["n"] for m, s in report["byModel"].items()}, {"a": 1, "b": 1})
        self.assertFalse(report["judged"])  # 3社に満たない

    def test_baseline_of_another_yardstick_stops(self):
        with TemporaryDirectory() as d:
            path = Path(d) / "b.json"
            path.write_text(json.dumps({"yardstick": "0", "stats": {}}), encoding="utf-8")
            with self.assertRaises(SystemExit):
                quality.read_baseline(path)

    def test_latest_report_is_the_newest_month(self):
        with TemporaryDirectory() as d:
            for month in ("2026-10", "2026-09", "2026-11"):
                (Path(d) / f"{month}.json").write_text(json.dumps({"month": month}), encoding="utf-8")
            self.assertEqual(quality.latest_report(Path(d))["month"], "2026-11")


if __name__ == "__main__":
    unittest.main()
