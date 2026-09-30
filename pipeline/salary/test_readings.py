"""平均年間給与の読み取り（本文の表・桁の直し）の単体テスト。

  cd pipeline && npm test        # vitest と一緒に走る
  python3 -m unittest discover -s salary -t salary -p 'test_*.py'

定期実行の知らせ（#892・#895）で見つかった2つの形を固定入力で留める。どちらも
2026年の有報で初めて出た形で、それまでの全件の組み直しには現れていなかった。
"""

import unittest

import run
import textblock

# ニヤクコーポレーションの「提出会社の状況」の表（CSV に変換した後の形。セルは区切りなしで続く）
NIYAKU_2025 = (
    "(2) 提出会社の状況2025年６月30日現在 従業員数（人）平均年令平均勤続年数平均年間給与（円）"
    "1,931（89）51歳3ヶ月16年1ヶ月5,118,010    セグメントの名称従業員数（人）物流事業1,832（85）"
)
# 2026年6月期から、給与の隣に対前事業年度増減率の列が増えた
NIYAKU_2026 = (
    "② 提出会社の状況2026年６月30日現在 従業員数（人）平均年令平均勤続年数平均年間給与（円）"
    "平均年間給与の対前事業年度増減率（％）1,977（80）51歳7ヶ月15年10ヶ月5,461,8826.72    "
    "セグメントの名称従業員数（人）物流事業1,864（77）"
)


class ValueUnitTable(unittest.TestCase):
    """単位が値の側に付く表（`51歳7ヶ月`）。"""

    def test_増減率の列が無い表(self):
        got = textblock.parse(NIYAKU_2025, 1931)
        self.assertEqual(got["avg_salary"], 5_118_010)
        self.assertAlmostEqual(got["avg_age"], 51.25)

    def test_増減率の列が増えた表でも給与を読む(self):
        # 列を知らないと、見出しの「平均年間給与」を給与の列として2回拾い、
        # `5,461,8826.72` の `6.72` を給与として読みに行って表ごと落とす
        got = textblock.parse(NIYAKU_2026, 1977)
        self.assertEqual(got["avg_salary"], 5_461_882)
        self.assertAlmostEqual(got["avg_age"], 51 + 7 / 12, places=2)
        self.assertAlmostEqual(got["avg_tenure"], 15 + 10 / 12, places=2)


def row(salary, employees=448):
    return {"avg_salary": salary, "employees_nonconsolidated": employees}


class FixSalaryTypos(unittest.TestCase):
    def test_百万倍の桁で入った値を戻す(self):
        # フルヤ金属 2026年6月期: 表には 7,567,272円、タグには 7567272000000
        r = row(7_567_272_000_000)
        run.fix_salary_typos([r])
        self.assertEqual(r["avg_salary"], 7_567_272)
        self.assertEqual(r["salary_fixed"], "7567272000000→7567272")

    def test_いちばん小さい冪で帯に入るものを採る(self):
        # ÷1000 で帯に入るものを、それより大きい冪で割らない
        r = row(8_000_000_000)
        run.fix_salary_typos([r])
        self.assertEqual(r["avg_salary"], 8_000_000)

    def test_百万倍でも帯に入らなければ落とす(self):
        r = row(7_567_272_000_000_000)
        run.fix_salary_typos([r])
        self.assertIsNone(r["avg_salary"])
        self.assertTrue(r["salary_fixed"].endswith("→除外"))

    def test_帯の中の値には触らない(self):
        r = row(7_482_528)
        self.assertEqual(run.fix_salary_typos([r]), [])
        self.assertEqual(r["avg_salary"], 7_482_528)


if __name__ == "__main__":
    unittest.main()
