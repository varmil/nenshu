"""`update_numbers.py` の単体テスト（refresh の D4・#874）。合成データだけで見る。

  cd pipeline && npm test        # vitest と一緒に走る
  python3 -m unittest discover -s refresh -t refresh -p 'test_*.py'
"""

import csv
import json
import tempfile
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from unittest import mock

import update_numbers as un

import ledger


def meta(code, doc_id, period="2026-06-30", filed="2026-09-26 09:00", ordinance="010", sec="1234"):
    return {
        "docID": doc_id,
        "docTypeCode": "120",
        "ordinanceCode": ordinance,
        "edinetCode": code,
        "secCode": sec + "0" if sec else None,
        "filerName": f"会社{code}",
        "periodEnd": period,
        "submitDateTime": filed,
    }


class Days(unittest.TestCase):
    def test_日本時間の昨日まで(self):
        # UTC 14:00 は日本時間 23:00（同じ日）、15:30 は翌日 0:30
        self.assertEqual(
            un.jst_yesterday(datetime(2026, 9, 29, 14, 0, tzinfo=timezone.utc)), date(2026, 9, 28)
        )
        self.assertEqual(
            un.jst_yesterday(datetime(2026, 9, 29, 15, 30, tzinfo=timezone.utc)), date(2026, 9, 29)
        )

    def test_読んだ日の翌日からの平日だけを読む(self):
        # 2026-09-25 は金曜
        self.assertEqual(
            un.days_to_read(date(2026, 9, 25), date(2026, 9, 29)),
            [date(2026, 9, 28), date(2026, 9, 29)],
        )
        self.assertEqual(un.days_to_read(date(2026, 9, 29), date(2026, 9, 29)), [])


class PickNewDocs(unittest.TestCase):
    def test_会社本体の有報を内国法人だけ1社1件に寄せる(self):
        kinds = {"E00001": "内国法人・組合", "E00002": "外国法人・組合", "E00003": "内国法人・組合"}
        results = [
            meta("E00001", "S1000001", "2026-06-30"),
            meta("E00001", "S1000002", "2026-06-30"),  # 同じ期末なら docID の大きいほう
            meta("E00002", "S1000003"),  # 外国法人
            meta("E00003", "S1000004", "2026-03-31"),
            meta("E00003", "S1000005", "2026-05-01", ordinance="030"),  # ファンドの有報
        ]
        got = un.pick_new_docs(results, kinds)
        self.assertEqual({c: m["docID"] for c, m in got.items()}, {"E00001": "S1000002", "E00003": "S1000004"})


class ShouldProcess(unittest.TestCase):
    def test_台帳に無い会社は処理する(self):
        self.assertTrue(un.should_process(meta("E00001", "S1"), None, None))

    def test_同じ書類と期末が前の書類は処理しない(self):
        entry = {"doc_numbers": "S1"}
        row = {"period_end": "2026-06-30"}
        self.assertFalse(un.should_process(meta("E00001", "S1"), entry, row))
        self.assertFalse(un.should_process(meta("E00001", "S2", "2025-06-30"), entry, row))
        self.assertTrue(un.should_process(meta("E00001", "S2", "2026-06-30"), entry, row))  # 訂正の出し直し
        self.assertTrue(un.should_process(meta("E00001", "S3", "2027-06-30"), entry, row))


class Eligible(unittest.TestCase):
    def rec(self, **over):
        return {"avg_salary": 5_000_000, "avg_age": 40.0, "employees_nonconsolidated": 100, **over}

    def test_掲載の条件の境目(self):
        self.assertTrue(un.eligible(self.rec()))
        self.assertFalse(un.eligible(self.rec(employees_nonconsolidated=99)))
        self.assertFalse(un.eligible(self.rec(avg_age=19.9)))
        self.assertTrue(un.eligible(self.rec(avg_age=65)))
        self.assertFalse(un.eligible(self.rec(avg_salary=1_000_000)))
        self.assertFalse(un.eligible(self.rec(avg_salary=None)))


