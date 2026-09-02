"""要約と分析の機械ゲート。**LLM を呼ばない純関数だけを置く。**

C9（[#241](https://github.com/varmil/nenshu/issues/241)・親 #214・ADR-0015・
`docs/company/spec.md` AC-25〜AC-27）。生成と検証はセッションのエージェントが担うので、
**固定入力でテストできるのはこの層になる**（C6 の `summary/gate.py` と同じ位置づけ）。

**規格が2つあるので、ゲートも2つある**（ADR-0015 決定1）。

| | 要約 | 分析 |
| --- | --- | --- |
| 評価語 | **落とす**（C6 の表をそのまま使う） | **通す**（これが本体） |
| 社名 | **通す**（50回目に外した。下記） | 通す（地の文なので「同社は」等が自然） |
| 算用数字 | **個数に上限**（50回目に足した）。通すものも**原文に無い数は落とす** | **個数に上限**（ADR-0015 決定2） |
| 原文に無い固有名詞 | 落とす | **見ない** |

**要約で社名を落とすのは 50回目にやめた**（運営者の指示）。C6 から引き継いだ規則で、
理由は「h1 に社名が出ているから繰り返さない」という表示上のものだったが、
**`name_tokens` は社名の語を含む子会社名・ブランド名・サービス名まで巻き込む**——
いちご（16回目）は理念と投資法人の名前が、太陽ホールディングス（21回目）は太陽ファルマが、
富士通ゼネラル・楽天市場・中部電力ミライズ・タカラトミーアーツ（33回目）はその名前自体が、
東急（50回目）は東急電鉄・東急バスが書けなかった。**要約の規格が「何をしている会社か」を
固有名詞で書く形に変わった以上、この規則は害のほうが大きい。** 社名が原文に無ければ
`unsupported_terms` が落とすので、**書けるのは原文にある呼び方だけ**という線は残る。

**分析で固有名詞を見ないのは、外部の文書も材料だからである。** 有報の原文だけと突き合わせると、
公式サイトやリリースから採った正しい語がすべて「原文に無い」になる。**埋め合わせは検証パスの
側にあり、生成が挙げた URL を実際に取りに行って突き合わせる**（AC-27）。ここで「通った」ことは
**規格に収まっていること**であって、材料から導けることではない。
"""

import importlib.util
import re
import unicodedata
from pathlib import Path


def _load(name, path):
    """ファイルを名指しでモジュールとして読む。

    **`sys.path` を足して `import gate` と書くことはできない。** このファイル自身が
    `gate` なので、既に `sys.modules` に入っている自分が返り、初期化の途中で
    `AttributeError` になる（実際になった）。名前を変えて逃げるより、**どのファイルを
    読んでいるかを名指しするほうが、2つの `gate.py` がある事情に対して正直である。**
    """
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


summary_gate = _load("summary_gate", Path(__file__).resolve().parent.parent / "summary" / "gate.py")

# C6 と共有するもの。**書き写さない**——評価語の表や字形のそろえ方が2か所に分かれると、
# 要約の規格だけが片方で古くなる。
JUDGEMENT_WORDS = summary_gate.JUDGEMENT_WORDS
width = summary_gate.width
sentences = summary_gate.sentences
unsupported_terms = summary_gate.unsupported_terms
_fold = summary_gate._fold

# 規格。**暫定値はパイロットで決め直す**（design.md に実測を残す）。
SUMMARY_MIN_LEN, SUMMARY_MAX_LEN = 200, 700
SUMMARY_MIN_SENTENCES, SUMMARY_MAX_SENTENCES = 3, 10
HEADLINE_MIN_LEN, HEADLINE_MAX_LEN = 12, 75
ANALYSIS_MIN_LEN, ANALYSIS_MAX_LEN = 120, 500
ANALYSIS_MIN_SENTENCES, ANALYSIS_MAX_SENTENCES = 3, 10

