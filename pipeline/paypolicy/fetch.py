"""給与の決定方針の原文を取る（C18・#851・親 #850）。

    cd pipeline/paypolicy && python3 fetch.py            # 対象の全書類
    cd pipeline/paypolicy && python3 fetch.py --limit 20 # 試しに20件

**CSV 形式（`type=5`）ではなく XBRL 本体（`type=1`）を落とす。** CSV の値は段落の
区切りを落とす（NTT の節は改行も全角空白も0個で、PDF では5段落）。XBRL 本体の
HTML なら段落が p 要素のまま残っている。C5・C8 が CSV で足りたのは、要約の材料で
あって原文を画面に出さなかったからで、C19 は原文を段落ごとに出す。

**ZIP は残さない。** 1件約1.9MB で1,925件なら約3.6GB になる。使うのは HTML の中の
3つの節だけなので、それを `cache/{書類ID}.json` に書いて ZIP は捨てる。

- `section` — 「人材戦略に関する基本方針等」。**タクソノミに標準の要素が無く、各社の
  独自要素で付いている**（2026年版タクソノミは府令の改正より前の公表）。名前はほとんどが
  `jpcrp030000-asr_{EDINETコード}-000:BasicPolicyOnHumanResourcesStrategyEmployeesEtcTextBlock`
  （無作為100件で100件）だが、**`…:BasicPolicyOnHumanResourcesStrategyTextBlock` の会社がある**
  （いすゞ）。`BasicPolicyOnHumanResources` で始まり `TextBlock` で終わる名前を拾う。
  **独自要素を付けずに「従業員の状況」の要素に節ごと入れる会社もある**（TDK。(1) と (2) を
  1つの要素にしている）ので、節が見つからなければそちらから見出しで切り出す
- `sustainability` — 「サステナビリティに関する考え方及び取組」。節の中では参照先だけを
  示し、給与の決定方針の本文をここに書く会社がある（KDDI・兼松）
- `employees` — 「従業員の状況」。この Unit では使わない。持株会社の最大人員会社の表が
  ここにあり（spec 1.23 の対象外）、後の Unit が ZIP を取り直さずに済むよう残す

対象は決算期末が2026年3月31日以後の書類（`ranking_unified_2026.csv` の `doc_id`。
平均年間給与を取ったのと同じ書類）。**それより前の書類にはこの節がそもそも無い**
（開示府令 第二号様式 記載上の注意 (58-2) の適用時期）。
"""

import argparse
import csv
import json
import re
import sys
import time
import zipfile
import io
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent / "salary"))
import edinet  # noqa: E402

CACHE = ROOT / "cache"
UNIFIED = ROOT / "../data/ranking_unified_2026.csv"

# 開示府令の改正（(58-2)・(58-3)）は「2026年3月31日以後に終了する事業年度」から
FIRST_PERIOD_END = "2026-03-31"

SECTION_NAME = re.compile(r":BasicPolicyOnHumanResources\w*TextBlock$")
SUSTAINABILITY = "jpcrp_cor:DisclosureOfSustainabilityRelatedFinancialInformationTextBlock"
EMPLOYEES = "jpcrp_cor:InformationAboutEmployeesTextBlock"

# 「従業員の状況」の要素に節ごと入っているときの切り出しに使う見出し
_SECTION_TITLE = re.compile(r"【人[材財]戦略に関する基本方針等?】")
_EMPLOYEES_TITLE = re.compile(r"【従業員の状況】")

# EDINET は流量制限に HTTP 200 で応える（`edinet.fetch_csv` の説明）。並列は3まで。
WORKERS = 3