class Reread(unittest.TestCase):
    def test_前の期から50パーセントを超えて動いたら読み直す(self):
        self.assertIsNotNone(un.reread_reason({"avg_salary": 15_100_000}, 10_000_000, []))
        self.assertIsNotNone(un.reread_reason({"avg_salary": 4_900_000}, 10_000_000, []))
        self.assertIsNone(un.reread_reason({"avg_salary": 14_900_000}, 10_000_000, []))

    def test_前の期の値が無い会社は上位30社なら読み直す(self):
        salaries = [float(20_000_000 - i * 10_000) for i in range(100)]
        # 30位（上に29社）
        self.assertIsNotNone(un.reread_reason({"avg_salary": salaries[28] - 1}, None, salaries))
        # 31位
        self.assertIsNone(un.reread_reason({"avg_salary": salaries[29] - 1}, None, salaries))


class History(unittest.TestCase):
    def row(self, doc_id, salary=5_000_000.0):
        return {
            "edinet_code": "E00001",
            "avg_salary": salary,
            "avg_age": 40.0,
            "avg_tenure": 10.0,
            "employees_nonconsolidated": 500.0,
            "source": "tag",
            "period_end": "2026-06-30",
            "doc_id": doc_id,
        }

    def test_その年の行を足し_同じ年なら後の書類で差し替える(self):
        rows = []
        un.upsert_history(rows, self.row("S1000002"), 2026)
        self.assertEqual([(r["year"], r["doc_id"]) for r in rows], [("2026", "S1000002")])
        un.upsert_history(rows, self.row("S1000001", 1.0), 2026)  # 前の書類では替えない
        self.assertEqual(rows[0]["doc_id"], "S1000002")
        un.upsert_history(rows, self.row("S1000003", 6_000_000.4), 2026)
        self.assertEqual((rows[0]["doc_id"], rows[0]["avg_salary"]), ("S1000003", "6000000"))


class Performance(unittest.TestCase):
    def test_当期の値が遡りの値に勝ち_前の書類の当期は替えない(self):
        rows = [
            {"edinet_code": "E00001", "year": "2025", "ordinary_income": "100", "oi_basis": "consolidated",
             "employees_consolidated": "10", "employees_nonconsolidated": "5", "source_year": "2025", "back": "0"},
            {"edinet_code": "E00001", "year": "2024", "ordinary_income": "90", "oi_basis": "consolidated",
             "employees_consolidated": "", "employees_nonconsolidated": "", "source_year": "2025", "back": "1"},
        ]
        parsed = {"oi": {0: 120.0, 1: 101.0, 2: 91.0}, "oi_nc": {}, "emp_c": 11.0, "emp_nc": 6.0}
        un.merge_performance(rows, "E00001", 2026, parsed)
        by_year = {int(r["year"]): r for r in rows}
        self.assertEqual(by_year[2026]["ordinary_income"], 120)
        self.assertEqual(by_year[2026]["employees_consolidated"], 11)
        # 2025 は前の書類の当期（back 0）が残る。2024 は前の書類の Prior1（back 1）が今回の Prior2 に勝つ
        self.assertEqual(str(by_year[2025]["ordinary_income"]), "100")
        self.assertEqual(str(by_year[2024]["ordinary_income"]), "90")


# ---------------------------------------------------------------------------
# apply を小さな合成データで通す


