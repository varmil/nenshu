"""自動マージの判定（refresh の D8・#878・AC-12）。"""
import unittest

import automerge
from automerge import criteria_hits, decide, glob_to_regex, load_patterns

# 定期実行のデータ更新の PR が触るファイル（D4・D7 の1回目で実際に変わったもの）
DATA_PR = [
    "pipeline/data/ranking_unified.csv",
    "pipeline/data/salary_history.csv",
    "pipeline/data/performance_history.csv",
    "pipeline/data/ledger.csv",
    "pipeline/data/numbers_pending.csv",
    "pipeline/data/universe.json",
    "pipeline/data/worklife.csv",
    "pipeline/worklife/manifest.json",
    "web/public/data/companies.json",
    "web/public/data/history.json",
    "web/public/logos/7203.webp",
    "web/public/og.png",
    "web/lib/brand/ogFacts.ts",
]


class Glob(unittest.TestCase):
    def match(self, pattern, path):
        return glob_to_regex(pattern).match(path) is not None

    def test_double_star_is_zero_or_more_directories(self):
        self.assertTrue(self.match("**/*.test.ts", "a.test.ts"))
        self.assertTrue(self.match("**/*.test.ts", "web/features/x/a.test.ts"))
        self.assertTrue(self.match(".github/**", ".github/workflows/ci.yml"))

    def test_single_star_stays_in_one_directory(self):
        self.assertTrue(self.match("pipeline/*/prompts/**", "pipeline/analysis/prompts/generate.md"))
        self.assertFalse(self.match("pipeline/*/prompts/**", "pipeline/a/b/prompts/x.md"))
        self.assertFalse(self.match("package.json", "web/package.json"))

    def test_whole_path_only(self):
        self.assertFalse(self.match("**/*.test.ts", "web/a.test.ts.orig"))
        self.assertFalse(self.match("pipeline/refresh/thresholds.json", "x/pipeline/refresh/thresholds.json"))


class Criteria(unittest.TestCase):
    """いまの `criteria.txt` で見る。一覧を直したら、ここが守りたい線を確かめ直す。"""

    patterns = load_patterns()

    def test_data_update_touches_no_criteria(self):
        self.assertEqual(criteria_hits(DATA_PR, self.patterns), [])

    def test_code_fix_outside_criteria_is_not_held(self):
        # やり直しで直らない失敗をエージェントが直す PR（spec 1.12）は自動でマージしてよい
        files = ["pipeline/salary/edinet.py", "pipeline/refresh/update_numbers.py", "pipeline/scripts/build-data.ts"]
        self.assertEqual(criteria_hits(files, self.patterns), [])

    def test_each_kind_of_criteria_is_held(self):
        for path in [
            "pipeline/refresh/test_update_numbers.py",  # テスト
            "web/features/ranking/lib/salary.test.ts",
            "web/e2e/company-page.spec.ts",
            ".github/workflows/ci.yml",
            "web/package.json",
            "pipeline/refresh/thresholds.json",  # 止める線の閾値
            "pipeline/refresh/prompts/reread.md",  # 生成の規格
            "pipeline/analysis/prompts/generate.md",
            "pipeline/analysis/gate.py",
            "pipeline/refresh/criteria.txt",  # この一覧と判定
            "pipeline/refresh/automerge.py",
            ".claude/skills/refresh-daily/SKILL.md",  # 定期実行の手順
        ]:
            self.assertEqual(criteria_hits([path], self.patterns), [path], path)


GREEN = {"pipeline": "success", "web": "success", "e2e": "success"}


def run_decide(**over):
    args = dict(
        state="OPEN",
        labels=[automerge.LABEL],
        pr_head="abc",
        run_head="abc",
        run_conclusion="success",
        jobs=GREEN,
        hits=[],
    )
    args.update(over)
    return decide(**args)


class Decide(unittest.TestCase):
    def test_merge_when_ci_green_and_no_criteria(self):
        self.assertEqual(run_decide().action, "merge")

    def test_hold_when_criteria_touched(self):
        d = run_decide(hits=["pipeline/refresh/thresholds.json"])
        self.assertEqual((d.action, d.hits), ("hold", ["pipeline/refresh/thresholds.json"]))

    def test_failed_when_any_job_is_not_success(self):
        self.assertEqual(run_decide(jobs={**GREEN, "e2e": "failure"}).action, "failed")
        self.assertEqual(run_decide(jobs={"pipeline": "success", "web": "success"}).action, "failed")
        self.assertEqual(run_decide(run_conclusion="cancelled").action, "failed")

    def test_skip_without_label(self):
        # 運営者や Unit の PR はラベルを持たない。自動ではマージしない
        self.assertEqual(run_decide(labels=[]).action, "skip")

    def test_skip_when_ci_is_for_an_older_commit(self):
        self.assertEqual(run_decide(pr_head="def").action, "skip")

    def test_skip_closed(self):
        self.assertEqual(run_decide(state="MERGED").action, "skip")

    def test_hold_wins_over_merge_only_after_ci_passes(self):
        # 基準に触れていても CI が落ちていれば「落ちた」を先に出す（直すべきはそちら）
        d = run_decide(hits=["web/e2e/x.spec.ts"], jobs={**GREEN, "web": "failure"})
        self.assertEqual(d.action, "failed")


class Targets(unittest.TestCase):
    """どの PR を、どの CI の実行で判定するか。"""

    def setUp(self):
        self.calls = []
        self.orig = automerge.gh

    def tearDown(self):
        automerge.gh = self.orig

    def fake_gh(self, runs):
        def gh(*args):
            self.calls.append(args)
            import json

            return json.dumps({"workflow_runs": runs})

        automerge.gh = gh

    def test_ci_completion_judges_its_pull_requests(self):
        wr = {"id": 1, "head_sha": "abc", "pull_requests": [{"number": 7}]}
        self.assertEqual(automerge.targets("o/r", {"workflow_run": wr}), [("7", wr)])

    def test_label_after_ci_uses_the_latest_ci_of_the_head(self):
        run = {"id": 2, "status": "completed", "head_sha": "abc"}
        self.fake_gh([run])
        event = {"pull_request": {"number": 8, "head": {"sha": "abc"}}}
        self.assertEqual(automerge.targets("o/r", event), [("8", run)])
        self.assertIn("head_sha=abc", self.calls[0][1])

    def test_label_before_ci_finishes_waits_for_the_completion(self):
        self.fake_gh([{"id": 3, "status": "in_progress", "head_sha": "abc"}])
        event = {"pull_request": {"number": 9, "head": {"sha": "abc"}}}
        self.assertEqual(automerge.targets("o/r", event), [])


if __name__ == "__main__":
    unittest.main()
