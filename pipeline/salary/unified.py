"""全社を1つのランキングに統合する。

持株会社も事業会社も非上場の有報提出会社も、除外せず同じ表に載せる。
「単体カバー率」（単体従業員数 ÷ 連結従業員数）を列として持たせ、
その数字がグループの何割を映しているかを読者が自分で見られるようにする。

  python3 unified.py
"""

import csv
import re
import unicodedata
from datetime import date
from pathlib import Path

import curves
import edinet
import run

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "out"
OUT.mkdir(exist_ok=True)


# 単体従業員がこの人数に満たない会社は表に載せない。
# 数人しかいない持株会社が上位を埋めると、ランキングとして読めなくなる。
MIN_EMPLOYEES = 100


def badge(row):
    """その数字がグループの何を指しているかのラベル。"""
    ratio = row.get("emp_ratio")
    if ratio is None or ratio >= 0.1:
        return ""
    return "本社のみ"


def build(start=None, end=None):
    """母集団を組み直す（ADR-0011・`docs/expansion/spec.md` 1.1〜1.3）。

    **窓は回す日から遡って12か月**で、日付を直書きしない。`start`/`end` を渡せる
    のは再現のため——**CSV を作り直した窓は `design.md` に残す**。
    """
    if start is None or end is None:
        start, end = run.twelve_month_window()
    rows, curve_table = run.build(0, "年収", start, end)
    # **候補の絞り込みが先。** `fix_salary_typos` は帯の外の値を10の冪で戻すので、
    # 先に当てると候補のどれとも一致しない値になる（`resolve_ambiguous_salary`）。
    resolved, ambiguous = resolve_ambiguous_salary(rows)
    run.fix_salary_typos(rows)

    ok = [r for r in rows
          if r["avg_salary"] and r["avg_age"]
          and 20 <= r["avg_age"] <= 65 and r["avg_salary"] > 1_000_000]

    for r in ok:
        nc = r.get("employees_nonconsolidated")
        c = r.get("employees_consolidated")
        r["emp_ratio"] = round(nc / c, 4) if (nc and c and c > 0) else None
        r["badge"] = badge(r)

    body = [r for r in ok if (r.get("employees_nonconsolidated") or 0) >= MIN_EMPLOYEES]
    out = rebuild_derived(body, curve_table)
    save_universe(start, end, len(rows), len(ok), len(ok) - len(body), len(out),
                  ambiguous, resolved)
    return out


HISTORY_CSV = ROOT.parent / "data" / "salary_history.csv"


