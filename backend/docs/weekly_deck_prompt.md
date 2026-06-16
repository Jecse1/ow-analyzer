# 프롬프트: FLC 주간 스크림 보고 슬라이드 덱(19장) 생성

> 이 프롬프트를 그대로 붙여넣으면 (DB만 있으면) 동일한 19장 덱을 재현할 수 있다.
> 가장 확실한 재현은 `backend/make_deck.py` 자체를 보관/실행하는 것. 이 문서는 그 백업/사양서.

너는 데이터 분석가 + 오버워치2 코치다. 아래 스펙대로 **발표용 PNG 슬라이드 덱(16:9, 1920×1080)**을
`backend/make_deck.py` 하나로 생성하라. 모든 텍스트는 한국어.

## 환경 / 데이터
- 작업 폴더: `backend/`. DB: `data/scrim.db` (SQLite, **읽기 전용** — 수정 금지).
- sqlite3 CLI 없음 → **Python(`py -3`)으로 접근**. Windows라 인코딩은 `PYTHONIOENCODING=utf-8 PYTHONUTF8=1` 필수.
- matplotlib 필요(없으면 `py -3 -m pip install matplotlib`). 한글 폰트는 `C:\Windows\Fonts\malgun.ttf`(맑은 고딕)를
  `fm.fontManager.addfont` 로 등록 후 `rcParams['font.family']` 지정, `axes.unicode_minus=False`.
- 한타 그룹핑은 **반드시 `services.fight_analysis.compute_fights(events, t1, t2)` 재사용**(앱과 동일 로직).
- 테이블: `sessions, matches, rounds, player_stats, events`. 핵심 컬럼:
  - `player_stats`: round_id, match_id, team_name, player_name, hero_name, final_blows, deaths,
    eliminations, hero_damage_dealt, healing_dealt, damage_taken, damage_blocked, ultimates_earned/used, hero_time_played
  - `events`: event_type('kill'/'ultimate_start'/...), timestamp(영상초), game_timestamp(게임시계),
    player_team/hero/name, target_team/hero/name, ability, round_id
  - `matches`: team1/2_name, winner, map_name, video_url, video_offset, game_setup_sec
- 우리팀 = **FLC**. 상대 = ZETA, T1, VR, JDG, ONG. 전적 32승 11무 14패.
- 로스터: 탱 Someone/HanBin · 딜 MER1T(캐서디/바스티온)/CheckMate(시메트라)/SP1NT(트레이서) · 힐 Fielder(키리코)/ChiYo(루시우/주노/미즈키/제트팩 캣).

## 방법론 / 정의 (정직성 규칙)
- **모든 선수 지표는 `hero_time_played` 기반 10분당 정규화**(라운드 길이 편차 보정), hero_time_played<30초 행 제외.
- `rounds.winner` 컬럼은 절반 이상 비어있어 **신뢰 불가** → **라운드 승 = 해당 라운드 킬 우위(events 직접 집계) 프록시**. 동수는 제외. 슬라이드 푸터에 "킬 우위 프록시" 명시.
- 한타 승 = `compute_fights` winner(생존자=5−사망, 많은 팀). 무승부(동수)는 승률에서 제외.
- **데이터에 없는 지표(라인 단독 한타승률, 궁 효율 등)는 만들지 말 것.** `solo_kills/multikills`는 전부 0(미수집)이라 사용 금지.
  궁 `used>earned` 케이스 있어 궁 효율 단정 금지.
- 표본 작은 항목(라인하르트 13R, ONG 5매치, 5영웅 조합 등)은 **"소표본/방향성 참고용" 푸터** 필수.
- 역할 매핑(영웅→탱/딜/힐): 탱={D.Va,마우가,시그마,라마트라,라인하르트,레킹볼,윈스턴,오리사,자리야,해저드,둠피스트},
  힐={루시우,주노,키리코,아나,모이라,브리기테,바티스트,일리아리,미즈키,제트팩 캣,우양,메르시,젠야타}, 나머지=딜.
- 맵 모드: **쟁탈**=일리오스·오아시스·남극반도(3R/매치, 점령), **플래시포인트**=수라바사·뉴정크시티(5R/매치, 점령). Push(루나사피·뉴퀸스트리트)·기타 제외.

## 디자인
- figsize=(19.2,10.8) dpi=100. 큰 글씨(제목 46, 부제 24, 인사이트 26, 축/값 라벨 15~22). 발표/모바일 가독성.
- 색: **FLC=파랑 #2b6cb0**, 상대=빨강 #c0392b / 회색 #8a8f98. 역할색 탱 보라#6b46c1·딜 빨강·힐 초록#2f9e44.
- 막대 위 수치 라벨, 50% 기준선(점선), 범례·축·제목 명확. 하단 중앙에 파랑 굵은 **인사이트 한 줄**(단, slide 18 fullcomp은 인사이트 없음), 우하단 작은 **푸터(출처/주의)**.
- ⚠️ 맑은 고딕에 **이모지 글리프 없음 → 이모지 쓰지 말 것**(□ 깨짐). 색/텍스트로 구분.
- "vs 전체팀"으로 표기('리그' 금지). 상대 선수 비교 시 회색.

