"""賃金カーブ。

このファイルには2系統のカーブがある。**既定で使われるのは前者**なので、
出典を書くときは取り違えないこと（実際に取り違えが起きた。U7を参照）。

1. ANNUAL_INDUSTRY / ANNUAL_LARGE — **既定で使うのはこちら**
   annual_curves.json（fetch_estat.py が e-Stat から生成）を読み込む。
   出典: 厚生労働省「令和5年賃金構造基本統計調査」統計表ID 0003425893
   値は年収（千円）＝ きまって支給する現金給与額 × 12 ＋ 年間賞与その他特別給与額。
   賞与と時間外手当を含むので、有報の「平均年間給与」と定義が揃う。
   一般労働者・男女計・学歴計・企業規模計（ANNUAL_LARGE は1,000人以上）・民営事業所。

2. INDUSTRY_CURVES / SIZE_CURVES — 下のハードコード定数。
   annual_curves.json が無いときのフォールバックにすぎない。
   出典: 厚生労働省「令和6年賃金構造基本統計調査 結果の概況」
     第4表  企業規模、性、年齢階級別賃金（男女計）
     第5-1表 産業、年齢階級別賃金（男女計）
   値は所定内給与額（月額・千円）。**賞与と残業代を含まない**点に注意。
"""

import json
import math
from pathlib import Path
from bisect import bisect_right

# 年収ベースのカーブ（fetch_estat.py が生成）。あれば既定で使う。
#
# **配信に使われているのは `pipeline/data/annual_curves.json`。** build-data.ts が
# これを読んで `web/public/data/curves.json` を作る。こちらを先に探す。
# fetch_estat.py の書き出し先（salary/annual_curves.json）は取得直後の置き場で、
# リポジトリには入っていない。探し順を間違えると、下のフォールバック定数
# （所定内給与＝月額・賞与を含まない）が黙って使われ、web と別の数字が出る。
_ANNUAL = {}
_HERE = Path(__file__).resolve().parent
for _p in (_HERE.parent / "data" / "annual_curves.json", _HERE / "annual_curves.json"):
    if _p.exists():
        _ANNUAL = json.loads(_p.read_text())
        break
ANNUAL_INDUSTRY = _ANNUAL.get("ANNUAL_INDUSTRY", {})
ANNUAL_LARGE = _ANNUAL.get("ANNUAL_LARGE", {})

# 年齢階級の代表年齢（階級の中央値）
AGE_POINTS = [22, 27, 32, 37, 42, 47, 52, 57, 62, 67]

# 産業別（男女計・企業規模計） 20~24 から 65~69 まで
INDUSTRY_CURVES = {
    "鉱業": [267.4, 324.3, 351.4, 396.6, 438.3, 385.0, 420.6, 398.6, 347.9, 273.2],
    "建設業": [238.9, 273.2, 306.5, 340.2, 357.8, 399.4, 407.5, 437.3, 389.8, 333.1],
    "製造業": [216.8, 249.8, 282.4, 313.8, 341.9, 356.5, 374.4, 390.6, 294.6, 247.7],
    "電気・ガス業": [244.4, 298.5, 370.5, 429.6, 472.6, 506.8, 556.5, 563.5, 318.9, 299.3],
    "情報通信業": [249.1, 287.7, 349.8, 390.9, 439.5, 474.5, 485.2, 520.5, 330.9, 307.3],
    "運輸業": [234.9, 266.4, 292.0, 308.1, 318.8, 327.0, 327.8, 333.5, 279.0, 245.4],
    "卸売業・小売業": [230.6, 266.1, 292.8, 327.5, 363.4, 396.7, 416.3, 426.4, 316.2, 253.9],
    "金融業・保険業": [250.5, 298.2, 359.3, 419.3, 464.3, 487.5, 496.6, 471.9, 362.3, 346.7],
    "不動産業": [259.6, 292.6, 337.5, 416.5, 414.3, 427.0, 431.9, 446.6, 339.7, 251.2],
    "学術研究・専門技術": [245.3, 295.2, 352.8, 398.0, 434.8, 458.1, 479.8, 496.6, 411.4, 373.8],
    "宿泊業・飲食": [221.0, 243.1, 263.1, 282.9, 295.2, 307.1, 305.3, 292.5, 264.6, 226.3],
    "生活関連・娯楽": [224.5, 252.8, 274.1, 295.7, 322.5, 331.2, 316.7, 317.1, 264.4, 215.3],
    "教育・学習支援": [232.5, 267.5, 310.5, 350.2, 387.8, 420.0, 436.8, 466.4, 451.1, 422.0],
    "医療・福祉": [244.0, 274.9, 296.3, 307.2, 310.0, 330.4, 326.4, 333.6, 318.9, 303.6],
    "複合サービス": [213.5, 239.0, 258.8, 287.7, 313.4, 346.2, 369.6, 380.6, 240.9, 203.3],
    "サービス業": [222.1, 244.7, 263.3, 289.3, 302.1, 325.5, 316.1, 319.7, 276.1, 242.7],
    "産業計": [232.5, 267.2, 299.5, 328.7, 351.4, 372.7, 380.4, 392.0, 317.7, 275.5],
}

# 企業規模別（男女計・産業計）。上場企業は大企業が中心なので頑健性チェックに使う
SIZE_CURVES = {
    "大企業": [244.7, 284.8, 326.1, 369.8, 396.3, 419.7, 425.0, 452.6, 332.7, 275.0],
    "中企業": [227.3, 258.7, 287.8, 313.1, 340.1, 364.3, 378.6, 385.0, 316.7, 281.7],
    "小企業": [221.8, 252.1, 278.7, 296.8, 313.8, 329.8, 329.9, 332.8, 304.4, 270.2],
}

