# Scrim Analyzer 데이터 구조 분석 보고서

> 목적: 이 데이터로 **(A) 게임 상태 → 승률 예측** 모델과 **(B) 행동(궁 사용 등) 전후 승률 변화 분석**이 가능한지 판단.
> 분석 기준: `backend/data/scrim.db` (2026-07-13 시점 실측), `backend/scrim_rowdata_log/`, 파서 `main.py::parse_overwatch_log`.
> 게임: 오버워치. 팀 내부 스크림 분석 도구.

---

## 요약 (결론 먼저)

- **(A) 상태 → 승률 예측**: **부분적으로 가능**. 맵/모드/라운드/점수/한타 흐름과 킬·궁 시퀀스는 충분히 있으나, **위치 좌표·체력·실시간 생존 인원·궁 게이지 충전률**이 DB에 없어 "임의 시점의 완전한 게임 상태 복원"은 불가. 한타(fight) 단위의 거친 상태 스냅샷 기반 승률 모델은 가능.
- **(B) 행동 전후 승률 변화**: **가능**. `ultimate_start`(궁 사용) 이벤트가 시각·선수·영웅과 함께 기록되고, 한타 승패가 계산되므로 "선궁/궁 개수 우위 → 한타 승률" 류 분석은 바로 됨(이미 궁극기 분석 탭에서 수행 중).
- **핵심 반전**: **원본 raw 로그(`scrim_rowdata_log/*.txt`)는 DB보다 훨씬 풍부**하다. `ultimate_charged`(궁 충전 완료), `ultimate_end`, `hero_swap`(영웅 스왑), `ability_1/2_used`(스킬 사용) 등이 raw에는 있으나 **DB `events` 테이블로 적재되지 않는다**. 모델 고도화 시 raw 재파싱으로 상당수 결손을 메울 수 있음.

---

## 1. 데이터 저장 구조

### 1.1 저장소 개요

| 저장소 | 형식 | 위치 | 역할 |
|--------|------|------|------|
| **주 DB** | SQLite | `backend/data/scrim.db` | **단일 소스 오브 트루스** (Phase 5 이후) |
| 원본 업로드 로그 | 텍스트(CSV 유사) | `backend/scrim_rowdata_log/{id}_{n}.txt` | 게임 클라이언트 워크숍 로그 원본. DB 재구축(`admin/rebuild-db`)의 소스 |
| 세션 메타 | JSON | `backend/scrim_rowdata_log/{id}_meta.json` | 세션·매치 목록·영상 URL·오프셋 |
| 레거시 JSON | JSON | `backend/scrim_data.json` | Phase 5 이후 **미사용**, 백업 보존 |

DB는 SQLAlchemy 2.0(async) + Alembic 관리. 스키마 정본은 `backend/db/models.py`.

### 1.2 테이블 계층 구조

```
sessions (스크림 세션 = 하루 한 팀 상대)
  └─ matches (매치 = 맵 1판)            [soft delete 대상]
       ├─ pauses (일시정지 구간)
       └─ rounds (라운드)
            ├─ player_stats (라운드 종료시 선수별 누적 스탯)
            └─ events (타임라인 이벤트)   ← 핵심 시계열
```

- `sessions 1 : N matches 1 : N rounds 1 : N events`
- `player_stats`는 `rounds`와 `matches` 양쪽에 FK를 가짐(라운드별 스냅샷 + 매치 집계 조회 편의).
- `events`도 `round_id`와 `match_id` 양쪽 FK 보유.
- soft delete(`deleted_at`)는 `sessions`, `matches`에만 존재. 삭제 시 하위는 실제로는 남고 `deleted_at IS NULL` 필터로 배제.

### 1.3 테이블별 스키마

