"""EDINET API v2 クライアント。有報を取得して従業員データを抜き出す。

APIキーは環境変数 EDINET_API_KEY か、salary/.edinet_key ファイルから読む。
取得したZIPは cache/ に置き、再実行時は再ダウンロードしない。
"""

import io
import os
import csv
import time
import json
import zipfile
import urllib.parse
import urllib.request
from pathlib import Path
from collections import namedtuple
from datetime import date, timedelta

import businesstext

# **テキストブロックは `csv` の既定の上限（131,072字）を超えうる。** 「経営者による
# 分析」のような節は本文まるごと1セルに入る。超えると `csv.reader` が例外を投げ、
# **その書類だけが丸ごと読めなくなる**ので上限を上げておく。
csv.field_size_limit(10 * 1024 * 1024)

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

# 本文から拾うテキストブロック。**要素ごとに保存の条件も採り方も違う**ので、
# 要素名と一緒に持つ（C5・#159。以前は `TEXT_BLOCK` という単数の定数だった）。
#
#   keep  — その値を保存するか。従業員の状況は表の給与の行が要る（無い値は
#           `textblock.parse` が読めない）が、事業の内容は空でなければ採る
#   multi — 同じ要素が複数のファイルに現れたとき、全部集めるか最初の1つで足りるか。
#           集めたほうの採り方は `businesstext.pick`（最長）が持つ
TextBlockSpec = namedtuple("TextBlockSpec", "slot keep multi")

TEXT_BLOCKS = {
    # 平均年間給与をタグ付けしていない会社（持株会社傘下の事業会社に多い）のために
    # 「従業員の状況」の本文を持つ。読むのは `textblock.py`。
    "jpcrp_cor:InformationAboutEmployeesTextBlock": TextBlockSpec(
        "employees_textblock", lambda v: "平均年間給与" in v, False
    ),
    # 会社の説明文の原文（C5・ADR-0010）。**要約はここでは作らない。**
    "jpcrp_cor:DescriptionOfBusinessTextBlock": TextBlockSpec(
        "business_textblocks", lambda v: bool(v.strip()), True
    ),
}


def api_key():
    k = os.environ.get("EDINET_API_KEY")
    if k:
        return k.strip()
    f = ROOT / ".edinet_key"
    if f.exists():
        return f.read_text().strip()
    raise SystemExit(
        "EDINET APIキーが未設定。環境変数 EDINET_API_KEY か salary/.edinet_key に置いてください。"
    )


