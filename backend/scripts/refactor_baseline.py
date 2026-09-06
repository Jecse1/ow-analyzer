# -*- coding: utf-8 -*-
"""
refactor_baseline.py — main.py 모듈 분리(리팩토링 2단계) 회귀 검증용 기준 덤프.

목적:
    "이관 전(baseline)" 산출물의 바이트/sha256 을 저장하고, 이후 각 이관 단계마다
    동일 스크립트를 --compare 로 실행해 전 항목이 1비트도 바뀌지 않았음을 표로 증명한다.
    (함수 본문은 이동만 하므로 API 응답·파싱 결과·게임데이터 덤프가 diff-0 이어야 한다.)

측정 항목:
    A. API 응답 8종 (백엔드 :8000 기동 필요, 콜드 1회 호출 후 측정 = 캐시 안정 상태):
       /api/scrims, /api/fight-records?base_team=FLC, /api/first-fights,
       /api/player-fight-stats, /api/scrims/full-events,
       /api/scrims/{첫 세션 id}, /api/matches/{첫 매치 id}, /openapi.json
    B. parse_overwatch_log 결과(키 정렬 JSON) sha256 — 샘플 2건(한국어 + 영어 변환본).
       변환본은 game_data(ko->en) 매핑으로 결정적 생성, baseline/fixtures/ 에 고정 저장.
    C. dump_game_data.py 결과 sha256 (게임데이터 파생 불변 증거).
    D. import main 부작용: ROW_DATA_DIR 존재, id(main._RESPONSE_CACHE)(동일 프로세스 내 단일 객체 증거).

사용:
    python scripts/refactor_baseline.py                 # 기준 저장 → dumps/split/baseline/
    python scripts/refactor_baseline.py --compare baseline   # 재측정 후 baseline 과 비교 표 출력(불일치 시 exit 1)

주의: backend/ 에서 실행. API 항목은 백엔드가 127.0.0.1:8000 에 떠 있어야 한다.
"""
from __future__ import annotations
import os, sys, json, hashlib, argparse, subprocess, urllib.request

_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.dirname(_HERE)
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

BASE_URL = "http://127.0.0.1:8000"
OUT_ROOT = os.path.join(_BACKEND, "dumps", "split")
BASELINE_DIR = os.path.join(OUT_ROOT, "baseline")
FIX_DIR = os.path.join(BASELINE_DIR, "fixtures")


def _sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def _http_get(path: str) -> bytes:
    with urllib.request.urlopen(BASE_URL + path, timeout=120) as r:
        return r.read()


def _api_dumps() -> dict:
    # 첫 세션/매치 id 동적 발견
    scrims = json.loads(_http_get("/api/scrims").decode("utf-8"))
    first_sid = scrims[0]["id"] if scrims else None
    first_mid = None
    if first_sid:
        detail = json.loads(_http_get(f"/api/scrims/{first_sid}").decode("utf-8"))
        matches = detail.get("matches") or []
        if matches:
            first_mid = matches[0].get("id")
    paths = [
        ("scrims", "/api/scrims"),
        ("fight-records", "/api/fight-records?base_team=FLC"),
        ("first-fights", "/api/first-fights"),
        ("player-fight-stats", "/api/player-fight-stats"),
        ("full-events", "/api/scrims/full-events"),
        ("openapi", "/openapi.json"),
    ]
    if first_sid:
        paths.append(("scrim-detail", f"/api/scrims/{first_sid}"))
    if first_mid:
        paths.append(("match-detail", f"/api/matches/{first_mid}"))
    out = {}
    for name, p in paths:
        _http_get(p)              # 콜드 1회(캐시 워밍)
        b = _http_get(p)          # 측정
        out[name] = {"path": p, "bytes": len(b), "sha256": _sha(b)}
    return out


def _build_ko2en() -> dict:
    """game_data 로 ko->en 토큰 맵 구성(영어 변환본 생성용, 결정적)."""
    import game_data as gd
    heroes = gd.HEROES_DATA
    maps = gd.MAPS_DATA
    m: dict = {}
    for h in heroes:
        en = h.get("en")
        if not en:
            continue
        for k in [h.get("logName"), h.get("ko"), *(h.get("aliases") or [])]:
            if k and k not in m:
                m[k] = en
    for mp in maps:
        en = mp.get("en")
        if not en:
            continue
        for k in [mp.get("ko"), *(mp.get("aliases") or [])]:
            if k and k not in m:
                m[k] = en
    # 모드(타입) ko->en + 팀 토큰
    for ko, en in {"쟁탈": "Control", "화물": "Escort", "혼합": "Hybrid",
                   "밀기": "Push", "플래시포인트": "Flashpoint", "격돌": "Clash"}.items():
        m.setdefault(ko, en)
    m.setdefault("1팀", "Team 1")
    m.setdefault("2팀", "Team 2")
    return m