#### `sessions` — 스크림 세션
| 필드 | 타입 | 설명 |
|------|------|------|
| id | String(PK) | 세션 ID(예: `2605271416` = 날짜+시각 코드) |
| scrim_name | String | 스크림명(예: `260527-VARREL`) |
| date | String | 날짜(`YYYY-MM-DD`) |
| start_time / end_time | String | 시작·종료 시(문자열, "14" 등) |
| created_at / updated_at | DateTime | 생성·수정 시각 |
| deleted_at | DateTime? | soft delete 마커 |

#### `matches` — 매치(맵 1판)
| 필드 | 타입 | 설명 |
|------|------|------|
| id | String(PK) | UUID |
| session_id | String(FK) | 소속 세션 |
| match_index | Integer | 세션 내 순번 |
| map_name | String | 맵명(한글, 예: `남극반도`) |
| team1_name / team2_name | String | 팀명(예: `VR`, `FLC`) |
| winner | String | **원본** 자동판정 승자(팀명 / `Draw` / `Unknown`) |
| winner_override | String? | **수기 보정** 승자(밀기맵 등). NULL=미보정. 원본 `winner`는 불변 |
| score_t1 / score_t2 | Integer | 팀별 스코어 |
| result | String | 결과 문자열 |
| video_url | String | VOD URL |
| video_offset | Integer | 영상-게임 시각 오프셋(초) |
| game_setup_sec | Integer? | 준비 시간(영상 점프 계산용) |
| duration_sec | Float | 매치 길이 |
| total_final_blows_t1/t2 | Integer | 팀별 최종처치 합 |
| created_at / deleted_at | DateTime | — |

> 유효 승자 = `winner_override || winner` (직렬화 계층에서 적용). 밀기맵은 스코어 이벤트가 없어 자동판정이 전부 `Draw`로 저장되므로 수기 보정 필수.

#### `pauses` — 일시정지
| 필드 | 타입 | 설명 |
|------|------|------|
| id | Integer(PK) | — |
| match_id | String(FK) | — |
| start_sec / end_sec / duration | Integer | 정지 구간(초) |

#### `rounds` — 라운드
| 필드 | 타입 | 설명 |
|------|------|------|
| id | Integer(PK) | — |
| match_id | String(FK) | — |
| round_number | Integer | 라운드 번호 |
| winner | String | 라운드 승자(**결측 많음** — §5 참조) |
| duration_sec | Float | 라운드 길이 |
| final_blows_t1/t2 | Integer | 라운드 내 팀별 최종처치 |

#### `player_stats` — 라운드 종료 시 선수별 누적 스탯 (**시계열 아님, 스냅샷**)
| 필드 | 타입 | 설명 |
|------|------|------|
| id / round_id / match_id | — | PK·FK |
| team_name / player_name | String | 팀·선수 |
| hero_name / hero_image / slot_index | String/Int | 라운드 종료 시점 영웅·슬롯 |
| eliminations, final_blows, deaths | Float | 처치·최종처치·죽음 |
| all_damage_dealt, hero_damage_dealt, barrier_damage_dealt | Float | 딜량 |
| healing_dealt, healing_received, self_healing | Float | 힐량 |
| damage_taken, damage_blocked | Float | 받은/막은 피해 |
| defensive_assists, offensive_assists | Float | 어시스트 |
| **ultimates_earned, ultimates_used** | Float | **궁 획득·사용 수(라운드 누적 집계값)** |
| multikill_best, multikills, solo_kills | Float | 멀티킬·솔로킬 |
| objective_kills, environmental_kills/deaths | Float | 거점·환경 처치/사망 |
| hero_time_played | Float | 영웅 플레이 시간 |

> **중요**: 라운드 **종료 시점의 누적값**이다. "3분 30초 시점의 딜량/궁 상태"처럼 임의 시점 값은 복원 불가. (raw의 `player_stat` 이벤트는 주기적으로 찍히지만 DB `events`엔 안 들어가고 `player_stats` 테이블의 최종 스냅샷만 남음.)

