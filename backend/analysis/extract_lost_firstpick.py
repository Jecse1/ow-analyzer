# -*- coding: utf-8 -*-
"""
"선킬 따고 패배한 한타" 추출 — 코칭 교보재용.

[정의] (기존 services/fight_analysis.compute_fights 재사용 — 앱과 동일한 한타 그룹핑)
  - 한타: kill/ultimate_start 이벤트를 timestamp 기준으로 묶음.
          첫 이벤트부터 20초(INITIAL_WINDOW), 킬마다 +10초(KILL_EXTENSION) 연장.
          공백이 연장창을 넘으면 새 한타.
  - FLC 선킬: 한타의 '첫 kill' 이벤트가  player_team==FLC AND target_team==상대팀.
             (자살/환경사/상대 자폭을 선킬로 오인하지 않도록 killer=FLC 명시 검증)
  - 한타 패배: compute_fights 의 winner(생존자=5-사망수, 적은 쪽이 패)가 상대팀.
             == 한타 구간 내 FLC 사망 > 상대 사망. (Draw=동수는 제외)
  - 추출 대상 = FLC 선킬 AND 한타 패배.
[경계처리]
  - 킬 1개뿐인 한타: FLC가 그 1킬을 따면 FLC 사망0<상대1 → FLC 승 → 제외(정상).
  - 동수(Draw): 패배 아님 → 제외.
  - 자살/팀킬(killer_team==target_team): 첫 kill이 이거면 FLC 선킬 조건 불충족 → 제외.
[비디오 링크] frontend/src/utils/videoLink.buildVideoLink 와 동일:
  - game_setup_sec != NULL: t = video_offset + (ts - game_setup_sec)
  - game_setup_sec == NULL: t = video_offset + ts
  - pauses 보정 후 floor, 0 클램프. 교보재용으로 LEAD_IN초 앞당김.
"""
import sqlite3, sys, math
sys.path.insert(0, '.')
from services.fight_analysis import compute_fights

US = 'FLC'
LEAD_IN = 5  # 선킬 시점보다 5초 앞에서 영상 시작

c = sqlite3.connect('data/scrim.db'); c.row_factory = sqlite3.Row
cur = c.cursor()

cur.execute('''SELECT m.id,m.team1_name,m.team2_name,m.map_name,m.video_url,m.video_offset,
  m.game_setup_sec,s.scrim_name,s.date
  FROM matches m JOIN sessions s ON m.session_id=s.id
  WHERE m.deleted_at IS NULL AND s.deleted_at IS NULL''')
matches = {r['id']: dict(r) for r in cur.fetchall()}

# pauses per match
pauses = {}
cur.execute('SELECT match_id,start_sec,end_sec FROM pauses')
for r in cur.fetchall():
    pauses.setdefault(r['match_id'], []).append((r['start_sec'], r['end_sec']))

def build_link(m, ts):
    url = m['video_url']
    if not url or not url.strip():
        return None
    off = float(m['video_offset'] or 0)
    gss = m['game_setup_sec']
    t = off + (ts - gss) if gss is not None else off + ts
    for s_, e_ in sorted(pauses.get(m['id'], [])):
        if s_ <= t:
            t += (e_ - s_)
    t = max(0, math.floor(t - LEAD_IN))
    clean = url
    import re
    clean = re.sub(r'[?&]t=[^&]*', '', clean).rstrip('?&')
    sep = '&' if '?' in clean else '?'
    return f'{clean}{sep}t={t}'

