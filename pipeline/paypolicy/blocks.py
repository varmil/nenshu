"""節の HTML を「塊」と「文」の列にする（C18・#851）。

**生成AIに文を書かせないための土台。** 生成AIには、ここで番号を振った文の列を見せて
「どの文からどの文までが給与の決定方針か」だけを答えさせる。本文を組み立てるのは
`cut` で、文は原文から機械的に取り出すので、**文が変わることが構造上起きない**。

塊（block）は4種類。

- `title` — 節の見出し（「（１）【人材戦略に関する基本方針等】」）。選ばせない
- `heading` — 会社自身の小見出し。**タグでは判定しない**——h5・h6 を本文の段落に使う
  会社がある（Hamee は本文が h6、日鉄鉱業は長い1文が h5）。句点で終わらない短い行を
  小見出しとみる（`is_heading`）
- `para` — 段落。p 要素（や h 要素）1つが1段落。文に分ける
- `table` — 表。セルの文字列を行ごとに持つ。文には分けない。**1列の表は段落に展開する**（`_unbox`）。
  **結合したセルは `spans` に持つ**（`[行, セル, colspan, rowspan]`。行とセルは `rows` の添字で、
  結合の無い表では鍵ごと無い）。落とすと行ごとにセルが左へ詰まり、列がずれて見える（ソニー
  グループの報酬の表で、株式報酬の内訳の行だけが1列右へずれていた）
- `image` — 画像。文字を持たない。範囲に入ったら数える

**空白の扱い。** HTML のソースの改行は表示では意味を持たないので落とす。`&#160;` は
普通の空白にする。段落の前後の空白（字下げの全角空白を含む）は落とす。段落の中の
全角空白は残す（「② 従業員の給料…方針　当社における…」のように、見出しと本文を
1つの p に全角空白で並べる会社がある）。**空白以外の文字は1字も落とさない**——
`plain_text` と突き合わせるテストで固めている。
"""

import html as _html
import re
from html.parser import HTMLParser

# 小見出しとみる長さの上限。これより長ければ句点が無くても段落として扱う
# （「…従業員持株会向けRSの」のように、行の途中で p を切る会社がある）。
HEADING_MAX = 40

