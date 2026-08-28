"""`edinet.py` のうち、ZIP を読んで記録に組み立てるところの単体テスト。

ネットワークには触らない（`fetch_csv` は対象外）。合成した ZIP を読ませる。
"""

import io
import unittest
import zipfile
from pathlib import Path
from tempfile import TemporaryDirectory

import edinet

HEADER = ["要素ID", "項目名", "コンテキストID", "相対年度", "連結・個別",
          "期間・時点", "ユニットID", "単位", "値"]


def _zip(dirpath, files):
    """`{ファイル名: [行, …]}` から有報の ZIP を1つ作る。行は9列のタプル。"""
    path = Path(dirpath) / "doc.zip"
    with zipfile.ZipFile(path, "w") as z:
        for name, rows in files.items():
            buf = io.StringIO()
            buf.write("\t".join(HEADER) + "\r\n")
            for row in rows:
                # RFC 4180 と同じ規則。本文の `"` は倍にして書く。
                buf.write("\t".join('"' + str(c).replace('"', '""') + '"' for c in row) + "\r\n")
            z.writestr(name, buf.getvalue().encode("utf-16"))
    return path


def _row(elem, value, ctx="FilingDateInstant", label=""):
    return (elem, label, ctx, "", "", "", "", "", value)


BUSINESS = "jpcrp_cor:DescriptionOfBusinessTextBlock"
MDNA, RISKS, ISSUES, SUSTAINABILITY = (s.element for s in edinet.ANALYSIS_SECTIONS)
EMPLOYEES = "jpcrp_cor:InformationAboutEmployeesTextBlock"
META = [
    _row("jpdei_cor:EDINETCodeDEI", "E00001"),
    _row("jpcrp_cor:AverageAnnualSalaryInformationAboutReportingCompanyInformationAboutEmployees",
         "7,000,000", "CurrentYearDuration_NonConsolidatedMember"),
    _row("jpcrp_cor:AverageAgeYearsInformationAboutReportingCompanyInformationAboutEmployees",
         "40.0", "CurrentYearDuration_NonConsolidatedMember"),
]
META_MOCK = {"secCode": "12340", "edinetCode": "E00001", "filerName": "テスト株式会社",
             "docID": "S000TEST", "periodEnd": "2026-03-31"}


class ParseCsvZip(unittest.TestCase):
    def test_事業の内容は複数ファイルぶん集める(self):
        with TemporaryDirectory() as d:
            path = _zip(d, {
                "XBRL_TO_CSV/jpcrp030000-asr-001.csv": [_row(BUSINESS, "３【事業の内容】　短いほう")],
                "XBRL_TO_CSV/jpcrp030000-asr-002.csv": [_row(BUSINESS, "３【事業の内容】　こちらが長いほうの原文です。")],
            })
            rec = edinet.parse_csv_zip(path)
            self.assertEqual(len(rec["business_textblocks"]), 2)

    def test_空の値は集めない(self):
        with TemporaryDirectory() as d:
            path = _zip(d, {"XBRL_TO_CSV/a.csv": [_row(BUSINESS, "  ")]})
            self.assertNotIn("business_textblocks", edinet.parse_csv_zip(path))

    def test_従業員の状況は給与の行があるものだけ採る(self):
        with TemporaryDirectory() as d:
            path = _zip(d, {"XBRL_TO_CSV/a.csv": [
                _row(EMPLOYEES, "従業員数(人)1,000"),
                _row(EMPLOYEES, "平均年間給与(円)7,000,000"),
            ]})
            rec = edinet.parse_csv_zip(path)
            # 条件を満たす最初の1つ。**事業の内容と採り方が違う**（あちらは最長）。
            self.assertEqual(rec["employees_textblock"], "平均年間給与(円)7,000,000")

    def test_値の中の引用符が倍のまま残らない(self):
        with TemporaryDirectory() as d:
            path = _zip(d, {"XBRL_TO_CSV/a.csv": [_row(BUSINESS, '「"K" LINE」を運航する。')]})
            self.assertEqual(edinet.parse_csv_zip(path)["business_textblocks"],
                             ['「"K" LINE」を運航する。'])

    def test_値の中の改行で行が落ちない(self):
        with TemporaryDirectory() as d:
            path = _zip(d, {"XBRL_TO_CSV/a.csv": [
                _row(BUSINESS, "１行目\n２行目"),
                _row("jpdei_cor:EDINETCodeDEI", "E00001"),
            ]})
            rec = edinet.parse_csv_zip(path)
            self.assertEqual(rec["business_textblocks"], ["１行目\n２行目"])
            # 改行を含む値の**後ろの行**まで読めていること（素の split では落ちる）。
            self.assertEqual(rec["edinet_code"], "E00001")

    def test_既定の上限を超える値も読める(self):
        # テキストブロックは `csv` の既定（131,072字）を超えうる。超えると
        # **その書類が丸ごと読めなくなる**ので、上限を上げてあることを固定する。
        long = "あ" * 200_000
        with TemporaryDirectory() as d:
            path = _zip(d, {"XBRL_TO_CSV/a.csv": [_row(BUSINESS, long)]})
            self.assertEqual(edinet.parse_csv_zip(path)["business_textblocks"], [long])

    def test_テキストブロックは他の要素と混ざらない(self):
        with TemporaryDirectory() as d:
            path = _zip(d, {"XBRL_TO_CSV/a.csv": META + [_row(BUSINESS, "本文")]})
            rec = edinet.parse_csv_zip(path)
            self.assertEqual(rec["edinet_code"], "E00001")
            self.assertEqual(rec["business_textblocks"], ["本文"])