#### `events` — 타임라인 이벤트 (**핵심 시계열**)
| 필드 | 타입 | 설명 | 사용 이벤트 |
|------|------|------|-------------|
| id / round_id / match_id | — | PK·FK | 전체 |
| **event_type** | String | 이벤트 종류(§2) | 전체 |
| **timestamp** | Float | **영상 기준 시각(정수 초)** | 전체 |
| **game_timestamp** | Float | **게임 기준 시각(센티초 ~0.01s)** | 전체 |
| player_name / player_team / player_hero / player_hero_img | String | 행위자(킬러/궁 사용자) | kill, ultimate_start |
| ability | String | 처치 수단 / `Ultimate` | kill, ultimate_start |
| target_name / target_team / target_hero / target_hero_img | String | 피격자 | kill |
| round_number | Integer | 라운드 번호 | round_*, objective_* |
| winner | String | 승자 | round_end, match_end |
| attacker | String | 공격 팀 | round_start |
| description | String | 맵/모드 설명 | match_start |
| score_t1 / score_t2 | Integer | 스코어 | match_end |
| capturing_team | String | 점령 팀 | objective_captured |
| new_index / old_index | Integer | 체크포인트 인덱스 | objective_updated |
| team | String | 진행 팀 | point/payload_progress |
| extra_data | JSON | 미래 확장용(현재 **전부 NULL**) | — |

---

## 2. 이벤트 데이터 상세

### 2.1 DB `events`에 실제 적재되는 이벤트 종류 (실측 24,409건)

| event_type | 건수 | 설명 | 위치정보 |
|------------|-----:|------|:--------:|
| `kill` | 12,430 | 처치(최종처치). 킬러·피격자·영웅·수단 포함 | ✗ |
| `ultimate_start` | 6,273 | **궁극기 사용 시작**. 사용자·영웅 포함 | ✗ |
| `point_progress` | 2,261 | 쟁탈 거점 점령률 진행 | ✗ |
| `objective_captured` | 1,056 | 거점/체크포인트 점령 | ✗ |
| `payload_progress` | 909 | 화물 진행률 | ✗ |
| `objective_updated` | 549 | 체크포인트 인덱스 변화 | ✗ |
| `round_end` | 334 | 라운드 종료(+승자) | ✗ |
| `round_start` | 300 | 라운드 시작(+공격팀) | ✗ |
| `match_start` | 154 | 매치 시작(맵/모드) | ✗ |
| `match_end` | 143 | 매치 종료(+스코어) | ✗ |

> **위치(좌표/지역명) 정보는 어떤 이벤트에도 없다.** 킬 이벤트조차 좌표가 없다.

### 2.2 raw 로그에는 있으나 DB로 **적재되지 않는** 이벤트 (실측, 154개 txt 파일 기준)

| raw event | 건수 | 잠재 가치 | DB 반영 |
|-----------|-----:|-----------|---------|
| `ability_1_used` | 35,530 | 스킬 사용(공격성/쿨 프록시) | ✗ 없음 |
| `ability_2_used` | 19,405 | 스킬 사용 | ✗ 없음 |
| `defensive_assist` | 13,378 | 방어 어시(존버·피어싱) | `player_stats` 집계만 |
| `player_stat` | 12,910 | **주기적 스탯 스냅샷(시계열!)** | 라운드 최종값만 |
| `ultimate_charged` | 6,467 | **궁 충전 완료 시각(=궁 보유 시작)** | ✗ **없음** |
| `offensive_assist` | 6,336 | 공격 어시 | `player_stats` 집계만 |
| `ultimate_end` | 6,270 | **궁 종료(=궁 지속시간)** | ✗ 없음 |
| `hero_swap` | 5,498 | **영웅 스왑 타임라인** | ✗ **없음(스냅샷만)** |
| `hero_spawn` | 2,292 | 라운드 초기 스폰 | ✗ 없음 |
| `remech_charged` / `dva_remech` | 191 / 67 | D.Va 메카 재장전 | ✗ 없음 |
| `echo_duplicate_start/end` | 18 / 18 | 에코 복제 궁 | ✗ 없음 |
| `mercy_rez` | 11 | 메르시 부활 | ✗ 없음 |

