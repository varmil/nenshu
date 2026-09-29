"""`ledger.py` の単体テスト（refresh の D2・#872）。合成データだけで見る。

  cd pipeline && npm test        # vitest と一緒に走る
  python3 -m unittest discover -s ledger -t ledger -p 'test_*.py'
"""

import tempfile
import unittest
from datetime import date
from pathlib import Path

import ledger

AS_OF = date(2026, 8, 25)


def entry(edinet_code, company_id, filed="2026-06-25", doc="S100AAAA"):
    e = {c: "" for c in ledger.COLUMNS}
    e.update(edinet_code=edinet_code, id=company_id, filed=filed, doc_numbers=doc)
    return e


def book(*entries):
    return {e["edinet_code"]: e for e in entries}


class AddMonths(unittest.TestCase):
    def test_月末は丸める(self):
        self.assertEqual(ledger.add_months(date(2026, 3, 31), -1), date(2026, 2, 28))
        self.assertEqual(ledger.add_months(date(2028, 3, 31), -1), date(2028, 2, 29))
        self.assertEqual(ledger.add_months(date(2026, 1, 31), 1), date(2026, 2, 28))

    def test_うるう日から数える(self):
        self.assertEqual(ledger.add_months(date(2024, 2, 29), 12), date(2025, 2, 28))
        self.assertEqual(ledger.add_months(date(2024, 2, 29), 24), date(2026, 2, 28))
        self.assertEqual(ledger.add_months(date(2024, 2, 29), 48), date(2028, 2, 29))

    def test_年をまたぐ(self):
        self.assertEqual(ledger.add_months(date(2026, 8, 25), -12), date(2025, 8, 25))
        self.assertEqual(ledger.add_months(date(2025, 11, 30), 3), date(2026, 2, 28))


class MayEnter(unittest.TestCase):
    def test_直近12か月の提出だけが入る(self):
        # `run.twelve_month_window` と同じく両端を含む
        self.assertTrue(ledger.may_enter(date(2025, 8, 25), AS_OF))
        self.assertTrue(ledger.may_enter(AS_OF, AS_OF))
        self.assertFalse(ledger.may_enter(date(2025, 8, 24), AS_OF))

    def test_基準日より後の提出は入らない(self):
        self.assertFalse(ledger.may_enter(date(2026, 8, 26), AS_OF))


class AssignId(unittest.TestCase):
    def test_証券コードがあれば証券コード(self):
        self.assertEqual(ledger.assign_id("6861", "E01967", set()), "6861")

    def test_証券コードが無ければEDINETコード(self):
        self.assertEqual(ledger.assign_id("", "E03532", set()), "E03532")

    def test_0だけの証券コードは無いものとして扱う(self):
        # EDINET が証券コードの無い会社に 0000 を入れることがある（クラサスケミカル）
        self.assertEqual(ledger.assign_id("0000", "E42126", set()), "E42126")
        self.assertEqual(ledger.normalize_sec_code("00000"), "")
        self.assertEqual(ledger.normalize_sec_code("130A"), "130A")

    def test_証券コードがぶつかったら後から来た会社はEDINETコード(self):
        self.assertEqual(ledger.assign_id("1234", "E99999", {"1234"}), "E99999")

    def test_どちらも使われていたら落とす(self):
        with self.assertRaises(ValueError):
            ledger.assign_id("1234", "E99999", {"1234", "E99999"})

    def test_EDINETコードの形でなければ落とす(self):
        with self.assertRaises(ValueError):
            ledger.assign_id("1234", "", set())