results = []  # dict per lost-first-pick fight
for mid, m in matches.items():
    opp = m['team2_name'] if m['team1_name'] == US else m['team1_name']
    cur.execute('''SELECT event_type,timestamp,game_timestamp,player_name,player_team,player_hero,
      target_name,target_team,target_hero,ability FROM events WHERE match_id=?''', (mid,))
    evs = [dict(r) for r in cur.fetchall()]
    if not evs:
        continue
    fights = compute_fights(evs, m['team1_name'], m['team2_name'])
    for f in fights:
        kills = [e for e in f['events'] if e['event_type'] == 'kill']
        if not kills:
            continue
        first = kills[0]
        # FLC 선킬: killer=FLC, target=상대
        flc_firstkill = (first['player_team'] == US and first['target_team'] == opp)
        if not flc_firstkill:
            continue
        if f['winner'] == US:   # FLC가 이긴 한타는 제외 (패배 + 무승부만)
            continue
        outcome = '패배' if f['winner'] == opp else '무승부(못이김)'
        flc_deaths = f['team1_deaths'] if m['team1_name'] == US else f['team2_deaths']
        opp_deaths = f['team2_deaths'] if m['team1_name'] == US else f['team1_deaths']
        ts = first['timestamp']
        results.append(dict(
            opp=opp, map=m['map_name'], sess=m['scrim_name'], date=m['date'],
            outcome=outcome,
            ts=ts, gt=first.get('game_timestamp') or 0,
            killer=first['player_name'], killer_hero=first['player_hero'],
            victim=first['target_name'], victim_hero=first['target_hero'],
            flc_deaths=flc_deaths, opp_deaths=opp_deaths,
            link=build_link(m, ts), has_video=bool(m['video_url'] and m['video_url'].strip()),
            # who on FLC died in this fight (백라인 노출 패턴)
            flc_victims=[e['target_name'] for e in kills if e['target_team'] == US],
            flc_killers=[e['player_name'] for e in kills if e['player_team'] == US],
        ))

# ---- summary preview ----
from collections import Counter
nloss = sum(1 for r in results if r['outcome'] == '패배')
ndraw = len(results) - nloss
print(f'총 "선킬 따고 못 이긴" 한타: {len(results)}개  (패배 {nloss} + 무승부 {ndraw})')
byopp = Counter(r['opp'] for r in results)
byopp_loss = Counter(r['opp'] for r in results if r['outcome']=='패배')
byopp_draw = Counter(r['opp'] for r in results if r['outcome']!='패배')
print('상대별(전체):', dict(byopp))
print('  └ 패배:', dict(byopp_loss), ' 무승부:', dict(byopp_draw))
nv = sum(1 for r in results if r['has_video'])
print(f'영상 있음: {nv}  /  영상 없음: {len(results)-nv}')

def fmt_t(gt):
    gt = int(gt); return f'{gt//60}:{gt%60:02d}'

ORD = ['ZETA','T1','VR','JDG','ONG']
results.sort(key=lambda r: (ORD.index(r['opp']) if r['opp'] in ORD else 99, r['date'], r['ts']))

if '--detail' in sys.argv:
    cur_opp = None
    for r in results:
        if r['opp'] != cur_opp:
            cur_opp = r['opp']
            n = byopp[r['opp']]; nl=byopp_loss[r['opp']]; nd=byopp_draw[r['opp']]
            note = '  ⚠️표본 적음' if r['opp']=='ONG' else ''
            print(f'\n{"="*60}\n{cur_opp}전 — 선킬 따고 못 이김 ({n}개: 패배{nl}/무승부{nd}){note}\n{"="*60}')
        link = r['link'] if r['has_video'] else '❌ 영상 기록 없음(교보재 불가)'
        print(f"\n[{r['sess']}] {r['map']} | 한타 {fmt_t(r['gt'])}  «{r['outcome']}»")
        print(f"  선킬: {r['killer']}({r['killer_hero']}) → {r['victim']}({r['victim_hero']})")
        print(f"  결과: FLC {r['flc_deaths']}사망 vs {r['opp']} {r['opp_deaths']}사망")
        print(f"  FLC 사망자: {', '.join(r['flc_victims'])}")
        print(f"  영상: {link}")

