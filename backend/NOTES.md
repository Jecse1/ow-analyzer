# Backend Operations Notes

## 백업/복원 주의사항

### ⚠️ 백업 복원 전 필수 확인

phase5_backup 등 백업 파일을 복원할 때 반드시:

1. 복원 전 현재 active 세션 목록 기록
2. 복원 후 의도치 않은 세션 부활 여부 확인:
   ```bash
   python -c "
   import sqlite3
   conn = sqlite3.connect('data/scrim.db')
   cur = conn.cursor()
   cur.execute('SELECT id, scrim_name FROM sessions WHERE deleted_at IS NULL')
   for r in cur.fetchall(): print(r)
   conn.close()
   "
   ```
3. 부활한 좀비 발견 시: hard delete 후 백업 재생성

### 현재 clean 백업 (2026-05-27 JDG 박멸 후)

- `data/scrim.db.phase5_backup` — DB, 2개 세션 (260526-VARREL, 260527-VARREL)
- `scrim_data.json.phase5_backup` — JSON, 2개 세션 동일

### before_rebuild_* 파일 정책

`rebuild-db` API는 `scrim_rowdata_log/` raw 파일 기반으로 deterministic하게 재구성됨.
before_rebuild_* 백업은 필요 없으므로 생성하지 않음.

TODO: rebuild_database()에서 before_rebuild_* 자동 생성 로직 제거 또는 최대 1개 유지로 변경.

---

## 좀비 세션 사고 기록 (2026-05-27)

**증상:** 세션 `2605271618` (260527-JDG-1) 삭제 후 재부활.

**원인:** Phase 4 테스트 중 soft-delete 전 상태로 phase5_backup이 생성됨.
Phase 5 3-세션 복원 작업 시 해당 백업 복원 → JDG active 상태로 부활.

**조치:** DB hard delete (events → player_stats → rounds → pauses → matches → session)
+ scrim_data.json 제거 + 모든 구 백업 삭제 + 새 clean 백업 재생성.

**재발 방지:** 백업 복원 후 위 확인 절차 준수.

---

## TODO

- [ ] `verify_db_backup(backup_path)` 함수: 백업 파일의 active 세션이 현재 DB와 다른 경우 경고 출력
- [ ] `rebuild_database()`: before_rebuild_* 자동 백업 제거 (scrim_rowdata_log 기반 rebuild는 deterministic)