# 東証33業種 → 賃金センサスの産業大分類
TSE33_TO_INDUSTRY = {
    "水産・農林業": "産業計",
    "鉱業": "鉱業",
    "建設業": "建設業",
    "食料品": "製造業",
    "繊維製品": "製造業",
    "パルプ・紙": "製造業",
    "化学": "製造業",
    "医薬品": "製造業",
    "石油・石炭製品": "製造業",
    "ゴム製品": "製造業",
    "ガラス・土石製品": "製造業",
    "鉄鋼": "製造業",
    "非鉄金属": "製造業",
    "金属製品": "製造業",
    "機械": "製造業",
    "電気機器": "製造業",
    "輸送用機器": "製造業",
    "精密機器": "製造業",
    "その他製品": "製造業",
    "電気・ガス業": "電気・ガス業",
    "陸運業": "運輸業",
    "海運業": "運輸業",
    "空運業": "運輸業",
    "倉庫・運輸関連業": "運輸業",
    "倉庫・運輸関連": "運輸業",
    "外国法人・組合": "産業計",
    "情報・通信業": "情報通信業",
    "卸売業": "卸売業・小売業",
    "小売業": "卸売業・小売業",
    "銀行業": "金融業・保険業",
    "証券、商品先物取引業": "金融業・保険業",
    "保険業": "金融業・保険業",
    "その他金融業": "金融業・保険業",
    "不動産業": "不動産業",
    "サービス業": "サービス業",
}


def _interp(points, values, x):
    """区分線形補間。範囲外は端の値で頭打ちにする。"""
    if x <= points[0]:
        return values[0]
    if x >= points[-1]:
        return values[-1]
    i = bisect_right(points, x) - 1
    x0, x1 = points[i], points[i + 1]
    y0, y1 = values[i], values[i + 1]
    return y0 + (y1 - y0) * (x - x0) / (x1 - x0)


CURVE_SETS = {
    "年収": lambda: ANNUAL_INDUSTRY or INDUSTRY_CURVES,   # 既定
    "年収_大企業": lambda: ANNUAL_LARGE or SIZE_CURVES,
    "所定内": lambda: INDUSTRY_CURVES,
    "大企業": lambda: SIZE_CURVES,
    "中企業": lambda: SIZE_CURVES,
    "小企業": lambda: SIZE_CURVES,
}


def curve_set(name):
    """カーブ名から (テーブル, 産業別か) を返す。"""
    if name in ("大企業", "中企業", "小企業"):
        return {name: SIZE_CURVES[name]}, False
    return CURVE_SETS.get(name, CURVE_SETS["年収"])(), True


def wage_at(age, industry="産業計", curves=None):
    table = curves or (ANNUAL_INDUSTRY or INDUSTRY_CURVES)
    values = table.get(industry) or table.get("産業計") or next(iter(table.values()))
    return _interp(AGE_POINTS, values, age)


def age_factor(from_age, to_age=35.0, industry="産業計", curves=None):
    """from_age の賃金水準を to_age に換算する倍率。

    **これ単体は目標年齢が平均年齢より上のときの式**（ADR-0003）。
    若い側は倍率では表せないので `estimate_salary` を使うこと。
    """
    base = wage_at(from_age, industry, curves)
    if base <= 0:
        return None
    return wage_at(to_age, industry, curves) / base


def _round_half_up(x):
    """JavaScript の Math.round と同じ丸め。

    Python の組み込み round() は偶数丸めなので、.5 ちょうどで
    web 側（`web/features/ranking/lib/salary.ts`）と1円ずれる。
    両者の一致は `pipeline/scripts/build-data.test.ts` が全1,867社で固定している。
    """
    return int(math.floor(x + 0.5))


def estimate_salary(avg_salary, avg_age, to_age=35.0, industry="産業計", curves=None):
    """年齢補正した推定年収。ADR-0005 の2点モデル。

        目標年齢 ≦ 平均年齢:
          C(22) + (平均年間給与 − C(22)) × (C(目標年齢) − C(22)) ÷ (C(平均年齢) − C(22))
        目標年齢 > 平均年齢:
          平均年間給与 × C(目標年齢) ÷ C(平均年齢)

    **`web/features/ranking/lib/salary.ts` と同じ挙動にすること。**
    表示に使うのは web 側の実装で、こちらは CSV の派生列を作るためのもの。
    ずれると CSV とサイトの数字が食い違う。
    """
    at_target = wage_at(to_age, industry, curves) * 1000     # カーブは千円、給与は円
    at_avg = wage_at(avg_age, industry, curves) * 1000
    if at_avg <= 0:
        return None
    if to_age > avg_age:
        return _round_half_up(avg_salary * at_target / at_avg)

    table = curves or (ANNUAL_INDUSTRY or INDUSTRY_CURVES)
    values = table.get(industry) or table.get("産業計") or next(iter(table.values()))
    anchor = values[0] * 1000
    span = at_avg - anchor
    # 平均年齢が起点に近い会社や、平均給与が業種の22歳水準を下回る会社では
    # 2点を結べない。倍率一定（旧式）に戻す。
    if span <= 0 or avg_salary <= anchor:
        return _round_half_up(avg_salary * at_target / at_avg)
    return _round_half_up(anchor + (avg_salary - anchor) * (at_target - anchor) / span)


def industry_of(tse33):
    return TSE33_TO_INDUSTRY.get((tse33 or "").strip(), "産業計")


if __name__ == "__main__":
    for ind in ("情報通信業", "金融業・保険業", "製造業", "産業計"):
        print(f"{ind:12s} 30歳→35歳 x{age_factor(30, 35, ind):.3f}   "
              f"43歳→35歳 x{age_factor(43, 35, ind):.3f}")
