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

## 프론트 탭 구성

순서: 대시보드 · 스크림 세션 · 전체 통계 · 한타 분석 · 궁극기 분석 · 첫한타 · 킬데스 통계 · 궁극기 통계 · 개인 통계 · 선수 비교

| 탭 | 내용 |
|----|------|
| 한타 분석 (베타) | 한타 단위 상황별 승률 (교전/궁극기/궁 콤보·시퀀스·응수) — `FightLabStats.jsx` |
| 궁극기 분석 | 4개 서브탭: [상황] [콤보·시퀀스] [교환 패턴] [이니시] — `UltimateAnalysisStats.jsx` |
| 개인 통계 | 선수별 개요·영웅 풀·최근 K/D 폼(세트별 점, FB/max(1,D)) — `PlayerProfileView.jsx` |

**궁극기 분석 서브탭 요약**
- **[상황]**: 궁 사용/선궁/개수 우위 등 상황별 승률 표 (한타 분석의 궁극기 서브탭 이동).
- **[콤보·시퀀스]**: 콤보(3초 연쇄)·시퀀스·응수(카운터) 분석 (그룹 기준 기본값: 영웅만).
- **[교환 패턴]**: 궁 교환의 "순서"를 낱개 표기(궁 1개 = 칩 1개, 팀 색 배지, 6칩 절단)로 집계.
  첫 칩 기준 [우리 선궁]/[상대 선궁] 섹션 + 필터 pill, 주목 패턴 카드, 승률 미니 바.
  행 펼침 → 구성 미니 표(그룹 키 = 우리 궁 영웅 낱개 순서, 상대 궁은 빈도 병기) + VOD(구성 선택 시 완전 궁 시퀀스 표시).
  ※ 시간 묶음(콤보) 분석은 [콤보·시퀀스] 전담 — 이 표의 패턴 키에는 3초 묶음 없음.
- **[이니시]**: 선궁(한타 첫 궁)의 질 — 우리/상대 이니시 궁별 승률, 선수별 분해, 3초 응수 상위.
  첫 궁 판정·요약 수치는 교환 패턴 인사이트와 동일 계산(동시각은 우리 우선).

## 백엔드 API

| Endpoint | 용도 |
|----------|------|
| `GET /api/scrims` | 세션 목록 (경량, ~4KB) |
| `GET /api/scrims/{id}` | 세션 상세 |
| `GET /api/scrims/full-events` | 통계용 전체 데이터 (UltimateStats 등) |
| `GET /api/fight-records` | 한타 분석/궁극기 분석 전용 평탄 한타 리스트 (compute_fights 재사용) |
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