class ToRecord(unittest.TestCase):
    def test_平文にした原文が入る(self):
        with TemporaryDirectory() as d:
            path = _zip(d, {"XBRL_TO_CSV/a.csv": META + [
                _row(BUSINESS, "３【事業の内容】　当社はＭ&amp;Ａを行っております。"),
            ]})
            rec = edinet.to_record(META_MOCK, edinet.parse_csv_zip(path))
            self.assertEqual(rec["business_text"], "３【事業の内容】\n当社はＭ&Ａを行っております。")

    def test_原文が無ければ空文字(self):
        with TemporaryDirectory() as d:
            path = _zip(d, {"XBRL_TO_CSV/a.csv": META})
            self.assertEqual(edinet.to_record(META_MOCK, edinet.parse_csv_zip(path))["business_text"], "")

    def test_複数あれば長いほうを採る(self):
        with TemporaryDirectory() as d:
            path = _zip(d, {
                "XBRL_TO_CSV/a.csv": META + [_row(BUSINESS, "短いほう")],
                "XBRL_TO_CSV/b.csv": [_row(BUSINESS, "こちらが長いほうの原文です。")],
            })
            rec = edinet.to_record(META_MOCK, edinet.parse_csv_zip(path))
            self.assertEqual(rec["business_text"], "こちらが長いほうの原文です。")


class AnalysisTexts(unittest.TestCase):
    """4節の抜き出し（C8・#240・AC-24）。"""

    def _texts(self, rows):
        with TemporaryDirectory() as d:
            path = _zip(d, {"XBRL_TO_CSV/a.csv": META + rows})
            return edinet.analysis_texts(edinet.parse_csv_zip(path))

    def test_4節ぶんの鍵が常に揃う(self):
        # **無い節を鍵ごと落とさない。** 呼び出し側（`extract_analysis`）に
        # 「有る節だけ回す」分岐を作らせないため。
        texts = self._texts([])
        self.assertEqual(sorted(texts), ["issues", "mdna", "risks", "sustainability"])
        self.assertEqual(set(texts.values()), {""})

    def test_節ごとに平文で入る(self):
        texts = self._texts([
            _row(MDNA, "４【経営者による分析】　増収増益となりました。"),
            _row(RISKS, "３【事業等のリスク】　為替変動の影響を受けます。"),
            _row(ISSUES, "１【対処すべき課題】　海外展開を進めます。"),
            _row(SUSTAINABILITY, "２【サステナビリティ】　人材育成方針を定めています。"),
        ])
        self.assertEqual(texts["mdna"], "４【経営者による分析】\n増収増益となりました。")
        self.assertEqual(texts["risks"], "３【事業等のリスク】\n為替変動の影響を受けます。")
        self.assertEqual(texts["issues"], "１【対処すべき課題】\n海外展開を進めます。")
        self.assertEqual(texts["sustainability"], "２【サステナビリティ】\n人材育成方針を定めています。")

    def test_複数あれば長いほうを採る(self):
        with TemporaryDirectory() as d:
            path = _zip(d, {
                "XBRL_TO_CSV/a.csv": META + [_row(RISKS, "短いほう")],
                "XBRL_TO_CSV/b.csv": [_row(RISKS, "こちらが長いほうの原文です。")],
            })
            self.assertEqual(edinet.analysis_texts(edinet.parse_csv_zip(path))["risks"],
                             "こちらが長いほうの原文です。")

    def test_人的資本の独自要素は拾わない(self):
        # **接尾辞で拾わないことを固定する**（`edinet.ANALYSIS_SECTIONS` の注記）。
        # 独自要素の中身はサステナビリティの節に含まれており（実測1,035件中1,009件）、
        # 接尾辞にすると「他の節を参照してください」の1行まで巻き込む。
        texts = self._texts([
            _row(SUSTAINABILITY, "サステナビリティ全般。②戦略　人材育成方針。"),
            _row("jpcrp030000-asr_E00001-000:StrategyHumanCapitalTextBlock", "②戦略　人材育成方針。"),
            _row("jpcrp030000-asr_E00001-000:ReferenceToOtherInformationStrategyHumanCapitalTextBlock",
                 "「１．サステナビリティ全般」を参照してください。"),
        ])
        self.assertEqual(texts["sustainability"], "サステナビリティ全般。②戦略\n人材育成方針。")

    def test_事業の内容は4節に入らない(self):
        # ADR-0015 決定4。説明文（C7）と同じ原文を材料にすると1画面に2回出る。
        texts = self._texts([_row(BUSINESS, "３【事業の内容】　当社の事業。")])
        self.assertEqual(set(texts.values()), {""})

    def test_ランキングの記録には4節を入れない(self):
        # `run.py`（2,961件）と `history.py`（17,684件）が全書類ぶん呼ぶので、
        # 1社あたり約25,000字をそこで平文に直さない。
        with TemporaryDirectory() as d:
            path = _zip(d, {"XBRL_TO_CSV/a.csv": META + [_row(MDNA, "増収増益となりました。")]})
            rec = edinet.to_record(META_MOCK, edinet.parse_csv_zip(path))
            self.assertNotIn("mdna", rec)
            self.assertEqual(rec["business_text"], "")


if __name__ == "__main__":
    unittest.main()