# 分析に含めてよい算用数字の個数（見出しと本文の合計）。**#214 の良い例5つは0〜2個**で、
# 「半減」「増収増益」「2割」のように語で言えるものを語で言うと数値が要らなくなる。
#
# **3にしたのはパイロットの実測から**（design.md）。#214 の5例は「一言＋短い裏づけ」の
# 63〜90字で、ここで書く本文は3観点まで含めて約250字——**3倍の長さに同じ上限を当てると、
# 数を漢数字で書いて逃げる**という別の歪みが出た（実際に1社で出た）。8社の実測は1〜3個で、
# 3で頭打ちになる。
#
# **50回目に5へ緩めた**（ADR-0016）。分析が推測まで踏み込む形になり、**時点を名指しする
# 必要が出た**——「2024年11月の公募増資で得た資金が手元にある」は日付だけで2個を使う。
# **「数値は脇役」は変わっていない**ので、少ないほど良いことに変わりはない。
MAX_ANALYSIS_DIGITS = 5

# 要約に含めてよい算用数字の個数。**50回目に足した**（運営者の指示で要約の規格を
# 「当期の業績はどうだったか」から「この会社は何をしている会社か」へ改めたときに、
# 数を機械で落とせるようにした）。
#
# **改める前の316社の実測は中央27個**で、168社（53.2%）が「当連結会計年度の売上高は…」で
# 始まっていた。**改めた後の6社は0〜1個**（唯一の1個は「2050年カーボンニュートラル」）。
# **2にしたのはその間を取ったのではなく、1では偶然に落ちるからである**——年号・設立年・
# 拠点数のような、量を並べているわけではない数字が1つ2つ混じるのは自然で、3つ並べば
# それは業績の列挙に戻っている。**カギ括弧の中は数えない**ので `一太郎2025` は名前のまま。
MAX_SUMMARY_DIGITS = 2

_DIGIT_RUN = re.compile(r"[0-9０-９][0-9０-９,，．.]*")
_URL = re.compile(r"^https?://[^\s]+$")
# 固有名詞を囲むカギ括弧。**有報もこのプロンプトも、製品名・ブランド名・計画名を
# カギ括弧で書く**（`「変革2030」`・`「S!mplus」`・`「AUREME」`）。
# **二重カギ括弧も同じ。** 作品名は有報がこちらで書く（`『ストリートファイター6』`）。
_QUOTED = re.compile(r"「[^」]*」|『[^』]*』")


def digit_runs(text):
    """量を述べているアラビア数字の並び。

    **英字に隣り合うものは語の一部として見逃す**（`3PL`・`Web3`。C6 が同じ判定を持つ）。

    **カギ括弧の中も数えない。** 固有名詞に数字が入っている型——中期経営計画
    `「変革2030」`、家電の `「S!mplus」`、ロボットの `「R-2000シリーズ」`——は珍しくなく、
    **数えると「具体的に書くほど上限に食い込む」**という逆向きの圧力になる。上限が
    止めたいのは**量を並べること**であって、名前を出すことではない。
    """
    folded = _fold(text or "")
    # カギ括弧の中を同じ長さの伏字にする。**消さずに置き換える**——位置がずれると
    # 英字の隣り合わせの判定が狂う。
    folded = _QUOTED.sub(lambda m: "〓" * len(m.group(0)), folded)
    out = []
    for m in _DIGIT_RUN.finditer(folded):
        run = m.group(0).rstrip(",.，．")
        if not run:
            continue
        before = folded[m.start() - 1] if m.start() else ""
        after = folded[m.end()] if m.end() < len(folded) else ""
        if (before.isascii() and before.isalpha()) or (after.isascii() and after.isalpha()):
            continue
        out.append(run)
    return out


def _bare(run):
    return run.replace(",", "").replace("，", "")


def unsupported_numbers(text, source):
    """要約にあって原文に無い数。**要約は原文に書いてある事実だけなので、原文に無い数は
    そこで作られたものになる。**

    比べるのは桁区切りを落とした並び。原文が `1,234` と書き要約が `1234` と書いても
    同じものと見る。**分析では使わない**——あちらは外部の文書と同じページの数値も材料に
    するので、有報の原文に無いことが誤りを意味しない。
    """
    src = _fold(source or "")
    src_bare = _bare(src)
    out = []
    for run in digit_runs(text):
        if _bare(run) in src_bare or run in src:
            continue
        if run not in out:
            out.append(run)
    return out


