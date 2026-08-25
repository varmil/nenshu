"""有報データを取得して35歳補正ランキングを作る。

  python3 run.py --limit 300            # 検証（300社）
  python3 run.py --limit 0              # 全社
  python3 run.py --limit 300 --curve 大企業
"""

import csv
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
    """EDINETコードリスト（APIキー不要）から業種・上場区分・提出者名・法人番号を読む。

    提出者名は `unified.backfill_edinet_code()` が、証券コードで引けない会社
    （上場廃止で証券コードが外れた会社・非上場の有報提出会社）を突合するのに使う。

    **法人番号は女性活躍DBとの突合キー**（ADR-0009）。`unified.backfill_corporate_number()`
    が CSV の `corporate_number` 列に写す。証券コードと社名では突合しない
    ——女性活躍DB側の証券コードは自己申告で誤登録があり、社名は同名別会社が多い。
    """
    path = ROOT / "Edinetcode.zip"
    if not path.exists():
        import urllib.request
        url = "https://disclosure2dl.edinet-fsa.go.jp/searchdocument/codelist/Edinetcode.zip"
        req = urllib.request.Request(url, headers={"User-Agent": "salary/1.0"})
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
            "corporate_number": (r[idx["提出者法人番号"]] or "").strip(),
        }
    return info


FILER_KIND = "内国法人・組合"


def twelve_month_window(today=None):
    """取得の窓（両端を含む）。**回す日から遡って12か月**（ADR-0011）。

    **決算期に貼り付いた日付を直書きしない。** 以前は 6/1〜7/10 という3月期決算の
    提出ピークに置いており、**それ以外の決算期の会社が1社も入らなかった**
    （キヤノン・楽天グループ・イオン・ファーストリテイリングなど1,095社）。

    **12か月にする理由。** 有報は事業年度ごとに1回出るので、12か月の窓なら決算期が
    いつであっても各社ちょうど1回入る。**暦年にしないのは、年の途中で回すと窓の
    後半が空になるため**。**窓を置かず「各社の最新の有報」にしないのは、上場廃止・
    合併で提出をやめた会社が何年も残るため**——12か月の窓は「いまも有報を出して
    いる」という条件そのものになる。

    両端を含むので厳密には366日ぶんあり、**窓の両端に同じ会社の2年ぶんが入りうる**。
    それは `edinet.annual_reports` の期末優先が受け止める。
    """
    end = today or date.today()
    try:
        start = end.replace(year=end.year - 1)
    except ValueError:  # 2月29日に回した場合
        start = end.replace(year=end.year - 1, day=28)
    return start, end


def build(limit, curve_name, start, end):
    codelist = load_edinet_codelist()
    print(f"EDINETコードリスト: {len(codelist)}社")

    print(f"有報を列挙 ({start} 〜 {end})")
    docs = edinet.annual_reports(start, end)
    print(f"有報（EDINETコードで一意）{len(docs)}件")

    # **外国法人・組合と外国政府等を落とす**（ADR-0011・`docs/expansion/spec.md` 1.1）。
    # 窓の中に外国法人200社・外国政府等28社がいるが、転職先ではない。**以前は
    # 非上場側の経路だけがこの線を持っていた**——証券コードを持つ会社は素通りしていた。
    docs = [d for d in docs
            if (codelist.get(d.get("edinetCode") or "") or {}).get("kind") == FILER_KIND]
    print(f"  うち{FILER_KIND}: {len(docs)}件")

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


SALARY_FLOOR = 2_000_000


def plausible_salary_range(row):
    """その行の平均年間給与としてあり得る帯（円）。

    **従業員が少ない会社は本当に高額なことがある**（役員数人の持株会社など）ので
    上限を分ける。`fix_salary_typos` の桁ズレ判定と、`unified.resolve_ambiguous_salary`
    の候補の絞り込みが**同じ線を見る**ようにここに出してある——別々に持つと、
    片方が直ったときにもう片方だけ古い線で判断する。
    """
    emp = row.get("employees_nonconsolidated") or 0
    return SALARY_FLOOR, 30_000_000 if emp >= 20 else 120_000_000


def fix_salary_typos(rows):
    """有報のタグ付けミス（桁違い）を直す。

    平均年間給与は円単位のはずだが、千円単位の数字をそのまま入れている
    会社が実際にある。従業員数から見てあり得ない額を、10の冪で
    妥当な帯（200万〜3000万）に戻す。修正した会社は記録して後で目視する。

    **大きすぎる側だけでなく小さすぎる側も直す。** 「7,196」のように千円単位の
    数字を円の欄にタグ付けした書類があり、これは上限に当たらないので素通りする。
    10年ぶんに広げて初めて5件見つかった（2026年には無い）。
    """
    fixed = []
    for r in rows:
        s = r.get("avg_salary")
        if not s:
            continue
        FLOOR, ceiling = plausible_salary_range(r)
        if s < FLOOR:
            for mul in (10, 100, 1000, 10000):
                if FLOOR <= s * mul <= ceiling:
                    r["avg_salary"] = s * mul
                    r["salary_fixed"] = f"{s:.0f}→{s * mul:.0f}"
                    fixed.append(r)
                    break
            else:
                r["salary_fixed"] = f"{s:.0f}→除外"
                r["avg_salary"] = None
                fixed.append(r)
            continue
        if s <= ceiling:
            continue
        original = s
        for div in (10, 100, 1000, 10000):
            if FLOOR <= original / div <= ceiling:
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
    default_start, default_end = twelve_month_window()
    p.add_argument("--start", default=default_start.isoformat())
    p.add_argument("--end", default=default_end.isoformat())
    a = p.parse_args()

    rows, curve_table = build(
        a.limit, a.curve,
        date.fromisoformat(a.start), date.fromisoformat(a.end),
    )
    ok, body, by_raw, by_adj = analyse(rows, curve_table)
    report(ok, body, by_raw, by_adj)
    save(ok)


if __name__ == "__main__":
    main()
