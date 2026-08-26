"""文字をアウトライン（SVG の path）に落として `lettering.ts` を書き出す。

    python3 pipeline/brand/outline.py > pipeline/brand/lettering.ts

**OG画像（S2・Issue #116）のためだけの道具で、ふだんは回さない。** 出力は
コミットしてあり、`npm run build:brand` はそれを読むだけで動く。

**なぜ文字のまま SVG に書かないか。** `sharp`（librsvg）の `<text>` は
実行環境の fontconfig を引く。日本語フォントの入っていない機械で回すと
豆腐（□）が並んだ画像が焼かれ、しかも**その場では誰も気づけない**——寸法も
バイト数も正しいので、`assets.test.ts` の見ている性質は全部通る。
アウトラインにしておけば、どの機械で焼いても同じ絵になる。

**文（`有価証券報告書ベースの`）ではなく字（`有`・`価`・…）で出す。** OG画像には
社数・全体平均・対象期間という**データから引く数字**が載るようになったので
（`brand/og.ts`）、焼く時点で文字列が決まる。文ごと持つと数字が変わるたびに
この道具を回すことになり、そのたびに fontTools と日本語フォントの入った機械が要る。
字の表を持てば、組むのは `brand/text.ts` の `compose()` がやる。

必要なもの（この工程だけ）:
  pip install fonttools
  Liberation Sans（`fonts-liberation`）と IPAGothic（`fonts-ipafont-gothic`）

**フォントは字を組むために使っているだけで、フォントそのものは配らない。**
出るのはこの文字列の輪郭を写した座標である。
"""

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.misc.transform import Transform

# 出力の座標系。フォントサイズ100に相当する em で書き、使う側が `scale()` で伸ばす。
EM = 100

LIBERATION_BOLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
LIBERATION_REGULAR = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
IPA_GOTHIC = "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf"

# OG画像に出うる字。**データから引く値があるので、文ではなく字で並べる**——
# 社数・全体平均・対象期間は `web/public/data/` の中身で変わる（`brand/og.ts`）。
# 見出しと見出しラベルの固定文＋数字・区切り・単位・出典まで。
GOTHIC_CHARS = "有価証券報告書の数値のまま、社平均年収。対象全体期間・出典万円月〜金融庁"

# ASCII は Liberation Sans（プロポーショナル）で組む。IPAGothic の欧文は
# 固定ピッチなので、`2,961` や `EDINET` が間延びして見える。
SANS_CHARS = "0123456789, EDINT"


def load(font_path: str):
    font = TTFont(font_path)
    return font, EM / font["head"].unitsPerEm, font.getGlyphSet(), font.getBestCmap()


def outline(font_path: str, text: str, tracking: float = 0.0) -> tuple[str, float]:
    """`text` を1本の path にして返す。戻りは (d, 送り幅)。"""
    font, scale, glyphs, cmap = load(font_path)
    hmtx = font["hmtx"]

    pen = SVGPathPen(glyphs, ntos=lambda v: f"{v:.1f}".rstrip("0").rstrip("."))
    x = 0.0
    for char in text:
        name = cmap.get(ord(char))
        if name is None:
            raise SystemExit(f"{font_path} に {char!r} が無い")
        # フォントは上向きの座標系なので Y を反転してベースラインを原点にする。
        transform = Transform(scale, 0, 0, -scale, x, 0)
        glyphs[name].draw(TransformPen(pen, transform))
        x += hmtx[name][0] * scale + tracking
    return pen.getCommands(), x - tracking


def emit_lettering(name: str, doc: str, font: str, text: str, tracking: float = 0.0) -> None:
    d, width = outline(font, text, tracking)
    print(f"\n/** {doc} */")
    print(f"export const {name}: Lettering = {{")
    print(f'  text: "{text}",')
    print(f"  width: {width:.1f},")
    print(f'  path: "{d}",')
    print("};")


def emit_table(name: str, doc: str, font_path: str, chars: str) -> None:
    """字の表。1字ずつ原点から描いてあるので、置く側が送り幅ぶんずらして並べる。"""
    font, scale, glyphs, cmap = load(font_path)
    hmtx = font["hmtx"]

    print(f"\n/** {doc} */")
    print(f"export const {name}: GlyphTable = {{")
    for char in sorted(dict.fromkeys(chars)):
        glyph_name = cmap.get(ord(char))
        if glyph_name is None:
            raise SystemExit(f"{font_path} に {char!r} が無い")
        pen = SVGPathPen(glyphs, ntos=lambda v: f"{v:.1f}".rstrip("0").rstrip("."))
        glyphs[glyph_name].draw(TransformPen(pen, Transform(scale, 0, 0, -scale, 0, 0)))
        advance = hmtx[glyph_name][0] * scale
        key = '" "' if char == " " else f'"{char}"'
        print(f'  {key}: {{ advance: {advance:.1f}, d: "{pen.getCommands()}" }},')
    print("};")


print('/* このファイルは `pipeline/brand/outline.py` の出力。手で編集しない。 */')
print("""
/**
 * OG画像に置く文字の輪郭（S2・Issue #116・`docs/site-chrome/spec.md` 4.3）。
 *
 * **文字のままではなく座標で持つ。** `sharp`（librsvg）の `<text>` は実行環境の
 * fontconfig を引くので、日本語フォントの入っていない機械で焼くと豆腐が並んだ
 * 画像ができる——寸法もバイト数も正しいままなので、テストでは捕まらない。
 *
 * ベースラインを原点に、フォントサイズ100の座標系で書いてある。使う側は
 * `translate(x y) scale(size/100)` で置く。
 *
 * **ワードマーク以外は字の表で持つ。** OG画像に載る社数・全体平均・対象期間は
 * データから引く値なので、焼く時点まで文字列が決まらない。組むのは
 * `brand/text.ts` の `compose()`。
 */
export type Lettering = {
  /** 何と書いてあるか（読む人のため。描画には使わない）。 */
  text: string;
  /** 送り幅（フォントサイズ100のとき）。 */
  width: number;
  path: string;
};

/** 1字ぶんの輪郭と送り幅。 */
export type Glyph = {
  advance: number;
  d: string;
};

export type GlyphTable = Record<string, Glyph>;""")

emit_lettering(
    "WORDMARK",
    "ワードマーク。デザイン案のフォールバック（Arial）と字幅の同じ Liberation Sans Bold で組んだ。",
    LIBERATION_BOLD,
    "OpenReport",
    tracking=-1.1,
)
emit_table("GOTHIC", "和文（IPAGothic）。全角なので送り幅は一律100。", IPA_GOTHIC, GOTHIC_CHARS)
emit_table(
    "SANS",
    "欧文と数字（Liberation Sans Regular）。IPAGothic の欧文は固定ピッチで間延びする。",
    LIBERATION_REGULAR,
    SANS_CHARS,
)
