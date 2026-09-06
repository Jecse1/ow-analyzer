from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime
from contextlib import asynccontextmanager
import uvicorn
import json
import os
import sys
import glob
import uuid
import re
import threading
import tempfile

# Ensure backend/ is on sys.path so the `db` package resolves regardless of cwd
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

_DB_IMPORT_ERROR = None
try:
    from sqlalchemy import select
    from db.database import init_db, AsyncSessionLocal
    from db.models import Session as DBSession, Match as DBMatch, Pause as DBPause, Round as DBRound, PlayerStat as DBPlayerStat, Event as DBEvent
    from services.fight_analysis import compute_fights, format_fights_for_api, compute_fight_metrics as fa_compute_fight_metrics
    _DB_AVAILABLE = True
except Exception as _e:
    _DB_AVAILABLE = False
    _DB_IMPORT_ERROR = f"{type(_e).__name__}: {_e}"
    print(f"[DB] Import failed: {_DB_IMPORT_ERROR}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if _DB_AVAILABLE:
        try:
            await init_db()
            print("[DB] Initialized successfully")
        except Exception as e:
            print(f"[DB] Init failed: {e}")
    yield


app = FastAPI(lifespan=lifespan)

# 응답 gzip 압축 — 1KB 이상 JSON 전송량 절감 (Accept-Encoding: gzip 클라이언트만)
# compresslevel=6: 기본값 9는 압축률 이득이 거의 없이 CPU만 수 배 소모 (저사양 서버 고려)
app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=6)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 밴픽 실시간 대결(WebSocket) — 격리 모듈. 기존 API/집계/DB 무변경, 라우터 등록만.
try:
    from banpick import router as banpick_router
    app.include_router(banpick_router)
except Exception as _e:
    print(f"[banpick] router not loaded: {_e}")

# [split] 통계/조회 라우터 → routers/stats.py (include 순서: banpick → stats → (later)scrims)
from routers.stats import router as stats_router
app.include_router(stats_router)
# [split] 세션·매치 라우터 → routers/scrims.py (include 순서: banpick → stats → scrims)
from routers.scrims import router as scrims_router
app.include_router(scrims_router)


# [split] 응답 캐시 → cache.py (하위호환 re-export; _RESPONSE_CACHE 단일 객체 유지)
from cache import _RESPONSE_CACHE, _response_cache_get, _response_cache_store, _invalidate_response_cache


# [split] 상수·경로·게임데이터 파생 → config.py (하위호환 re-export)
from config import (
    KOREAN_HERO_MAP, TANKS, SUPPORTS, MAP_TYPE_DATA, CONTROL_MAP_KEYWORDS,
    _FIGHTLAB_TANKS, _FIGHTLAB_SUPPORTS, _FIGHTLAB_DAMAGE,
    PLAYER_ROLE_OVERRIDES, NUMERIC_FIELDS, FIGHT_QUIET_GAP_SEC,
    DATA_FILE, ROW_DATA_DIR,
    _MAP_TYPE_DATA_NOSPACE, _MATCH_LEVEL_MAP_TYPES,
    TRADE_WINDOW_SEC, HERO_ROLE_DATA,
    MIN_SAMPLE_FOR_PERCENTILE_FIGHTS, MIN_SAMPLE_FOR_PERCENTILE_ROUNDS, PERCENTILE_MIN_POOL,
)

# [split] 로그 파서·맵/팀/시간 헬퍼·역할점수 → parsers/log_parser.py (하위호환 re-export)
from parsers.log_parser import (
    normalize_team_name, is_control_map, resolve_map_type, is_match_level_map, safe_float,
    time_str_to_seconds, parse_log_timestamp,
    get_role_score, get_player_role_score,
    parse_overwatch_log, assign_persistent_slots,
)

# [split] 요청 Pydantic 모델 → schemas.py (하위호환 re-export)
from schemas import PauseInput, MatchSegment, ScrimManualInput, BatchDeleteRequest







# [split] 한타 요약/지표·fightlab 변환 → services/fight_metrics.py (하위호환 re-export)
from services.fight_metrics import (
    build_fight_summaries, compute_fight_metrics,
    _build_match_pauses, _fightlab_hero_role, _fightlab_side, _fight_to_record,
)


# [split] 순수 통계 계산 → services/stats.py (하위호환 re-export)
from services.stats import calculate_pure_stats, compute_player_fight_stats

# [split] DB→dict 직렬화 → serializers.py (하위호환 re-export)
from serializers import (
    _db_event_to_dict, _db_player_stat_to_dict, _db_round_to_dict,
    _aggregate_match_stats, _db_match_to_dict, _db_session_to_dict,
)

























# ─────────────────────────────────────────────────────────────────────────────
# 한타 분석 (베타) 전용: GET /api/fight-records
# compute_fights 재사용(미수정). 한타 1개 = 응답 항목 1개(평탄 리스트).
# ─────────────────────────────────────────────────────────────────────────────







# ─────────────────────────────────────────────────────────────────────────────
# 한타 분석 (베타) [선수] 서브탭 전용: GET /api/player-fight-stats
# (매치 × 선수 × 영웅) 단위 가산(additive) 집계. 프론트가 기간/필터별로 합산만 수행.
# compute_fights 재사용(미수정). 기존 엔드포인트/필드 무변경 — 신규 추가만.
# ─────────────────────────────────────────────────────────────────────────────















if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)