> **부활(리스폰) 이벤트는 raw에도 없다** (`hero_spawn`은 라운드 시작 스폰만). 메르시 부활(`mercy_rez`)만 별도 존재. → 임의 시점 생존 인원 정밀 복원의 최대 장애물(§3).

### 2.3 타임스탬프 & 정밀도

- **두 개의 시각 축**을 모든 이벤트가 보유:
  - `timestamp`: **영상 기준, 정수 초 단위**(`[HH:MM:SS]` 헤더에서 파싱). 예: 130.0, 131.0
  - `game_timestamp`: **게임 기준, 센티초(≈0.01초) 정밀도**. 예: 20.82, 21.10
- 같은 초에 여러 킬이 몰릴 때 **정밀 순서는 `game_timestamp`로만** 구분 가능(예: `168.43` vs `169.00`).
- 영상↔게임 변환: `matches.video_offset`, `game_setup_sec`로 계산(메모리 [[timestamp-coordinate-model]] 참조).
- **프레임 단위 정밀도는 없음.** 궁 사용·킬의 상대 순서 분석에는 충분하나, 초미세(<10ms) 콤보 판정은 불가.

### 2.4 궁극기 관련 (모델 B의 핵심)

| 정보 | DB `events` | `player_stats` | raw 로그 |
|------|:-----------:|:--------------:|:--------:|
| 궁 **사용 시각** (`ultimate_start`) | ✅ 시각·선수·영웅 | — | ✅ |
| 궁 **획득/사용 수**(라운드 집계) | — | ✅ `ultimates_earned/used` | ✅ |
| 궁 **충전 완료 시각**(`ultimate_charged`) | ❌ | — | ✅ 6,467건 |
| 궁 **종료 시각**(`ultimate_end`) | ❌ | — | ✅ 6,270건 |
| 궁 **게이지 충전률(%) 시계열** | ❌ | ❌ | ❌ |

> `ability` 필드는 `ultimate_start`에서 전부 리터럴 `"Ultimate"`(궁 이름 아님). **어떤 궁인지는 `player_hero`로 식별**한다.
> **"이 팀이 지금 궁을 몇 개 들고 있나(사용 안 하고 보유)"는 DB만으로는 알 수 없다.** 단, raw의 `ultimate_charged`(보유 시작) + `ultimate_start`(사용) 페어를 재파싱하면 **보유 상태 구간을 복원 가능** → 재적재 시 모델 A의 강력한 피처가 됨.

---

## 3. 상태 정보 (임의 시점 게임 상태 복원 가능성)

| 상태 요소 | 복원 가능성 | 근거 |
|-----------|:-----------:|------|
| 맵 / 모드 | ✅ | `matches.map_name` + `match_start.description`, 맵타입은 `resolve_map_type` |
| 라운드 / 공수 | ✅ | `rounds`, `round_start.attacker` |
| 라운드 스코어 / 남은시간(진행률) | ✅ | `match_end.score_t1/2`, `point/payload_progress`, `objective_updated` |
| **양팀 생존 인원(임의 시점)** | ⚠️ **부분** | 킬 이벤트로 사망 시점은 알지만 **리스폰 이벤트가 없어** 몇 초 뒤 부활을 반영 못함. 한타 윈도우 내 "누적 사망"은 정확(§5의 fight 로직) |
| 영웅 조합(임의 시점) | ⚠️ **부분** | 킬·궁에 등장한 선수의 영웅은 알지만, 그 순간 교전에 안 나온 선수의 영웅은 미상. `player_stats`는 라운드 종료 시점 영웅만 |
| **체력(HP)** | ❌ | 어디에도 없음 |
| **궁 보유 여부(사용 전 보유)** | ❌ DB / ⚠️ raw | DB는 사용 시점만. raw `ultimate_charged`로 복원 가능 |
| 위치 | ❌ | 좌표·지역명 전무 |
| **영웅 스왑 기록** | ⚠️ | DB `events`엔 스왑 이벤트 없음. `player_stats`에 라운드 종료 영웅만. raw `hero_swap`(5,498건)에 전체 타임라인 존재 |

