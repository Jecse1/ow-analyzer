# -*- coding: utf-8 -*-
"""쟁탈/플래시포인트 맵 — 라운드별 '첫 싸움' 승률 + 승/패 방식 분석.

[정의]
  - 대상 맵: 쟁탈(일리오스·오아시스·남극반도), 플래시포인트(수라바사·뉴정크시티).
  - 첫 싸움: 각 round_id의 이벤트만으로 compute_fights → 첫 번째 한타(fights[0]).
  - 승/패: compute_fights winner(생존자 많은 팀). 무승부(동수)는 별도.
  - 방식 분석: 첫 킬 주체/영웅/대상, 첫 궁 주체/영웅, 사망 차이 → 승/패 한타 비교.
"""
import sqlite3, sys, io
from collections import defaultdict, Counter
sys.path.insert(0,'.')
from services.fight_analysis import compute_fights

US='FLC'
CONTROL={'일리오스','오아시스','남극반도'}
FLASH={'수라바사','뉴정크시티'}
ROLE_HERO={'D.Va':'탱','마우가':'탱','시그마':'탱','라마트라':'탱','라인하르트':'탱','레킹볼':'탱','윈스턴':'탱','오리사':'탱','자리야':'탱','해저드':'탱','둠피스트':'탱',
 '루시우':'힐','주노':'힐','키리코':'힐','아나':'힐','모이라':'힐','브리기테':'힐','바티스트':'힐','일리아리':'힐','미즈키':'힐','제트팩 캣':'힐','우양':'힐','메르시':'힐','젠야타':'힐'}
def hrole(h): return ROLE_HERO.get(h,'딜')

c=sqlite3.connect('data/scrim.db'); c.row_factory=sqlite3.Row; cur=c.cursor()
cur.execute('''SELECT m.id,m.team1_name,m.team2_name,m.map_name FROM matches m JOIN sessions s ON m.session_id=s.id
 WHERE m.deleted_at IS NULL AND s.deleted_at IS NULL''')
M={r['id']:dict(t1=r['team1_name'],t2=r['team2_name'],opp=(r['team2_name'] if r['team1_name']==US else r['team1_name']),map=r['map_name']) for r in cur.fetchall()}
cols=['event_type','timestamp','game_timestamp','player_name','player_team','player_hero','target_name','target_team','target_hero','ability','round_id']

# gather events per (match, round)
rev=defaultdict(list)
cur.execute(f"SELECT {','.join(cols)} FROM events WHERE event_type IN ('kill','ultimate_start')")
for r in cur.fetchall():
    rev[(r['round_id'])].append(dict(zip(cols,[r[c] for c in cols])))

# map round_id -> match_id
r2m={}
cur.execute("SELECT DISTINCT round_id,match_id FROM events WHERE round_id IS NOT NULL")
for r in cur.fetchall(): r2m[r['round_id']]=r['match_id']

def first_fights(mapset):
    out=[]
    for rid,evs in rev.items():
        mid=r2m.get(rid)
        if mid not in M or M[mid]['map'] not in mapset: continue
        info=M[mid]
        fights=compute_fights(evs, info['t1'], info['t2'])
        if not fights: continue
        f=fights[0]
        kills=[e for e in f['events'] if e['event_type']=='kill']
        ults=[e for e in f['events'] if e['event_type']=='ultimate_start']
        if not kills: continue
        w=f['winner']; opp=info['opp']
        outcome='승' if w==US else ('패' if w==opp else '무')
        fk=kills[0]
        fkteam='FLC' if fk['player_team']==US else ('상대' if fk['player_team']==opp else '?')
        fd=f['team1_deaths'] if info['t1']==US else f['team2_deaths']
        od=f['team2_deaths'] if info['t1']==US else f['team1_deaths']
        # 첫 FLC 사망자 / 첫 상대 처치 대상
        flc_first_death=next((e['target_hero'] for e in kills if e['target_team']==US), None)
        opp_first_down=next((e['target_hero'] for e in kills if e['target_team']==opp), None)
        firstult=ults[0] if ults else None
        out.append(dict(opp=opp,map=info['map'],outcome=outcome,fkteam=fkteam,
            fk_killer=fk['player_name'] if fk['player_team']==US else None,
            fk_killer_hero=fk['player_hero'] if fk['player_team']==US else None,
            fk_target_hero=fk['target_hero'], fk_target_role=hrole(fk['target_hero']),
            flc_first_death=flc_first_death, flc_first_death_role=hrole(flc_first_death) if flc_first_death else None,
            fd=fd,od=od,
            firstult_team=('FLC' if firstult and firstult['player_team']==US else ('상대' if firstult else None)),
            firstult_hero=firstult['player_hero'] if firstult else None))
    return out

