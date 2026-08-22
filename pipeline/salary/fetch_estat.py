"""e-Stat から年収ベースの賃金カーブを作る。

賃金構造基本統計調査（令和2年以降 一般_産業大・中分類_年齢階級別DB）から
きまって支給する現金給与額と年間賞与その他特別給与額を取り、

    年収 = きまって支給する現金給与額 × 12 + 年間賞与その他特別給与額

として産業×年齢階級のカーブを作る。有報の平均年間給与も賞与と残業代を
含むので、所定内給与だけのカーブより対象に合う。

  python3 fetch_estat.py            # annual_curves.json を作り直す
appId は環境変数 ESTAT_APP_ID か salary/.estat_key から読む。
"""

import os
import json
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STATS_DATA_ID = "0003425893"

INDUSTRIES = {
    "01": "産業計", "02": "鉱業", "03": "建設業", "07": "製造業",
    "32": "電気・ガス業", "37": "情報通信業", "43": "運輸業",
    "52": "卸売業・小売業", "67": "金融業・保険業", "74": "不動産業",
    "78": "学術研究・専門技術", "83": "宿泊業・飲食", "87": "生活関連・娯楽",
    "91": "教育・学習支援", "94": "医療・福祉", "98": "複合サービス",
    "101": "サービス業",
}
# 年齢階級コード → 代表年齢
AGE_CODES = ["03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]
SIZES = {"01": "ANNUAL_INDUSTRY", "02": "ANNUAL_LARGE"}  # 企業規模計 / 1,000人以上


def app_id():
    v = os.environ.get("ESTAT_APP_ID")
    if v:
        return v.strip()
    f = ROOT / ".estat_key"
    if f.exists():
        return f.read_text().strip()
    raise SystemExit("e-Stat appId が未設定（ESTAT_APP_ID か .estat_key）")


def fetch(year="2023000000"):
    q = {
        "appId": app_id(), "statsDataId": STATS_DATA_ID,
        "cdTab": "40,44",                    # きまって支給する現金給与額 / 年間賞与
        "cdCat01": ",".join(SIZES),          # 企業規模
        "cdCat02": ",".join(INDUSTRIES),     # 産業
        "cdCat03": "01",                     # 男女計
        "cdCat04": ",".join(AGE_CODES),      # 年齢階級
        "cdCat05": "01",                     # 学歴計
        "cdCat06": "02",                     # 民営事業所
        "cdTime": year, "limit": "5000", "metaGetFlg": "N",
    }
    url = ("https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData?"
           + urllib.parse.urlencode(q))
    with urllib.request.urlopen(url, timeout=180) as r:
        data = json.load(r)
    result = data["GET_STATS_DATA"]["RESULT"]
    if result["STATUS"] != 0:
        raise SystemExit(f"e-Stat エラー: {result.get('ERROR_MSG')}")
    return data["GET_STATS_DATA"]["STATISTICAL_DATA"]["DATA_INF"]["VALUE"]


def build(values):
    idx = {(v["@tab"], v["@cat01"], v["@cat02"], v["@cat04"]): float(v["$"])
           for v in values}
    out = {}
    for size_code, label in SIZES.items():
        table = {}
        for ind_code, name in INDUSTRIES.items():
            row = []
            for age in AGE_CODES:
                monthly = idx.get(("40", size_code, ind_code, age))
                bonus = idx.get(("44", size_code, ind_code, age))
                row.append(round(monthly * 12 + bonus, 1)
                           if monthly is not None and bonus is not None else None)
            table[name] = row
        out[label] = table
    return out


if __name__ == "__main__":
    curves = build(fetch())
    path = ROOT / "annual_curves.json"
    path.write_text(json.dumps(curves, ensure_ascii=False, indent=1))
    print(f"書き出し: {path}")
    for name in ("産業計", "情報通信業", "金融業・保険業"):
        row = curves["ANNUAL_INDUSTRY"][name]
        print(f"  {name:10s} 22歳 {row[0]:.0f}千円 → 37歳 {row[3]:.0f} → 57歳 {row[7]:.0f}")