**결론**: 임의 시점의 완전한 상태 벡터(생존 5v5, 각자 영웅·HP·궁)는 **DB만으로는 복원 불가**. 복원 가능한 것은 **한타 단위의 거친 상태**(맵/모드/라운드/스코어/한타 내 킬·사망·궁 사용 시퀀스)다. 이 수준이면 "한타 시작 상태 → 한타 승패" 모델은 성립한다.

---

## 4. 데이터 규모 (실측)

| 항목 | 값 |
|------|----|
| 세션 수 | **29** (soft-delete 제외 29) |
| 매치 수 | **157** |
| 라운드 수 | **417** |
| player_stats 행 | **4,169** |
| **이벤트 수** | **24,409** |
| 수집 기간 | **2026-05-27 ~ 2026-07-09** (약 6.5주) |
| 매치당 평균 이벤트 | **≈ 158.5** |
| 매치당 평균 라운드 | **≈ 2.71** (분포: 1R=27, 2R=54, 3R=39, 4R=5, 5R=29) |
| 등장 영웅 수(distinct) | 47 |
| 한타(fight) 수 | **미저장 — 계산값**. 킬 ~12,430건 기준 대략 1,000~1,300 추정(한타당 ~10킬) |

> 맵 커버리지: 19종 맵, 매치 6~18건 분포(남극반도 18, 일리오스 14, 서킷로얄 13 …).
> **규모 판단**: 로지스틱 회귀·트리 기반의 **한타 단위 승률 모델(수천 샘플)**에는 쓸 만함. 매치 단위(157건)나 딥러닝 시계열 모델에는 표본 부족.

---

## 5. 결과 라벨

### 5.1 승패 기록 방식

| 단위 | 라벨 위치 | 상태 |
|------|-----------|------|
| **매치** | `matches.winner` (+`winner_override`) | ✅ 잘 라벨됨. 유효승자=`override||winner`. 밀기맵은 override 필수 |
| **라운드** | `rounds.winner`, `round_end.winner` | ⚠️ **결측 많음**: 실측 분포 `Unknown`=146, `0`=108 vs 실팀명 라벨은 소수. 쟁탈/밀기 등 라운드 승자 자동판정이 안 되는 모드 다수 |
| **한타(교전)** | **저장 안 됨 — 런타임 계산** | `services/fight_analysis.py::compute_fights` |

매치 유효승자 실측 분포: FLC 74, ZETA 29, CR 26, T1 18, (미보정/공백 3, Draw 2 등).

### 5.2 "한타" 단위의 존재 여부

**데이터에 한타 경계는 저장돼 있지 않다. 이벤트에서 유추(계산)한다.** 알고리즘(`compute_fights`, JS/Py 이중 구현 동일):

1. `kill`·`ultimate_start` 이벤트만 대상으로 시간순 스캔.
2. 첫 이벤트에서 한타 시작, 종료시각 = 시작+**20초**(`INITIAL_WINDOW`).
3. 킬이 나올 때마다 종료시각을 **해당 킬+10초**(`KILL_EXTENSION`)로 연장.
4. 다음 이벤트가 종료시각을 넘으면 한타 종료·새 한타 시작.
5. **한타 승자 = 생존 인원 많은 팀**(`5 - 팀별 사망수` 비교, 동수면 `Draw`).
6. 부가 산출: `first_pick_team`(선취 처치), `first_pick_advantage_rate`, 한타 내 궁 사용 수·선궁 측 등.

> 즉 **한타는 휴리스틱 파생물**이다. 윈도우 상수(20s/10s)에 민감하고, 5인 고정·부활 미반영 가정 위에서 승자를 매긴다. 모델 B("궁 사용 전후 한타 승률")는 이 계산된 fight 위에서 이미 동작 중(궁극기 분석 탭).

