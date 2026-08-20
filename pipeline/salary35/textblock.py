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
EMP = INT + r"(?:[\s　]*[(（\[［〔][\s　\d,－-]+[)）\]］〕])?"

AGE_MIN, AGE_MAX = 18.0, 70.0
SALARY_MIN, SALARY_MAX = 1_000_000, 60_000_000


def _labels(age_dp, ten_dp=None):
    """`age_dp` / `ten_dp` は年齢・勤続の小数桁数。

    **別々に指定できる必要がある。** 区切りの無いセルでは
    `34.09.924,320,256` が「34.0 / 9.9 / 24,320,256」とも
    「34.0 / 9.92 / 4,320,256」とも読める（コメリ2017年）。前者は年齢と勤続で
    桁数が揃うが、正しいのは後者である（翌年が406万円）。
    """
    ten_dp = age_dp if ten_dp is None else ten_dp
    d = r"\d{1,2}\.\d{%d}" % age_dp
    dt = r"\d{1,2}\.\d{%d}" % ten_dp
    return [
        (re.compile(r"従業[員業]数\s*[(（][人名][)）]"), ("employees", EMP)),
        (re.compile(r"平均年[齢令]\s*[(（][歳才][)）]"), ("age", d)),
        (re.compile(r"平均勤続年数\s*[(（]年[)）]"), ("tenure", dt)),
        (re.compile(r"平均年間給与\s*[(（]千円[)）]"), ("salary_k", INT)),
        (re.compile(r"平均年間給与\s*[(（]円[)）]"), ("salary_y", INT)),
        (re.compile(r"平均年間給与の対前[事業]*年度*増減率\s*[(（][％%][)）]"),
         ("delta", r"[-△▲]?\d{1,3}\.\d{1,2}")),
    ]


def _num(v):
    """先頭の数値だけを取る。「1,155名」「5,795千円」のように単位が値の側に
    付く書式があるので、括弧や単位を落としてから float にする。"""
    if not v:
        return None
    m = re.match(r"[\s　]*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)", v)
    return float(m.group(1).replace(",", "")) if m else None


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



# --- 値の側に単位が付く書式（2017〜2018年の有報に多い） -------------------
#
# 2019年より前は平均年間給与の XBRL 要素そのものが無く、全社を本文から拾う。
# その本文の表は、単位を見出しではなく値に付けることが多い。
#
#   従業員数（人）平均年齢平均勤続年数平均年間給与（円）261(440)40.6歳13年6ケ月7,463,281
#
# 年齢・勤続が「13年6ケ月」と年＋月で書かれる点が既存の書式と決定的に違う
# （小数ではないので `\d{1,2}\.\d{n}` に当たらない）。2017・2018の抽出失敗
# 768件のうち722件＝94%がこの一形態だった。
#
# **既存のパスの後ろに足す。** 先に置くと現行年の読み方が変わりうるが、
# 後ろなら既に成功している書類には触れない（2026年は全社成功しているので、
# spec AC-3 の突き合わせは構造的に壊れない）。

FULLWIDTH_DIGITS = str.maketrans("０１２３４５６７８９", "0123456789")


def _labels_valueunit(dp, expect_employees=None):
    """単位が値の側に付く表。見出しは括弧付きでも裸でもよい。

    `expect_employees` を渡すと従業員数の桁を XBRL の値に固定する。
    `9138歳4ヶ月` のような並びは `91|38歳4ヶ月` とも `913|8歳4ヶ月` とも読め、
    貪欲に読むと後者になって年齢8歳で妥当性検査に落ちる。
    """
    unit = r"[\s　]*[(（][^)）]{0,6}[)）]"
    emp = EMP
    if expect_employees:
        n = int(expect_employees)
        emp = f"(?:{n:,}|{n})"
    # 「1,568人〔129人〕」のように単位が括弧の前にも後にも来る
    emp += (r"(?:[\s　]*[人名])?"
            r"(?:[\s　]*[(（\[［〔][\s　\d,－\-人名]*[)）\]］〕])?"
            r"(?:[\s　]*[人名])?")
    age = (r"(?:\d{1,2}\.\d{%d}[\s　]*[歳才]?"
           r"|\d{1,2}[\s　]*[歳才][\s　]*(?:\d{1,2}[\s　]*[ヶケかカ箇ヵ]?月)?)" % dp)
    ten = (r"(?:\d{1,2}\.\d{%d}[\s　]*年?"
           r"|\d{1,2}[\s　]*年[\s　]*(?:\d{1,2}[\s　]*[ヶケかカ箇ヵ]?月)?)" % dp)
    return [
        (re.compile(r"従業[員業]数(?:" + unit + r")?"), ("employees", emp)),
        (re.compile(r"平均年[齢令](?:" + unit + r")?"), ("age", age)),
        (re.compile(r"平均勤続年数(?:" + unit + r")?"), ("tenure", ten)),
        (re.compile(r"平均年間給与\s*[(（]千円[)）]"), ("salary_k", INT)),
        (re.compile(r"平均年間給与\s*[(（]円[)）]"), ("salary_y", INT)),
        # 単位も値の側にある書式: …平均年間給与 158(78)人 40才3ヵ月 15年0ヵ月 5,795千円
        (re.compile(r"平均年間給与"), ("salary_u", INT + r"[\s　]*(?:千円|円)")),
    ]


