"""`extract.py` のうち、1書類から従業員数と経常利益を抜くところの単体テスト（#905）。

ネットワークには触らない。合成した ZIP を読ませる。
"""

import io
import unittest
import zipfile
from pathlib import Path
from tempfile import TemporaryDirectory

import extract

HEADER = ["要素ID", "項目名", "コンテキストID", "相対年度", "連結・個別",
          "期間・時点", "ユニットID", "単位", "値"]

OI = "jpcrp_cor:OrdinaryIncomeLossSummaryOfBusinessResults"
EMPLOYEES = "jpcrp_cor:NumberOfEmployees"
EMPLOYEES_IFRS_SUMMARY = "jpcrp_cor:NumberOfEmployeesIFRSSummaryOfBusinessResults"


def _row(elem, ctx, value, label=""):
    return (elem, label, ctx, "", "", "", "", "", value)


def _parse(rows):
    with TemporaryDirectory() as d:
        path = Path(d) / "doc.zip"
        with zipfile.ZipFile(path, "w") as z:
            buf = io.StringIO()
            buf.write("\t".join(HEADER) + "\r\n")
            for row in rows:
                buf.write("\t".join('"' + str(c) + '"' for c in row) + "\r\n")
            z.writestr("XBRL_TO_CSV/jpcrp030000-asr-001.csv", buf.getvalue().encode("utf-16"))
        return extract.parse(path)


class ConsolidatedEmployees(unittest.TestCase):
    def test_NumberOfEmployeesがあればそれを連結として採る(self):
        got = _parse([
            _row(EMPLOYEES, "CurrentYearInstant", "76,866"),
            _row(EMPLOYEES, "CurrentYearInstant_NonConsolidatedMember", "192"),
        ])
        self.assertEqual((got["emp_c"], got["emp_nc"]), (76866, 192))

    def test_IFRS用の要素だけの書類は連結として採る(self):
        # ソフトバンクグループの2017年3月期。連結は IFRS 用の要素にしか無く、
        # 単体は NumberOfEmployees の NonConsolidatedMember にある。
        got = _parse([
            _row(EMPLOYEES_IFRS_SUMMARY, "CurrentYearInstant", "68402"),
            _row(EMPLOYEES_IFRS_SUMMARY, "Prior1YearInstant", "63591"),
            _row(EMPLOYEES, "Prior3YearInstant", "69067"),
            _row(EMPLOYEES, "CurrentYearInstant_NonConsolidatedMember", "199"),
        ])
        self.assertEqual((got["emp_c"], got["emp_nc"]), (68402, 199))

    def test_両方ある書類はNumberOfEmployeesを優先する(self):
        # 出てくる順に依らない（IFRS 用の要素が先に来ても NumberOfEmployees が勝つ）。
        got = _parse([
            _row(EMPLOYEES_IFRS_SUMMARY, "CurrentYearInstant", "1,111"),
            _row(EMPLOYEES, "CurrentYearInstant", "2,222"),
        ])
        self.assertEqual(got["emp_c"], 2222)

    def test_遡った期とセグメント別の値は連結の当期として採らない(self):
        got = _parse([
            _row(EMPLOYEES_IFRS_SUMMARY, "Prior1YearInstant", "63591"),
            _row(EMPLOYEES_IFRS_SUMMARY, "CurrentYearInstant_NonConsolidatedMember", "199"),
            _row(EMPLOYEES_IFRS_SUMMARY, "CurrentYearInstant_OperatingSegmentsMember", "5,864"),
        ])
        self.assertIsNone(got["emp_c"])

    def test_どちらも無い書類は連結が空のまま(self):
        # 連結財務諸表を作らない会社。単体で代用するのは呼ぶ側（`build-data.ts`）の規則。
        got = _parse([_row(EMPLOYEES, "CurrentYearInstant_NonConsolidatedMember", "350")])
        self.assertEqual((got["emp_c"], got["emp_nc"]), (None, 350))