def salary_reference():
    """会社ごとの平均年間給与の基準値（10年推移の中央値）。EDINETコード → 円。

    **`history.resolve_candidates` が使うのと同じ基準**を、単年の母集団を組む側でも
    引けるようにしたもの。10年ぶんの取得（`timeseries`）はここより重いので、
    **その成果物を読むだけにする**——無い環境では基準を持たずに進む。
    """
    if not HISTORY_CSV.exists():
        return {}
    import statistics

    by_code = {}
    with open(HISTORY_CSV, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            try:
                value = float(r["avg_salary"])
            except (TypeError, ValueError, KeyError):
                continue
            if value > 0:
                by_code.setdefault(r["edinet_code"], []).append(value)
    return {code: statistics.median(v) for code, v in by_code.items()}


def resolve_ambiguous_salary(rows, reference=None):
    """**読み方が2通りに割れた平均年間給与を、2段で1つに絞る。**どちらでも決まらない
    行は採用しない（`docs/expansion/spec.md` 1.5b・AC-5b）。
    `(選び直した数, 落とした数)` を返す。

    「従業員の状況」本文の区切りの無いセルは、`231(13)57.309.822,360,598` が
    「勤続9.8／2,236万円」とも「勤続9.82／236万円」とも読める。**同型の並びで
    正解が逆になる例が実在する**ので、1書類の中では決められない（`textblock._best`）。
    いま採っているのは `DP_PAIRS` の並びで先に来たほう＝多くの場合は大きいほうで、
    **窓を12か月に広げると株式会社山田クラブ２１（E04731・非上場・従業員231人・
    平均年齢57.3歳）が2,236万円として実測値の3位に出ていた。**

    **1段目は帯。** 候補は10倍違うので、**片方だけが「平均年間給与としてあり得る帯」に
    入ることが多い**——サントリーホールディングスの `[1,176万, 176万]` は下が
    `SALARY_FLOOR`（200万）を割り、竹中工務店の `[1,153万, 153万]` も同じ。
    **判定は `run.plausible_salary_range`＝桁ズレ補正が使うのと同じ線**で、別に持つと
    片方だけ古い線で判断することになる。

    **2段目は年をまたぐ基準。** 帯で決まらなければ `history.resolve_candidates` と
    同じ規則——その会社の他の年に近いほうを採る。基準は10年推移
    （`pipeline/data/salary_history.csv`）の中央値で、**1年ぶんが同じ誤読をしていても
    中央値なら他の9年に引き戻される。**

    **どちらでも決まらなければ落とす。** 10倍違う2つの読みのうち片方を根拠なく選ぶ
    くらいなら、その会社の金額は「無い」ものとして扱う（数字の出典と計算方法を読者から
    見える場所に置く、という約束の裏返し）。**山田クラブ２１は2,236万も236万も帯の中で、
    10年推移にも1行も無いのでここで落ちる。** 新しく入る会社で同じことが起きたら、
    E4（#176）で10年ぶんを取り直せば基準ができ、そのとき拾い直せる。

    **textblock 由来そのものは切らない**（spec 1.5b）。候補が1つに決まる行は残す——
    同じ経路でサントリーホールディングス・日本経済新聞社・竹中工務店が正しく入る。

    **`run.fix_salary_typos` より先に走らせること。** あちらは帯の外の値を10の冪で
    帯に戻すので、先に当てると候補のどれとも一致しない値になる。
    """
    import math

    reference = salary_reference() if reference is None else reference
    resolved = dropped = 0
    for r in rows:
        cands = r.get("salary_candidates")
        if not cands or not r.get("avg_salary"):
            continue

        floor, ceiling = run.plausible_salary_range(r)
        plausible = [v for v in cands if floor <= v <= ceiling]
        if len(plausible) != 1:
            ref = reference.get(r.get("edinet_code") or "")
            if not ref:
                r["avg_salary"] = None
                dropped += 1
                continue
            # 帯で絞れたぶんがあればその中から、無ければ全候補から選ぶ。
            plausible = [min(plausible or cands, key=lambda v: abs(math.log(v / ref)))]

        if plausible[0] != r["avg_salary"]:
            r["avg_salary"] = plausible[0]
            resolved += 1
    return resolved, dropped


# 母集団の内訳。**CSV には行として残らないもの**（落とした会社の数と、取得の窓）を置く。
UNIVERSE_PATH = ROOT.parent / "data" / "universe.json"


def save_universe(start, end, fetched, eligible, excluded_by_employees, published,
                  ambiguous_salary, resolved_salary):
    """母集団の内訳を `pipeline/data/universe.json` に残す。

    **`/about` に「単体従業員100人未満で何社を省いたか」を出すため**
    （`docs/expansion/spec.md` 1.3・AC-4、運営者の指示 2026-08-24）。条件そのものは
    既に `/about` に理由付きで書いてあるが、**それが何社を落としているかは書いて
    いない**。窓を広げると掲載社数の3分の1を超える会社がこの線で落ちるので、
    **数を出さないと「有報を出している会社は全部載っている」と読めてしまう。**

    **CSV には書けない。** 落ちた会社はそもそも行にならない。社数（`meta.count`）と
    同じく**直書きせずデータから引く**ために、内訳だけを別に置く。

    **取得の窓もここに置く。** `/about` の「EDINET に◯◯に提出されたもの」は、
    窓が動くようになった以上（ADR-0011）データから引くしかない。
    """
    import json

    UNIVERSE_PATH.write_text(
        json.dumps(
            {
                "filingWindow": {"from": start.isoformat(), "to": end.isoformat()},
                # 窓の中の内国法人・組合として書類を読んだ会社
                "fetched": fetched,
                # 平均年間給与の読み方が割れた会社（AC-5b）。10年推移を基準に
                # 選び直せたぶんと、基準が無くて採用しなかったぶん。
                "resolvedSalary": resolved_salary,
                "ambiguousSalary": ambiguous_salary,
                # 平均年齢20〜65歳・平均年間給与100万円超を満たす会社
                "eligible": eligible,
                "minEmployees": MIN_EMPLOYEES,
                # そのうち単体従業員が足りずに落ちた会社（`/about` に出す数）
                "excludedByEmployees": excluded_by_employees,
                # 実際に掲載する会社（＝ CSV の行数）
                "published": published,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def rebuild_derived(rows, curve_table=None):
    """推定年収とそれに依存する列（salary35 / factor / 順位）を計算し直す。

    ここが CSV の派生列を作る唯一の場所。EDINET から取り直した直後（`build`）でも、
    既に手元にある CSV を式の変更に追随させるとき（`--from-csv`）でも同じ経路を通す。
    式が2箇所に分かれると、片方だけ直して静かに食い違う。
    """
    for r in rows:
        r["salary35"] = curves.estimate_salary(
            r["avg_salary"], r["avg_age"], 35.0, r["industry"], curve_table
        )
        # ADR-0005 では若い側が倍率で表せないので、実際に掛かった比率を入れる。
        r["factor"] = (
            round(r["salary35"] / r["avg_salary"], 4)
            if r["salary35"] and r["avg_salary"] else None
        )

    body = [r for r in rows if r["salary35"]]
    for i, r in enumerate(sorted(body, key=lambda r: -r["avg_salary"]), 1):
        r["rank_raw"] = i
    for i, r in enumerate(sorted(body, key=lambda r: -r["salary35"]), 1):
        r["rank_adj"] = i
    for r in body:
        r["rank_delta"] = r["rank_raw"] - r["rank_adj"]
    return sorted(body, key=lambda r: r["rank_adj"])


def load_csv(path):
    """既存の CSV を読む。派生列以外は文字列のまま持ち回して差分を最小にする。"""
    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        r["avg_age"] = float(r["avg_age"])
        r["avg_salary"] = float(r["avg_salary"])
    return rows


def _norm_name(s):
    """社名の突合用の正規化。全角/半角を揃え、空白をすべて落とす。

    法人格は落とさない。EDINETコードリスト側も法人格を含む正式名称を持って
    いるので、落としても得が無く、同名衝突が増えるだけになる。
    """
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", s or ""))


def backfill_edinet_code(rows):
    """EDINETコードリストと突合して edinet_code 列を埋める。

    公開URL `/company/[id]` の識別子は「証券コードがあればそれ、無ければ
    EDINETコード」（ADR-0006）。書類IDは毎年の有報提出で変わるので使わない。

    コードリストは現時点のスナップショットなので、証券コードだけでは足りない
    ——上場廃止で証券コードが外れた会社が引けない。社名でフォールバックし、
    同名が複数あるときは上場区分、それでも決まらなければ未割り当てのコードで
    絞る。**1件でも決まらなければ社名を列挙して異常終了する。** 空のまま進むと
    同名の別会社に静かに紐づき、URLが別の会社を指したまま公開されてしまう。
    """
    info = run.load_edinet_codelist()

    by_sec, by_name = {}, {}
    for code, v in info.items():
        sec = (v.get("sec_code") or "").strip()
        if sec:
            by_sec.setdefault(sec, []).append(code)
        by_name.setdefault(_norm_name(v.get("name")), []).append(code)

    used = set()
    pending = []
    for r in rows:
        sec = (r.get("sec_code") or "").strip()
        cands = by_sec.get(sec, []) if sec else []
        if len(cands) == 1:
            r["edinet_code"] = cands[0]
            used.add(cands[0])
        else:
            pending.append(r)

    unresolved = []
    for r in pending:
        cands = list(by_name.get(_norm_name(r.get("name")), []))
        if len(cands) > 1:
            same = [c for c in cands
                    if info[c].get("listed") == (r.get("listed") or "")]
            if len(same) == 1:
                cands = same
        if len(cands) > 1:
            free = [c for c in cands if c not in used]
            if len(free) == 1:
                cands = free
        if len(cands) == 1:
            r["edinet_code"] = cands[0]
            used.add(cands[0])
        else:
            unresolved.append((r.get("name"), r.get("sec_code"), cands))

    if unresolved:
        lines = "\n".join(
            f"  {name}（証券コード {sec or '無し'}）→ 候補 {cands or '無し'}"
            for name, sec, cands in unresolved
        )
        raise SystemExit(
            f"EDINETコードを決められない行が {len(unresolved)} 件あります。\n{lines}"
        )
    return rows


def backfill_corporate_number(rows):
    """EDINETコードリストの `提出者法人番号` を `corporate_number` 列に写す。

    **女性活躍DB（worklife 施策）との突合キー**（ADR-0009）。証券コードと社名では
    突合しない——女性活躍DB側の証券コードは自己申告で誤登録があり（阪急阪神HDの
    9042で阪神電気鉄道が返る）、社名は同名別会社が多い（マツダ株式会社は広島と
    兵庫に存在する）。実測では証券コード＋社名の突合が29社を別の会社に紐づけていた。

    引き当ては `edinet_code` 経由で行う。**1件でも引けなければ異常終了する**
    ——空のまま進むと、その会社だけ黙って「データ無し」になり、突合率が落ちた
    ことに気づけない。
    """
    info = run.load_edinet_codelist()

    missing = []
    for r in rows:
        code = (r.get("edinet_code") or "").strip()
        number = (info.get(code, {}).get("corporate_number") or "").strip()
        if not number:
            missing.append((r.get("name"), code))
        r["corporate_number"] = number

    if missing:
        lines = "\n".join(f"  {name}（EDINETコード {code or '無し'}）" for name, code in missing)
        raise SystemExit(
            f"法人番号を引けない行が {len(missing)} 件あります。\n{lines}"
        )
    return rows


HEADERS = ["rank_adj", "rank_raw", "rank_delta", "sec_code", "name", "tse33",
           "listed", "avg_age", "avg_tenure", "avg_salary", "salary35",
           "factor", "employees_nonconsolidated", "employees_consolidated",
           "emp_ratio", "badge", "industry", "source",
           "period_end", "edinet_code", "corporate_number", "doc_id"]


def save(rows, path=None):
    path = path or OUT / "ranking_unified.csv"
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=HEADERS, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    return path


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--from-csv",
        metavar="PATH",
        help="EDINET から取り直さず、既存の CSV の派生列（salary35・factor・順位）"
             "だけを今の式で計算し直す。推定式を変えたときに使う。",
    )
    ap.add_argument(
        "--backfill-edinet-code",
        metavar="PATH",
        help="EDINET から取り直さず、既存の CSV に edinet_code 列を埋める。"
             "公開URLの識別子（ADR-0006）に使う。",
    )
    ap.add_argument(
        "--backfill-corporate-number",
        metavar="PATH",
        help="EDINET から取り直さず、既存の CSV に corporate_number 列を埋める。"
             "女性活躍DBとの突合キー（ADR-0009）に使う。",
    )
    args = ap.parse_args()

    if args.backfill_corporate_number:
        rows = backfill_corporate_number(load_csv(args.backfill_corporate_number))
        path = save(rows, Path(args.backfill_corporate_number))
        print(f"\ncorporate_number を埋めた {len(rows)}社 → {path}")
        raise SystemExit(0)

    if args.backfill_edinet_code:
        rows = backfill_edinet_code(load_csv(args.backfill_edinet_code))
        path = save(rows, Path(args.backfill_edinet_code))
        print(f"\nedinet_code を埋めた {len(rows)}社 → {path}")
        raise SystemExit(0)

    if args.from_csv:
        # 読んだ CSV をその場で書き換える。列も行順も save() が決めるので揃う。
        rows = rebuild_derived(load_csv(args.from_csv))
        path = save(rows, Path(args.from_csv))
    else:
        rows = build()
        path = save(rows)
    print(f"\n統合ランキング {len(rows)}社（単体従業員{MIN_EMPLOYEES}人以上）→ {path}")
    print(f"  うち本社のみ（カバー率1割未満）: {sum(1 for r in rows if r['badge'])}社")
    print(f"  うち非上場: {sum(1 for r in rows if r['listed'] != '上場')}社")
    print("\n=== TOP25 ===")
    for r in rows[:25]:
        print(f"{r['rank_adj']:>3} ({r['rank_raw']:>4}) {r['name'][:24]:26} "
              f"{r['avg_age']:>4.1f}歳 {r['avg_salary']/1e4:>6.0f}万 → "
              f"{r['salary35']/1e4:>6.0f}万 {r['badge']}")
