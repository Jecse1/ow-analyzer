"""
맵 이름 오타 일괄 교정 (정확 일치 기준).

CORRECTIONS 의 (오타 -> 정타) 쌍을 아래 두 곳에 적용한다.
  1) DB  : backend/data/scrim.db 의 matches.map_name
  2) META: backend/scrim_rowdata_log/*_meta.json 의 matches[].map_name (재파싱/재업로드 대비)

★ 정확 일치만 바꾼다. 예: '남극반' -> '남극반도' 는 '남극반도'(정상)는 건드리지 않는다.

기본은 dry-run(미리보기). 실제 반영은 --apply.
  미리보기:  python scripts/fix_map_name_typos.py
  실제반영:  python scripts/fix_map_name_typos.py --apply

--apply 시 DB는 .bak_YYYYmmdd_HHMMSS 백업을 먼저 만든다.
backend 디렉토리에서 실행하는 것을 전제로 한다.
"""
import argparse
import glob
import json
import os
import shutil
import sqlite3
from datetime import datetime

# 오타 -> 정타 (정확 일치)
CORRECTIONS = {
    "수바라사": "수라바사",
    "남극반": "남극반도",
}

DB_PATH = os.path.join("data", "scrim.db")
META_GLOB = os.path.join("scrim_rowdata_log", "*_meta.json")


def fix_db(apply: bool) -> int:
    if not os.path.exists(DB_PATH):
        print(f"  [DB] 파일 없음: {DB_PATH} (건너뜀)")
        return 0
    con = sqlite3.connect(DB_PATH)
    total = 0
    try:
        for wrong, right in CORRECTIONS.items():
            rows = con.execute(
                "SELECT id, session_id FROM matches WHERE map_name = ?", (wrong,)
            ).fetchall()
            if not rows:
                continue
            for mid, sid in rows:
                print(f"  [DB] match={mid} session={sid}: {wrong} -> {right}")
            total += len(rows)
            if apply:
                con.execute(
                    "UPDATE matches SET map_name = ? WHERE map_name = ?", (right, wrong)
                )
        if total == 0:
            print("  [DB] 대상 행 없음")
        elif apply:
            con.commit()
            print(f"  [DB] 총 {total}행 수정 완료")
        return total
    finally:
        con.close()


def fix_meta(apply: bool) -> int:
    total = 0
    for path in glob.glob(META_GLOB):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            print(f"  [META] 읽기 실패 {path}: {e}")
            continue
        hits = 0
        for m in data.get("matches", []) or []:
            mn = m.get("map_name")
            if mn in CORRECTIONS:
                m["map_name"] = CORRECTIONS[mn]
                hits += 1
        if hits:
            total += hits
            print(f"  [META] {path}: {hits}건 교정")
            if apply:
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                print(f"  [META] 저장 완료: {path}")
    if total == 0:
        print("  [META] 대상 없음")
    return total


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="실제로 파일/DB를 수정 (없으면 미리보기)")
    args = ap.parse_args()

    mode = "APPLY(실제 반영)" if args.apply else "DRY-RUN(미리보기)"
    print(f"=== 맵 이름 오타 교정 [{mode}] ===")
    print(f"    대상: {CORRECTIONS}")
    if args.apply and os.path.exists(DB_PATH):
        backup = f"{DB_PATH}.bak_{datetime.now():%Y%m%d_%H%M%S}"
        shutil.copy2(DB_PATH, backup)
        print(f"  [DB] 백업 생성: {backup}")
    n_db = fix_db(args.apply)
    n_meta = fix_meta(args.apply)
    print(f"=== 합계: DB {n_db}행, META {n_meta}건 ===")
    if not args.apply and (n_db or n_meta):
        print("실제 반영하려면: python scripts/fix_map_name_typos.py --apply")


if __name__ == "__main__":
    main()
