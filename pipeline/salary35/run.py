"""有報データを取得して35歳補正ランキングを作る。

  python3 run.py --limit 300            # 検証（300社）
  python3 run.py --limit 0              # 全社
  python3 run.py --limit 300 --curve 大企業
"""

import csv
import json
import zipfile
import argparse
from pathlib import Path
from datetime import date

import curves
import edinet

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "out"
OUT.mkdir(exist_ok=True)


def load_edinet_codelist():
    """EDINETコードリスト（APIキー不要）から業種・上場区分・提出者名を読む。

    提出者名は `unified.backfill_edinet_code()` が、証券コードで引けない会社
    （上場廃止で証券コードが外れた会社・非上場の有報提出会社）を突合するのに使う。
    """
    path = ROOT / "Edinetcode.zip"
    if not path.exists():
        import urllib.request
        url = "https://disclosure2dl.edinet-fsa.go.jp/searchdocument/codelist/Edinetcode.zip"
        req = urllib.request.Request(url, headers={"User-Agent": "salary35/1.0"})
        with urllib.request.urlopen(req, timeout=120) as r:
            path.write_bytes(r.read())
    z = zipfile.ZipFile(path)
    name = [n for n in z.namelist() if n.lower().endswith(".csv")][0]
    text = z.read(name).decode("cp932", "replace")
    rows = list(csv.reader(text.splitlines()[1:]))
    header, body = rows[0], rows[1:]
    idx = {h: i for i, h in enumerate(header)}
    info = {}
    for r in body:
        if len(r) < len(header):
            continue
        code = r[idx["ＥＤＩＮＥＴコード"]]
        info[code] = {
            "name": r[idx["提出者名"]],
            "tse33": r[idx["提出者業種"]],
            "listed": r[idx["上場区分"]],
            "sec_code": (r[idx["証券コード"]] or "")[:4],
            "kind": r[idx["提出者種別"]],
            "capital": r[idx["資本金"]],
        }
    return info


def unlisted_docs(codelist):
    """証券コードを持たない有報提出会社（持株会社傘下の事業会社など）。

    みずほ銀行・三井住友銀行・三菱UFJ銀行は上場していないので証券コードが
    ないが、有報は出している。持株会社の単体数字はグループを代表しないので、
    実際に人が働いている事業会社側を拾う。外国の銀行や国際機関は転職先では
    ないので、内国法人だけに絞る。
    """
    import glob
    res = []
    for f in glob.glob(str(edinet.CACHE / "list_*.json")):
        d = json.loads(Path(f).read_text())
        res += [r for r in (d.get("results") or [])
                if r.get("docTypeCode") == "120" and not r.get("secCode")
                and r.get("withdrawalStatus") != "1"]
    uniq = {}
    for r in res:
        info = codelist.get(r.get("edinetCode") or "")
        if not info or info.get("kind") != "内国法人・組合":
            continue
        uniq[r["edinetCode"]] = r
    return list(uniq.values())


def build(limit, curve_name, start, end, include_unlisted=False):
    codelist = load_edinet_codelist()
    print(f"EDINETコードリスト: {len(codelist)}社")

    print(f"有報を列挙 ({start} 〜 {end})")
    docs = edinet.annual_reports(start, end)
    print(f"有報（上場）{len(docs)}件")
    if include_unlisted:
        extra = unlisted_docs(codelist)
        print(f"有報（非上場の内国法人）{len(extra)}件")
        docs = docs + extra

    if limit:
        docs = docs[:limit]

    curve_table, by_industry = curves.curve_set(curve_name)
    print(f"カーブ: {curve_name}（{'産業別' if by_industry else '一律'}, "
          f"{len(curve_table)}系列）")
    rows = []
    for i, meta in enumerate(docs, 1):
        try:
            path = edinet.fetch_csv(meta["docID"])
            rec = edinet.to_record(meta, edinet.parse_csv_zip(path))
        except Exception as e:  # noqa: BLE001
            print(f"  [{i}] {meta.get('filerName')} 失敗: {e}")
            continue
        info = codelist.get(rec["edinet_code"] or "", {})
        rec["tse33"] = info.get("tse33", "")
        rec["listed"] = info.get("listed", "")
        rec["industry"] = (
            curves.industry_of(rec["tse33"]) if by_industry else curve_name
        )
        rows.append(rec)
        if i % 25 == 0:
            print(f"  {i}/{len(docs)} 取得済み")

    return rows, curve_table


