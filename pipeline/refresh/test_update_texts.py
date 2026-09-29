"""文章の差分生成（refresh の D6・#876）。合成データで、どの会社のどの工程を選ぶかと、
台帳・待ち行列の書き方を見る。

  cd pipeline && npm test
  python3 -m unittest discover -s refresh -t refresh -p 'test_*.py'
"""
import unittest

from update_texts import (
    drop_unfinished_pay_policy,
    select_queue,
    stage_docs,
    todo_stages,
    update_pending,
)

FIRST = "2026-03-31"


def entry(code, numbers, analysis="", description="", pay_policy=""):
    return {
        "edinet_code": code,
        "id": code,
        "filed": "2026-09-01",
        "doc_numbers": numbers,
        "doc_analysis": analysis,
        "doc_description": description,
        "doc_pay_policy": pay_policy,
    }


def ranking(code, rank, period_end="2027-03-31"):
    return {"edinet_code": code, "rank_raw": str(rank), "period_end": period_end, "doc_id": ""}


class TodoStages(unittest.TestCase):
    def test_all_stages_follow_the_numbers_filing(self):
        e = entry("E1", "NEW", "OLD", "OLD", "OLD")
        self.assertEqual(todo_stages(e, "2027-03-31", set(), FIRST), ["analysis", "description", "pay_policy"])

    def test_done_stages_are_skipped(self):
        e = entry("E1", "NEW", "NEW", "OLD", "OLD")
        self.assertEqual(todo_stages(e, "2027-03-31", set(), FIRST), ["description", "pay_policy"])

    def test_pay_policy_only_for_periods_with_the_section(self):
        # 開示府令 (58-2) より前の期の書類には節が無い
        e = entry("E1", "NEW", "OLD", "OLD", "")
        self.assertEqual(todo_stages(e, "2026-02-28", set(), FIRST), ["analysis", "description"])

    def test_a_stage_that_failed_on_this_filing_is_not_picked_again(self):
        # 同じ書類で落ちた工程を毎日選び直すと、その会社が上限を使い切り続ける
        e = entry("E1", "NEW", "OLD", "OLD", "OLD")
        failed = {("analysis", "NEW")}
        self.assertEqual(todo_stages(e, "2027-03-31", failed, FIRST), ["description", "pay_policy"])

    def test_a_failure_on_an_older_filing_does_not_block_the_new_one(self):
        e = entry("E1", "NEW", "OLD", "OLD", "OLD")
        failed = {("analysis", "OLD")}
        self.assertIn("analysis", todo_stages(e, "2027-03-31", failed, FIRST))


class SelectQueue(unittest.TestCase):
    def test_partial_companies_first_then_by_raw_rank(self):
        entries = {
            "E1": entry("E1", "N1", "O", "O", "O"),  # 3位
            "E2": entry("E2", "N2", "O", "O", "O"),  # 1位
            "E3": entry("E3", "N3", "N3", "O", "O"),  # 50位・分析だけ済んだ（途中で止まった）
            "E4": entry("E4", "N4", "N4", "N4", "N4"),  # 済んでいる
        }
        rank = {"E1": ranking("E1", 3), "E2": ranking("E2", 1), "E3": ranking("E3", 50), "E4": ranking("E4", 2)}
        got = select_queue(entries, rank, [], FIRST, limit=10)
        self.assertEqual([c for c, _ in got], ["E3", "E2", "E1"])
        self.assertEqual(got[0][1], ["description", "pay_policy"])

    def test_a_company_whose_stage_failed_counts_as_partial(self):
        # 分析が落ちて説明文が残っている会社は、残りを先に片付ける
        entries = {"E1": entry("E1", "N1", "O", "O", "O"), "E2": entry("E2", "N2", "O", "O", "O")}
        rank = {"E1": ranking("E1", 1), "E2": ranking("E2", 9)}
        pending = [{"edinet_code": "E2", "stage": "analysis", "doc_id": "N2"}]
        got = select_queue(entries, rank, pending, FIRST, limit=10)
        self.assertEqual(got, [("E2", ["description", "pay_policy"]), ("E1", ["analysis", "description", "pay_policy"])])

    def test_limit(self):
        entries = {f"E{i}": entry(f"E{i}", f"N{i}") for i in range(5)}
        rank = {f"E{i}": ranking(f"E{i}", i + 1) for i in range(5)}
        self.assertEqual([c for c, _ in select_queue(entries, rank, [], FIRST, limit=2)], ["E0", "E1"])

    def test_new_company_without_any_text(self):
        # 新しく載った会社は文章の書類が空。書けるまで節は出ない（spec 1.9）
        entries = {"E1": entry("E1", "N1")}
        got = select_queue(entries, {"E1": ranking("E1", 7)}, [], FIRST, limit=10)
        self.assertEqual(got, [("E1", ["analysis", "description", "pay_policy"])])


