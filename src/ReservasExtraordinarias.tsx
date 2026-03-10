import { useState, useMemo } from "react";
import { useTheme } from "./ThemeContext";
import { useBreakpoint } from "./useIsMobile";


const SUPABASE_URL = "https://wlisbvcqqjlgzfvbnscp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsaXNidmNxcWpsZ3pmdmJuc2NwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0Njg5MDIsImV4cCI6MjA4ODA0NDkwMn0.66Ly-QcVzj0rM5DyH6o3NDE-jfPSlPgRuJYyTDMlW4g";

const HOURS = ["06:00","07:00","08:00","09:00","10:00","11:00",
               "12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00"];
const DAYS  = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];

const PROG_COLORS: Record<string,string> = {
  "Química":"#F472B6","Biología":"#4ADE80","Física":"#60A5FA","Matemáticas":"#FB923C","Otro":"#a78bfa",
};

interface ReservasExtraordinariaProps {
  session:      any;
  reservations: any[];
  spaces:       any[];
  onClose:      () => void;
  onSaved:      () => void;
}

const EMPTY = {
  subject:"", teacher:"", program:"Otro",
  room:"", day:"Lunes", hour:"08:00", hour_end:"10:00",
  specific_date:"", tipo_reserva:"extraordinaria" as "extraordinaria"|"bloqueo",
  notes:"",
};

function getHoursBetween(start:string, end:string): string[] {
  const si = HOURS.indexOf(start), ei = HOURS.indexOf(end);
  if (si===-1||ei===-1||ei<si) return [start];
  return HOURS.slice(si, ei+1);
}

