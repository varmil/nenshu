"""説明文の機械ゲート。**原文から導けない文をここで落とす。**

C6（[#160](https://github.com/varmil/nenshu/issues/160)・親 #158・ADR-0010 決定2・
`docs/company/spec.md` AC-19）。**LLM を呼ばない純関数だけを置く**——生成と検証は
セッションのエージェントが担うので、**固定入力でテストできるのはこの層になる。**

判定の順序は「文ごとに落とす → 残りで全体を見る」。

1. 説明文を文に分ける
2. **文ごと**に、社名・数値・評価語・原文に無い固有名詞を見て、違反する文を落とす
3. 残った文で文数（2〜3）と字数（全角60〜130）を見る。外れたら不合格

**文ごとに落とすのは AC-3 がそう決めているため。** 1文だけが原文から離れている型
（キーエンスの「自社工場を持たないファブレス体制」）を、説明文ごと捨てずに済む。
落とした結果2文に満たなくなれば、そこで初めて不合格になる。
"""

import re
import unicodedata

# 評価語。**原文に書いてあっても書かない**（ADR-0010 決定2）。記述ではなく評価だから。
JUDGEMENT_WORDS = (
    "最大手", "最大級", "日本初", "世界初", "国内初", "業界初",
    "トップシェア", "シェアトップ", "首位", "有数", "屈指", "随一", "リーディング",
    "ナンバーワン", "No.1", "ＮＯ．１", "優れた", "優位", "強みと", "高い収益性",
    # **同じ語の別の形が2回すり抜けた。** 「強みと」だけを持っていたので
    # 「強みである有機合成技術」（42回目・住友化学）が素通りし、検証パスに拾われた。
    "強みである", "強みを持つ", "強みとする",
    # **語形が違うだけの言い換えも入れる。** 「収益性の高い事業」が素通りして
    # 検証パスに拾われた（C9 の15回目・サイバーエージェント）。
    "収益性の高い",
    "高収益", "高い技術力", "高品質", "先進的", "業界をリード", "急成長", "躍進",
    "老舗", "名門", "革新的", "画期的", "独創的", "圧倒的",
)

# 数の混入。見るのは spec 1.18 が挙げる型（順位・年収・従業員数・子会社数）で、
# **「いくつあるか」を数えている数字**が対象になる。
#
# **アラビア数字は、英字に隣り合っていないときだけ数と見る。** `3PL`・`Web3` は
# 原文にある語の一部で量ではない（ロジスティードが `３ＰＬ` で落ちた）。
#
# **漢数字は助数詞が続くときだけ見る。** ただし `つ`・`事業`・`セグメント` は外して
# ある——**「単一セグメント」の「一」を数と見て4社が落ちた**。有報の定型句で、
# 数を述べているわけではない。
_DIGIT_RUN = re.compile(r"[0-9０-９]+")
_KANJI_COUNT = re.compile(
    r"[一二三四五六七八九十百千万]+(?:社|件|名|人|億|兆|拠点|カ国|か国|ヶ国)"
)

# 固有名詞の候補。**原文に現れなければ、その文は原文から導けていない。**
_KATAKANA = re.compile(r"[ァ-ヶー]{4,}")
_LATIN = re.compile(r"[A-Za-zＡ-Ｚａ-ｚ][A-Za-zＡ-Ｚａ-ｚ&.\-]{1,}")
_ORG = re.compile(r"[一-龥ァ-ヶA-Za-z]{2,}(?:株式会社|㈱|ホールディングス|グループ)")

# 社名から落とす語。**「株式会社キーエンス」も「キーエンス」も混入とみなす**ため。
_NAME_NOISE = re.compile(r"株式会社|㈱|合同会社|有限会社|ホールディングス|ＨＤ|グループ本社|グループ")

MIN_LEN, MAX_LEN = 60, 130
MIN_SENTENCES, MAX_SENTENCES = 2, 3


def width(text):
    """全角換算の字数。半角は0.5字として数え、切り上げる。

    規格が「全角60〜130字」（spec 1.18）なので、`len()` で数えると欧文の多い会社
    だけが甘くなる。
    """
    n = 0.0
    for c in text:
        n += 1.0 if unicodedata.east_asian_width(c) in ("W", "F", "A") else 0.5
    return int(n + 0.999)


def sentences(text):
    """文に分ける。区切りは `。`（句点は文の側に残す）。"""
    parts = re.split(r"(?<=。)", (text or "").strip())
    return [p.strip() for p in parts if p.strip()]


