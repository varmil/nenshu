"""更新できなかったものの知らせ（refresh の D8・#878・AC-14）。"""
import unittest
from datetime import date

from alerts import (
    Case,
    effort_case,
    key_of,
    pending_cases,
    plan,
    pr_cases,
    quality_case,
    read_effort,
    stalled_case,
    texts_cases,
    worklife_case,
)

TODAY = date(2026, 10, 5)


def pending(reason, since="2026-10-04", code="E00001"):
    return {
        "edinet_code": code,
        "doc_id": "S100TEST",
        "sec_code": "1234",
        "name": "テスト株式会社",
        "period_end": "2026-06-30",
        "filed": "2026-09-28",
        "reason": reason,
        "detail": "詳しい理由",
        "since": since,
    }


class Pending(unittest.TestCase):
    def test_final_reasons_are_reported_at_once(self):
        for reason in ("unresolved", "not_eligible"):
            (case,) = pending_cases([pending(reason, since="2026-10-05")], TODAY)
            self.assertEqual(case.key, "numbers:E00001")
            self.assertIn("詳しい理由", case.body)

    def test_retried_reasons_wait_for_the_second_day(self):
        # 1回の取得の失敗は次の回で直ることが多い。2回続けて残ったら知らせる
        for reason in ("fetch_failed", "reread"):
            self.assertEqual(pending_cases([pending(reason, since="2026-10-04")], TODAY), [], reason)
            self.assertEqual(len(pending_cases([pending(reason, since="2026-10-03")], TODAY)), 1, reason)

    def test_one_case_per_company(self):
        rows = [pending("not_eligible", code="E00001"), pending("unresolved", code="E00002")]
        self.assertEqual([c.key for c in pending_cases(rows, TODAY)], ["numbers:E00001", "numbers:E00002"])


class Texts(unittest.TestCase):
    """文章の待ち行列（D6）。同じ書類では選び直さないので、1日目から知らせる。"""

    def row(self, stage, reason="検証パス: 重み付け"):
        return {"edinet_code": "E01991", "stage": stage, "doc_id": "S100NEW", "name": "レーザーテック株式会社",
                "reason": reason, "since": "2026-10-01"}

    def test_one_case_per_company_listing_the_stages(self):
        cases = texts_cases([self.row("pay_policy", "人材戦略の節が無い"), self.row("analysis")])
        self.assertEqual([c.key for c in cases], ["texts:E01991"])
        self.assertIn("分析と要約・給与の決定方針", cases[0].title)
        self.assertLess(cases[0].body.index("分析と要約"), cases[0].body.index("給与の決定方針"))

    def test_no_rows_no_case(self):
        self.assertEqual(texts_cases([]), [])


class Quality(unittest.TestCase):
    """分析の品質のずれ（D10）。いちばん新しい月の集計にずれがあれば1件。"""

    def report(self, drifts):
        stats = {"n": 40, "subjective": 0.5, "fact": 8.0, "external": 0.02, "reader": 0.1, "escape": 0.3, "chars": 350}
        base = {"subjective": 1.37, "fact": 5.82, "external": 0.15, "reader": 0.28, "escape": 0.15, "chars": 364}
        return {"month": "2026-11", "stats": stats, "baseline": base, "drifts": drifts,
                "byModel": {"claude-opus-5-5@xhigh": {"n": 40, "subjective": 0.5, "fact": 8.0, "external": 0.02}}}

    def test_drift_becomes_one_case_without_the_month_in_the_key(self):
        case = quality_case(self.report([{"metric": "subjective", "value": 0.5, "baseline": 1.37}]))
        self.assertEqual(case.key, "quality:analysis")
        self.assertIn("2026-11", case.title)
        self.assertIn("claude-opus-5-5@xhigh", case.body)

    def test_no_drift_no_case(self):
        self.assertIsNone(quality_case(self.report([])))
        self.assertIsNone(quality_case(None))


class Worklife(unittest.TestCase):
    manifest = {"file": "99_20260929_utf8.zip", "fetchedAt": "2026-09-30"}

    def test_no_case_without_rejected(self):
        self.assertIsNone(worklife_case(self.manifest))
        self.assertIsNone(worklife_case(None))

    def test_rejected_version_is_reported(self):
        m = {
            **self.manifest,
            "rejected": {"file": "99_20261001_utf8.zip", "sha256": "f" * 64, "fetchedAt": "2026-10-01", "reason": "101列目が違う"},
        }
        case = worklife_case(m)
        self.assertEqual(case.key, "worklife:rejected")
        self.assertIn("101列目が違う", case.body)
        self.assertIn("99_20260929_utf8.zip", case.body)  # 前の版のまま、と言える