class StageDocs(unittest.TestCase):
    def test_reads_the_filing_each_artifact_points_to(self):
        docs = stage_docs(
            "E1",
            {"E1": {"source_doc_id": "A"}},
            {"E1": {"source_doc_id": "B"}},
            [{"edinet_code": "E1", "doc_id": "C"}, {"edinet_code": "E2", "doc_id": "X"}],
        )
        self.assertEqual(docs, {"analysis": "A", "description": "B", "pay_policy": "C"})

    def test_missing_artifacts_are_empty(self):
        self.assertEqual(stage_docs("E1", {}, {}, []), {"analysis": "", "description": "", "pay_policy": ""})

    def test_two_pay_policy_records_for_one_company_fail(self):
        with self.assertRaises(ValueError):
            stage_docs("E1", {}, {}, [{"edinet_code": "E1", "doc_id": "A"}, {"edinet_code": "E1", "doc_id": "B"}])


class DropUnfinishedPayPolicy(unittest.TestCase):
    def test_drops_the_new_filing_left_at_referenced(self):
        rows = [
            {"edinet_code": "E1", "doc_id": "OLD", "verdict": "own"},
            {"edinet_code": "E1", "doc_id": "NEW", "verdict": "referenced"},
        ]
        kept, dropped = drop_unfinished_pay_policy(rows, "E1", "NEW")
        self.assertTrue(dropped)
        self.assertEqual([r["doc_id"] for r in kept], ["OLD"])

    def test_keeps_answered_records(self):
        rows = [{"edinet_code": "E1", "doc_id": "NEW", "verdict": "own"}]
        self.assertEqual(drop_unfinished_pay_policy(rows, "E1", "NEW"), (rows, False))


class UpdatePending(unittest.TestCase):
    def test_passed_stages_clear_and_failed_stages_are_written(self):
        pending = [
            {"edinet_code": "E1", "stage": "analysis", "doc_id": "OLD", "name": "A", "reason": "前", "since": "2026-01-01"},
            {"edinet_code": "E9", "stage": "description", "doc_id": "X", "name": "Z", "reason": "他", "since": "2026-01-01"},
        ]
        got = update_pending(pending, "E1", "A", "NEW", {"analysis": None, "description": "検証パス: 重み付け"},
                             "2026-10-01")
        self.assertEqual(
            [(p["edinet_code"], p["stage"], p["doc_id"], p["since"]) for p in got],
            [("E1", "description", "NEW", "2026-10-01"), ("E9", "description", "X", "2026-01-01")],
        )

    def test_since_is_kept_while_the_same_filing_keeps_failing(self):
        pending = [{"edinet_code": "E1", "stage": "analysis", "doc_id": "NEW", "name": "A", "reason": "前",
                    "since": "2026-09-01"}]
        got = update_pending(pending, "E1", "A", "NEW", {"analysis": "今回"}, "2026-10-01")
        self.assertEqual((got[0]["reason"], got[0]["since"]), ("今回", "2026-09-01"))

    def test_stages_not_in_results_are_untouched(self):
        # 掛からない工程（給与の決定方針が改正前の期）には触らない
        pending = [{"edinet_code": "E1", "stage": "pay_policy", "doc_id": "OLD", "name": "A", "reason": "前",
                    "since": "2026-09-01"}]
        got = update_pending(pending, "E1", "A", "NEW", {"analysis": None}, "2026-10-01")
        self.assertEqual(got, pending)


if __name__ == "__main__":
    unittest.main()