class Apply(unittest.TestCase):
    """`apply` を一時ディレクトリの合成データに当てる（AC-1・AC-2・AC-10・AC-11）。"""

    def setUp(self):
        import unified

        self.tmp = tempfile.TemporaryDirectory()
        d = Path(self.tmp.name)
        self.paths = {
            "RANKING": d / "ranking_unified.csv",
            "HISTORY": d / "salary_history.csv",
            "PERFORMANCE": d / "performance_history.csv",
            "UNIVERSE": d / "universe.json",
            "PENDING": d / "numbers_pending.csv",
        }
        rows = [self.company("E00001", "1111", 9_000_000.0), self.company("E00002", "2222", 6_000_000.0)]
        rows = unified.rebuild_derived(rows)
        unified.save(rows, self.paths["RANKING"])
        un.write_csv(self.paths["HISTORY"], [
            "edinet_code", "year", "avg_salary", "avg_age", "avg_tenure",
            "employees_nonconsolidated", "source", "period_end", "doc_id",
        ], [])
        un.write_csv(self.paths["PERFORMANCE"], [
            "edinet_code", "year", "ordinary_income", "oi_basis", "employees_consolidated",
            "employees_nonconsolidated", "source_year", "back",
        ], [])
        self.paths["UNIVERSE"].write_text(json.dumps({
            "filingWindow": {"from": "2025-08-25", "to": "2026-08-25"}, "published": 2,
        }), encoding="utf-8")
        self.ledger_path = d / "ledger.csv"
        entries = {}
        for code, cid in (("E00001", "1111"), ("E00002", "2222")):
            e = {c: "" for c in ledger.COLUMNS}
            e.update(edinet_code=code, id=cid, filed="2025-09-26", doc_numbers=f"S0{code[1:]}")
            entries[code] = e
        ledger.save(entries, self.ledger_path)
        self.patches = [mock.patch.object(un, k, v) for k, v in self.paths.items()]
        self.patches.append(mock.patch.object(ledger, "PATH", self.ledger_path))
        for p in self.patches:
            p.start()

        # 本物のデータに触れていないこと（`ledger.load` の既定の引数で一度踏んだ）
        self.real_ledger = ledger.ROOT.parent / "data" / "ledger.csv"
        self.real_before = self.real_ledger.read_bytes()

    def tearDown(self):
        self.assertEqual(self.real_ledger.read_bytes(), self.real_before, "本物の台帳を書き換えた")
        for p in self.patches:
            p.stop()
        self.tmp.cleanup()

    def company(self, code, sec, salary, doc_id=None, name=None):
        return {
            "sec_code": sec, "name": name or f"会社{code}", "tse33": "電気機器", "listed": "上場",
            "avg_age": 40.0, "avg_tenure": 10.0, "avg_salary": salary,
            "employees_nonconsolidated": 500.0, "employees_consolidated": 800.0, "emp_ratio": 0.625,
            "badge": "", "industry": "製造業", "source": "tag", "period_end": "2025-06-30",
            "edinet_code": code, "corporate_number": "1" * 13, "doc_id": doc_id or f"S0{code[1:]}",
        }

    def item(self, code, doc_id, salary, status="apply", in_ledger=True, sec="1111"):
        m = meta(code, doc_id, sec=sec)
        row = {**self.company(code, sec, salary, doc_id), "period_end": "2026-06-30"}
        return {"meta": m, "status": status, "listed_in_ledger": in_ledger, "row": row,
                "performance": {"oi": {"0": 50.0}, "oi_nc": {}, "emp_c": 800.0, "emp_nc": 500.0}}

    def ranking(self):
        with open(self.paths["RANKING"], encoding="utf-8-sig") as f:
            return {r["edinet_code"]: r for r in csv.DictReader(f)}

    def test_載っている会社の数字が替わり_順位が計算し直され_読んだ日が進む(self):
        # AC-1: E00002 が 6,000,000 → 8,000,000（+33%）の新しい有報
        collected = {"through": "2026-09-28", "items": [self.item("E00002", "S1000002", 8_000_000.0, sec="2222")]}
        un.apply(collected, {}, date(2026, 9, 29))
        rows = self.ranking()
        self.assertEqual(rows["E00002"]["doc_id"], "S1000002")
        self.assertEqual(float(rows["E00002"]["avg_salary"]), 8_000_000.0)
        entries = ledger.load(self.ledger_path)
        self.assertEqual((entries["E00002"]["doc_numbers"], entries["E00002"]["filed"]), ("S1000002", "2026-09-26"))
        # 文章の工程の書類は触らない（spec 1.5）
        self.assertEqual(entries["E00002"]["doc_description"], "")
        universe = json.loads(self.paths["UNIVERSE"].read_text(encoding="utf-8"))
        self.assertEqual(universe["filingWindow"], {"from": "2025-09-28", "to": "2026-09-28"})
        with open(self.paths["HISTORY"], encoding="utf-8") as f:
            hist = list(csv.DictReader(f))
        self.assertEqual([(h["edinet_code"], h["year"], h["avg_salary"]) for h in hist], [("E00002", "2026", "8000000")])

    def test_新しく載る会社には台帳の規則で_ID_が振られる(self):
        # AC-2: 証券コード 1111 は E00001 が使っているので、後から来た会社は EDINETコードになる
        item = self.item("E00009", "S1000009", 7_000_000.0, in_ledger=False, sec="1111")
        un.apply({"through": "2026-09-28", "items": [item]}, {}, date(2026, 9, 29))
        entries = ledger.load(self.ledger_path)
        self.assertEqual(entries["E00009"]["id"], "E00009")
        self.assertIn("E00009", self.ranking())

    def test_読み直し待ちは判定が来るまで反映せず_待ち行列に残る(self):
        # AC-11
        item = self.item("E00002", "S1000002", 12_000_000.0, status="reread", sec="2222")
        un.apply({"through": "2026-09-28", "items": [item]}, {}, date(2026, 9, 29))
        self.assertEqual(self.ranking()["E00002"]["doc_id"], "S0" + "00002")
        pending = un.read_csv(self.paths["PENDING"])[1]
        self.assertEqual([(p["edinet_code"], p["reason"]) for p in pending], [("E00002", "reread")])

    def test_読み直しで確かめられたら反映し_決まらなければ前の期のまま(self):
        item = self.item("E00002", "S1000002", 12_000_000.0, status="reread", sec="2222")
        un.apply({"through": "2026-09-28", "items": [item]},
                 {"E00002": {"doc_id": "S1000002", "verdict": "unresolved"}}, date(2026, 9, 29))
        self.assertEqual(self.ranking()["E00002"]["doc_id"], "S000002")
        self.assertEqual(un.read_csv(self.paths["PENDING"])[1][0]["reason"], "unresolved")
        un.apply({"through": "2026-09-28", "items": [item]},
                 {"E00002": {"doc_id": "S1000002", "verdict": "confirmed"}}, date(2026, 9, 29))
        self.assertEqual(self.ranking()["E00002"]["doc_id"], "S1000002")
        self.assertEqual(un.read_csv(self.paths["PENDING"])[1], [])

    def test_書類が取れなかった会社は待ち行列に残り_数字はそのまま(self):
        # AC-10 の書類ぶん。一覧を読み直さないので、待ち行列に残さないと二度と拾えない
        item = {"meta": meta("E00002", "S1000002", sec="2222"), "status": "fetch_failed", "reason": "x"}
        un.apply({"through": "2026-09-28", "items": [item]}, {}, date(2026, 9, 29))
        self.assertEqual(self.ranking()["E00002"]["doc_id"], "S000002")
        pending = un.read_csv(self.paths["PENDING"])[1]
        self.assertEqual([(p["doc_id"], p["reason"]) for p in pending], [("S1000002", "fetch_failed")])
        self.assertIn(pending[0]["reason"], un.RETRY)


class Collect(unittest.TestCase):
    def test_書類一覧が1日でも取れなければ何も書かずに止まる(self):
        # AC-10（線 A）
        with tempfile.TemporaryDirectory() as d:
            universe = Path(d) / "universe.json"
            universe.write_text(json.dumps({"filingWindow": {"from": "2025-09-25", "to": "2026-09-25"}}))
            with mock.patch.object(un, "UNIVERSE", universe), \
                 mock.patch.object(un, "WORK", Path(d) / "work"), \
                 mock.patch.object(un.edinet, "list_documents", side_effect=RuntimeError("429")):
                with self.assertRaises(SystemExit):
                    un.collect(date(2026, 9, 29))
            self.assertFalse((Path(d) / "work").exists())
            self.assertEqual(json.loads(universe.read_text())["filingWindow"]["to"], "2026-09-25")


if __name__ == "__main__":
    unittest.main()