export default function ReservasExtraordinarias({
  session, reservations, spaces, onClose, onSaved
}: ReservasExtraordinariaProps) {
  const { T } = useTheme(); // ← TEMA DINÁMICO
  const { isMobile } = useBreakpoint();

  const [form,       setForm]       = useState(EMPTY);
  const [error,      setError]      = useState("");
  const [saving,     setSaving]     = useState(false);
  const [toast,      setToast]      = useState("");
  const [tab,        setTab]        = useState<"crear"|"disponibles"|"lista">("crear");
  const [nowFree,    setNowFree]    = useState<any[]>([]);
  const [filterTipo, setFilterTipo] = useState<"all"|"extraordinaria"|"bloqueo">("all");

  const token = session?.access_token;
  const upd = (p:any) => setForm(f=>({...f,...p}));

  // S dentro del componente para usar T dinámico
  const S = {
    overlay:{ position:"fixed" as const,inset:0,zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.85)",backdropFilter:"blur(8px)",padding:16 },
    box:    { background:T.bg3,borderRadius:16,border:`1px solid ${T.border2}`,width:"100%",maxWidth:860,maxHeight:"93vh",overflowY:"auto" as const,boxShadow:T.shadow },
    inp:{ width:"100%",background:T.inputBg,border:`1px solid ${T.inputBorder}`,color:T.text,borderRadius:8,padding:"9px 12px",fontSize:16,outline:"none",boxSizing:"border-box" as const,minHeight:44 },
    sel:{ width:"100%",background:T.inputBg,border:`1px solid ${T.inputBorder}`,color:T.text,borderRadius:8,padding:"9px 12px",fontSize:16,outline:"none",minHeight:44 },
    lbl:    { display:"block",fontSize:11,fontWeight:500 as const,color:T.muted,marginBottom:5,letterSpacing:"0.05em",textTransform:"uppercase" as const },
    btn:    (bg:string,extra?:any)=>({ padding:"9px 18px",borderRadius:8,border:"none",color:"#fff",background:bg,fontSize:13,fontWeight:600 as const,cursor:"pointer",...extra }),
  };

  const showToast = (msg:string) => {
    setToast(msg); setTimeout(()=>setToast(""),3000);
  };

  const allRooms = useMemo(()=>spaces.filter(s=>s.activo).map(s=>s.nombre),[spaces]);

  const extraordinary = useMemo(()=>
    reservations.filter(r=>r.tipo_reserva==="extraordinaria"||r.tipo_reserva==="bloqueo")
  ,[reservations]);

  const filtered = useMemo(()=>
    filterTipo==="all" ? extraordinary : extraordinary.filter(r=>r.tipo_reserva===filterTipo)
  ,[extraordinary, filterTipo]);

  const validateConflict = (): string | null => {
    const { room, day, hour, hour_end, specific_date } = form;
    if (!room || !day || !hour || !hour_end) return "Completa todos los campos obligatorios.";
    const block = getHoursBetween(hour, hour_end);
    for (const h of block) {
      const clashAcad = reservations.find(r =>
        r.room === room && r.day === day && r.hour === h &&
        (!r.tipo_reserva || r.tipo_reserva === "academica")
      );
      if (clashAcad) return `Conflicto con clase académica: "${clashAcad.subject}" a las ${h}.`;
      if (specific_date) {
        const clashExtr = reservations.find(r =>
          r.room === room && r.specific_date === specific_date && r.hour === h &&
          (r.tipo_reserva === "extraordinaria" || r.tipo_reserva === "bloqueo")
        );
        if (clashExtr) return `Conflicto con reserva extraordinaria: "${clashExtr.subject}" a las ${h}.`;
      }
    }
    return null;
  };

  const handleSave = async () => {
    const conflict = validateConflict();
    if (conflict) { setError(conflict); return; }
    try {
      setSaving(true); setError("");
      const payload = {
        program:      form.program,
        subject:      form.subject || (form.tipo_reserva==="bloqueo" ? "🔒 BLOQUEADO" : "Reserva Extraordinaria"),
        teacher:      form.teacher || "Administración",
        day:          form.day,
        hour:         form.hour,
        hour_end:     form.hour_end,
        room:         form.room,
        tipo_espacio: spaces.find(s=>s.nombre===form.room)?.tipo==="Laboratorio" ? "lab" : "teoria",
        tipo_reserva: form.tipo_reserva,
        specific_date:form.specific_date || null,
      };
      const res = await fetch(`${SUPABASE_URL}/rest/v1/reservations`, {
        method:"POST",
        headers:{
          apikey:SUPABASE_KEY, Authorization:`Bearer ${token}`,
          "Content-Type":"application/json", Prefer:"return=minimal",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Error al guardar");
      showToast("✓ Reserva creada exitosamente");
      setForm(EMPTY);
      onSaved();
    } catch { setError("Error al guardar. Intenta de nuevo."); }
    finally { setSaving(false); }
  };

  const checkAvailableNow = () => {
    const now      = new Date();
    const dayNames = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
    const today    = dayNames[now.getDay()];
    const currentH = `${String(now.getHours()).padStart(2,"0")}:00`;
    const free = spaces.filter(s => {
      if (!s.activo) return false;
      if (currentH < s.hora_apertura || currentH >= s.hora_cierre) return false;
      return !reservations.some(r => r.room===s.nombre && r.day===today && r.hour===currentH);
    });
    setNowFree(free);
    setTab("disponibles");
  };

  return (
    <div style={S.overlay} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={S.box}>

        {/* HEADER */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"18px 24px",borderBottom:`1px solid ${T.border}`}}>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:"Montserrat,sans-serif"}}>
              ⭐ Reservas Extraordinarias & Bloqueos
            </div>
            <div style={{fontSize:11,color:T.muted,marginTop:3}}>
              Investigación · Eventos · Bloqueos de mantenimiento
            </div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {toast&&<span style={{fontSize:12,padding:"6px 12px",borderRadius:8,color:"#4ade80",background:"rgba(74,222,128,0.1)",border:"1px solid rgba(74,222,128,0.25)"}}>{toast}</span>}
            <button onClick={checkAvailableNow}
              style={{...S.btn("linear-gradient(135deg,#059669,#10b981)"),fontSize:12,display:"flex",alignItems:"center",gap:6}}>
              🔍 ¿Qué hay libre ahora?
            </button>
            <button onClick={onClose} style={{background:"transparent",border:"none",color:T.muted,fontSize:22,cursor:"pointer"}}>✕</button>
          </div>
        </div>

        {/* TABS */}
        <div style={{display:"flex",borderBottom:`1px solid ${T.border}`}}>
          {[
            {key:"crear",       label:"➕ Crear Reserva"},
            {key:"disponibles", label:`🟢 Libres Ahora (${nowFree.length})`},
            {key:"lista",       label:`📋 Historial (${extraordinary.length})`},
          ].map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key as any)}
              style={{flex:1,padding:"11px",fontSize:12,fontWeight:600,cursor:"pointer",border:"none",
                borderBottom:tab===t.key?`2px solid ${T.udAccent}`:"2px solid transparent",
                background:tab===t.key?"rgba(0,102,204,0.08)":"transparent",
                color:tab===t.key?"#60a5fa":T.muted}}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{padding:24}}>

          {/* ══ TAB CREAR ══ */}
          {tab==="crear"&&(
            <div style={{display:"flex",flexDirection:"column",gap:16}}>

              {/* Tipo */}
              <div>
                <label style={S.lbl}>Tipo de Reserva</label>
                <div style={{display:"flex",gap:8}}>
                  {[
                    {key:"extraordinaria", label:"⭐ Extraordinaria", desc:"Investigación / Evento"},
                    {key:"bloqueo",        label:"🔒 Bloqueo",        desc:"Mantenimiento / Inhabilitado"},
                  ].map(t=>(
                    <button key={t.key} onClick={()=>upd({tipo_reserva:t.key})}
                      style={{flex:1,padding:"10px 14px",borderRadius:8,cursor:"pointer",
                        border:`1px solid ${form.tipo_reserva===t.key?(t.key==="bloqueo"?"#f87171":T.udAccent):T.border2}`,
                        background:form.tipo_reserva===t.key?(t.key==="bloqueo"?"rgba(239,68,68,0.1)":"rgba(0,102,204,0.12)"):"transparent",
                        color:form.tipo_reserva===t.key?(t.key==="bloqueo"?"#f87171":"#60a5fa"):T.muted,
                        textAlign:"left" as const}}>
                      <div style={{fontWeight:700,fontSize:13}}>{t.label}</div>
                      <div style={{fontSize:10,marginTop:2,opacity:0.7}}>{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{display:"grid",gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr",gap:12}}>
                <div>
                  <label style={S.lbl}>Descripción / Evento *</label>
                  <input style={S.inp} value={form.subject} placeholder="Ej: Seminario de Investigación Bioquímica"
                    onChange={e=>upd({subject:e.target.value})}/>
                </div>
                <div>
                  <label style={S.lbl}>Programa</label>
                  <select style={S.sel} value={form.program} onChange={e=>upd({program:e.target.value})}>
                    {["Química","Biología","Física","Matemáticas","Otro"].map(p=><option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              <div style={{display:"grid",gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",gap:12}}>
                <div>
                  <label style={S.lbl}>Responsable</label>
                  <input style={S.inp} value={form.teacher} placeholder="Nombre del responsable"
                    onChange={e=>upd({teacher:e.target.value})}/>
                </div>
                <div>
                  <label style={S.lbl}>Espacio *</label>
                  <select style={S.sel} value={form.room} onChange={e=>upd({room:e.target.value})}>
                    <option value="">Seleccionar espacio</option>
                    {spaces.filter(s=>s.activo).map(s=>(
                      <option key={s.nombre} value={s.nombre}>{s.tipo==="Laboratorio"?"🔬":"🏫"} {s.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{display:"grid",gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr",gap:12}}>
                <div>
                  <label style={S.lbl}>Día *</label>
                  <select style={S.sel} value={form.day} onChange={e=>upd({day:e.target.value})}>
                    {DAYS.map(d=><option key={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.lbl}>Fecha específica</label>
                  <input style={S.inp} type="date" value={form.specific_date}
                    onChange={e=>upd({specific_date:e.target.value})}/>
                </div>
                <div>
                  <label style={S.lbl}>Hora inicio *</label>
                  <select style={S.sel} value={form.hour} onChange={e=>upd({hour:e.target.value,hour_end:e.target.value})}>
                    {HOURS.map(h=><option key={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.lbl}>Hora fin *</label>
                  <select style={S.sel} value={form.hour_end} onChange={e=>upd({hour_end:e.target.value})}>
                    {HOURS.filter(h=>h>=form.hour).map(h=><option key={h}>{h}</option>)}
                  </select>
                </div>
              </div>

              {form.hour&&form.hour_end&&(
                <div style={{background:T.bg2,borderRadius:8,padding:"8px 14px",border:`1px solid ${T.border}`,fontSize:12}}>
                  <span style={{color:T.muted}}>Bloques: </span>
                  <span style={{color:"#60a5fa",fontWeight:600}}>{getHoursBetween(form.hour,form.hour_end).join(" · ")}</span>
                  <span style={{color:T.muted,marginLeft:8}}>({getHoursBetween(form.hour,form.hour_end).length}h)</span>
                </div>
              )}

              {error&&(
                <div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",color:"#f87171",fontSize:13,padding:"10px 12px",borderRadius:8,display:"flex",gap:8}}>
                  <span>⚠</span><span>{error}</span>
                </div>
              )}

              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>setForm(EMPTY)}
                  style={{...S.btn("transparent"),border:`1px solid ${T.border2}`,color:T.mutedL}}>
                  Limpiar
                </button>
                <button onClick={handleSave} disabled={saving}
                  style={{...S.btn(form.tipo_reserva==="bloqueo"?"linear-gradient(135deg,#dc2626,#ef4444)":`linear-gradient(135deg,${T.udBlue},${T.udAccent})`),flex:1,opacity:saving?0.7:1}}>
                  {saving?"Guardando…":form.tipo_reserva==="bloqueo"?"🔒 Crear Bloqueo":"⭐ Crear Reserva Extraordinaria"}
                </button>
              </div>
            </div>
          )}

          {/* ══ TAB DISPONIBLES ══ */}
          {tab==="disponibles"&&(
            <div>
              <div style={{fontSize:13,color:T.muted,marginBottom:16,textAlign:"center" as const}}>
                Espacios libres en este momento ({new Date().toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"})})
              </div>
              {nowFree.length===0?(
                <div style={{textAlign:"center" as const,padding:40,color:T.muted}}>
                  <div style={{fontSize:40,marginBottom:12}}>🔍</div>
                  <div>No hay espacios disponibles ahora o es fuera del horario de operación.</div>
                  <button onClick={checkAvailableNow}
                    style={{...S.btn(`linear-gradient(135deg,${T.udBlue},${T.udAccent})`),marginTop:16}}>
                    Buscar de nuevo
                  </button>
                </div>
              ):(
                <div style={{display:"grid",gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(3,1fr)",gap:12}}>
                 {nowFree.map(s=>(
                    <div key={s.nombre}
                      style={{background:T.bg2,borderRadius:10,padding:"14px 16px",border:`1px solid rgba(74,222,128,0.3)`,cursor:"pointer"}}
                      onClick={()=>{ upd({room:s.nombre}); setTab("crear"); }}>
                      <div style={{fontSize:20,marginBottom:6}}>{s.tipo==="Laboratorio"?"🔬":"🏫"}</div>
                      <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:4}}>{s.nombre}</div>
                      <div style={{fontSize:11,color:T.muted}}>{s.tipo} · Cap. {s.capacidad}</div>
                      <div style={{fontSize:10,color:"#4ade80",marginTop:6}}>✓ Libre ahora · Clic para reservar</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══ TAB LISTA ══ */}
          {tab==="lista"&&(
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div style={{display:"flex",gap:8}}>
                {[["all","Todas"],["extraordinaria","⭐ Extraordinarias"],["bloqueo","🔒 Bloqueos"]].map(([k,l])=>(
                  <button key={k} onClick={()=>setFilterTipo(k as any)}
                    style={{padding:"6px 14px",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",
                      border:`1px solid ${filterTipo===k?T.udAccent:T.border2}`,
                      background:filterTipo===k?"rgba(0,102,204,0.15)":"transparent",
                      color:filterTipo===k?"#60a5fa":T.muted}}>
                    {l}
                  </button>
                ))}
              </div>
              {filtered.length===0?(
                <div style={{textAlign:"center" as const,padding:40,color:T.muted}}>
                  No hay reservas extraordinarias.
                </div>
              ):(
                filtered.map((r,i)=>(
                  <div key={i} style={{background:T.bg2,borderRadius:10,padding:"12px 16px",
                    border:`1px solid ${r.tipo_reserva==="bloqueo"?"rgba(239,68,68,0.25)":"rgba(251,146,60,0.25)"}`,
                    display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:r.tipo_reserva==="bloqueo"?"#f87171":"#fb923c",marginBottom:4}}>
                        {r.tipo_reserva==="bloqueo"?"🔒":"⭐"} {r.subject}
                      </div>
                      <div style={{fontSize:11,color:T.muted}}>
                        📍 {r.room} · {r.day}{r.specific_date?` · ${r.specific_date}`:""} · {r.hour}→{r.hour_end}
                        {r.teacher&&<span style={{marginLeft:8}}>· 👤 {r.teacher}</span>}
                      </div>
                    </div>
                    <span style={{fontSize:10,padding:"3px 10px",borderRadius:99,
                      background:r.tipo_reserva==="bloqueo"?"rgba(239,68,68,0.15)":"rgba(251,146,60,0.15)",
                      color:r.tipo_reserva==="bloqueo"?"#f87171":"#fb923c",
                      fontWeight:600,whiteSpace:"nowrap" as const}}>
                      {r.tipo_reserva}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}