def _to_english(log_text: str, ko2en: dict) -> str:
    """콤마 구분 필드 중 정확히 일치하는 ko 토큰만 en 으로 치환(결정적)."""
    out_lines = []
    for line in log_text.splitlines():
        # 시간 프리픽스 "[..] " 보존
        prefix = ""
        rest = line
        if line.startswith("[") and "] " in line:
            i = line.index("] ") + 2
            prefix, rest = line[:i], line[i:]
        fields = rest.split(",")
        fields = [ko2en.get(f.strip(), f) for f in fields]
        out_lines.append(prefix + ",".join(fields))
    return "\n".join(out_lines) + ("\n" if log_text.endswith("\n") else "")


def _parse_dumps() -> dict:
    import main
    os.makedirs(FIX_DIR, exist_ok=True)
    # 샘플 로그: scrim_rowdata_log 최근 .txt 1건
    rd = os.path.join(_BACKEND, "scrim_rowdata_log")
    txts = sorted([f for f in os.listdir(rd) if f.endswith(".txt")], reverse=True)
    if not txts:
        return {"error": "no sample .txt"}
    src = os.path.join(rd, txts[0])
    with open(src, "r", encoding="utf-8", errors="ignore") as f:
        ko_log = f.read()
    ko2en = _build_ko2en()
    en_log = _to_english(ko_log, ko2en)
    # 고정 픽스처 저장(비교 시 동일 입력 보장)
    ko_fix = os.path.join(FIX_DIR, "sample_ko.txt")
    en_fix = os.path.join(FIX_DIR, "sample_en.txt")
    if not os.path.exists(ko_fix):
        with open(ko_fix, "w", encoding="utf-8", newline="\n") as f:
            f.write(ko_log)
    if not os.path.exists(en_fix):
        with open(en_fix, "w", encoding="utf-8", newline="\n") as f:
            f.write(en_log)
    # 항상 고정 픽스처를 입력으로 사용
    with open(ko_fix, "r", encoding="utf-8") as f:
        ko_in = f.read()
    with open(en_fix, "r", encoding="utf-8") as f:
        en_in = f.read()

    import pprint
    def parse_sha(text):
        parsed = main.parse_overwatch_log(text)
        # parse 결과에 튜플 키가 있어 json 불가 → pprint(정렬)로 결정적 직렬화.
        blob = pprint.pformat(parsed, width=200, sort_dicts=True).encode("utf-8")
        return {"bytes": len(blob), "sha256": _sha(blob)}

    return {
        "korean": {"source": txts[0], **parse_sha(ko_in)},
        "english": {"fixture": "sample_en.txt", **parse_sha(en_in)},
    }


def _dump_game_data_sha() -> dict:
    tmp = os.path.join(OUT_ROOT, "_gd_tmp.json")
    os.makedirs(OUT_ROOT, exist_ok=True)
    subprocess.run([sys.executable, os.path.join(_HERE, "dump_game_data.py"), tmp],
                   cwd=_BACKEND, check=True, stderr=subprocess.DEVNULL)
    with open(tmp, "rb") as f:
        b = f.read()
    os.remove(tmp)
    return {"bytes": len(b), "sha256": _sha(b)}


def _import_side_effects() -> dict:
    import main
    return {
        "row_data_dir_exists": os.path.isdir(os.path.join(_BACKEND, "scrim_rowdata_log")),
        "response_cache_is_dict": isinstance(getattr(main, "_RESPONSE_CACHE", None), dict),
    }


