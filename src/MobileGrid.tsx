import { useState } from "react";
import { useTheme } from "./ThemeContext";

const DAYS_SHORT = ["L","M","X","J","V","S"];
const DAYS_FULL  = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];

const PROG_COLORS: Record<string,string> = {
  "Química":"#F472B6","Biología":"#4ADE80",
  "Física":"#60A5FA","Matemáticas":"#FB923C","Otro":"#a78bfa",
};

interface MobileGridProps {
  reservations: any[];
  onCellClick:  (r: any) => void;
}

export default function MobileGrid({ reservations, onCellClick }: MobileGridProps) {
  const { T } = useTheme();
  const [selectedDay, setSelectedDay] = useState(0);

  // ── Protección total contra nulls ──
  const safeReservations = reservations.filter(r =>
    r && r.day && r.hour && r.subject
  );

  const dayReservations = safeReservations
    .filter(r => r.day === DAYS_FULL[selectedDay])
    .sort((a, b) => (a.hour || "").localeCompare(b.hour || ""));

  const byHour: Record<string, any[]> = {};
  for (const r of dayReservations) {
    const h = r.hour || "00:00";
    if (!byHour[h]) byHour[h] = [];
    byHour[h].push(r);
  }
  const hours = Object.keys(byHour).sort();

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", background:T.bg }}>

      {/* Selector de días */}
      <div style={{
        display:"flex", gap:6, padding:"12px 16px",
        background:T.bg2, borderBottom:`1px solid ${T.border}`,
        overflowX:"auto", scrollbarWidth:"none",
      }}>
        {DAYS_SHORT.map((d, i) => {
          const count = safeReservations.filter(r => r.day === DAYS_FULL[i]).length;
          const active = i === selectedDay;
          return (
            <button key={i} onClick={() => setSelectedDay(i)} style={{
              minWidth:44, height:52, borderRadius:10, border:"none",
              background: active ? T.udAccent : T.bg3,
              color: active ? "#fff" : T.muted,
              display:"flex", flexDirection:"column",
              alignItems:"center", justifyContent:"center",
              gap:2, cursor:"pointer", flexShrink:0,
              boxShadow: active ? `0 4px 12px ${T.udAccent}50` : "none",
              transition:"all 0.15s",
            }}>
              <span translate="no" style={{ fontSize:15, fontWeight:700 }}>{d}</span>
              {count > 0 && (
                <span style={{
                  fontSize:9, background: active ? "rgba(255,255,255,0.3)" : T.udAccent,
                  color:"#fff", borderRadius:99, padding:"1px 5px", fontWeight:600,
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Nombre del día */}
      <div style={{
        padding:"10px 16px 4px", fontSize:13, fontWeight:700,
        color:T.mutedL, letterSpacing:"0.08em", textTransform:"uppercase",
      }}>
        {DAYS_FULL[selectedDay]} — {dayReservations.length} clase{dayReservations.length!==1?"s":""}
      </div>

      {/* Lista */}
      <div style={{ flex:1, overflowY:"auto", padding:"8px 16px 24px", display:"flex", flexDirection:"column", gap:8 }}>

        {hours.length === 0 && (
          <div style={{
            flex:1, display:"flex", flexDirection:"column",
            alignItems:"center", justifyContent:"center",
            padding:40, color:T.muted, textAlign:"center",
          }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📭</div>
            <div style={{ fontSize:14 }}>Sin clases este día</div>
          </div>
        )}

        {hours.map(hour => (
          <div key={hour}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6, marginTop:4 }}>
              <span style={{ fontSize:11, fontWeight:700, color:T.udAccent, fontFamily:"monospace", minWidth:42 }}>
                {hour}
              </span>
              <div style={{ flex:1, height:1, background:T.border }} />
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {byHour[hour].map((r, i) => {
                // Protección por campo
                const program  = r.program  || "Otro";
                const subject  = r.subject  || "(sin nombre)";
                const teacher  = r.teacher  || "";
                const room     = r.room     || "";
                const hourEnd  = r.hour_end || r.hour || "";
                const color    = PROG_COLORS[program] || "#94a3b8";
                const isLab    = r.tipo_espacio === "lab";
                const isExtr   = r.tipo_reserva === "extraordinaria";
                const isBlock  = r.tipo_reserva === "bloqueo";

                return (
                  <button key={i} onClick={() => onCellClick(r)} style={{
                    width:"100%", textAlign:"left", border:"none", cursor:"pointer",
                    background:T.bg2, borderRadius:12,
                    borderLeft:`4px solid ${isBlock?"#ef4444":isExtr?"#fb923c":color}`,
                    padding:"12px 14px",
                    boxShadow:`0 2px 8px rgba(0,0,0,0.15)`,
                    minHeight:44,
                  }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:T.text, lineHeight:1.3, flex:1 }}>
                        {isBlock?"🔒 ":isExtr?"⭐ ":""}{subject}
                      </div>
                      <span style={{
                        fontSize:10, padding:"2px 8px", borderRadius:99, flexShrink:0,
                        background:isLab?"rgba(74,222,128,0.15)":"rgba(96,165,250,0.15)",
                        color:isLab?"#4ade80":"#60a5fa", fontWeight:600,
                        border:`1px solid ${isLab?"rgba(74,222,128,0.3)":"rgba(96,165,250,0.3)"}`,
                      }}>
                        {isLab?"🔬 Lab":"🏫 Teoría"}
                      </span>
                    </div>

                    <div style={{ display:"flex", gap:12, marginTop:6, flexWrap:"wrap", alignItems:"center" }}>
                      <span style={{ fontSize:11, color:T.muted, fontFamily:"monospace" }}>
                        {r.hour} → {hourEnd}
                      </span>
                      {room && (
                        <span style={{ fontSize:11, color:T.mutedL }}>📍 {room}</span>
                      )}
                      {teacher && (
                        <span style={{ fontSize:11, color:T.muted }}>👤 {teacher}</span>
                      )}
                      <span style={{
                        fontSize:10, padding:"1px 7px", borderRadius:99,
                        background:`${color}20`, color, fontWeight:600, marginLeft:"auto",
                      }}>
                        {program}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}