def _num_unit(v):
    """「13年6ケ月」「40.6歳」「39歳9ヶ月」を年の小数にする。"""
    if not v:
        return None
    v = re.sub(r"[(（\[［〔].*", "", v).replace(",", "").strip()
    m = re.match(r"(\d{1,2})[\s　]*[歳才年][\s　]*(\d{1,2})[\s　]*[ヶケかカ箇ヵ]?月", v)
    if m:
        return round(int(m.group(1)) + int(m.group(2)) / 12, 2)
    m = re.match(r"(\d{1,2}(?:\.\d+)?)", v)
    return float(m.group(1)) if m else None

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



def _contiguous(head, cols):
    """**給与の列を起点に、見出しが途切れないところまで前後へ広げる。**

    同じ表の見出しは連続している。見出しと見出しのあいだに数字が挟まっていれば、
    そこで値の行が始まっていて、その先（手前）の見出しは別の表のものである。

    起点を `cols[0]` にしてはいけない。散文中の「…記載されている従業員数は」の
    ような語も見出しとして拾われるため、先頭から広げると1列目で切れて表ごと
    落とす（実際にぴあ等がこれで落ちていた）。**給与から広げれば、給与を含む
    表の見出し行だけが残る。**
    """
    idx = [i for i, (_, _, (k, _)) in enumerate(cols)
           if k in ("salary_k", "salary_y", "salary_u")]
    if not idx:
        return []
    at = idx[-1]

    def broken(prev, cur):
        # 「(注)1」のような脚注番号は見出し行の一部で、値の行ではない
        gap = re.sub(r"[(（]?[注※][)）]?[0-9０-９]*", "", head[prev[1]:cur[0]])
        return bool(re.search(r"\d", gap))

    lo = at
    while lo > 0 and not broken(cols[lo - 1], cols[lo]):
        lo -= 1
    hi = at
    while hi + 1 < len(cols) and not broken(cols[hi], cols[hi + 1]):
        hi += 1
    return cols[lo:hi + 1]


def _parse_headered(text, expect_employees, skip_employees, anchor_employees=False):
    """見出しの並びを読んでから値を順に食う。

    `anchor_employees` は、従業員数の桁を XBRL 側の値に固定して読む。
    CSV変換後の表はセルが区切りなしで連結されるため、`4639.32.46,469` のような
    数字の並びは `46|39.3|2.4|6,469` とも `463|9.3|2.4|6,469` とも読める。
    貪欲に読むと後者になり、平均年齢9.3歳で妥当性検査に落ちる。単体従業員数が
    XBRL でタグ付けされていれば桁の切り方が一意に決まるので、それを先に試す。

    **小数桁の総当たりは「平均年間給与」の出現ごとに閉じている。** 1つの書類に
    表が複数あることがあり（持株会社の「提出会社の状況」と「最大人員会社の
    状況」など）、出現をまたいで候補を並べると *別の会社の値* が候補に混ざる。
    候補は同じ表の読み方の違いだけを指していなければならない。
    """
    if anchor_employees and not expect_employees:
        return None
    for m in re.finditer(r"平均年間給与", text):
        found = [_read_at(text, m, expect_employees, skip_employees,
                          anchor_employees, a, t) for a, t in DP_PAIRS]
        got = _best(found)
        if got:
            return got
    return None


def _read_at(text, m, expect_employees, skip_employees, anchor_employees, dp, ten_dp):
    """「平均年間給与」の1つの出現について、指定の小数桁で1通りだけ読む。"""
    labels = _labels(dp, ten_dp)
    if anchor_employees:
        n = int(expect_employees)
        exact = f"(?:{n:,}|{n})"
        labels = [
            (pattern, (key, exact + r"(?:[\s　]*[(（\[［〔][\s　\d,－\-]+[)）\]］〕])?"))
            if key == "employees"
            else (pattern, (key, pat))
            for pattern, (key, pat) in labels
        ]
    head_start = max(0, m.start() - 130)
    head = text[head_start:m.start() + 60]
    cols = _contiguous(head, _headers(head, labels))
    if not cols:
        return None
    if skip_employees:
        cols = [c for c in cols if c[2][0] != "employees"]
        if not cols:
            return None
    body = text[head_start + cols[-1][1]:][:240]
    pos, got = 0, {}
    for _, _, (key, pat) in cols:
        mm = re.compile(r"[\s　]*(" + pat + r")").match(body, pos)
        if not mm:
            return None
        got[key] = mm.group(1)
        pos = mm.end()
    employees = _num(got.get("employees"))
    age = _num(got.get("age"))
    tenure = _num(got.get("tenure"))
    salary = (_num(got["salary_k"]) * 1000 if "salary_k" in got
              else _num(got.get("salary_y")))
    if not _validate(age, salary, employees, expect_employees, tenure):
        return None
    return {"avg_salary": salary, "avg_age": age, "avg_tenure": tenure,
            "employees_parsed": employees or expect_employees,
            "source": f"headered/dp{dp}{'' if ten_dp == dp else f't{ten_dp}'}"
                      f"{'/noemp' if skip_employees else ''}"
                      f"{'/anchored' if anchor_employees else ''}"}


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