def report(ff, label, fh):
    n=len(ff); W=sum(1 for x in ff if x['outcome']=='승'); L=sum(1 for x in ff if x['outcome']=='패'); D=n-W-L
    wr=W/(W+L)*100 if (W+L) else 0
    fh(f'\n## {label} — 첫 싸움 {n}개:  {W}승 {L}패 {D}무  (승률 {wr:.0f}%)\n')
    won=[x for x in ff if x['outcome']=='승']; lost=[x for x in ff if x['outcome']=='패']
    def pct(sub,key,val): return 100*sum(1 for x in sub if x[key]==val)/len(sub) if sub else 0
    def join(cnt,k=8): return ', '.join(f'{a} {b}' for a,b in cnt.most_common(k)) or '—'
    w_fkflc=pct(won,'fkteam','FLC'); l_fkflc=pct(lost,'fkteam','FLC')
    w_ult=pct(won,'firstult_team','FLC'); l_ult=pct(lost,'firstult_team','FLC')
    fh(f'- 첫 킬을 **FLC가** 따낸 비율:  승리 한타 {w_fkflc:.0f}%  vs  패배 한타 {l_fkflc:.0f}%')
    fh(f'- 첫 궁을 **FLC가** 먼저 쓴 비율:  승리 {w_ult:.0f}%  vs  패배 {l_ult:.0f}%')
    fh('\n  **[이기는 방식]** 승리 첫 싸움에서:')
    ik=Counter(f"{x['fk_killer']}({x['fk_killer_hero']})" for x in won if x['fkteam']=='FLC')
    fh('   - 첫 킬 개시(누가): '+join(ik,5))
    fh('   - 첫 킬 대상 역할: '+join(Counter(x['fk_target_role'] for x in won if x['fkteam']=='FLC')))
    fh('   - 첫 킬 대상 영웅: '+join(Counter(x['fk_target_hero'] for x in won if x['fkteam']=='FLC'),5))
    fh('\n  **[지는 방식]** 패배 첫 싸움에서:')
    l_fkopp=pct(lost,'fkteam','상대')
    fh(f'   - 상대가 첫 킬 가져간 비율: {l_fkopp:.0f}%')
    fh('   - 먼저 잘리는 우리 역할: '+join(Counter(x['flc_first_death_role'] for x in lost if x['flc_first_death'])))
    fh('   - 먼저 잘리는 우리 영웅: '+join(Counter(x['flc_first_death'] for x in lost if x['flc_first_death']),6))
    return dict(n=n,W=W,L=L,D=D,wr=wr)

ctrl=first_fights(CONTROL); flash=first_fights(FLASH)
buf=[]
def fh(s): buf.append(s); print(s)
fh('# 쟁탈/플래시포인트 — 첫 싸움 승률 & 승/패 방식\n')
fh('> 첫 싸움 = 각 라운드 첫 한타(compute_fights). 승=생존자 많은 팀(무승부 제외 승률).')
sc=report(ctrl,'🟢 쟁탈(Control) — 일리오스·오아시스·남극반도',fh)
sf=report(flash,'🟣 플래시포인트 — 수라바사·뉴정크시티',fh)
both=ctrl+flash
sb=report(both,'⚫ 쟁탈+플래시포인트 합산',fh)
io.open('첫싸움_쟁탈_플포.md','w',encoding='utf-8').write('\n'.join(buf))
print('\n→ 첫싸움_쟁탈_플포.md 작성 완료')
c.close()
