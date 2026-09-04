# -*- coding: utf-8 -*-
"""
dump_game_data.py — 게임 데이터 상수(영웅/맵/역할/EN→KO)를 정본화 검증용 JSON으로 덤프.

목적:
    리팩토링 1단계에서 "이관 전(before)" 값과 "이관 후(after, 로더 파생)" 값을
    동일 스크립트로 덤프해 diff-0(승인된 2건 델타 제외)을 증명한다.

정본화(canonicalization):
    - dict  : json.dumps(sort_keys=True) 로 키 순서 무시(내용 비교).
    - list  : 정렬해 순서 무시(모두 set/membership 성격).
              banpick HEROES/MAPS(딕셔너리 리스트)는 안정 키로 정렬.
    순서에 의존하는 런타임 동작(KOREAN_HERO_MAP 역매핑 setdefault,
    MAP_TYPE_DATA nospace 파생)은 이 덤프가 아니라 STEP 1-4 런타임 테스트로 검증한다.

부작용 없음:
    main.py import 는 DB 접속/서버 기동을 유발하지 않는다(init_db 는 lifespan 에서만 호출,
    SQLAlchemy 엔진은 지연 연결). 운영 DB(backend/data/scrim.db)를 건드리지 않는다.

CLI:
    python scripts/dump_game_data.py <출력경로.json>
    (backend/ 에서 실행. 인자 생략 시 dumps/before.json)
"""
from __future__ import annotations
import os
import sys
import json

_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.dirname(_HERE)
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)


def _sorted_list(seq):
    """문자열 리스트를 정렬(순서 무시)."""
    return sorted(seq, key=lambda x: str(x))


def _sorted_dictlist(seq):
    """딕셔너리 리스트를 그 내용(정렬 JSON)으로 안정 정렬."""
    return sorted(seq, key=lambda d: json.dumps(d, ensure_ascii=False, sort_keys=True))


def collect() -> dict:
    import main
    import log_normalizer
    from banpick import data as bp

    out: dict = {}
    # --- main.py ---
    out["main.KOREAN_HERO_MAP"] = dict(main.KOREAN_HERO_MAP)
    out["main.TANKS"] = _sorted_list(main.TANKS)
    out["main.SUPPORTS"] = _sorted_list(main.SUPPORTS)
    out["main._FIGHTLAB_TANKS"] = _sorted_list(main._FIGHTLAB_TANKS)
    out["main._FIGHTLAB_SUPPORTS"] = _sorted_list(main._FIGHTLAB_SUPPORTS)
    out["main._FIGHTLAB_DAMAGE"] = _sorted_list(main._FIGHTLAB_DAMAGE)
    out["main.HERO_ROLE_DATA"] = dict(main.HERO_ROLE_DATA)
    out["main.MAP_TYPE_DATA"] = dict(main.MAP_TYPE_DATA)
    out["main.CONTROL_MAP_KEYWORDS"] = _sorted_list(main.CONTROL_MAP_KEYWORDS)

    # --- log_normalizer.py ---
    out["log_normalizer._HERO_EN2KO_EXPLICIT"] = dict(log_normalizer._HERO_EN2KO_EXPLICIT)
    out["log_normalizer.HERO_EN2KO"] = dict(log_normalizer.HERO_EN2KO)
    out["log_normalizer.MAP_EN2KO"] = dict(log_normalizer.MAP_EN2KO)
    out["log_normalizer.MODE_EN2KO"] = dict(log_normalizer.MODE_EN2KO)

    # --- banpick/data.py ---
    out["banpick.HEROES"] = _sorted_dictlist([dict(h) for h in bp.HEROES])
    out["banpick.MAPS"] = _sorted_dictlist([dict(m) for m in bp.MAPS])
    return out


def main_cli(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out_path = argv[0] if argv else os.path.join(_BACKEND, "dumps", "before.json")
    out_path = os.path.abspath(out_path)
    data = collect()
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, sort_keys=True, indent=2)
        f.write("\n")
    # 요약(stderr 로 — stdout 은 깨끗하게 유지)
    print(f"[dump] wrote {out_path}", file=sys.stderr)
    for k, v in sorted(data.items()):
        n = len(v) if hasattr(v, "__len__") else "?"
        print(f"  {k}: {n}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main_cli())