## 슬라이드 19장 (파일명 순서대로 `reports/weekly_20260602/slide_NN_*.png`)
1. cover — 표지(FLC 주간 보고, 2026.05.26–06.02, 32-11-14)
2. summary — 핵심 결론 4가지(ZETA만 열세 / 선킬 따고 한타 패배 / 패배=데스 폭증 / 궁 경제는 균형)
3. teams — 팀별 vs FLC 처치·데스/10 그룹막대(상대별). ZETA전만 데스 우세 강조
4. fightwin — 한타 승률 상대별(ZETA 49% 최저, 전체 56%)
5. firstpick — "첫 킬 싸움": 첫 킬 딴 팀이 한타 86% 승 / FLC 첫 킬 시 89% vs 내줄 때 13% / 퍼블 획득률 상대별(ZETA 48%)
6. overextend — "선킬 따고 과확장": 라운드 선킬 획득률 vs 선킬 딴 라운드 전환율(ZETA 56%→44%)
7. winloss — 승리 vs 패배 선수별 데스/10(전원 +50~90%)
8. tank — 탱커 FLC vs 전체팀(가로막대, 처치·데스·막은피해, FLC 강조)
9. dps — 딜러 FLC vs 전체팀(처치·영웅딜·데스)
10. support — 서포터 FLC vs 전체팀(힐량·처치·데스)
11. rein — FLC 전체 탱 영웅 비교(D.Va/시그마/라마트라/마우가/라인하르트): 라운드 승률 + 처치/데스/영웅딜/막은피해.
    라인하르트는 처치·승률·막은피해 최상위·영웅딜만 낮음(근접). "상대 라마트라·돌진의 방벽 무시 압박을 얼마나 흘리/받아치냐가 관건" 문구 + 소표본 주의
12. ultimate — 궁 사용 시 한타 승률(미사용 50% < 사용 59% < 선궁 62%)
13. firstfight — 쟁탈/플포 첫 싸움 승률(쟁탈 52%·플포 58%·합산 55%) + 첫 킬 지배(89% vs 13%)
14. firstfight_win — 첫 싸움 이기는 방식: 개시자(HanBin 디바 다이브) + 먼저 끊는 상대 영웅(키리코 13). 부제에 첫킬%/첫궁선점%/대상역할
15. firstfight_lose — 지는 방식: 먼저 잘리는 우리 영웅(캐서디·키리코) + 역할(딜 다수). 부제에 상대 첫킬%/역할
16. healer_comp — 힐러 조합별 승률 FLC vs 전체팀(라운드 주력 힐러 2명, 막대에 라운드 수 병기, FLC 5R+ 조합만)
17. tankswap — 탱 교체 효과: 딜/힐 코어 고정(루시우·시메트라·캐서디·키리코), 탱만 교체 시 승률(D.Va 60%/라인 57%/라마트라 46%). 코어·탱은 데이터에서 자동 선정
18. fullcomp — 전체 5영웅 조합별 승률 **FLC vs 상대팀(FLC 제외) 2분할**(좌 FLC, 우 상대팀, 각 4R+).
    **힐러 조합 기준으로 묶어 나열**: 행 라벨 = `[힐러2명] 탱·딜·딜`, 같은 힐러조합끼리 인접 정렬 + 그룹 구분선.
    가로막대, 승률색 초록≥55/빨강<45, 라운드 수 병기, 소표본 경고. 우측은 우리팀 제외 → 상대들이 쓰는 조합/승률 파악용.
    **이 슬라이드는 하단 인사이트 한 줄 없음**(차트 2개 + 푸터만).
19. checkpoints — 다음 스크림 체크포인트 7항목(선킬 후 reset / ZETA 다이브 대응 / MER1T 보호 / 서폿 더블컷 방지 /
    첫싸움 공격: 상대 키리코 끊기 / 첫싸움 수비: 캐서디·키리코 보호 / 약점맵)

## 함정(반드시 피할 것)
- Python 3.11 **f-string 표현식 안에 백슬래시/escape 따옴표 금지** → 값은 f-string 밖에서 선계산.
- 가로막대 맨 왼쪽 패널은 y라벨 잘림 주의 → 좌측 여백 충분히(axes x≥0.09).
- "픽"="킬"(처치) 의미로 통일. "쟁탈 첫 싸움"은 1라운드 오프닝이라 양 팀 궁 0%가 정상.
- 라운드별 첫 싸움은 **round_id로 events를 필터해 compute_fights → fights[0]**.

## 실행
`reports/weekly_20260602/*.png` 비우고 `PYTHONIOENCODING=utf-8 PYTHONUTF8=1 py -3 make_deck.py` 실행, 19장 저장 확인.
각 슬라이드는 1장씩 Read로 렌더 검증(한글 깨짐·겹침·잘림 없는지).

## 관련 산출물 스크립트 (참고)
- `make_deck.py` — 이 덱 생성기(메인).
- `first_fight.py` — 쟁탈/플포 첫 싸움 승률·승/패 방식 분석(→ `첫싸움_쟁탈_플포.md`).
- `kiriko_ult.py` — 키리코 선궁 한타 승/패 구분(→ `키리코_선궁_승패.md`).
- `extract_lost_firstpick.py` — 선킬 따고 못 이긴 한타 교보재(영상 링크 포함, → `선킬역전_교보재.md`).
- 비디오 링크 공식(frontend `videoLink.buildVideoLink`와 동일): `game_setup_sec != NULL` → `video_offset + (ts - game_setup_sec)`,
  `NULL` → `video_offset + ts`; pauses 보정 후 floor, 0 클램프.