def summary_sentence_problems(sentence, source):
    """要約の1文の違反。**空なら通す。**

    **社名は見ない**（50回目に外した。理由は冒頭の表の下）。
    """
    bad = []
    for word in JUDGEMENT_WORDS:
        if word in sentence:
            bad.append(f"評価語: {word}")
            break
    terms = unsupported_terms(sentence, source)
    if terms:
        bad.append("原文に無い固有名詞: " + "・".join(terms[:3]))
    nums = unsupported_numbers(sentence, source)
    if nums:
        bad.append("原文に無い数値: " + "・".join(nums[:3]))
    return bad


def apply_summary_gate(summary, source, max_digits=MAX_SUMMARY_DIGITS):
    """要約に機械ゲートを当てる。`(通った要約, 落とした理由の並び)` を返す。

    **文ごとに落とし、残りで全体を見る**（C6 と同じ順序）。1文だけが原文から離れている型を、
    要約ごと捨てずに済む。

    **数値の個数だけは文ごとに落とせない**——どの文を落とすかを機械では決められないので、
    字数・文数と同じ段で見て、超えていれば要約ごと返す（書き直しになる）。
    """
    reasons = []
    kept = []
    for s in sentences(summary):
        bad = summary_sentence_problems(s, source)
        if bad:
            reasons.append("文を落とした（" + " / ".join(bad) + "）")
        else:
            kept.append(s)

    if not kept:
        return "", reasons or ["要約が空"]
    text = "".join(kept)
    if not (SUMMARY_MIN_SENTENCES <= len(kept) <= SUMMARY_MAX_SENTENCES):
        reasons.append(f"文数が範囲外: {len(kept)}文")
        return "", reasons
    w = width(text)
    if not (SUMMARY_MIN_LEN <= w <= SUMMARY_MAX_LEN):
        reasons.append(f"字数が範囲外: 全角{w}字")
        return "", reasons
    digits = digit_runs(text)
    if len(digits) > max_digits:
        reasons.append(f"数値が多い: {len(digits)}個（上限{max_digits}）"
                       f" — {'・'.join(digits[:5])}")
        return "", reasons
    return text, reasons


def source_problems(sources):
    """出典の形式。**中身が取れるかは見ない**（検証パスが実際に取りに行く）。"""
    bad = []
    for i, s in enumerate(sources or []):
        url = (s or {}).get("url", "") if isinstance(s, dict) else str(s)
        if not _URL.match(url or ""):
            bad.append(f"出典[{i}]がURLでない: {url[:40]}")
    return bad


def apply_analysis_gate(headline, analysis, sources, max_digits=MAX_ANALYSIS_DIGITS):
    """分析に機械ゲートを当てる。`(通った見出し, 通った本文, 落とした理由の並び)` を返す。

    **文ごとには落とさない。** 要約と違い、分析は一言と地の文が1つの筋で繋がっているので、
    途中の1文を抜くと残りが宙に浮く。**落とすときは分析ごと落とす。**

    **評価語を数えない**——それが本体である（ADR-0015 決定1）。代わりに見るのは
    **算用数字の個数**で、これが「数値は脇役」を機械で落とせる形になっている。
    """
    reasons = []
    headline = (headline or "").strip()
    analysis = (analysis or "").strip()
    if not headline or not analysis:
        return "", "", ["分析が空"]

    hs = sentences(headline)
    if len(hs) != 1:
        reasons.append(f"見出しが1文でない: {len(hs)}文")
    hw = width(headline)
    if not (HEADLINE_MIN_LEN <= hw <= HEADLINE_MAX_LEN):
        reasons.append(f"見出しの字数が範囲外: 全角{hw}字")

    bs = sentences(analysis)
    if not (ANALYSIS_MIN_SENTENCES <= len(bs) <= ANALYSIS_MAX_SENTENCES):
        reasons.append(f"本文の文数が範囲外: {len(bs)}文")
    bw = width(analysis)
    if not (ANALYSIS_MIN_LEN <= bw <= ANALYSIS_MAX_LEN):
        reasons.append(f"本文の字数が範囲外: 全角{bw}字")

    digits = digit_runs(headline) + digit_runs(analysis)
    if len(digits) > max_digits:
        reasons.append(f"数値が多い: {len(digits)}個（上限{max_digits}）"
                       f" — {'・'.join(digits[:5])}")

    reasons += source_problems(sources)

    if reasons:
        return "", "", reasons
    return headline, analysis, reasons


