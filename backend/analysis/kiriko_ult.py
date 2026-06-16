# -*- coding: utf-8 -*-
"""키리코(FLC, Fielder) 궁극기를 '먼저 쓴' 한타 → 승/패 구분 마크다운.

[정의]
  - 한타: services.fight_analysis.compute_fights (앱과 동일, kill+ultimate_start 그룹핑).
  - '키리코 궁 선궁': 그 한타의 ultimate_start 중 시간상 가장 빠른 것이
                     player_team=FLC AND player_hero=키리코 (= FLC가 키리코 궁으로 한타에서 가장 먼저 궁 사용).
  - 승/패: compute_fights winner (생존자 많은 팀). 무승부(동수)는 별도 분류.
[영상] frontend videoLink.buildVideoLink 동일 — game_setup_sec 분기 + pauses 보정, 키리코 궁 5초 전부터.
"""
import sqlite3, sys, math, re, io
sys.path.insert(0, '.')
from services.fight_analysis import compute_fights

US='FLC'; HERO='키리코'; LEAD_IN=5
c=sqlite3.connect('data/scrim.db'); c.row_factory=sqlite3.Row; cur=c.cursor()

cur.execute('''SELECT m.id,m.team1_name,m.team2_name,m.map_name,m.video_url,m.video_offset,m.game_setup_sec,s.scrim_name,s.date
 FROM matches m JOIN sessions s ON m.session_id=s.id WHERE m.deleted_at IS NULL AND s.deleted_at IS NULL''')
matches={r['id']:dict(r) for r in cur.fetchall()}
pauses={}
for r in cur.execute('SELECT match_id,start_sec,end_sec FROM pauses'):
    pauses.setdefault(r['match_id'],[]).append((r['start_sec'],r['end_sec']))

def build_link(m, ts):
    url=m['video_url']
    if not url or not url.strip(): return None
    off=float(m['video_offset'] or 0); gss=m['game_setup_sec']
    t=off+(ts-gss) if gss is not None else off+ts
    for s_,e_ in sorted(pauses.get(m['id'],[])):
        if s_<=t: t+=(e_-s_)
    t=max(0,math.floor(t-LEAD_IN))
    clean=re.sub(r'[?&]t=[^&]*','',url).rstrip('?&')
    sep='&' if '?' in clean else '?'
    return f'{clean}{sep}t={t}'

cols=['event_type','timestamp','game_timestamp','player_name','player_team','player_hero','target_name','target_team','target_hero','ability']
rows=[]
for mid,m in matches.items():
    opp=m['team2_name'] if m['team1_name']==US else m['team1_name']
    cur.execute(f'SELECT {",".join(cols)} FROM events WHERE match_id=?',(mid,))
    evs=[dict(zip(cols,r)) for r in cur.fetchall()]
    if not evs: continue
    for f in compute_fights(evs, m['team1_name'], m['team2_name']):
        ults=[e for e in f['events'] if e['event_type']=='ultimate_start']
        if not ults: continue
        first=ults[0]
        if not (first['player_team']==US and first['player_hero']==HERO):
            continue   # 첫 궁이 FLC 키리코가 아니면 제외
        w=f['winner']
        outcome='승리' if w==US else ('패배' if w==opp else '무승부')
        fd=f['team1_deaths'] if m['team1_name']==US else f['team2_deaths']
        od=f['team2_deaths'] if m['team1_name']==US else f['team1_deaths']
        ts=first['timestamp']
        kills=[e for e in f['events'] if e['event_type']=='kill']
        rows.append(dict(opp=opp,map=m['map_name'],sess=m['scrim_name'],date=m['date'],
            outcome=outcome, gt=first.get('game_timestamp') or 0, ts=ts,
            user=first['player_name'], fd=fd, od=od,
            link=build_link(m,ts), has_video=bool(m['video_url'] and m['video_url'].strip()),
            # 한타 내 다른 FLC 궁(연계), 상대 궁
            flc_ults=[f"{e['player_name']}({e['player_hero']})" for e in ults if e['player_team']==US],
            opp_ults=[f"{e['player_hero']}" for e in ults if e['player_team']==opp]))

def fmt_t(gt): gt=int(gt); return f'{gt//60}:{gt%60:02d}'
ORD=['ZETA','T1','VR','JDG','ONG']
rows.sort(key=lambda r:(ORD.index(r['opp']) if r['opp'] in ORD else 9, r['date'], r['ts']))

from collections import Counter
nW=sum(1 for r in rows if r['outcome']=='승리')
nL=sum(1 for r in rows if r['outcome']=='패배')
nD=sum(1 for r in rows if r['outcome']=='무승부')
print(f'키리코 선궁 한타 총 {len(rows)}개  — 승리 {nW} / 패배 {nL} / 무승부 {nD}')

def table(rs):
    out=['| 결과 | 세션·맵·시점 | 한타결과(FLC vs 상대 사망) | FLC 연계 궁 | 상대 궁 | 영상 |',
         '|------|------------|--------------------------|-----------|--------|------|']
    for r in rs:
        link=f'[▶ 점프]({r["link"]})' if r['has_video'] else '영상없음'
        sess=r['sess'].split('-')[0]
        flcu=', '.join(r['flc_ults'][1:]) or '—'   # 첫(키리코) 제외 연계
        oppu=', '.join(r['opp_ults']) or '—'
        out.append(f"| {r['outcome']} | {sess} {r['map']} {fmt_t(r['gt'])} | {r['fd']} vs {r['od']} | {flcu} | {oppu} | {link} |")
    return '\n'.join(out)

md=[]
md.append('# 🦊 키리코(Fielder) 선궁 한타 — 승 / 패 구분\n')
md.append(f'> **정의**: 한타(compute_fights)에서 **가장 먼저 터진 궁극기가 FLC 키리코**인 경우. ')
md.append(f'한타 승=생존자 많은 팀. 영상은 키리코 궁 {LEAD_IN}초 전부터.\n')
md.append(f'\n**총 {len(rows)}개 한타** — 🔵승리 {nW} · 🔴패배 {nL} · ⚪무승부 {nD}  (승률 {nW/(nW+nL)*100:.0f}%, 무승부 제외)\n')
byres=Counter((r["outcome"],r["opp"]) for r in rows)
md.append('\n## 🔵 이기는 장면 — 키리코 선궁 후 한타 승리\n')
md.append(table([r for r in rows if r['outcome']=='승리'])+'\n')
md.append('\n## 🔴 지는 장면 — 키리코 선궁 후 한타 패배\n')
md.append(table([r for r in rows if r['outcome']=='패배'])+'\n')
dr=[r for r in rows if r['outcome']=='무승부']
if dr:
    md.append('\n## ⚪ 무승부 (참고)\n')
    md.append(table(dr)+'\n')
# 상대별 요약
md.append('\n## 📊 상대별 요약\n')
md.append('| 상대 | 승 | 패 | 무 | 승률(무제외) |\n|------|----|----|----|------------|')
for o in ORD:
    w=sum(1 for r in rows if r['opp']==o and r['outcome']=='승리')
    l=sum(1 for r in rows if r['opp']==o and r['outcome']=='패배')
    d=sum(1 for r in rows if r['opp']==o and r['outcome']=='무승부')
    wr=f'{w/(w+l)*100:.0f}%' if (w+l) else '—'
    md.append(f'| {o} | {w} | {l} | {d} | {wr} |')

io.open('키리코_선궁_승패.md','w',encoding='utf-8').write('\n'.join(md))
print('→ 키리코_선궁_승패.md 작성 완료')
c.close()
