"""EDINET API v2 クライアント。有報を取得して従業員データを抜き出す。

APIキーは環境変数 EDINET_API_KEY か、salary35/.edinet_key ファイルから読む。
取得したZIPは cache/ に置き、再実行時は再ダウンロードしない。
"""

import io
import os
import time
import json
import zipfile
import urllib.parse
import urllib.request
from pathlib import Path
from datetime import date, timedelta

BASE = "https://api.edinet-fsa.go.jp/api/v2"
ROOT = Path(__file__).resolve().parent
CACHE = ROOT / "cache"
CACHE.mkdir(exist_ok=True)

# 有報の「従業員の状況」でタグ付けされている要素
ELEMENTS = {
    "jpcrp_cor:AverageAnnualSalaryInformationAboutReportingCompanyInformationAboutEmployees": "avg_salary",
    "jpcrp_cor:AverageAgeYearsInformationAboutReportingCompanyInformationAboutEmployees": "avg_age",
    "jpcrp_cor:AverageLengthOfServiceYearsInformationAboutReportingCompanyInformationAboutEmployees": "avg_tenure",
    "jpcrp_cor:NumberOfEmployees": "employees",
    "jpdei_cor:SecurityCodeDEI": "sec_code",
    "jpdei_cor:EDINETCodeDEI": "edinet_code",
    "jpdei_cor:FilerNameInJapaneseDEI": "name",
    "jpdei_cor:CurrentFiscalYearEndDateDEI": "fy_end",
}

# タグ付けされていない会社のために本文から拾う
TEXT_BLOCK = "jpcrp_cor:InformationAboutEmployeesTextBlock"


def api_key():
    k = os.environ.get("EDINET_API_KEY")
    if k:
        return k.strip()
    f = ROOT / ".edinet_key"
    if f.exists():
        return f.read_text().strip()
    raise SystemExit(
        "EDINET APIキーが未設定。環境変数 EDINET_API_KEY か salary35/.edinet_key に置いてください。"
    )


