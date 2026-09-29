"""`history.resolve_scale` の単体テスト（refresh の D0・#870）。

  cd pipeline && npm test        # vitest と一緒に走る
  python3 -m unittest discover -s salary -t salary -p 'test_*.py'

**桁の選び直しの規則は、以前は実データの3社の値（トスネット2019・Ｍ＆Ａキャピタル
パートナーズ2019/2022・ホットリンク2018）を `build-data.test.ts` に書き写して見ていた。**
毎日の更新でデータが動くとその値は崩れるので、同じ3つの形を固定入力で留める。
"""

import unittest

import history


def rec(year, salary, *, original=None, employees=500):
    """1社1年ぶんの行。`original` を渡すと `fix_salary_typos` が桁を直した行になる。"""
    r = {
        "edinet_code": "E00001",
        "year": year,
        "avg_salary": salary,
        "employees_nonconsolidated": employees,
    }
    if original is not None:
        r["salary_fixed"] = True
        r["salary_original"] = original
    return r


class ResolveScale(unittest.TestCase):
    def test_他の年が指す桁に選び直す(self):
        # トスネットの形: 千円単位の数字を円の欄に入れた年が ÷100 で帯に入って止まっていた。
        # 他の年は 250〜300万円なので、正しいのは ÷1000。
        recs = [
            rec(2018, 2_540_000),
            rec(2019, 26_242_710, original=2_624_271_000),
            rec(2020, 2_800_000),
            rec(2021, 3_020_000),
        ]
        changed = history.resolve_scale(recs)
        self.assertEqual(round(recs[1]["avg_salary"]), 2_624_271)
        self.assertEqual(len(changed), 1)

    def test_他の年が同じ水準なら帯の上限の外でも元の値に戻す(self):
        # Ｍ＆Ａキャピタルパートナーズの形: 元の値が正しく、帯の上限（3,000万円）を
        # わずかに超えるために ÷10 されていた。他の年が 2,300〜2,700万円を指している。
        recs = [
            rec(2018, 22_700_000),
            rec(2019, 3_109_300, original=31_093_000),
            rec(2020, 26_880_000),
            rec(2021, 24_000_000),
        ]
        history.resolve_scale(recs)
        self.assertEqual(round(recs[1]["avg_salary"]), 31_093_000)

    def test_桁を直していない年は浮いて見えても触らない(self):
        # ホットリンクの形: 有報が「（千円）3,205」と書いている実額で、他の年より低いだけ。
        recs = [
            rec(2018, 3_205_000),
            rec(2019, 5_600_000),
            rec(2020, 6_100_000),
            rec(2021, 5_900_000),
        ]
        self.assertEqual(history.resolve_scale(recs), [])
        self.assertEqual(recs[0]["avg_salary"], 3_205_000)

    def test_直っていない年が2つ未満なら基準にしない(self):
        recs = [
            rec(2018, 2_540_000),
            rec(2019, 26_242_710, original=2_624_271_000),
        ]
        self.assertEqual(history.resolve_scale(recs), [])
        self.assertEqual(recs[1]["avg_salary"], 26_242_710)


if __name__ == "__main__":
    unittest.main()