if '--md' in sys.argv:
    out = []
    out.append('# 🎯 FLC — "선킬 따고 못 이긴 한타" 교보재 (전체 상대 합본)\n')
    out.append(f'> 추출 정의: 한타 첫 킬을 **FLC가 상대를 처치**(killer=FLC)했으나 그 한타를 **이기지 못한**(FLC 사망 ≥ 상대 사망) 경우. ')
    out.append(f'한타 그룹핑은 앱과 동일한 `compute_fights()`(20초창+킬당10초연장). 자살·팀킬은 선킬에서 제외. 영상은 선킬 {LEAD_IN}초 전부터 재생.\n')
    out.append(f'\n**총 {len(results)}개** (🔴패배 {nloss} · 🟡무승부 {ndraw}) · 전부 영상 있음\n')
    out.append('\n| 상대 | 합계 | 패배 | 무승부 |\n|------|------|------|--------|\n')
    for o in ORD:
        if byopp[o]:
            note = ' ⚠️표본적음' if o=='ONG' else ''
            out.append(f'| **{o}**{note} | {byopp[o]} | {byopp_loss[o]} | {byopp_draw[o]} |\n')
    cur_opp = None
    for r in results:
        if r['opp'] != cur_opp:
            cur_opp = r['opp']
            note = '  ⚠️*표본 적음, 신뢰도 낮음*' if r['opp']=='ONG' else ''
            out.append(f'\n---\n## {cur_opp}전 — {byopp[r["opp"]]}개 (🔴패배 {byopp_loss[r["opp"]]} · 🟡무승부 {byopp_draw[r["opp"]]}){note}\n\n')
            out.append('| 결과 | 세션·맵·시점 | 선킬 | 한타결과 | FLC 사망자 | 영상 |\n')
            out.append('|------|------------|------|---------|-----------|------|\n')
        link = f'[▶ 점프]({r["link"]})' if r['has_video'] else '❌ 영상없음'
        badge = '🔴패배' if r['outcome']=='패배' else '🟡무승부'
        res = f'**{r["flc_deaths"]} vs {r["opp_deaths"]}**' if r['outcome']=='패배' else f'{r["flc_deaths"]} vs {r["opp_deaths"]}'
        sess_short = r['sess'].split('-')[0]
        victims = ', '.join(r['flc_victims'])
        out.append(f'| {badge} | {sess_short} {r["map"]} {fmt_t(r["gt"])} | {r["killer"]}({r["killer_hero"]})→{r["victim"]}({r["victim_hero"]}) | {res} | {victims} | {link} |\n')
    # pattern stats
    from collections import Counter as Ct
    vc, kc = Ct(), Ct()
    for r in results:
        vc.update(r['flc_victims']); kc.update([r['killer']])
    out.append('\n---\n## 📌 패턴 통계\n')
    out.append('\n**선킬 후 한타에서 가장 많이 죽는 선수** (백라인/후속 노출):\n')
    for n,ct in vc.most_common(): out.append(f'- {n}: {ct}회\n')
    out.append('\n**선킬(첫 킬)을 가장 많이 따낸 선수** (어디서 교전 시작):\n')
    for n,ct in kc.most_common(): out.append(f'- {n}: {ct}회\n')
    import io
    with io.open('선킬역전_교보재.md','w',encoding='utf-8') as fo:
        fo.write(''.join(out))
    print('\n→ 선킬역전_교보재.md 작성 완료')

if '--stats' in sys.argv:
    print('\n--- 패턴 통계 ---')
    victim_c = Counter()
    killer_c = Counter()
    for r in results:
        victim_c.update(r['flc_victims'])
        killer_c.update([r['killer']])
    print('선킬 후 한타에서 가장 많이 죽는 FLC 선수(백라인 노출):')
    for n,ct in victim_c.most_common(): print(f'  {n}: {ct}회')
    print('선킬(첫킬)을 가장 많이 따낸 FLC 선수(어디로 과확장):')
    for n,ct in killer_c.most_common(): print(f'  {n}: {ct}회')
c.close()