def _parse_valueunit(text, expect_employees, dp, anchor_employees=False):
    """単位が値の側に付く表を読む。`_parse_headered` と同じ骨格だが、
    年齢・勤続の値が「13年6ケ月」でも取れる点と、全角数字を先に半角へ倒す点が違う。"""
    text = text.translate(FULLWIDTH_DIGITS)
    if anchor_employees and not expect_employees:
        return None
    labels = _labels_valueunit(dp, expect_employees if anchor_employees else None)
    for m in re.finditer(r"平均年間給与", text):
        head_start = max(0, m.start() - 130)
        head = text[head_start:m.start() + 60]
        cols = _contiguous(head, _headers(head, labels))
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
        age = _num_unit(got.get("age"))
        tenure = _num_unit(got.get("tenure"))
        if "salary_k" in got:
            salary = _num(got["salary_k"]) * 1000
        elif "salary_y" in got:
            salary = _num(got["salary_y"])
        else:
            raw = got.get("salary_u") or ""
            salary = (_num(re.sub(r"[\s　]*[千]?円.*", "", raw))
                      * (1000 if "千円" in raw else 1)) if raw else None
        if _validate(age, salary, employees, expect_employees, tenure):
            return {"avg_salary": salary, "avg_age": age, "avg_tenure": tenure,
                    "employees_parsed": employees or expect_employees,
                    "source": f"valueunit/dp{dp}{'/anchored' if anchor_employees else ''}"}
    return None


def parse(text, expect_employees=None):
    """テキストブロックから平均年収・平均年齢・平均勤続年数を返す。"""
    if not text:
        return None
    got = _parse_all(text, expect_employees)
    if got:
        return got
    # 文字間に空白を撒いて字送りしている書類がある（「従  業  員  数  (人)」）。
    # 見出しの正規表現が当たらなくなるので、空白を全部落として引き直す。
    squashed = re.sub(r"[\s　]+", "", text)
    return _parse_all(squashed, expect_employees) if squashed != text else None


# 年齢・勤続の小数桁の組み合わせ。**平均年齢はほぼ必ず小数1桁**なので、
# 給与が同じ候補が複数出たときは年齢1桁のものを先に採る（`_best` は同点なら
# 先に現れたほうを返すので、この並びがそのまま優先順位になる）。
DP_PAIRS = ((1, 1), (1, 2), (2, 2), (2, 1))


def _best(candidates):
    """妥当な候補のうち、`DP_PAIRS` の並びで最初のものを採る。

    **候補が割れたとき、1書類の中だけでは正解を決められない。** 区切りの無い
    セルでは、たとえば次の2つが構造的に同型でありながら正解が逆になる。

      キーエンス2017 `2,12136.112.418,617,851`
        → 勤続12.4 / 給与1,862万（正）  |  勤続12.41 / 給与862万（誤）
      コメリ2017   `4,179(4,046)34.09.924,320,256`
        → 勤続9.9 / 給与2,432万（誤）   |  勤続9.92 / 給与432万（正）

    どちらを採るかは**同じ会社の他の年**を見ないと決まらない。ここでは並び順で
    決め打ちし、割れたことは `candidates` に残して `history.py` が年をまたいで
    選び直す。
    """
    candidates = [c for c in candidates if c]
    if not candidates:
        return None
    best = dict(candidates[0])
    others = sorted({c["avg_salary"] for c in candidates} - {best["avg_salary"]})
    if others:
        best["candidates"] = [best["avg_salary"]] + others
    return best


def _parse_all(text, expect_employees):
    # 従業員数を XBRL の値に固定できるならそれが最も曖昧さが少ないので先に試す。
    got = _parse_headered(text, expect_employees, False, anchor_employees=True)
    if got:
        return got
    for skip in (False, True):
        got = _parse_headered(text, expect_employees, skip)
        if got:
            return got
    got = _parse_inline(text, expect_employees)
    if got:
        return got
    # 単位が値の側に付く書式は最後に試す（既に成功している書類には触れない）
    for dp in (1, 2):
        got = _parse_valueunit(text, expect_employees, dp, anchor_employees=True)
        if got:
            return got
    for dp in (1, 2):
        got = _parse_valueunit(text, expect_employees, dp)
        if got:
            return got
    return None
