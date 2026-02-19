// src/ScrimDetail.jsx
import React, { useEffect, useState } from "react";
import axios from "axios";
import { ChevronLeft, BarChart3 } from "lucide-react";
// [중요] ThemeContext와 LanguageContext 가져오기
import { useTheme } from "./ThemeContext";
import { useLanguage } from "./LanguageContext";

const API_BASE = import.meta.env.PROD ? "" : "http://127.0.0.1:8000";

export default function ScrimDetail({ scrimId, onSelectMatch, onBack, onGoOverall }) {
  const { theme } = useTheme(); // [테마 훅]
  const { t } = useLanguage();  // [언어 훅]

  const [scrim, setScrim] = useState(null);
  const [scrimLoading, setScrimLoading] = useState(true);
  const [scrimErr, setScrimErr] = useState("");

  useEffect(() => {
    let alive = true;

    async function fetchScrim() {
      setScrimLoading(true);
      setScrimErr("");
      setScrim(null);

      try {
        const res = await axios.get(`${API_BASE}/api/scrims/${encodeURIComponent(scrimId)}`);
        if (!alive) return;
        setScrim(res.data);
      } catch (e) {
        if (!alive) return;
        setScrimErr(e?.message || String(e));
      } finally {
        if (!alive) return;
        setScrimLoading(false);
      }
    }

    if (scrimId) fetchScrim();

    return () => {
      alive = false;
    };
  }, [scrimId]);

  if (scrimLoading) {
    return (
      <div style={{ padding: 40, maxWidth: 1200, margin: "0 auto", color: theme.text }}>
        {t.loading}
      </div>
    );
  }

  if (!scrim) {
    return (
      <div style={{ padding: 40, maxWidth: 1200, margin: "0 auto", color: theme.text }}>
        <div style={{ color: theme.danger, fontWeight: 800 }}>{t.noData}</div>
        <div style={{ color: theme.textSub, marginTop: 8, fontSize: 13 }}>{scrimErr}</div>
        <button
          onClick={onBack}
          style={{
            marginTop: 14,
            background: theme.surfaceHighlight,
            border: `1px solid ${theme.borderHighlight}`,
            color: theme.text,
            padding: "10px 14px",
            borderRadius: 10,
            cursor: "pointer",
            fontWeight: 800,
          }}
        >
          {t.back}
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "40px", maxWidth: 1200, margin: "0 auto", color: theme.text }}>
      {/* 헤더 */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button
            onClick={onBack}
            style={{
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              color: theme.text,
              borderRadius: 10,
              padding: "10px 12px",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <ChevronLeft size={16} /> {t.backToList}
          </button>

          <div>
            <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 4 }}>{scrim.scrim_name}</div>
            <div style={{ color: theme.textSub, fontSize: 13 }}>
              {scrim.date} · {scrim.start_time} ~ {scrim.end_time} · {scrim.matches?.length || 0} {t.fightCount}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {onGoOverall && (
            <button
              onClick={onGoOverall}
              style={{
                background: theme.surfaceHighlight,
                border: `1px solid ${theme.borderHighlight}`,
                color: theme.text,
                padding: "10px 14px",
                borderRadius: 10,
                cursor: "pointer",
                fontWeight: 800,
                display: "inline-flex",
                gap: 8,
                alignItems: "center",
              }}
            >
              <BarChart3 size={16} /> {t.overall}
            </button>
          )}
        </div>
      </div>

      <div style={{ height: 24 }} />

      {/* 매치 목록 */}
      <div
        style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: 14,
          padding: 18,
        }}
      >
        <div style={{ fontWeight: 900, marginBottom: 12 }}>Match List</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {(scrim.matches || []).map((m) => {
            return (
              <div
                key={m.id}
                style={{
                  border: `1px solid ${theme.border}`,
                  background: theme.bg, // 리스트 아이템 배경
                  borderRadius: 12,
                  padding: 14,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>
                    #{m.match_index} · {m.map_name}
                  </div>
                  <div style={{ color: theme.textSub, fontSize: 13 }}>
                    Result: {m.result || "Unknown"}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    onClick={() => onSelectMatch?.(m.id)}
                    style={{
                      background: theme.text, // 반전 효과 (흰색 모드에선 검정, 다크 모드에선 흰색)
                      border: "none",
                      color: theme.bg,        // 텍스트는 배경색으로 반전
                      padding: "8px 10px",
                      borderRadius: 10,
                      cursor: "pointer",
                      fontWeight: 900,
                      fontSize: 12,
                    }}
                  >
                    Analyze
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {scrimErr && (
          <div style={{ marginTop: 12, color: theme.danger, fontSize: 13 }}>{scrimErr}</div>
        )}
      </div>
    </div>
  );
}