def targets():
    """決算期末が2026年3月31日以後の書類。`ranking_unified_2026.csv` の並びのまま。"""
    with open(UNIFIED, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    return [r for r in rows if r["period_end"] >= FIRST_PERIOD_END]


_OPEN = re.compile(r'<ix:nonNumeric\b[^>]*\bname="([^"]+)"[^>]*(?<!/)>')
# **閉じタグの無い `<ix:nonNumeric … />` がある**（無作為100件で899個。空の値に使う）。
# 深さに数えると、節の中にあったときに閉じタグで0に戻らなくなる
_TAG = re.compile(r"<(/?)ix:nonNumeric\b[^>]*?(/?)>")


def _inner(html, start):
    """`start` にある ix:nonNumeric の開きタグから、対応する閉じタグまでの中身。

    **入れ子になる。** サステナビリティの節は、人的資本や気候変動の小さな節を
    ix:nonNumeric の中に ix:nonNumeric として持つ。最初の閉じタグで切ると外側が途中で切れる。
    """
    depth = 0
    for m in _TAG.finditer(html, start):
        if m.group(2):
            continue  # `<ix:nonNumeric … />`。中身を持たない
        depth += -1 if m.group(1) else 1
        if depth == 0:
            open_end = html.index(">", start) + 1
            return html[open_end:m.start()]
    raise ValueError("ix:nonNumeric が閉じていない")


def find_blocks(html):
    """1つの HTML から3つの節の中身を拾う。見つからなければキーごと持たない。"""
    found = {}
    for m in _OPEN.finditer(html):
        name = m.group(1)
        if SECTION_NAME.search(name):
            key = "section"
        elif name == SUSTAINABILITY:
            key = "sustainability"
        elif name == EMPLOYEES:
            key = "employees"
        else:
            continue
        found.setdefault(key, []).append((name, _inner(html, m.start())))
    return found


def extract(zip_bytes):
    """ZIP の本文（PublicDoc の htm）から3つの節を取り出す。

    同じ節が2つ以上の要素で見つかったら、全部を残して数える（`count` に件数）。
    **黙って最初の1つを採らない**——無作為100件では0件だったが、全件で起きたら
    どちらを採るかを決め直す必要がある。
    """
    z = zipfile.ZipFile(io.BytesIO(zip_bytes))
    out = {}
    for name in sorted(z.namelist()):
        if "PublicDoc/" not in name or not name.endswith(".htm"):
            continue
        html = z.read(name).decode("utf-8", "replace")
        for key, items in find_blocks(html).items():
            for element, inner in items:
                out.setdefault(key, []).append({"file": name.rsplit("/", 1)[-1], "element": element, "html": inner})
    if "section" not in out:
        for item in out.get("employees", []):
            cut = section_from_employees(item["html"])
            if cut is not None:
                out["section"] = [{"file": item["file"], "element": f"fallback:{item['element']}", "html": cut}]
                break
    return out


def section_from_employees(inner):
    """「従業員の状況」の要素の中から「人材戦略に関する基本方針等」の節を切り出す。

    節の見出しの直前のタグから、「【従業員の状況】」の見出しの直前のタグまで。見出しが
    無ければ None。
    """
    m = _SECTION_TITLE.search(inner)
    if not m:
        return None
    start = inner.rfind("<", 0, m.start())
    e = _EMPLOYEES_TITLE.search(inner, m.end())
    end = inner.rfind("<", 0, e.start()) if e else len(inner)
    return inner[max(start, 0):end]


def fetch_one(doc_id, retries=5):
    """1件取る。**失敗は例外にせず理由の文字列で返す**——1件の読めない書類で全体を止めない
    （1,533件目で止まったことがある）。"""
    try:
        return _fetch_one(doc_id, retries)
    except Exception as e:  # noqa: BLE001
        return doc_id, f"{type(e).__name__}: {e}"


def _fetch_one(doc_id, retries):
    path = CACHE / f"{doc_id}.json"
    if path.exists():
        return doc_id, "cached"
    for i in range(retries):
        blob = edinet._get(f"{edinet.BASE}/documents/{doc_id}", {"type": "1"}, timeout=180)
        if blob[:2] == b"PK":
            blocks = extract(blob)
            path.write_text(json.dumps({"doc_id": doc_id, **blocks}, ensure_ascii=False))
            time.sleep(0.35)
            return doc_id, "ok"
        # 429 などのエラー本文。待って引き直す（2,4,8,16,32秒）
        time.sleep(2 ** (i + 1))
    return doc_id, f"not a zip: {blob[:80]!r}"


def repair():
    """キャッシュにあって節が無い書類を、今の拾い方でもう一度見る。

    「従業員の状況」から切り出せればキャッシュを書き直し、切り出せなければキャッシュを
    消して取り直させる（拾い方を広げる前に取った書類のため）。消した書類 ID を返す。
    """
    dropped = []
    for r in targets():
        path = CACHE / f"{r['doc_id']}.json"
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("section"):
            continue
        for item in data.get("employees", []):
            cut = section_from_employees(item["html"])
            if cut is not None:
                data["section"] = [{"file": item["file"], "element": f"fallback:{item['element']}", "html": cut}]
                path.write_text(json.dumps(data, ensure_ascii=False))
                break
        else:
            path.unlink()
            dropped.append(r["doc_id"])
    return dropped


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--repair", action="store_true", help="節の無いキャッシュを見直してから取る")
    args = ap.parse_args()
    CACHE.mkdir(exist_ok=True)
    if args.repair:
        dropped = repair()
        print(f"節の無いキャッシュを消して取り直す: {len(dropped)}件 {dropped}")
    docs = [r["doc_id"] for r in targets()]
    if args.limit:
        docs = docs[: args.limit]
    started = time.time()
    results = {}
    with ThreadPoolExecutor(WORKERS) as ex:
        for n, (doc_id, status) in enumerate(ex.map(fetch_one, docs), 1):
            results[doc_id] = status
            if n % 50 == 0 or n == len(docs):
                print(f"{n}/{len(docs)} {time.time() - started:.0f}s", flush=True)
    failed = {d: s for d, s in results.items() if s not in ("ok", "cached")}
    print(f"対象 {len(docs)}件 / 取得 {sum(s == 'ok' for s in results.values())}件"
          f" / キャッシュ {sum(s == 'cached' for s in results.values())}件 / 失敗 {len(failed)}件")
    for d, s in failed.items():
        print(f"  失敗 {d}: {s}")


if __name__ == "__main__":
    main()
