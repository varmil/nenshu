"""`fetch.py` の節の拾い方のテスト（C18・#851）。"""

import io
import unittest
import zipfile

import fetch

SECTION = "jpcrp030000-asr_E04430-000:BasicPolicyOnHumanResourcesStrategyEmployeesEtcTextBlock"

HTML = f"""<html><body>
<ix:nonNumeric name="{fetch.SUSTAINABILITY}" contextRef="FilingDateInstant" escape="true">
<h3>2【サステナビリティに関する考え方及び取組】</h3>
<ix:nonNumeric name="jpcrp030000-asr_E04430-000:StrategyHumanCapitalTextBlock" contextRef="FilingDateInstant" escape="true">
<p>人的資本の戦略。</p>
</ix:nonNumeric>
<p>内側の節の後ろの段落。</p>
</ix:nonNumeric>
<ix:nonNumeric name="{SECTION}" contextRef="FilingDateInstant" escape="true">
<h4>（1）【人材戦略に関する基本方針等】</h4><p>給与の方針。</p>
</ix:nonNumeric>
<ix:nonNumeric name="{fetch.EMPLOYEES}" contextRef="FilingDateInstant" escape="true"><h4>（2）【従業員の状況】</h4></ix:nonNumeric>
</body></html>"""


class TestFind(unittest.TestCase):
    def test_nested_blocks_are_not_cut_at_the_first_close(self):
        found = fetch.find_blocks(HTML)
        [(name, inner)] = found["sustainability"]
        self.assertIn("人的資本の戦略。", inner)
        self.assertIn("内側の節の後ろの段落。", inner, "入れ子の閉じタグで外側を切らない")

    def test_section_is_found_by_suffix(self):
        found = fetch.find_blocks(HTML)
        [(name, inner)] = found["section"]
        self.assertEqual(name, SECTION)
        self.assertIn("給与の方針。", inner)
        self.assertNotIn("従業員の状況", inner)

    def test_section_name_without_employees_etc(self):
        # いすゞは「EmployeesEtc」の付かない名前で付けている
        html = HTML.replace(SECTION, "jpcrp030000-asr_E02143-000:BasicPolicyOnHumanResourcesStrategyTextBlock")
        self.assertIn("section", fetch.find_blocks(html))

    def test_section_inside_employees_block(self):
        # TDK は (1) と (2) を「従業員の状況」の要素1つに入れている
        inner = ("<h3>5【従業員の状況等】</h3><h4>(1)【人材戦略に関する基本方針等】</h4>"
                 "<p>給与は役割で決めます。</p><h4>(2)【従業員の状況】</h4><table><tr><td>1</td></tr></table>")
        html = f'<ix:nonNumeric name="{fetch.EMPLOYEES}" escape="true">{inner}</ix:nonNumeric>'
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("XBRL/PublicDoc/0104010_honbun_ixbrl.htm", html)
        [item] = fetch.extract(buf.getvalue())["section"]
        self.assertTrue(item["element"].startswith("fallback:"))
        self.assertEqual(item["html"], "<h4>(1)【人材戦略に関する基本方針等】</h4><p>給与は役割で決めます。</p>")

    def test_extract_reads_public_doc_only(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("XBRL/PublicDoc/0104010_honbun_ixbrl.htm", HTML)
            z.writestr("XBRL/AuditDoc/audit_ixbrl.htm", HTML)
        out = fetch.extract(buf.getvalue())
        self.assertEqual(len(out["section"]), 1)
        self.assertEqual(out["section"][0]["file"], "0104010_honbun_ixbrl.htm")
        self.assertEqual(set(out), {"section", "sustainability", "employees"})


if __name__ == "__main__":
    unittest.main()