---

## 6. 샘플 데이터 (실제 매치 1건, 민감정보 없음)

매치 `435f59b5…` · 맵 `뉴퀸스트리트` · **FLC vs CR** · 유효승자 **FLC**
(`ts`=영상 초, `gt`=게임 초, 상위 28행)

```
   ts      gt  event              detail
    0    0.00  match_start        (맵/모드)
    0    0.00  round_start        round 1
  255   42.13  kill               FLC/MER1T(소전)   [Primary] → CR/LIP(캐서디)
  271   58.19  kill               FLC/HanBin(D.Va)  [0]       → CR/JunBin(라인하르트)
  273   60.69  kill               CR/HeeSang(바스티온)[Primary]→ FLC/ChiYo(주노)
  276   63.65  kill               FLC/MER1T(소전)   [Primary] → CR/vigilante(키리코)
  285   72.41  kill               FLC/MER1T(소전)   [Primary] → CR/LIP(캐서디)
  298   85.34  kill               CR/HeeSang(바스티온)[Primary]→ FLC/ChiYo(주노)
  317  104.92  kill               FLC/MER1T(소전)   [Primary] → CR/vigilante(키리코)
  322  109.47  kill               CR/HeeSang(바스티온)[Primary]→ FLC/MER1T(소전)
  323  110.60  kill               FLC/SP1NT(트레이서)[Melee]  → CR/LIP(솜브라)
  323  110.94  ultimate_start     FLC/Fielder(키리코) 궁
  329  116.89  ultimate_start     CR/HeeSang(바스티온) 궁
  339  126.20  kill               FLC/HanBin(D.Va)  [0]       → CR/JunBin(레킹볼)
  343  130.57  kill               CR/LIP(트레이서)  [Melee]   → FLC/Fielder(키리코)
  345  132.70  kill               CR/LIP(트레이서)  [Primary] → FLC/ChiYo(주노)
  377  164.55  ultimate_start     FLC/MER1T(소전) 궁
  379  166.17  ultimate_start     CR/CH0R0NG(제트팩캣) 궁
  379  166.87  ultimate_start     FLC/ChiYo(주노) 궁
  381  168.43  kill               FLC/MER1T(소전)   [Ultimate]→ CR/CH0R0NG(제트팩캣)
  382  169.00  ultimate_start     CR/vigilante(키리코) 궁
  383  170.44  kill               FLC/Fielder(미즈키)[Ability2]→ CR/HeeSang(바스티온)
  384  171.23  kill               FLC/HanBin(D.Va)  [0]       → CR/vigilante(키리코)
  386  173.77  kill               FLC/MER1T(소전)   [Secondary]→ CR/LIP(트레이서)
  393  180.30  kill               FLC/SP1NT(트레이서)[Primary] → CR/JunBin(레킹볼)
  404  191.16  ultimate_start     CR/LIP(트레이서) 궁
  413  200.42  ultimate_start     CR/JunBin(레킹볼) 궁
  433  220.62  kill               FLC/HanBin(D.Va)  [0]       → CR/vigilante(아나)
  436  223.42  ultimate_start     FLC/HanBin(D.Va) 궁
```

읽는 법:
- `ts`가 정수 초라 같은 초(예: 323, 379)에 여러 이벤트가 겹치면 **순서는 `gt`로 판별**.
- 킬의 `[...]`는 처치 수단(Primary/Secondary/Melee/Ultimate/Ability/`0`=미상).
- 영웅 스왑은 별도 이벤트로 없지만 **킬/궁 이벤트에 실린 영웅명이 그 시점 영웅**(예: Fielder가 키리코→미즈키로 바뀐 게 130s/170s 이벤트에서 드러남). 교전에 안 낀 선수의 실시간 영웅은 미상.

---

## 7. 누락된 것 — 승률 모델 관점의 결손 (내 의견)

### 7.1 치명적 결손 (모델 A "상태→승률"을 근본적으로 제약)