def _canonical_openapi() -> dict:
    """openapi.json 을 정규화(paths 키 정렬·각 path 내 method 정렬·components.schemas 키 정렬)해
    sha256 을 낸다. 라우터 분리로 paths '나열 순서'만 바뀌어도 이 값은 불변이어야 한다.
    반환: {sha256, paths(정렬된 경로 키 리스트)}."""
    raw = _http_get("/openapi.json")
    doc = json.loads(raw.decode("utf-8"))
    paths = doc.get("paths", {})
    canon_paths = {p: {m: paths[p][m] for m in sorted(paths[p].keys())} for p in sorted(paths.keys())}
    schemas = (doc.get("components", {}) or {}).get("schemas", {}) or {}
    canon = {"paths": canon_paths, "schemas": {k: schemas[k] for k in sorted(schemas.keys())}}
    blob = json.dumps(canon, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return {"sha256": _sha(blob), "paths": sorted(paths.keys())}


def capture() -> dict:
    return {
        "api": _api_dumps(),
        "parse": _parse_dumps(),
        "dump_game_data": _dump_game_data_sha(),
        "openapi_canonical": _canonical_openapi(),
        "side_effects": _import_side_effects(),
    }


def _flatten(d: dict, prefix="") -> dict:
    """판정용 평탄화. 원시 openapi(api.openapi.*)는 '경로 나열 순서'로 sha가 바뀌므로 판정 제외(참고용).
    대신 openapi_canonical.sha256 을 판정에 포함."""
    flat = {}
    for k, v in d.items():
        key = f"{prefix}{k}"
        if isinstance(v, dict):
            flat.update(_flatten(v, key + "."))
        elif k in ("sha256", "bytes", "row_data_dir_exists", "response_cache_is_dict"):
            flat[key] = v
    # 원시 openapi 바이트/sha 는 판정에서 제외(순서만 바뀜)
    flat.pop("api.openapi.sha256", None)
    flat.pop("api.openapi.bytes", None)
    return flat


def main_cli():
    ap = argparse.ArgumentParser()
    ap.add_argument("--compare", metavar="NAME", help="기준(baseline)과 비교")
    args = ap.parse_args()
    cur = capture()
    if not args.compare:
        os.makedirs(BASELINE_DIR, exist_ok=True)
        with open(os.path.join(BASELINE_DIR, "manifest.json"), "w", encoding="utf-8", newline="\n") as f:
            json.dump(cur, f, ensure_ascii=False, sort_keys=True, indent=2)
            f.write("\n")
        print(f"[baseline] saved → {os.path.join(BASELINE_DIR, 'manifest.json')}")
        for k, v in sorted(_flatten(cur).items()):
            print(f"  {k}: {v}")
        return 0
    # compare
    ref_path = os.path.join(OUT_ROOT, args.compare, "manifest.json")
    with open(ref_path, "r", encoding="utf-8") as f:
        ref = json.load(f)
    fref, fcur = _flatten(ref), _flatten(cur)
    keys = sorted(set(fref) | set(fcur))
    ok = True
    print(f"{'ITEM':<40} {'BASELINE':<20} {'CURRENT':<20} MATCH")
    for k in keys:
        a, b = fref.get(k), fcur.get(k)
        match = (a == b)
        ok = ok and match
        av = str(a)[:18] + ".." if a is not None and len(str(a)) > 20 else str(a)
        bv = str(b)[:18] + ".." if b is not None and len(str(b)) > 20 else str(b)
        print(f"{k:<40} {av:<20} {bv:<20} {'OK' if match else 'DIFF!!!'}")
    # 참고(판정 제외): 원시 openapi sha — 경로 나열 순서로만 달라질 수 있음
    rraw = (ref.get("api", {}).get("openapi", {}) or {}).get("sha256")
    craw = (cur.get("api", {}).get("openapi", {}) or {}).get("sha256")
    print(f"{'[info] api.openapi.sha256(raw)':<40} {str(rraw)[:18]+'..':<20} {str(craw)[:18]+'..':<20} {'(same)' if rraw==craw else '(order-diff, 판정제외)'}")
    # 경로 집합 동일 assert (정규화 sha 로 순서무관 내용 동일은 이미 판정됨)
    ref_paths = set((ref.get("openapi_canonical", {}) or {}).get("paths", []))
    cur_paths = set((cur.get("openapi_canonical", {}) or {}).get("paths", []))
    set_ok = (ref_paths == cur_paths)
    print(f"{'openapi paths set-equal':<40} {str(len(ref_paths)):<20} {str(len(cur_paths)):<20} {'OK' if set_ok else 'DIFF!!!'}")
    if not set_ok:
        print("  only-in-baseline:", ref_paths - cur_paths, "| only-in-current:", cur_paths - ref_paths)
    ok = ok and set_ok
    print("\nRESULT:", "ALL MATCH (OK)" if ok else "MISMATCH - STOP")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main_cli())
