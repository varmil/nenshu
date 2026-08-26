"""有報の「事業の内容」テキストブロックを平文に整える。

C5（[#159](https://github.com/varmil/nenshu/issues/159)・親 #158・ADR-0010）。
要約（C6）に渡す原文を作るところまでがこの Unit の範囲で、要約そのものは作らない。

**EDINET の CSV 形式（`type=5`）が返す値には HTML タグが残っていない。** 変換の
段階でブロック要素が畳まれ、表のセルも区切り無しで連結される（`textblock.py` の
注記と同じ性質）。**実測2,960件でタグは0件**、実体参照は239件にあった。
**それでもタグを落とす経路を残してあるのは、原本の XBRL（`type=1`）を読む日が来た
ときに変換の規則を2か所に分けないため。**

**段落の切れ目は全角空白（U+3000）として残る。** 改行はCSVの値に1つも無く
（**実測2,960件で0件**）、日本語の字下げに使われた U+3000 だけがブロックの境目を
示す（24,361か所）。`docs/company/spec.md` AC-18 が「改行は落とさない（段落の
切れ目は要約の入力に効く）」と言っているものは、この形では U+3000 のことになる
——**空白を一律に1個へ潰すと、原文がひと続きの塊のまま渡る。**
"""

import html
import re

# ブロックの終わりは改行に開く。**タグを落とす前に当てる**——先に落とすと
# 段落の境目そのものが消える。
_BLOCK_END = re.compile(
    r"(?i)</(?:p|div|tr|table|li|h[1-6])\s*>|<br\s*/?>|</?\s*(?:p|div|tr|table|li|h[1-6])\s*/>"
)
_TAG = re.compile(r"<[^>]*>")
# 空白として畳む文字。NBSP（U+00A0）と全角空白（U+3000）を含む。
_WS = re.compile(r"[ \t 　\r\n\f\v]+")
# 段落の境目とみなす文字。改行と全角空白。
_BREAK = re.compile(r"[\r\n　]")


def to_plain_text(value):
    """テキストブロックの値を平文にする。

    1. ブロック要素の終わりを改行にしてからタグを落とす
    2. 実体参照を戻す（`&amp;` → `&`）
    3. 連続する空白を1つに畳む。**改行か全角空白を含む並びは改行にする**
    4. 行ごとに前後の空白を落とし、空行を捨てる

    **全角空白を改行に開く代償を承知で採っている。** 開いた24,235か所から40件を
    目視で抜くと、7件は段落ではなく**参照や表のセルの途中**で割れていた
    （`「第５` / `経理の状況` / `１` / `連結財務諸表等」` のように参照が4行になる型が
    大半）。空白1個に潰せばこれらは1行に収まる——**代わりに全社の段落構造が丸ごと
    消える。** 要約（C6）に効くのは段落のほうなので、こちらを採った。
    """
    if not value:
        return ""
    text = _BLOCK_END.sub("\n", str(value))
    text = _TAG.sub("", text)
    text = html.unescape(text)
    out = []
    pos = 0
    for m in _WS.finditer(text):
        out.append(text[pos:m.start()])
        out.append("\n" if _BREAK.search(m.group(0)) else " ")
        pos = m.end()
    out.append(text[pos:])
    lines = [ln.strip() for ln in "".join(out).split("\n")]
    return "\n".join(ln for ln in lines if ln)


def pick(values):
    """同じ要素が複数のファイルに現れたときの採り方。**最も長いものを採る。**

    有報の ZIP には監査報告書（`jpaud-*`）と本表（`jpcrp*`）のCSVが並ぶ。実測では
    「事業の内容」は本表に1件だけだったが、訂正報告や様式違いで2件になったときに
    **走査順で決まる**（`namelist()` の順）ことのないよう規則にしておく。

    **長いほうを採る**のは、2件に割れるとしたら片方は見出しだけの断片になる形が
    考えやすく、断片は要約の材料にならないため。**実測で割れた会社は無い**ので、
    ここは「走査順で決めない」ことのほうが要点になる。
    """
    plain = [to_plain_text(v) for v in values or []]
    plain = [p for p in plain if p]
    if not plain:
        return ""
    return max(plain, key=len)
