"""`extract_analysis.py` の単体テスト。EDINET には触らない（合成した ZIP をキャッシュに置く）。

  cd pipeline && npm test
  python3 -m unittest discover -s summary -t summary -p 'test_*.py'
"""

import io
import unittest
import zipfile
from pathlib import Path
from tempfile import TemporaryDirectory

import extract_analysis
import edinet

HEADER = ["要素ID", "項目名", "コンテキストID", "相対年度", "連結・個別",
          "期間・時点", "ユニットID", "単位", "値"]
MDNA, RISKS, ISSUES, SUSTAINABILITY = (s.element for s in edinet.ANALYSIS_SECTIONS)
ROW = {"edinet_code": "E00001", "sec_code": "1234", "name": "テスト株式会社",
       "doc_id": "S000TEST", "period_end": "2026-03-31"}
FOUR = [
    (MDNA, "増収増益となりました。"),
    (RISKS, "為替変動の影響を受けます。"),
    (ISSUES, "海外展開を進めます。"),
    (SUSTAINABILITY, "人材育成方針を定めています。"),
]


def _write(cache, doc_id, rows):
    buf = io.StringIO()
    buf.write("\t".join(HEADER) + "\r\n")
    for row in rows:
        buf.write("\t".join(f'"{c}"' for c in row) + "\r\n")
    with zipfile.ZipFile(cache / f"{doc_id}.zip", "w") as z:
        z.writestr("XBRL_TO_CSV/jpcrp030000-asr-001.csv", buf.getvalue().encode("utf-16"))


def _row(elem, value):
    return (elem, "", "FilingDateInstant", "", "", "", "", "", value)


class Extract(unittest.TestCase):
    def setUp(self):
        self._dir = TemporaryDirectory()
        self._cache = edinet.CACHE
        edinet.CACHE = Path(self._dir.name)

    def tearDown(self):
        edinet.CACHE = self._cache
        self._dir.cleanup()

    def test_ZIPが無ければ取得失敗(self):
        self.assertEqual(extract_analysis.extract(ROW)[1], "取得失敗")

    def test_4節が1つも無ければ落とす(self):
        _write(edinet.CACHE, ROW["doc_id"], [_row("jpdei_cor:EDINETCodeDEI", "E00001")])
        self.assertEqual(extract_analysis.extract(ROW)[1], "4節とも無い")

    def test_1節でもあれば行を作る(self):
        # **4節すべてを要求しない。** C9 に渡す材料が1つでもあれば、書けるかどうかは
        # あちらの検証パスが決める（C5 が「書けない会社をここで落とさない」としたのと同じ線）。
        _write(edinet.CACHE, ROW["doc_id"], [_row(MDNA, "増収増益となりました。")])
        rec, reason = extract_analysis.extract(ROW)
        self.assertIsNone(reason)
        self.assertEqual(rec["mdna"], "増収増益となりました。")
        self.assertEqual(rec["risks"], "")
        self.assertEqual(rec["risks_len"], 0)
        self.assertEqual(rec["risks_sha1"], "")

    def test_節ごとにSHA1を持つ(self):
        _write(edinet.CACHE, ROW["doc_id"], [_row(e, v) for e, v in FOUR])
        rec, _ = extract_analysis.extract(ROW)
        shas = {rec[f"{k}_sha1"] for k in extract_analysis.KEYS}
        # **4節をまとめて1つにしない**——1節だけ変わった会社と全部変わった会社を
        # 区別できないと、C9 が回し直す範囲がそのぶん広がる。
        self.assertEqual(len(shas), 4)
        self.assertEqual(rec["mdna_sha1"], extract_analysis.hashlib.sha1(
            rec["mdna"].encode("utf-8")).hexdigest())

    def test_社名と証券コードは母集団のCSVから採る(self):
        _write(edinet.CACHE, ROW["doc_id"], [
            _row("jpdei_cor:FilerNameInJapaneseDEI", "旧テスト株式会社"),
            _row(MDNA, "増収増益となりました。"),
        ])
        rec, _ = extract_analysis.extract(ROW)
        self.assertEqual(rec["name"], "テスト株式会社")
        self.assertEqual(rec["sec_code"], "1234")

    def test_打ち切りに当たった節を記録する(self):
        # EDINET 側の30,000字の打ち切り。**復元しない**（この Unit の範囲は
        # 「平均年間給与を拾ったのと同じ書類から拾う」ことに閉じている）が、
        # どの会社のどの節が切れているかは残す。
        _write(edinet.CACHE, ROW["doc_id"], [
            _row(RISKS, "あ" * extract_analysis.EDINET_VALUE_CAP),
            _row(MDNA, "増収増益となりました。"),
        ])
        rec, _ = extract_analysis.extract(ROW)
        self.assertEqual(rec["truncated"], "risks")

    def test_打ち切りは1字ぶん緩めて数える(self):
        # `parse_csv_zip` が値を `strip()` するので、30,000字目が空白だった書類では
        # 29,999字になる（実測12件中10件）。**30,000ちょうどで判定すると取りこぼす。**
        _write(edinet.CACHE, ROW["doc_id"], [
            _row(MDNA, "あ" * (extract_analysis.EDINET_VALUE_CAP - 1) + " "),
        ])
        self.assertEqual(extract_analysis.extract(ROW)[0]["truncated"], "mdna")

    def test_切らないのが既定(self):
        _write(edinet.CACHE, ROW["doc_id"], [_row(MDNA, "あ" * 5000)])
        self.assertEqual(extract_analysis.extract(ROW)[0]["mdna_len"], 5000)

    def test_max_charsで切れる(self):
        # 切る長さを決めるのは C9（ADR-0015 決定2）。C8 は切る手段だけ持つ。
        _write(edinet.CACHE, ROW["doc_id"], [_row(MDNA, "あ" * 5000)])
        rec, _ = extract_analysis.extract(ROW, max_chars=1500)
        self.assertEqual(rec["mdna_len"], 1500)
        self.assertEqual(rec["mdna_sha1"], extract_analysis.hashlib.sha1(
            ("あ" * 1500).encode("utf-8")).hexdigest())


if __name__ == "__main__":
    unittest.main()