OI_MISTAGGED = "jpcrp_cor:OrdinaryIncomeSummaryOfBusinessResults"
PL_OI = "jppfs_cor:OrdinaryIncome"


class MistaggedOrdinaryIncome(unittest.TestCase):
    """#911。「経常収益」の要素に経常利益を入れた書類（弘電社・ディーブイエックス・キクカワエンタープライズ）。"""

    def test_正しい要素が無く当期が損益計算書と一致すれば経常利益として読む(self):
        got = _parse([
            _row(OI_MISTAGGED, "CurrentYearDuration", "4015000000", "経常収益、経営指標等"),
            _row(OI_MISTAGGED, "Prior1YearDuration", "3169000000", "経常収益、経営指標等"),
            _row(OI_MISTAGGED, "CurrentYearDuration_NonConsolidatedMember", "3941000000"),
            _row(PL_OI, "CurrentYearDuration", "4015000000"),
            _row(PL_OI, "CurrentYearDuration_NonConsolidatedMember", "3941000000"),
        ])
        self.assertEqual(got["oi"], {0: 4015000000, 1: 3169000000})
        self.assertEqual(got["oi_nc"], {0: 3941000000})

    def test_銀行の経常収益は読み替えない_正しい要素がある(self):
        # 三菱UFJ は経常収益（14.6兆円）と経常利益（3.4兆円）の両方を持つ
        got = _parse([
            _row(OI_MISTAGGED, "CurrentYearDuration", "14600000000000", "経常収益、経営指標等"),
            _row(OI, "CurrentYearDuration", "3400000000000", "経常利益又は経常損失（△）、経営指標等"),
            _row(PL_OI, "CurrentYearDuration", "3400000000000"),
        ])
        self.assertEqual(got["oi"], {0: 3400000000000})

    def test_損益計算書の経常利益と一致しなければ読み替えない(self):
        got = _parse([
            _row(OI_MISTAGGED, "CurrentYearDuration", "44234000000", "経常収益、経営指標等"),
            _row(PL_OI, "CurrentYearDuration", "4015000000"),
        ])
        self.assertEqual(got["oi"], {})

    def test_損益計算書が無ければ読み替えない(self):
        got = _parse([_row(OI_MISTAGGED, "CurrentYearDuration", "4015000000", "経常収益、経営指標等")])
        self.assertEqual(got["oi"], {})

    def test_片側だけ正しい要素がある書類は_もう片側だけ読み替える(self):
        # ディーブイエックスの2026年: 連結は正しい要素、単体だけ「経常収益」の要素
        got = _parse([
            _row(OI, "CurrentYearDuration", "300000000", "経常利益又は経常損失（△）、経営指標等"),
            _row(OI_MISTAGGED, "CurrentYearDuration_NonConsolidatedMember", "321886000"),
            _row(PL_OI, "CurrentYearDuration", "300000000"),
            _row(PL_OI, "CurrentYearDuration_NonConsolidatedMember", "321886000"),
        ])
        self.assertEqual(got["oi"], {0: 300000000})
        self.assertEqual(got["oi_nc"], {0: 321886000})


class PutKeepsConsolidatedEmployees(unittest.TestCase):
    def test_IFRS用の要素の連結従業員が当期の行に付く(self):
        parsed = _parse([
            _row(OI, "CurrentYearDuration_NonConsolidatedMember", "2870956000000", "経常利益又は経常損失（△）、経営指標等"),
            _row(EMPLOYEES_IFRS_SUMMARY, "CurrentYearInstant", "68402"),
            _row(EMPLOYEES, "CurrentYearInstant_NonConsolidatedMember", "199"),
        ])
        best = {}
        for back, value in sorted(parsed["oi_nc"].items()):
            extract._put(best, "E02778", 2017 - back, value, "nonconsolidated", back, 2017, parsed)
        row = best[("E02778", 2017)]
        self.assertEqual(row["employees_consolidated"], 68402)
        self.assertEqual(row["employees_nonconsolidated"], 199)


if __name__ == "__main__":
    unittest.main()