def _get(url, params, timeout=60, retries=3):
    params = dict(params)
    params["Subscription-Key"] = api_key()
    full = url + "?" + urllib.parse.urlencode(params)
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(full, headers={"User-Agent": "salary35/1.0"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(2 * (i + 1))
    raise last


def list_documents(day):
    """指定日に提出された書類一覧。"""
    cache = CACHE / f"list_{day.isoformat()}.json"
    if cache.exists():
        return json.loads(cache.read_text())
    raw = _get(f"{BASE}/documents.json", {"date": day.isoformat(), "type": "2"})
    data = json.loads(raw.decode("utf-8"))
    cache.write_text(json.dumps(data, ensure_ascii=False))
    return data


def annual_reports(start, end, verbose=True):
    """期間内に提出された有価証券報告書（docTypeCode=120）を列挙する。"""
    out = []
    day = start
    while day <= end:
        if day.weekday() < 5:  # 土日はまず提出がない
            try:
                data = list_documents(day)
            except Exception as e:  # noqa: BLE001
                if verbose:
                    print(f"  {day} 取得失敗: {e}")
                day += timedelta(days=1)
                continue
            hits = [
                r for r in (data.get("results") or [])
                if r.get("docTypeCode") == "120" and r.get("secCode")
                and not r.get("withdrawalStatus") == "1"
            ]
            out.extend(hits)
            if verbose and hits:
                print(f"  {day} 有報 {len(hits)}件")
        day += timedelta(days=1)
    # 同一企業の訂正・重複は後勝ちで1件に寄せる
    uniq = {}
    for r in out:
        uniq[r["secCode"]] = r
    return list(uniq.values())


def fetch_csv(doc_id, retries=5):
    """CSV形式（type=5）のZIPを取得。中身はUTF-16LEのTSV。

    **EDINETは流量制限に HTTP 200 で応える。** 本文が
    `{"StatusCode":"429","message":"Too Many Requests"}` の JSON になるだけなので、
    `urlopen` は例外を投げない。中身を検めずに書くと、ZIPのつもりで50バイトの
    エラーJSONがキャッシュに残り、後段の抽出だけが静かに欠ける（実際に17,719件中
    5,195件がこれで、取得側は fail=0 と報告していた）。**先頭が `PK` であることを
    確かめてから書く。**
    """
    path = CACHE / f"{doc_id}.zip"
    if path.exists():
        return path
    for i in range(retries):
        blob = _get(f"{BASE}/documents/{doc_id}", {"type": "5"}, timeout=120)
        if blob[:2] == b"PK":
            path.write_bytes(blob)
            time.sleep(0.35)
            return path
        # 429 などのエラー本文。待って引き直す（待ち時間は 2,4,8,16,32秒）
        if i == retries - 1:
            raise RuntimeError(f"{doc_id}: ZIPではない応答 {blob[:120]!r}")
        time.sleep(2 ** (i + 1))
    return path


def parse_csv_zip(path):
    """ZIP内のTSVから必要な要素を抜き出す。"""
    rec = {}
    try:
        z = zipfile.ZipFile(path)
    except zipfile.BadZipFile:
        return rec
    for name in z.namelist():
        if not name.lower().endswith(".csv"):
            continue
        raw = z.read(name)
        try:
            text = raw.decode("utf-16")
        except UnicodeError:
            text = raw.decode("utf-8", "replace")
        for line in text.splitlines()[1:]:
            cols = [c.strip().strip('"') for c in line.split("\t")]
            if len(cols) < 9:
                continue
            elem, ctx, value = cols[0], cols[2], cols[8]
            if elem == TEXT_BLOCK and "平均年間給与" in value:
                rec.setdefault("employees_textblock", value)
                continue
            key = ELEMENTS.get(elem)
            if not key:
                continue
            if value in ("", "－", "-"):
                continue
            # 当期のみ。セグメント別の内訳（コンテキストに Member が付くもの）は捨てる
            if ctx == "CurrentYearInstant" or ctx == "CurrentYearDuration":
                slot = key
            elif ctx in ("CurrentYearInstant_NonConsolidatedMember",
                         "CurrentYearDuration_NonConsolidatedMember"):
                slot = f"{key}__nc"
            elif ctx == "FilingDateInstant":
                slot = key
            else:
                continue
            rec.setdefault(slot, value)
    return rec


def to_record(meta, parsed):
    def num(v):
        try:
            return float(str(v).replace(",", ""))
        except (TypeError, ValueError):
            return None

    emp_nc = num(parsed.get("employees__nc"))
    emp_c = num(parsed.get("employees"))
    salary = num(parsed.get("avg_salary__nc") or parsed.get("avg_salary"))
    age = num(parsed.get("avg_age__nc") or parsed.get("avg_age"))
    tenure = num(parsed.get("avg_tenure__nc") or parsed.get("avg_tenure"))
    source = "tag"

    # 平均年間給与をタグ付けしていない会社（持株会社傘下の事業会社に多い）は
    # 「従業員の状況」本文から拾う
    candidates = None
    if not (salary and age) and parsed.get("employees_textblock"):
        import textblock
        got = textblock.parse(parsed["employees_textblock"], emp_nc)
        if got:
            # 読み方が割れた場合の他の候補。1書類の中では決められないので、
            # 年をまたいで選び直す側（history.py）に渡す。
            candidates = got.get("candidates")
            salary = salary or got["avg_salary"]
            age = age or got["avg_age"]
            tenure = tenure or got.get("avg_tenure")
            emp_nc = emp_nc or got.get("employees_parsed")
            source = "textblock"

    return {
        "sec_code": (meta.get("secCode") or "")[:4],
        "edinet_code": meta.get("edinetCode"),
        "name": meta.get("filerName"),
        "doc_id": meta.get("docID"),
        "period_end": meta.get("periodEnd"),
        "avg_salary": salary,
        "avg_age": age,
        "avg_tenure": tenure,
        "source": source,
        "employees_nonconsolidated": emp_nc,
        "employees_consolidated": emp_c,
        "salary_candidates": candidates,
    }
