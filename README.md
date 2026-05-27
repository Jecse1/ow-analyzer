# Falcon Scrim Analyzer

오버워치 스크림 분석 도구. 팀 내부용.

## 기술 스택

- **Backend**: FastAPI, SQLAlchemy 2.0 (async), Alembic, SQLite (aiosqlite)
- **Frontend**: React, Vite, Recharts
- **Deployment**: uvicorn (단일 워커)

## 로컬 개발 설정

### Backend

```bash
cd backend
python -m venv venv

# Windows
.\venv\Scripts\Activate.ps1
# Mac/Linux
# source venv/bin/activate

pip install -r requirements.txt

# DB 초기화 (최초 1회)
python -m uvicorn main:app --port 8000
# 또는 alembic 사용 시
alembic upgrade head

# 실행
python -m uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## 데이터 구조

- **SQLite DB**: `backend/data/scrim.db` (단일 소스)
  - 테이블: `sessions`, `matches`, `pauses`, `rounds`, `player_stats`, `events`
  - soft delete: `deleted_at` 컬럼 (`sessions`, `matches`)
- **원본 업로드 파일**: `backend/scrim_rowdata_log/`
- **레거시 JSON**: `backend/scrim_data.json` (Phase 5 이후 미사용, 백업 보존)

## DB 마이그레이션 히스토리

| Phase | 내용 |
|-------|------|
| 1 | sessions/matches/pauses 테이블, 읽기 API 전환 |
| 2 | rounds/player_stats 테이블 |
| 3 | events 테이블 + fights 백엔드 재계산 |
| 4 | Soft delete + DELETE API DB 전환 |
| 5 | JSON 의존성 100% 제거, DB 단일 소스 확립 |

## 백엔드 API

| Endpoint | 용도 |
|----------|------|
| `GET /api/scrims` | 세션 목록 (경량, ~4KB) |
| `GET /api/scrims/{id}` | 세션 상세 |
| `GET /api/scrims/full-events` | 통계용 전체 데이터 (UltimateStats 등) |
| `GET /api/matches/{id}` | 매치 상세 (rounds/events/fights/stats) |
| `POST /api/scrim/manual-register` | 세션 등록 |
| `POST /api/matches/upload` | 매치 로그 업로드 |
| `DELETE /api/sessions/{id}` | Soft delete |
| `DELETE /api/matches/{id}` | Soft delete |
| `POST /api/sessions/delete-batch` | 배치 삭제 |
| `POST /api/admin/rebuild-db` | raw 파일로부터 DB 재구축 |

## 프로젝트 구조

```
falcon-scrim-analyzer/
├── backend/
│   ├── main.py
│   ├── db/               # SQLAlchemy 모델, DB 연결
│   ├── services/         # fight_analysis 등
│   ├── scripts/          # 임포트, 검증 스크립트
│   ├── alembic/          # DB 마이그레이션
│   ├── data/             # SQLite DB
│   └── scrim_rowdata_log/
└── frontend/
    └── src/
```

## 백업 정책

- `backend/data/scrim.db.phase5_backup`: 안전망 백업 (JDG 세션 박멸 후 clean 상태)
- 복원 시 반드시 `NOTES.md` 확인 (좀비 세션 부활 방지)