def _get(url, params, timeout=60, retries=3):
    params = dict(params)
    params["Subscription-Key"] = api_key()
    full = url + "?" + urllib.parse.urlencode(params)
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(full, headers={"User-Agent": "salary/1.0"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(2 * (i + 1))
    raise last


def _list_status(data):
    """書類一覧の応答を仕分ける。`"ok"` / `"empty"` / `None`（不正）。

    流量制限の本文 `{"statusCode":"429","message":"Too Many Requests"}` は JSON と
    しては妥当なので `json.loads` を通ってしまう。**`metadata` の中身まで見ないと、
    エラー本文が「その日は提出0件」として通る。** 429 の本文には `metadata` が無い
    ので、そこで落ちる。

    `status` が `"404"` の日（未来日・保持期間外）は**エラーではなく「取れない」と
    いう正しい答え**なので、そのまま置いて引き直さない。`results` を持たないため
    呼び出し側の `data.get("results") or []` が空として扱う。
    """
    if not isinstance(data, dict):
        return None
    meta = data.get("metadata")
    if not isinstance(meta, dict):
        return None
    status = str(meta.get("status"))
    if status == "200" and "results" in data:
        return "ok"
    if status == "404":
        return "empty"
    return None


def list_documents(day, retries=5):
    """指定日に提出された書類一覧。

    **EDINETは流量制限に HTTP 200 で応える**（`fetch_csv` の注記と同じ）。
    一覧はZIPと違い応答がJSONなので、検めずに書くと `{"statusCode":"429"}` が
    そのまま `cache/list_<date>.json` に残る。**その日の提出書類が丸ごと0件と
    して扱われ、母集団から会社が静かに消える。** 中身を確かめてから書く。
    """
    cache = CACHE / f"list_{day.isoformat()}.json"
    if cache.exists():
        data = json.loads(cache.read_text())
        if _list_status(data):
            return data
        # 検証を入れる前に置かれたエラー本文。捨てて取り直す。
        cache.unlink()
    for i in range(retries):
        raw = _get(f"{BASE}/documents.json", {"date": day.isoformat(), "type": "2"})
        try:
            data = json.loads(raw.decode("utf-8"))
        except ValueError:
            data = None
        if data is not None and _list_status(data):
            cache.write_text(json.dumps(data, ensure_ascii=False))
            return data
        if i == retries - 1:
            raise RuntimeError(f"{day.isoformat()}: 書類一覧ではない応答 {raw[:120]!r}")
        time.sleep(2 ** (i + 1))


def doc_rank(r):
    """同じ会社の書類のうちどれを採るかの順序（大きいほうが勝つ）。

    **期末が新しいほう、同じなら `docID` が大きいほう**（ADR-0011・
    `docs/expansion/spec.md` 1.2）。後者は訂正報告を後勝ちにするためで、
    `fetch_history.targets()` が10年ぶんで使っている規則と同じ。
    """
    return (r.get("periodEnd") or "", r.get("docID") or "")


def annual_reports(start, end, verbose=True):
    """窓の中に提出された有価証券報告書（`docTypeCode=120`）を、**EDINETコードで
    1社1件に寄せて**返す。両端を含む。

    **証券コードの有無で経路を分けない。** 非上場の有報提出会社（みずほ銀行・
    三井住友銀行など）も同じ経路で入る。**提出者種別（内国法人・組合）による
    絞り込みは呼び出し側**（`run.build`）が EDINETコードリストで行う——ここは
    API の答えを窓で切って寄せるだけにする。

    **寄せ方は `doc_rank` の順で「勝ったほうを残す」。** 以前は証券コードをキーに
    「後に見つかったものが勝つ」で潰しており、**どれが残るかが走査順に依存して
    いた**。窓を12か月に広げるとこれが会社を落とす——りそな銀行と三井住友信託銀行は
    窓の中にそれぞれ4件の有報を持ち、**「従業員の状況」を持たない書類が残って
    母集団から消えていた**（実測。ADR-0011）。

    **キーが証券コードでは足りない理由**（ADR-0006 と同じ）。証券コードは非上場の
    会社に無く、上場廃止で外れる。EDINETコードは年をまたいで変わらない。
    """
    best = {}
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
                if r.get("docTypeCode") == "120" and r.get("edinetCode")
                and not r.get("withdrawalStatus") == "1"
            ]
            for r in hits:
                code = r["edinetCode"]
                cur = best.get(code)
                if cur is None or doc_rank(r) > doc_rank(cur):
                    best[code] = r
            if verbose and hits:
                print(f"  {day} 有報 {len(hits)}件")
        day += timedelta(days=1)
    return list(best.values())


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
    """ZIP内のTSVから必要な要素を抜き出す。

    **値は `csv` モジュールで読む。`split("\t")` と `strip('"')` では読めない。**
    EDINET の TSV は RFC 4180 と同じ引用符の規則で、本文に含まれる `"` は `""` に
    倍にして書かれている。素で割ると**倍のまま原文に残る**（「事業の内容」の実測で
    600社中4社。`""ラメント""` のような形になる）。要約に渡す原文（C5・#159）では
    引用符は中身の一部なので、ここで戻しておく。
    """
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
        reader = csv.reader(io.StringIO(text), delimiter="\t")
        next(reader, None)  # 見出し行
        for cols in reader:
            cols = [c.strip() for c in cols]
            if len(cols) < 9:
                continue
            elem, ctx, value = cols[0], cols[2], cols[8]
            spec = TEXT_BLOCKS.get(elem)
            if spec:
                if spec.keep(value):
                    if spec.multi:
                        rec.setdefault(spec.slot, []).append(value)
                    else:
                        rec.setdefault(spec.slot, value)
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
        # 会社の説明文の原文（C5・#159）。**平文にしてから持つ**——整える規則を
        # 読む側ごとに書き写さないため（`businesstext.py`）。要約は C6 が作る。
        "business_text": businesstext.pick(parsed.get("business_textblocks")),
    }