def name_tokens(name):
    """社名の当たり判定に使う語。`株式会社キーエンス` から `キーエンス` を作る。"""
    out = {name.strip()} if name and name.strip() else set()
    bare = _NAME_NOISE.sub("", name or "").strip()
    if len(bare) >= 2:
        out.add(bare)
    return {t for t in out if len(t) >= 2}


def _fold(text):
    """突き合わせ用に字形をそろえる。**全角と半角、大文字と小文字を区別しない。**

    有報は略語を全角で書くことが多く（`ＩＴ`・`ＤＸ`・`ＰＦＩ`）、説明文は半角で書く。
    **素で比べると「原文に無い固有名詞」になる**——実測で60社中8社がこれで落ちた
    （野村総合研究所・大林組・ディー・エヌ・エー・リクルートホールディングスほか）。
    どれも原文にある語で、違うのは字形だけだった。
    """
    return unicodedata.normalize("NFKC", text or "").lower()


def unsupported_terms(sentence, source):
    """その文にあって原文に無い固有名詞。**空なら原文の中で説明が付く。**

    カタカナ4文字以上・ラテン文字2文字以上・`◯◯株式会社` の形を見る（AC-3）。
    **一般名詞まで見ない**——「製薬会社」のような言い換えは原文に無くても正しい。
    """
    src = _fold(source)
    found = []
    for pattern in (_KATAKANA, _LATIN, _ORG):
        for m in pattern.finditer(sentence):
            term = m.group(0).rstrip(".-－・")
            if len(term) < 2:
                continue
            if _fold(term) in src or term in found:
                continue
            # **カタカナは原文にある塊の繋ぎ合わせを許す。** 正規表現はカタカナの
            # 連なりを丸ごと1語として拾うので、原文の「インターネット」と「サービス」を
            # 繋いだ「インターネットサービス」まで「原文に無い」になる（ＭＩＸＩが
            # これで落ちた）。**4文字以上の塊で覆えるなら通す**——「ファブレス」は
            # どう切っても原文に無いので落ちたままになる。
            if pattern is _KATAKANA and _covered_by_source(term, src):
                continue
            found.append(term)
    return found


def _covered_by_source(term, src, minimum=4):
    """カタカナの連なりを、原文にある `minimum` 文字以上の塊だけで覆えるか。"""
    i = 0
    while i < len(term):
        for j in range(len(term), i + minimum - 1, -1):
            if _fold(term[i:j]) in src:
                i = j
                break
        else:
            return False
    return True


def quantity_digits(sentence):
    """量を述べているアラビア数字。**英字に隣り合うものは語の一部として見逃す。**"""
    folded = _fold(sentence)
    for m in _DIGIT_RUN.finditer(folded):
        before = folded[m.start() - 1] if m.start() else ""
        after = folded[m.end()] if m.end() < len(folded) else ""
        if (before.isascii() and before.isalpha()) or (after.isascii() and after.isalpha()):
            continue
        return m.group(0)
    return ""


def sentence_problems(sentence, name, source):
    """1文の違反。**空なら通す。**"""
    bad = []
    for token in name_tokens(name):
        if token in sentence:
            bad.append(f"社名: {token}")
            break
    digits = quantity_digits(sentence)
    if digits:
        bad.append(f"数値: {digits}")
    m = _KANJI_COUNT.search(sentence)
    if m:
        bad.append(f"数値: {m.group(0)}")
    for word in JUDGEMENT_WORDS:
        if word in sentence:
            bad.append(f"評価語: {word}")
            break
    terms = unsupported_terms(sentence, source)
    if terms:
        bad.append("原文に無い固有名詞: " + "・".join(terms[:3]))
    return bad


def apply_gate(summary, name, source):
    """機械ゲートを当てる。`(通った説明文, 落とした理由の並び)` を返す。

    通らなかったときの説明文は空文字。**落とした文の理由も残す**——AC-6 が理由ごとの
    件数を求めており、どの規則が効いたのか数えられないと直せない。
    """
    reasons = []
    kept = []
    for s in sentences(summary):
        bad = sentence_problems(s, name, source)
        if bad:
            reasons.append("文を落とした（" + " / ".join(bad) + "）")
        else:
            kept.append(s)

    if not kept:
        return "", reasons or ["説明文が空"]

    text = "".join(kept)
    if not (MIN_SENTENCES <= len(kept) <= MAX_SENTENCES):
        reasons.append(f"文数が範囲外: {len(kept)}文")
        return "", reasons
    w = width(text)
    if not (MIN_LEN <= w <= MAX_LEN):
        reasons.append(f"字数が範囲外: 全角{w}字")
        return "", reasons
    return text, reasons