def fit_curve_from_data(rows, bandwidth=3.0):
    """上場企業の (平均年齢, 平均年収) から年齢カーブを自前で推定する。

    賃金センサスは所定内給与（賞与を除く）なので、年功で効いてくる賞与が
    カーブに乗らない。有報の平均年間給与は賞与込みなので、そちらから
    直接カーブを引いたほうが対象に合う。
    局所線形回帰（ガウス重み）で log(年収) を年齢に回帰する。

    ただしこれは会社間の差であって、1社の中の昇給ではない。
    「平均年齢の高い会社は年収も高い」という関係を年功カーブと読み替える
    生態学的推論になっている点は、記事側で明示する必要がある。
    """
    import math

    pts = [(r["avg_age"], math.log(r["avg_salary"])) for r in rows
           if r.get("avg_age") and r.get("avg_salary") and r["avg_salary"] > 0]
    if len(pts) < 50:
        return None

    def predict(x0):
        sw = swx = swy = swxx = swxy = 0.0
        for x, y in pts:
            w = math.exp(-0.5 * ((x - x0) / bandwidth) ** 2)
            sw += w; swx += w * x; swy += w * y
            swxx += w * x * x; swxy += w * x * y
        den = sw * swxx - swx * swx
        if abs(den) < 1e-12:
            return swy / sw if sw else None
        b = (sw * swxy - swx * swy) / den
        a = (swy - b * swx) / sw
        return a + b * x0

    grid = {age: predict(float(age)) for age in range(26, 56)}
    return {"grid": grid, "predict": predict}


def fitted_factor(fit, from_age, to_age=35.0):
    import math
    lo = min(fit["grid"]); hi = max(fit["grid"])
    a = max(lo, min(hi, from_age))
    b = max(lo, min(hi, to_age))
    return math.exp(fit["predict"](b) - fit["predict"](a))


def fix_salary_typos(rows):
    """有報のタグ付けミス（桁違い）を直す。

    平均年間給与は円単位のはずだが、千円単位の数字をそのまま入れている
    会社が実際にある。従業員数から見てあり得ない額を、10の冪で
    妥当な帯（200万〜3000万）に戻す。修正した会社は記録して後で目視する。
    """
    fixed = []
    for r in rows:
        s = r.get("avg_salary")
        emp = r.get("employees_nonconsolidated") or 0
        if not s:
            continue
        # 従業員が少ない会社は本当に高額なことがある（役員数人の持株会社など）
        ceiling = 30_000_000 if emp >= 20 else 120_000_000
        if s <= ceiling:
            continue
        original = s
        for div in (10, 100, 1000, 10000):
            if 2_000_000 <= original / div <= ceiling:
                r["avg_salary"] = original / div
                r["salary_fixed"] = f"{original:.0f}→{original/div:.0f}"
                fixed.append(r)
                break
        else:
            r["salary_fixed"] = f"{original:.0f}→除外"
            r["avg_salary"] = None
            fixed.append(r)
    return fixed


def analyse(rows, curve_table):
    fixed = fix_salary_typos(rows)
    if fixed:
        print(f"\n桁ズレの疑いを補正: {len(fixed)}社")
        for r in fixed:
            print(f"  {r['sec_code']} {r['name'][:20]:20s} "
                  f"単体{r.get('employees_nonconsolidated') or 0:.0f}人  {r['salary_fixed']}")

    ok = [
        r for r in rows
        if r["avg_salary"] and r["avg_age"]
        and 20 <= r["avg_age"] <= 65 and r["avg_salary"] > 1_000_000
    ]
    print(f"\n有効データ {len(ok)}社 / 取得 {len(rows)}社")

    fit = fit_curve_from_data(ok)
    for r in ok:
        f = curves.age_factor(r["avg_age"], 35.0, r["industry"], curve_table)
        r["factor"] = f
        r["salary35"] = r["avg_salary"] * f if f else None
        if fit:
            r["factor_fit"] = fitted_factor(fit, r["avg_age"])
            r["salary35_fit"] = r["avg_salary"] * r["factor_fit"]
        nc = r.get("employees_nonconsolidated")
        c = r.get("employees_consolidated")
        r["emp_ratio"] = (nc / c) if (nc and c and c > 0) else None
        # 単体の平均年収がグループ全体の何割をカバーしているか。
        # 1割を切ると、その数字はグループの実態を表していない。
        r["holding_flag"] = bool(
            r["emp_ratio"] is not None and r["emp_ratio"] < 0.1 and c and c >= 500
        )
        # カーブが薄い年齢帯は補正が信用できないので本表から外す
        r["age_outlier"] = not (28.0 <= r["avg_age"] <= 55.0)

    body = [r for r in ok
            if r["salary35"] and not r["holding_flag"] and not r["age_outlier"]]
    by_raw = sorted(body, key=lambda r: -r["avg_salary"])
    by_adj = sorted(body, key=lambda r: -r["salary35"])
    for i, r in enumerate(by_raw, 1):
        r["rank_raw"] = i
    for i, r in enumerate(by_adj, 1):
        r["rank_adj"] = i
    for r in body:
        r["rank_delta"] = r["rank_raw"] - r["rank_adj"]  # 正なら順位が上がった

    return ok, body, by_raw, by_adj