1. **위치/좌표 데이터 전무.** 킬에도 좌표가 없다. 맵 장악·거리·고지대·포지셔닝 같은 오버워치 승률의 핵심 공간 피처를 **아예 만들 수 없다.** raw에도 없어 재파싱으로도 복구 불가.
2. **리스폰(부활) 이벤트 없음.** 킬로 사망은 알지만 ~10초 뒤 부활을 반영 못해 **"지금 몇 대 몇으로 붙어 있나"의 정확한 실시간 생존 인원을 못 만든다.** 한타 윈도우 안에서만 근사. mercy_rez(11건)만 예외.
3. **체력(HP) 시계열 없음.** "체력 유리" 상태 피처 불가.

### 7.2 심각하지만 raw 재파싱으로 복구 가능 (우선 조치 권장)

4. **궁 게이지/보유 상태 없음.** DB는 `ultimate_start`(사용)만. → raw의 `ultimate_charged`(6,467)·`ultimate_end`(6,270)를 `events`로 재적재하면 **"한타 진입 시 양팀 보유 궁 수"라는 최상급 피처**를 얻는다. **모델 A 개선의 1순위.**
5. **영웅 스왑 타임라인 없음.** DB는 라운드 종료 영웅 스냅샷만. → raw `hero_swap`(5,498) 재적재 시 **임의 시점 5v5 조합 복원**이 가능해져 "카운터 픽 상태" 피처가 열림.
6. **주기적 스탯 스냅샷 버려짐.** raw `player_stat`(12,910)은 경기 중 반복 기록인데 DB엔 라운드 최종값만. → 재적재 시 **딜/힐/생존의 시계열**을 확보(누적 상태 피처).
7. **스킬 사용(`ability_1/2_used` 5.5만건) 버려짐.** 교전 강도·공격성 프록시로 유용.

### 7.3 라벨 품질 이슈

8. **라운드 승자 결측 다수**(`Unknown`+`0` = 254/417). 매치 승자는 좋지만 **라운드 단위 지도학습 라벨로는 부실.** → 한타 승자는 계산값이라 오히려 라벨 밀도가 낫다. 모델은 **한타 단위**로 세우는 게 라벨 관점에서 유리.
9. **한타 경계가 휴리스틱**(20s/10s 윈도우). 라벨(한타 승패)이 상수 선택과 5인·무부활 가정에 의존 → 모델 성능의 상한/노이즈 원인. 민감도 검증 필요.

### 7.4 규모/기타

10. **표본 규모.** 매치 157·라운드 417은 매치 단위 모델엔 적다. 한타 단위(~1,000+)면 정규화/트리 모델은 가능하나 딥러닝엔 부족. 6.5주치라 메타(패치·영웅밸런스) 변화 리스크는 낮음.
11. `extra_data`(JSON 확장 필드) 전부 NULL — 향후 좌표/HP 등 신규 피처를 넣을 자리는 스키마상 마련돼 있음.

### 7.5 실행 권고

- **바로 가능**: 모델 B(궁 사용 → 한타 승률)와, 한타 시작 상태(맵/모드/라운드/스코어/선궁/누적사망) → 한타 승패의 **로지스틱·GBDT 모델**. 이미 있는 `compute_fights` 출력이 곧 학습 테이블.
- **다음 단계 (raw 재적재로 저비용 고효과)**: `ultimate_charged`/`ultimate_end`/`hero_swap`/주기적 `player_stat`을 `events`(또는 신규 상태 테이블)에 적재 → **보유 궁 수·실시간 조합·시계열 스탯** 피처 확보. 모델 A의 질이 크게 오름.
- **불가/포기**: 위치·HP 기반 정밀 상태 모델. 데이터 소스(워크숍 로그) 자체를 좌표 기록하도록 바꾸지 않는 한 불가.

---

*본 보고서 수치는 2026-07-13 `scrim.db` 실측 및 `scrim_rowdata_log/` 154개 원본 로그 집계 기준.*
