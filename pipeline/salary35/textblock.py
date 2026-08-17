"""従業員の状況テキストブロックから平均年収・平均年齢を拾う。

上場していない有報提出会社（みずほ銀行・三井住友銀行・三菱UFJ銀行のような
持株会社傘下の事業会社）は、平均年間給与を個別のXBRL要素でタグ付けせず、
「従業員の状況」テキストブロックの表に書いているだけのことがある。
CSV変換後は表のセルが区切りなしで連結されるので、見出しの並びを読んでから
数値を順に食う。

書式は会社ごとに揺れる。単位が見出し側にあるもの（…平均年間給与(千円)）、
値側にあるもの（9,338千円）、従業員数に臨時従業員が括弧書きで付くもの、
平均年齢が「41歳2月」と年月で書かれるものがある。順に試して、
最初に妥当性検査を通ったものを採る。

誤読を防ぐため、拾った従業員数をXBRLでタグ付けされた単体従業員数と
突き合わせ、食い違えば捨てる。
"""

import re

INT = r"\d{1,3}(?:,\d{3})*"
# 従業員数のあとに臨時従業員が (1,597) や ［  124］ のように付くことがある
EMP = INT + r"(?:[\s　]*[(（\[［][\s　\d,]+[)）\]］])?"

AGE_MIN, AGE_MAX = 18.0, 70.0
SALARY_MIN, SALARY_MAX = 1_000_000, 60_000_000


def _labels(dp):
    d = r"\d{1,2}\.\d{%d}" % dp
    return [
        (re.compile(r"従業[員業]数\s*[(（][人名][)）]"), ("employees", EMP)),
        (re.compile(r"平均年[齢令]\s*[(（][歳才][)）]"), ("age", d)),
        (re.compile(r"平均勤続年数\s*[(（]年[)）]"), ("tenure", d)),
        (re.compile(r"平均年間給与\s*[(（]千円[)）]"), ("salary_k", INT)),
        (re.compile(r"平均年間給与\s*[(（]円[)）]"), ("salary_y", INT)),
        (re.compile(r"平均年間給与の対前[事業]*年度*増減率\s*[(（][％%][)）]"),
         ("delta", r"[-△▲]?\d{1,3}\.\d{1,2}")),
    ]


def _num(v):
    return float(re.sub(r"[(（\[［].*", "", v).replace(",", "").strip()) if v else None


def _validate(age, salary, employees, expect_employees, tenure=None):
    if not (age and salary):
        return False
    if not (AGE_MIN <= age <= AGE_MAX):
        return False
    if not (SALARY_MIN <= salary <= SALARY_MAX):
        return False
    # 勤続年数は年齢を超えられない。桁の切り方を誤るとここに引っかかる
    if tenure is not None and not (0 <= tenure <= age - 15):
        return False
    # ある程度の人数がいる会社で2,500万円を超えるのは、まず読み違え
    if employees and employees >= 50 and salary > 25_000_000:
        return False
    if expect_employees and employees:
        if abs(employees - expect_employees) > max(1, expect_employees * 0.02):
            return False
    return True


def _headers(segment, labels):
    found = []
    for pattern, spec in labels:
        for m in pattern.finditer(segment):
            found.append((m.start(), m.end(), spec))
    found.sort()
    # 「平均年間給与」と「…の対前年度増減率」は範囲が重なるので長いほうを残す
    out = []
    for start, end, spec in found:
        if out and start < out[-1][1]:
            if end - start > out[-1][1] - out[-1][0]:
                out[-1] = (start, end, spec)
            continue
        out.append((start, end, spec))
    return out


def _parse_headered(text, expect_employees, dp, skip_employees):
    labels = _labels(dp)
    for m in re.finditer(r"平均年間給与", text):
        head_start = max(0, m.start() - 130)
        head = text[head_start:m.start() + 60]
        cols = _headers(head, labels)
        if not any(k in ("salary_k", "salary_y") for _, _, (k, _) in cols):
            continue
        if skip_employees:
            cols = [c for c in cols if c[2][0] != "employees"]
            if not cols:
                continue
        body = text[head_start + cols[-1][1]:][:240]
        pos, got = 0, {}
        for _, _, (key, pat) in cols:
            mm = re.compile(r"[\s　]*(" + pat + r")").match(body, pos)
            if not mm:
                got = None
                break
            got[key] = mm.group(1)
            pos = mm.end()
        if not got:
            continue
        employees = _num(got.get("employees"))
        age = _num(got.get("age"))
        salary = (_num(got["salary_k"]) * 1000 if "salary_k" in got
                  else _num(got.get("salary_y")))
        tenure = _num(got.get("tenure"))
        if _validate(age, salary, employees, expect_employees, tenure):
            return {"avg_salary": salary, "avg_age": age,
                    "avg_tenure": tenure,
                    "employees_parsed": employees or expect_employees,
                    "source": f"headered/dp{dp}{'/noemp' if skip_employees else ''}"}
    return None


# 単位が値の側に付く書式: 28,030人 41歳 2月 17年 6月 9,338千円
INLINE = re.compile(
    r"従業[員業]数\s*平均年[齢令]\s*平均勤続年数\s*平均年間給与[^\d]{0,40}?"
    r"(" + INT + r")\s*人"
    r"[\s　]*(\d{1,2})\s*歳(?:[\s　]*(\d{1,2})\s*[ヶかケ]?月)?"
    r"[\s　]*(\d{1,2})\s*年(?:[\s　]*(\d{1,2})\s*[ヶかケ]?月)?"
    r"[\s　]*(" + INT + r")\s*(千円|円)"
)


def _parse_inline(text, expect_employees):
    for m in INLINE.finditer(text):
        emp = _num(m.group(1))
        age = float(m.group(2)) + (float(m.group(3)) / 12 if m.group(3) else 0)
        tenure = float(m.group(4)) + (float(m.group(5)) / 12 if m.group(5) else 0)
        salary = _num(m.group(6)) * (1000 if m.group(7) == "千円" else 1)
        if _validate(age, salary, emp, expect_employees, tenure):
            return {"avg_salary": salary, "avg_age": round(age, 1),
                    "avg_tenure": round(tenure, 1),
                    "employees_parsed": emp, "source": "inline"}
    return None


def parse(text, expect_employees=None):
    """テキストブロックから平均年収・平均年齢・平均勤続年数を返す。"""
    if not text:
        return None
    for dp in (1, 2):
        for skip in (False, True):
            got = _parse_headered(text, expect_employees, dp, skip)
            if got:
                return got
    return _parse_inline(text, expect_employees)