def report(ok, body, by_raw, by_adj):
    import statistics

    n = len(body)
    holdings = [r for r in ok if r.get("holding_flag")]
    deltas = [abs(r["rank_delta"]) for r in body]

    # 順位相関（スピアマン）
    if n > 1:
        d2 = sum((r["rank_raw"] - r["rank_adj"]) ** 2 for r in body)
        rho = 1 - 6 * d2 / (n * (n * n - 1))
    else:
        rho = float("nan")

    top_raw = {r["sec_code"] for r in by_raw[:50]}
    top_adj = {r["sec_code"] for r in by_adj[:50]}
    churn = len(top_raw - top_adj)

    print("\n" + "=" * 60)
    print("検証結果")
    print("=" * 60)
    print(f"対象社数（持株会社除外後）      : {n}")
    print(f"単体カバー率1割未満で除外       : {len(holdings)}社")
    print(f"平均年齢が28〜55歳の外で除外    : {sum(1 for r in ok if r.get('age_outlier'))}社")
    print(f"順位変動の中央値                : {statistics.median(deltas):.0f}位")
    print(f"順位変動の平均                  : {statistics.mean(deltas):.1f}位")
    print(f"順位変動が50位以上の企業        : {sum(1 for d in deltas if d >= 50)}社 "
          f"({sum(1 for d in deltas if d >= 50) / n * 100:.0f}%)")
    print(f"スピアマン順位相関              : {rho:.3f}")
    print(f"TOP50の入れ替わり               : {churn}/50社")

    # 2つ目のカーブ（有報データから自前で推定）との一致度
    if all("salary35_fit" in r for r in body):
        alt = sorted(body, key=lambda r: -r["salary35_fit"])
        alt_rank = {r["sec_code"]: i for i, r in enumerate(alt, 1)}
        d2b = sum((r["rank_adj"] - alt_rank[r["sec_code"]]) ** 2 for r in body)
        rho2 = 1 - 6 * d2b / (n * (n * n - 1)) if n > 1 else float("nan")
        agree = len({r["sec_code"] for r in alt[:50]} & top_adj)
        print(f"別カーブ（有報自前推定）との順位相関: {rho2:.3f}  TOP50一致 {agree}/50社")

    print("\n--- 補正で最も順位が上がった15社（若くして高い）---")
    for r in sorted(body, key=lambda r: -r["rank_delta"])[:15]:
        print(f"  {r['sec_code']} {r['name'][:22]:22s} 平均{r['avg_age']:.1f}歳 "
              f"{r['avg_salary']/1e4:6.0f}万 → {r['salary35']/1e4:6.0f}万  "
              f"{r['rank_raw']:4d}位 → {r['rank_adj']:4d}位 (+{r['rank_delta']})")

    print("\n--- 補正で最も順位が下がった15社（年功で上がる）---")
    for r in sorted(body, key=lambda r: r["rank_delta"])[:15]:
        print(f"  {r['sec_code']} {r['name'][:22]:22s} 平均{r['avg_age']:.1f}歳 "
              f"{r['avg_salary']/1e4:6.0f}万 → {r['salary35']/1e4:6.0f}万  "
              f"{r['rank_raw']:4d}位 → {r['rank_adj']:4d}位 ({r['rank_delta']})")

    if holdings:
        print("\n--- 単体の平均年収がグループを代表していない企業（カバー率1割未満）上位15社 ---")
        for r in sorted(holdings, key=lambda r: -(r["avg_salary"] or 0))[:15]:
            print(f"  {r['sec_code']} {r['name'][:22]:22s} "
                  f"{r['avg_salary']/1e4:6.0f}万 単体{r['employees_nonconsolidated']:.0f}人 "
                  f"/ 連結{r['employees_consolidated']:.0f}人 (カバー率{r['emp_ratio']*100:.1f}%)")

    return {"n": n, "rho": rho, "churn": churn,
            "median_delta": statistics.median(deltas),
            "holdings": len(holdings)}


def save(ok):
    path = OUT / "salary35.csv"
    fields = ["sec_code", "name", "listed", "source", "tse33", "industry", "avg_age", "avg_tenure",
              "avg_salary", "factor", "salary35", "rank_raw", "rank_adj",
              "rank_delta", "salary35_fit", "employees_nonconsolidated",
              "employees_consolidated", "emp_ratio", "holding_flag", "age_outlier",
              "salary_fixed", "period_end", "doc_id"]
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for r in sorted(ok, key=lambda r: r.get("rank_adj") or 10**9):
            w.writerow(r)
    print(f"\n書き出し: {path}")
    return path


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--limit", type=int, default=300, help="0で全件")
    p.add_argument("--curve", default="年収",
                   help="年収 / 年収_大企業 / 所定内 / 大企業 / 中企業 / 小企業")
    p.add_argument("--include-unlisted", action="store_true",
                   help="持株会社傘下の事業会社（みずほ銀行など）も含める")
    p.add_argument("--start", default="2026-06-01")
    p.add_argument("--end", default="2026-07-10")
    a = p.parse_args()

    rows, curve_table = build(
        a.limit, a.curve,
        date.fromisoformat(a.start), date.fromisoformat(a.end),
        include_unlisted=a.include_unlisted,
    )
    ok, body, by_raw, by_adj = analyse(rows, curve_table)
    report(ok, body, by_raw, by_adj)
    save(ok)


if __name__ == "__main__":
    main()