_BLOCK_TAGS = {"p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "div", "blockquote", "dd", "dt"}

# 節の見出し。「人財戦略」と書く会社がある（188件中3件）
_SECTION_TITLE = re.compile(r"【人[材財]戦略に関する基本方針等?】")

# 文の区切りは句点。**括弧の中の句点では切らない**（「…を実施。」と記載、のような引用）。
_OPEN_BRACKETS = "「『（(【［〔"
_CLOSE_BRACKETS = "」』）)】］〕"


# **府令の文言をそのまま見出しにする会社がある**（「②提出会社の従業員の給与（賞与を
# 含む。）その他の給付の額及び内容の決定に関する方針」は45字）。「方針」で終わる行は
# この長さまで小見出しとみる。パイロットでは丸藤シートパイルがこれで本文の先頭に入っていた
POLICY_HEADING_MAX = 80
_CLOSERS = "）)】］〕」』＞>"


def is_heading(text):
    """句点で終わらない短い行を小見出しとみる。"方針" で終わる行は少し長くても小見出し。"""
    t = text.strip()
    if not t or t.endswith(("。", "．")):
        return False
    if len(t) <= HEADING_MAX:
        return True
    return len(t) <= POLICY_HEADING_MAX and t.rstrip(_CLOSERS).endswith("方針")


# 文の途中で p を割る会社がある（ケル「…実現してまいり」／「ます。」、「…等級定義に基づ」／
# 「いた能力…」。690件中62件）。前の段落が長くて句点などで終わらず、次の段落がひらがなで
# 始まるなら、前の段落の続きとみてつなぐ。**文頭によく来る書き出しはつながない**——
# 有報の文でひらがなから始まる文は「これ・この・その・なお・また・さらに」などに偏っていて、
# それをつなぐと別の段落が1つになる（「…人財流出」／「これらのリスクは…」）
_STARTERS = ("これ", "この", "ここ", "こう", "その", "それ", "そこ", "そう", "なお", "また", "まず",
             "さらに", "あわせて", "ただし", "しかし", "したがって", "よって", "つまり", "すなわち",
             "いずれ", "あらゆる", "いわゆる", "わが", "お客", "お取引", "かつて", "いま")
_SENTENCE_END = ("。", "．", "！", "？", "」", "』", "）", ")", "：", ":")
_HIRAGANA = re.compile(r"^[ぁ-ん、。]")


def _continues(text):
    return bool(_HIRAGANA.match(text)) and not text.startswith(_STARTERS)


def _join_broken(blocks):
    out = []
    for b in blocks:
        prev = out[-1] if out else None
        if (prev and prev["kind"] == "para" and b["kind"] == "para"
                and not prev["text"].endswith(_SENTENCE_END) and _continues(b["text"])):
            prev["text"] += b["text"]
            continue
        out.append(b)
    return out


def split_sentences(text):
    """段落を文に分ける。つなぎ直すと元に戻る（区切りの句点は前の文に付ける）。"""
    out, buf, depth = [], [], 0
    for ch in text:
        buf.append(ch)
        if ch in _OPEN_BRACKETS:
            depth += 1
        elif ch in _CLOSE_BRACKETS:
            depth = max(0, depth - 1)
        elif ch == "。" and depth == 0:
            out.append("".join(buf))
            buf = []
    if buf:
        rest = "".join(buf)
        # 句点の後ろに空白だけが残ったら前の文に付ける（新しい文にしない）
        if out and not rest.strip():
            out[-1] += rest
        else:
            out.append(rest)
    return out


class _Parser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks = []
        self.buf = []
        self.table = None  # 表の中なら行の配列。セルは (文字列, colspan, rowspan)
        self.cell = None
        self.span = (1, 1)
        # **表は入れ子になる**（サステナビリティの節で、セルの中に表を置く会社がある）。
        # 内側の表の閉じタグで外側まで閉じると、残りのセルの文字を落とす。内側の表は
        # 外側のセルの文字列に平たく入れる
        self.depth = 0

    # 文字列の正規化は1か所に置く（`plain_text` と同じ規則にするため）
    @staticmethod
    def _norm(data):
        return data.replace("\r", "").replace("\n", "").replace("\xa0", " ")

    def _flush(self):
        text = "".join(self.buf).strip()
        self.buf = []
        if text:
            self.blocks.append({"kind": "para", "text": text})

    def handle_starttag(self, tag, attrs):
        if self.table is not None:
            if tag == "table":
                self.depth += 1
            elif self.depth > 1:
                pass  # 内側の表の行とセルは、外側のセルの中の文字として扱う
            elif tag == "tr":
                self.table.append([])
            elif tag in ("td", "th"):
                self.cell = []
                a = dict(attrs)
                self.span = (_span(a.get("colspan")), _span(a.get("rowspan")))
            elif (tag == "br" or tag in _BLOCK_TAGS) and self.cell is not None:
                # **セルの中の段落の区切りを改行で残す。** 本文を1列の表の中に組む会社がある
                # （ANA。レイアウトのための表）。区切りを落とすと段落が1つの塊になる。
                # 塊の数は変わらないので、判定済みの番号はそのまま使える
                self.cell.append("\n")
            return
        if tag == "table":
            self._flush()
            self.table = []
            self.depth = 1
        elif tag == "img":
            self._flush()
            alt = dict(attrs).get("alt") or ""
            self.blocks.append({"kind": "image", "alt": alt})
        elif tag == "br":
            self.buf.append("\n")
        elif tag in _BLOCK_TAGS:
            self._flush()

    def handle_endtag(self, tag):
        if self.table is not None:
            if tag == "table":
                self.depth -= 1
                if self.depth == 0:
                    table = _table(self.table)
                    if table:
                        self.blocks.append(table)
                    self.table = None
            elif self.depth > 1:
                if tag in ("td", "th") and self.cell is not None:
                    self.cell.append(" ")
            elif tag in ("td", "th") and self.cell is not None:
                if not self.table:
                    self.table.append([])
                text = re.sub(r"[ \t]*\n[\s]*", "\n", "".join(self.cell)).strip()
                self.table[-1].append((text, *self.span))
                self.cell = None
            elif tag in _BLOCK_TAGS and self.cell is not None:
                self.cell.append("\n")
            return
        if tag in _BLOCK_TAGS:
            self._flush()

    def handle_data(self, data):
        data = self._norm(data)
        if self.table is not None:
            if self.cell is not None:
                self.cell.append(data)
            elif data.strip():
                # セルの外の文字（表題など）も落とさない。1セルの行として持つ
                self.table.append([(data.strip(), 1, 1)])
            return
        self.buf.append(data)

    def close(self):
        super().close()
        self._flush()


def _span(value):
    """colspan・rowspan の値。数でなければ・1未満なら1（結合しない）。"""
    try:
        return max(1, int(str(value).strip()))
    except (TypeError, ValueError):
        return 1


def _table(raw):
    """(文字列, colspan, rowspan) の行の列を、表の塊にする。文字の無い行は落とす。

    **行を落とすなら、その行を跨ぐ rowspan を縮める。** 縮めないと、結合したセルが次の行まで
    伸びて列がずれる。**文字の無い行でも、下の行まで伸びるセルを持つなら残す**——落とすと
    そのセルが占めていた場所が詰まる。
    """
    n = len(raw)
    keep = [any(c[0] for c in r) for r in raw]
    for i, r in enumerate(raw):
        if not keep[i] and any(rs > 1 and any(keep[i + 1:i + rs]) for _, _, rs in r):
            keep[i] = True
    rows, spans = [], []
    for i, r in enumerate(raw):
        if not keep[i]:
            continue
        cells = []
        for j, (text, cs, rs) in enumerate(r):
            rs = sum(keep[i:min(n, i + rs)])
            cells.append(text)
            if cs > 1 or rs > 1:
                spans.append([len(rows), j, cs, rs])
        rows.append(cells)
    if not rows:
        return None
    table = {"kind": "table", "rows": rows}
    if spans:
        table["spans"] = spans
    return table


def _unbox(blocks):
    """**1列の表は表ではなく枠。** セルの中の行を段落として並べ直す。

    節の本文を1列の表の中に組む会社がある（ANA・山梨中央銀行は節の文章を1行1列の表に
    入れている）。表のままだと1つの塊になり、人材戦略の文と給与の文を番号で切り分けられない。
    2列以上の表（項目名と中身を並べたもの）は表のまま残す。
    """
    out = []
    for b in blocks:
        # 文字の無い行は数えない（結合したセルを持つので残した空の行が、1列の表を2列に見せる）
        if b["kind"] == "table" and all(len(r) == 1 for r in b["rows"] if any(r)):
            for r in b["rows"]:
                out.extend({"kind": "para", "text": line} for line in r[0].split("\n") if line.strip())
        else:
            out.append(b)
    return out


def parse(html):
    """節の HTML を塊の列にする。段落には文の列（`sentences`）を付ける。"""
    p = _Parser()
    p.feed(html)
    p.close()
    blocks = _unbox(p.blocks)
    for b in blocks:
        if b["kind"] == "para":
            # 段落の中の改行（br）は前後の空白ごと1つに寄せる
            b["text"] = re.sub(r"[ \t]*\n[ \t]*", "\n", b["text"]).strip()
    # 文の途中で割れた p は、小見出しの判定の前につなぐ（割れた前半は長く、句点で終わらない）
    blocks = [dict(b) for b in blocks]
    for b in blocks:
        if b["kind"] == "para" and is_heading(b["text"]):
            b["kind"] = "_short"
    blocks = _join_broken(blocks)
    for i, b in enumerate(blocks):
        if b["kind"] == "_short":
            b["kind"] = "para"
        if b["kind"] != "para":
            continue
        if i == 0 and _SECTION_TITLE.search(b["text"]):
            b["kind"] = "title"
        elif is_heading(b["text"]):
            b["kind"] = "heading"
        else:
            b["sentences"] = split_sentences(b["text"])
    return blocks


def block_text(b):
    """塊が持つ文字列（表はセルをつなげたもの、画像は空）。"""
    if b["kind"] == "table":
        return "".join(c for row in b["rows"] for c in row)
    if b["kind"] == "image":
        return ""
    return b["text"]


def plain_text(html):
    """タグを落として実体参照を戻しただけの文字列。**テストの突き合わせ用。**

    `parse` とは別の方法（正規表現）で作る。空白を落として比べれば、`parse` が
    空白以外の文字を1字も落としていないことを確かめられる。
    """
    t = re.sub(r"<[^>]+>", "", html)
    return _html.unescape(t)


def squash(text):
    """空白（改行・全角空白・`&#160;` を含む）をすべて落とす。"""
    return re.sub(r"\s", "", text)


# ── 生成AIに見せる番号 ───────────────────────────────────────────


def units(blocks):
    """塊と文に番号を振る。段落の文は `b{塊}s{文}`、それ以外は `b{塊}`（どれも1始まり）。"""
    out = []
    for i, b in enumerate(blocks, 1):
        if b["kind"] == "para":
            for j, s in enumerate(b["sentences"], 1):
                out.append({"id": f"b{i}s{j}", "block": i, "sentence": j, "kind": "para", "text": s})
        else:
            out.append({"id": f"b{i}", "block": i, "sentence": None, "kind": b["kind"], "text": _preview(b)})
    return out


def _preview(b):
    if b["kind"] == "table":
        # 1行に1つの番号なので、セルの中の改行は空白にして見せる
        return "［表］" + " / ".join(" | ".join(c.replace("\n", " ") for c in r) for r in b["rows"])
    if b["kind"] == "image":
        return f"［画像］{b['alt']}"
    if b["kind"] == "heading":
        return f"［見出し］{b['text']}"
    return f"［節の見出し］{b['text']}"


def render(blocks):
    """生成AIに渡す1社ぶんの文字列。1行に1つの番号。"""
    return "\n".join(f"{u['id']} {u['text']}" for u in units(blocks))


# ── 範囲から本文を組み立てる ─────────────────────────────────────


_ID = re.compile(r"^b(\d+)(?:s(\d+))?$")


def parse_id(uid):
    m = _ID.match(uid or "")
    if not m:
        raise ValueError(f"番号の形が違う: {uid!r}")
    return int(m.group(1)), int(m.group(2)) if m.group(2) else None


def _pos(blocks, uid, end):
    """番号を (塊, 文) の位置にする。段落の塊だけの番号なら、先頭（または末尾）の文。"""
    bi, si = parse_id(uid)
    if not 1 <= bi <= len(blocks):
        raise ValueError(f"塊の番号が範囲外: {uid}")
    b = blocks[bi - 1]
    if b["kind"] == "para":
        n = len(b["sentences"])
        if si is None:
            si = n if end else 1
        if not 1 <= si <= n:
            raise ValueError(f"文の番号が範囲外: {uid}")
    elif si is not None:
        raise ValueError(f"段落でない塊に文の番号がある: {uid}")
    return bi, si


def cut(blocks, start, end):
    """`start` から `end` まで（両端を含む）の塊を返す。文は原文の文字列のまま。

    段落の途中から始まる・途中で終わるときは、その段落の選ばれた文だけを1つの段落にする。
    """
    bs, ss = _pos(blocks, start, end=False)
    be, se = _pos(blocks, end, end=True)
    if (bs, ss or 0) > (be, se or 0):
        raise ValueError(f"始まりが終わりより後ろ: {start} > {end}")
    out = []
    for i in range(bs, be + 1):
        b = blocks[i - 1]
        if b["kind"] == "title":
            raise ValueError("節の見出しを範囲に含めた")
        if b["kind"] == "para":
            lo = ss if i == bs else 1
            hi = se if i == be else len(b["sentences"])
            text = "".join(b["sentences"][lo - 1:hi]).strip()
            if text:
                out.append({"kind": "para", "text": text})
        elif b["kind"] == "heading":
            out.append({"kind": "heading", "text": b["text"]})
        elif b["kind"] == "table":
            out.append({k: b[k] for k in ("kind", "rows", "spans") if k in b})
        else:
            out.append({"kind": "image", "alt": b["alt"]})
    return out
