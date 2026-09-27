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
- `table` — 表。セルの文字列を行ごとに持つ。文には分けない
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


def is_heading(text):
    """句点で終わらない短い行を小見出しとみる。"""
    t = text.strip()
    return 0 < len(t) <= HEADING_MAX and not t.endswith(("。", "．"))


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
        self.table = None  # 表の中なら行の配列
        self.cell = None
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
            elif tag == "br" and self.cell is not None:
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
                    rows = [r for r in self.table if any(c for c in r)]
                    if rows:
                        self.blocks.append({"kind": "table", "rows": rows})
                    self.table = None
            elif self.depth > 1:
                if tag in ("td", "th") and self.cell is not None:
                    self.cell.append(" ")
            elif tag in ("td", "th") and self.cell is not None:
                if not self.table:
                    self.table.append([])
                self.table[-1].append("".join(self.cell).strip())
                self.cell = None
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
                self.table.append([data.strip()])
            return
        self.buf.append(data)

    def close(self):
        super().close()
        self._flush()


def parse(html):
    """節の HTML を塊の列にする。段落には文の列（`sentences`）を付ける。"""
    p = _Parser()
    p.feed(html)
    p.close()
    blocks = p.blocks
    for i, b in enumerate(blocks):
        if b["kind"] != "para":
            continue
        # 段落の中の改行（br）は前後の空白ごと1つに寄せる
        b["text"] = re.sub(r"[ \t]*\n[ \t]*", "\n", b["text"]).strip()
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
        return "［表］" + " / ".join(" | ".join(r) for r in b["rows"])
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
            out.append({"kind": "table", "rows": b["rows"]})
        else:
            out.append({"kind": "image", "alt": b["alt"]})
    return out
