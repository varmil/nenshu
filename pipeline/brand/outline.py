"""文字をアウトライン（SVG の path）に落として `lettering.ts` を書き出す。

    python3 pipeline/brand/outline.py > pipeline/brand/lettering.ts

**OG画像（S2・Issue #116）のためだけの道具で、ふだんは回さない。** 出力は
コミットしてあり、`npm run build:brand` はそれを読むだけで動く。

**なぜ文字のまま SVG に書かないか。** `sharp`（librsvg）の `<text>` は
実行環境の fontconfig を引く。日本語フォントの入っていない機械で回すと
豆腐（□）が並んだ画像が焼かれ、しかも**その場では誰も気づけない**——寸法も
バイト数も正しいので、`assets.test.ts` の見ている性質は全部通る。
アウトラインにしておけば、どの機械で焼いても同じ絵になる。

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
IPA_GOTHIC = "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf"


def outline(font_path: str, text: str, tracking: float = 0.0) -> tuple[str, float]:
    """`text` を1本の path にして返す。戻りは (d, 送り幅)。"""
    font = TTFont(font_path)
    upem = font["head"].unitsPerEm
    scale = EM / upem
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
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


def emit(name: str, doc: str, font: str, text: str, tracking: float = 0.0) -> None:
    d, width = outline(font, text, tracking)
    print(f"\n/** {doc} */")
    print(f"export const {name}: Lettering = {{")
    print(f'  text: "{text}",')
    print(f"  width: {width:.1f},")
    print(f'  path: "{d}",')
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
 */
export type Lettering = {
  /** 何と書いてあるか（読む人のため。描画には使わない）。 */
  text: string;
  /** 送り幅（フォントサイズ100のとき）。 */
  width: number;
  path: string;
};""")

emit(
    "WORDMARK",
    "ワードマーク。デザイン案のフォールバック（Arial）と字幅の同じ Liberation Sans Bold で組んだ。",
    LIBERATION_BOLD,
    "OpenReport",
    tracking=-1.1,
)
emit("TAGLINE_1", "説明文の1行目（IPAGothic）。", IPA_GOTHIC, "有価証券報告書ベースの")
emit("TAGLINE_2", "説明文の2行目（IPAGothic）。", IPA_GOTHIC, "平均年収ランキング")
emit(
    "DOMAIN",
    "公開ホスト。`lib/seo/site.ts` の `SITE_ORIGIN` からホスト名だけを取った文字列と一致する。",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "openreport.net",
)