# --- 数値の裏付けの照合（AC-26） -------------------------------------------------
#
# **機械でやれるのは「言い切った変化率」の型だけである。** 分析の主張一般は突き合わせ
# られない——「規模を追う段階は終えた」に対応する数字は無い。**できないことをゲートに
# 書くと、通ったことが保証にならない**ので、範囲をここに明示しておく。
#
# 見るのは「N年で M% 上がった／下がった」の1つの型。ADR-0015 が名指ししているのは
# ファナックの「平均年収は10年で13%下がっている」で、`history.json` が支持するかを
# 向きと桁で確かめられる。
_TREND = re.compile(
    r"(?P<years>[0-9０-９]{1,2})\s*年(?:間)?で"
    r"(?:およそ|約)?\s*(?P<pct>[0-9０-９]{1,3}(?:[.．][0-9０-９])?)\s*[%％]"
    r"[^。]{0,12}?(?P<dir>下が|落ち|減|上が|伸び|増)"
)
_DOWN = ("下が", "落ち", "減")

# 許容。**桁が合っていることを見るのであって、小数第1位まで合わせにいかない**——
# 生成は丸めて書くし、基準年の取り方でも数ポイント動く。
TREND_TOLERANCE_POINTS = 6.0


def trend_claims(text):
    """「N年で M% 上がった／下がった」の主張。`(年数, 率, 向き)` の並び。"""
    out = []
    for m in _TREND.finditer(text or ""):
        years = int(unicodedata.normalize("NFKC", m.group("years")))
        pct = float(unicodedata.normalize("NFKC", m.group("pct")).replace("．", "."))
        down = m.group("dir") in _DOWN
        out.append((years, pct, "down" if down else "up"))
    return out


def check_trend_claims(text, series, tolerance=TREND_TOLERANCE_POINTS):
    """主張を `series`（`{年: 値}`。欠測は入れない）と突き合わせる。**支持されない主張だけ返す。**

    **照合できないときは黙って通す**——系列にその年が無い会社で「照合できない」を
    「誤り」と数えると、10年ぶんを持たない会社の分析が理由なく落ちる。
    """
    bad = []
    if not series:
        return bad
    series = {int(y): v for y, v in series.items() if v}
    if not series:
        return bad
    latest = max(series)
    for n, pct, direction in trend_claims(text):
        # **「10年で」は基準年が1つに決まらない。** 2017〜2026 の10年ぶんを持つ会社で
        # 「10年で」と書けば、ふつう端から端（2017→2026＝差は9年）を指す。差を10年と
        # 取れば基準は2016年になる。**日本語の側があいまいなので、どちらでも支持されれば
        # 通す**——片方に決め打ちすると、正しい主張を年の数え方だけで落とすことになる。
        candidates = [latest - n, latest - n + 1]
        seen = [(base, series[base]) for base in candidates if base in series]
        if not seen:
            continue
        deltas = [(series[latest] - v) / v * 100.0 for _, v in seen]
        if any(("down" if d < 0 else "up") == direction and abs(abs(d) - pct) <= tolerance
               for d in deltas):
            continue
        actual = deltas[0]
        if ("down" if actual < 0 else "up") != direction:
            bad.append(f"{n}年で{pct}%{'減' if direction == 'down' else '増'}"
                       f"と書いたが、実際は{actual:+.1f}%")
        else:
            bad.append(f"{n}年で{pct}%と書いたが、実際は{abs(actual):.1f}%")
    return bad
