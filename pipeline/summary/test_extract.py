"""`extract.py` の単体テスト。EDINET には触らない（合成した ZIP をキャッシュに置く）。

  cd pipeline && npm test
  python3 -m unittest discover -s summary -t summary -p 'test_*.py'
"""

import io
import unittest
import zipfile
from pathlib import Path
from tempfile import TemporaryDirectory

import extract
import edinet

HEADER = ["要素ID", "項目名", "コンテキストID", "相対年度", "連結・個別",
          "期間・時点", "ユニットID", "単位", "値"]
BUSINESS = "jpcrp_cor:DescriptionOfBusinessTextBlock"
ROW = {"edinet_code": "E00001", "sec_code": "1234", "name": "テスト株式会社",
       "doc_id": "S000TEST", "period_end": "2026-03-31"}


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
        self.assertEqual(extract.extract(ROW)[1], "取得失敗")

    def test_要素が無い(self):
        _write(edinet.CACHE, ROW["doc_id"], [_row("jpdei_cor:EDINETCodeDEI", "E00001")])
        self.assertEqual(extract.extract(ROW)[1], "要素が無い")

    def test_壊れたZIPは取得失敗(self):
        (edinet.CACHE / f"{ROW['doc_id']}.zip").write_bytes(b"not a zip")
        self.assertEqual(extract.extract(ROW)[1], "取得失敗")

    def test_取れた行(self):
        _write(edinet.CACHE, ROW["doc_id"],
               [_row(BUSINESS, "３【事業の内容】　当社は製造業です。")])
        rec, reason = extract.extract(ROW)
        self.assertIsNone(reason)
        self.assertEqual(rec["text"], "３【事業の内容】\n当社は製造業です。")
        self.assertEqual(rec["char_len"], len(rec["text"]))
        # SHA-1 は**平文にした後の文字列**で取る（整え方を変えたら全社ぶん変わる）。
        self.assertEqual(rec["text_sha1"], extract.hashlib.sha1(
            rec["text"].encode("utf-8")).hexdigest())

    def test_社名と証券コードは母集団のCSVから採る(self):
        # 書類の中の表記（旧商号など）ではなく `unified.py` が確定させたものが正。
        _write(edinet.CACHE, ROW["doc_id"], [
            _row("jpdei_cor:FilerNameInJapaneseDEI", "旧テスト株式会社"),
            _row(BUSINESS, "当社は製造業です。"),
        ])
        rec, _ = extract.extract(ROW)
        self.assertEqual(rec["name"], "テスト株式会社")
        self.assertEqual(rec["sec_code"], "1234")

    def test_書き出す列はHEADERSと一致する(self):
        _write(edinet.CACHE, ROW["doc_id"], [_row(BUSINESS, "当社は製造業です。")])
        rec, _ = extract.extract(ROW)
        self.assertEqual(list(rec), extract.HEADERS)


if __name__ == "__main__":
    unittest.main()