class Stalled(unittest.TestCase):
    def universe(self, to):
        return {"filingWindow": {"from": "2025-10-01", "to": to}}

    def test_reading_up_to_yesterday_is_normal(self):
        self.assertIsNone(stalled_case(self.universe("2026-10-04"), TODAY))
        self.assertIsNone(stalled_case(self.universe("2026-10-03"), TODAY))

    def test_three_days_behind_is_stalled(self):
        self.assertEqual(stalled_case(self.universe("2026-10-02"), TODAY).key, "routine:stalled")


def written(model, at="2026-09-29T22:53:15+00:00"):
    return {"model": model, "generated_at": at}


class Effort(unittest.TestCase):
    def test_latest_day_at_the_decided_effort_is_fine(self):
        rows = [written("claude-opus-5-5@xhigh"), written("claude-opus-5-5@xhigh")]
        self.assertIsNone(effort_case(rows, "xhigh"))

    def test_latest_day_at_another_effort_becomes_one_case(self):
        rows = [written("claude-opus-5-5@medium"), written("claude-opus-5-5@xhigh")]
        case = effort_case(rows, "xhigh")
        self.assertEqual(case.key, "routine:effort")
        self.assertIn("claude-opus-5-5@medium", case.title)
        self.assertIn("2社のうち 1社", case.body)

    def test_only_the_latest_day_counts(self):
        # 前の日に違う設定で書いていても、いちばん新しい日が決めた設定なら閉じる
        rows = [
            written("claude-opus-5-5@medium", "2026-09-29T22:53:15+00:00"),
            written("claude-opus-5-5@xhigh", "2026-09-30T22:10:00+00:00"),
        ]
        self.assertIsNone(effort_case(rows, "xhigh"))

    def test_day_is_japan_time(self):
        # UTC の9月29日14時59分と15時01分は、日本時間では29日と30日。いちばん新しい30日だけを見る
        # （UTC の日付で切ると2社とも29日になり、medium を拾う）
        rows = [
            written("claude-opus-5-5@medium", "2026-09-29T14:59:00+00:00"),
            written("claude-opus-5-5@xhigh", "2026-09-29T15:01:00+00:00"),
        ]
        self.assertIsNone(effort_case(rows, "xhigh"))

    def test_records_without_effort_are_not_looked_at(self):
        # C9 が書いた版5は `claude-opus-5` で、推論の設定を持たない
        self.assertIsNone(effort_case([written("claude-opus-5")], "xhigh"))
        self.assertIsNone(effort_case([], "xhigh"))

    def test_missing_setting_is_reported(self):
        self.assertIn("未設定", effort_case([written("claude-opus-5-5@xhigh")], None).title)

    def test_repository_setting_is_xhigh(self):
        # spec 1.14。Routine の設定には推論の欄が無いので、リポジトリの設定が決める
        self.assertEqual(read_effort(), "xhigh")


class PullRequests(unittest.TestCase):
    def test_labels_become_cases(self):
        prs = [
            {"number": 10, "title": "a", "url": "u", "labels": [{"name": "refresh"}, {"name": "refresh-criteria"}]},
            {"number": 11, "title": "b", "url": "u", "labels": [{"name": "refresh"}, {"name": "refresh-ci-failed"}]},
            {"number": 12, "title": "c", "url": "u", "labels": [{"name": "refresh"}]},
        ]
        self.assertEqual([c.key for c in pr_cases(prs)], ["pr-criteria:10", "pr-failed:11"])


def issue(number, case: Case):
    return {"number": number, "title": case.title, "body": case.issue_body()}


A = Case("numbers:E00001", "数字を更新できない: A", "中身A")
B = Case("worklife:rejected", "女性活躍DB", "中身B")


class Plan(unittest.TestCase):
    def test_key_is_the_first_line(self):
        self.assertEqual(key_of(A.issue_body()), "numbers:E00001")
        self.assertIsNone(key_of("運営者が手で立てた Issue"))
        self.assertIsNone(key_of(""))

    def test_create_missing_and_close_resolved(self):
        p = plan([A], [issue(5, B)])
        self.assertEqual([c.key for c in p.create], ["numbers:E00001"])
        self.assertEqual(p.close, [5])
        self.assertEqual(p.update, [])

    def test_same_case_is_not_created_twice(self):
        p = plan([A], [issue(5, A)])
        self.assertEqual((p.create, p.update, p.close), ([], [], []))

    def test_changed_body_is_updated_in_place(self):
        changed = Case(A.key, A.title, "中身が変わった")
        p = plan([changed], [issue(5, A)])
        self.assertEqual([(n, c.body) for n, c in p.update], [(5, "中身が変わった")])
        self.assertEqual((p.create, p.close), ([], []))

    def test_duplicates_are_closed_keeping_the_oldest(self):
        p = plan([A], [issue(7, A), issue(5, A)])
        self.assertEqual(p.close, [7])

    def test_issues_without_key_are_left_alone(self):
        p = plan([], [{"number": 9, "title": "手で立てた", "body": "鍵の無い本文"}])
        self.assertEqual(p.close, [])


if __name__ == "__main__":
    unittest.main()