class Admit(unittest.TestCase):
    def test_上場して証券コードが付いてもIDは変わらない(self):
        entries = book(entry("E03532", "E03532"))
        e = ledger.admit(
            entries, edinet_code="E03532", sec_code="9999", doc_id="S100BBBB",
            filed=date(2026, 6, 26), as_of=AS_OF,
        )
        self.assertEqual(e["id"], "E03532")
        self.assertEqual((e["filed"], e["doc_numbers"]), ("2026-06-26", "S100BBBB"))

    def test_上場廃止で証券コードが消えてもIDは変わらない(self):
        entries = book(entry("E01967", "6861"))
        e = ledger.admit(
            entries, edinet_code="E01967", sec_code="", doc_id="S100BBBB",
            filed=date(2026, 6, 26), as_of=AS_OF,
        )
        self.assertEqual(e["id"], "6861")

    def test_振り直された証券コードで来た新しい会社はEDINETコードになる(self):
        # 上場廃止した会社の行は台帳に残る（ページも残す）。その証券コードが別の会社に振られた
        entries = book(entry("E00001", "1234", filed="2025-01-10"))
        e = ledger.admit(
            entries, edinet_code="E99999", sec_code="1234", doc_id="S100CCCC",
            filed=date(2026, 6, 26), as_of=AS_OF,
        )
        self.assertEqual(e["id"], "E99999")
        self.assertEqual(entries["E00001"]["id"], "1234")

    def test_新しい会社は証券コードで載る(self):
        entries = book(entry("E00001", "1234"))
        e = ledger.admit(
            entries, edinet_code="E99999", sec_code="5678", doc_id="S100CCCC",
            filed=date(2026, 6, 26), as_of=AS_OF,
        )
        self.assertEqual(e["id"], "5678")
        self.assertIn("E99999", entries)

    def test_一度も載ったことがなく直近12か月に提出していない会社は載らない(self):
        entries = book(entry("E00001", "1234"))
        e = ledger.admit(
            entries, edinet_code="E99999", sec_code="5678", doc_id="S100CCCC",
            filed=date(2025, 8, 24), as_of=AS_OF,
        )
        self.assertIsNone(e)
        self.assertNotIn("E99999", entries)

    def test_載ったことのある会社は古い提出でも台帳に反映する(self):
        # 24か月の猶予の中で次の有報が遅れて出た（決算期の変更など）。入る条件は見ない
        entries = book(entry("E00001", "1234", filed="2024-09-30"))
        e = ledger.admit(
            entries, edinet_code="E00001", sec_code="1234", doc_id="S100DDDD",
            filed=date(2025, 8, 1), as_of=AS_OF,
        )
        self.assertEqual(e["filed"], "2025-08-01")

    def test_提出日を巻き戻さない(self):
        entries = book(entry("E00001", "1234", filed="2026-06-25"))
        with self.assertRaises(ValueError):
            ledger.admit(
                entries, edinet_code="E00001", sec_code="1234", doc_id="S100EEEE",
                filed=date(2026, 6, 24), as_of=AS_OF,
            )

    def test_数字以外の工程の書類は触らない(self):
        # 文章は書き直すまで前の書類のまま（spec 1.5）
        e0 = entry("E00001", "1234")
        e0.update(doc_description="S100AAAA", doc_analysis="S100AAAA")
        entries = book(e0)
        ledger.admit(
            entries, edinet_code="E00001", sec_code="1234", doc_id="S100FFFF",
            filed=date(2026, 7, 1), as_of=AS_OF,
        )
        self.assertEqual(
            (e0["doc_numbers"], e0["doc_description"], e0["doc_analysis"]),
            ("S100FFFF", "S100AAAA", "S100AAAA"),
        )


class CheckAndFile(unittest.TestCase):
    def test_同じIDが2社にあれば落とす(self):
        with self.assertRaises(ValueError):
            ledger.check(book(entry("E00001", "1234"), entry("E00002", "1234")))

    def test_提出日の形を検める(self):
        with self.assertRaises(ValueError):
            ledger.check(book(entry("E00001", "1234", filed="2026/06/25")))

    def test_書いて読むと同じでEDINETコードの順に並ぶ(self):
        entries = book(entry("E00002", "5678"), entry("E00001", "1234"))
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "ledger.csv"
            ledger.save(entries, path)
            lines = path.read_text(encoding="utf-8").splitlines()
            self.assertEqual(lines[0], ",".join(ledger.COLUMNS))
            self.assertEqual([line.split(",")[0] for line in lines[1:]], ["E00001", "E00002"])
            self.assertEqual(ledger.load(path), entries)

    def test_見出しが違えば読まない(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "ledger.csv"
            path.write_text("edinet_code,id\nE00001,1234\n", encoding="utf-8")
            with self.assertRaises(ValueError):
                ledger.load(path)


class CommittedLedger(unittest.TestCase):
    """git に置いてある台帳そのもの。形だけを見る（社数・ID の値は書き写さない）。"""

    def test_読めて形が正しい(self):
        entries = ledger.load()
        self.assertGreater(len(entries), 0)


if __name__ == "__main__":
    unittest.main()
