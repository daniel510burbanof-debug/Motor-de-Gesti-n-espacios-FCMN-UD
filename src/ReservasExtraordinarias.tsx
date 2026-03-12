import { useState, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import { useTheme } from "./ThemeContext";
import { useBreakpoint } from "./useIsMobile";

const SUPABASE_URL = "https://wlisbvcqqjlgzfvbnscp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsaXNidmNxcWpsZ3pmdmJuc2NwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0Njg5MDIsImV4cCI6MjA4ODA0NDkwMn0.66Ly-QcVzj0rM5DyH6o3NDE-jfPSlPgRuJYyTDMlW4g";

const HOURS = ["06:00","07:00","08:00","09:00","10:00","11:00",
               "12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00"];
const DAYS  = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const DURACIONES = [1,2,3,4,5,6,7,8];

const PROG_COLORS: Record<string,string> = {
  "Química":"#F472B6","Biología":"#4ADE80","Física":"#60A5FA",
  "Matemáticas":"#FB923C","Otro":"#a78bfa",
};

const REQUIRED_COLUMNS = [
  "Tipo","Descripcion","Programa","Responsable",
  "Espacio","Dia","Fecha","Hora_Inicio","Hora_Fin",
];

interface ReservasExtraordinariaProps {
  session:      any;
  reservations: any[];
  spaces:       any[];
  onClose:      () => void;
  onSaved:      () => void;
}

const EMPTY = {
  subject:"", teacher:"", program:"Otro",
  room:"", day:"Lunes", hour:"08:00", hour_end:"09:00",
  duracion: 1,
  specific_date:"", tipo_reserva:"extraordinaria" as "extraordinaria"|"bloqueo",
  notes:"",
};

function calcHourEnd(start: string, duracion: number): string {
  const idx = HOURS.indexOf(start);
  if (idx === -1) return start;
  const endIdx = Math.min(idx + duracion, HOURS.length - 1);
  return HOURS[endIdx];
}

function formatHourRange(start: string, end: string): string {
  if (!start) return "";
  if (!end || end === start) {
    const idx = HOURS.indexOf(start);
    const next = idx !== -1 && idx + 1 < HOURS.length ? HOURS[idx + 1] : start;
    return `${start} a ${next}`;
  }
  return `${start} a ${end}`;
}

function getFormattedBlocks(start: string, end: string): string[] {
  const si = HOURS.indexOf(start);
  const ei = HOURS.indexOf(end);
  if (si === -1 || ei === -1 || ei <= si) return [formatHourRange(start, end)];
  const blocks: string[] = [];
  for (let i = si; i < ei; i++) {
    blocks.push(`${HOURS[i]} a ${HOURS[i+1]}`);
  }
  return blocks;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function isUpcoming(r: any): boolean {
  if (!r.specific_date) return true;
  return r.specific_date >= todayStr();
}

function parseExcelMasivo(
  buffer: ArrayBuffer, spaces: any[]
): { rows: any[]; errors: string[] } {
  const wb    = XLSX.read(new Uint8Array(buffer), { type:"array" });
  const ws    = wb.Sheets[wb.SheetNames[0]];
  const raw   = XLSX.utils.sheet_to_json(ws) as any[];
  const errors: string[] = [];
  const rows:   any[]    = [];

  if (!raw.length) { errors.push("El archivo está vacío."); return { rows, errors }; }

  const fileColumns = Object.keys(raw[0]);
  const missing = REQUIRED_COLUMNS.filter(c => !fileColumns.includes(c));
  if (missing.length > 0) {
    errors.push(`Columnas faltantes: ${missing.join(", ")}`);
    return { rows, errors };
  }

  const activeSpaceNames = spaces.filter(s => s.activo).map(s => s.nombre);

  raw.forEach((row, i) => {
    const lineNum    = i + 2;
    const tipo       = String(row["Tipo"] || "").trim().toLowerCase();
    const descripcion= String(row["Descripcion"] || "").trim();
    const programa   = String(row["Programa"] || "Otro").trim();
    const responsable= String(row["Responsable"] || "").trim();
    const espacio    = String(row["Espacio"] || "").trim();
    const dia        = String(row["Dia"] || "").trim();
    const fecha      = String(row["Fecha"] || "").trim();
    const horaInicio = String(row["Hora_Inicio"] || "").trim();
    const horaFin    = String(row["Hora_Fin"] || "").trim();

    if (!["extraordinaria","bloqueo"].includes(tipo)) {
      errors.push(`Fila ${lineNum}: Tipo debe ser "extraordinaria" o "bloqueo".`); return;
    }
    if (!descripcion && tipo !== "bloqueo") {
      errors.push(`Fila ${lineNum}: Descripcion es obligatoria.`); return;
    }
    if (!DAYS.includes(dia)) {
      errors.push(`Fila ${lineNum}: Dia "${dia}" no válido.`); return;
    }
    if (!HOURS.includes(horaInicio)) {
      errors.push(`Fila ${lineNum}: Hora_Inicio "${horaInicio}" no válida.`); return;
    }
    if (!HOURS.includes(horaFin)) {
      errors.push(`Fila ${lineNum}: Hora_Fin "${horaFin}" no válida.`); return;
    }
    if (horaFin <= horaInicio) {
      errors.push(`Fila ${lineNum}: Hora_Fin debe ser mayor que Hora_Inicio.`); return;
    }
    if (!activeSpaceNames.includes(espacio)) {
      errors.push(`Fila ${lineNum}: Espacio "${espacio}" no encontrado o inactivo.`); return;
    }
    const hourEnd = horaFin;

    rows.push({
      tipo_reserva:  tipo,
      subject:       descripcion || "🔒 BLOQUEADO",
      program:       programa,
      teacher:       responsable || "Administración",
      room:          espacio,
      day:           dia,
      specific_date: fecha || null,
      hour:          horaInicio,
      hour_end:      hourEnd,
      tipo_espacio:  spaces.find(s => s.nombre === espacio)?.tipo === "Laboratorio" ? "lab" : "teoria",
    });
  });

  return { rows, errors };
}

export default function ReservasExtraordinarias({
  session, reservations, spaces, onClose, onSaved
}: ReservasExtraordinariaProps) {
  const { T } = useTheme();
  const { isMobile } = useBreakpoint();

  const [form,          setForm]          = useState(EMPTY);
  const [error,         setError]         = useState("");
  const [saving,        setSaving]        = useState(false);
  const [toast,         setToast]         = useState("");
  const [tab,           setTab]           = useState<"crear"|"disponibles"|"lista"|"masivo">("crear");
  const [nowFree,       setNowFree]       = useState<any[]>([]);
  const [filterTipo,    setFilterTipo]    = useState<"all"|"extraordinaria"|"bloqueo">("all");
  const [showPast,      setShowPast]      = useState(false);
  const [bulkDragOver,  setBulkDragOver]  = useState(false);
  const [bulkRows,      setBulkRows]      = useState<any[]>([]);
  const [bulkErrors,    setBulkErrors]    = useState<string[]>([]);
  const [bulkSaving,    setBulkSaving]    = useState(false);
  const [bulkSavedCount,setBulkSavedCount]= useState(0);
  // ← CAMBIO 1: estados para borrado total
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting,      setDeleting]      = useState(false);

  const token = session?.access_token;
  const upd = (p: any) => setForm(f => ({ ...f, ...p }));

  const handleHourChange = (hour: string) => {
    upd({ hour, hour_end: calcHourEnd(hour, form.duracion) });
  };
  const handleDuracionChange = (duracion: number) => {
    upd({ duracion, hour_end: calcHourEnd(form.hour, duracion) });
  };

  const S = {
    overlay: { position:"fixed" as const, inset:0, zIndex:200, display:"flex",
               alignItems:"center", justifyContent:"center",
               background:"rgba(0,0,0,0.85)", backdropFilter:"blur(8px)", padding:16 },
    box:     { background:T.bg3, borderRadius: isMobile ? 0 : 16,
               border:`1px solid ${T.border2}`, width:"100%", maxWidth:860,
               maxHeight: isMobile ? "100vh" : "93vh",
               overflowY:"auto" as const, boxShadow:T.shadow },
    inp:     { width:"100%", background:T.inputBg, border:`1px solid ${T.inputBorder}`,
               color:T.text, borderRadius:8, padding:"9px 12px", fontSize:16,
               outline:"none", boxSizing:"border-box" as const, minHeight:44 },
    sel:     { width:"100%", background:T.inputBg, border:`1px solid ${T.inputBorder}`,
               color:T.text, borderRadius:8, padding:"9px 12px", fontSize:16,
               outline:"none", minHeight:44 },
    lbl:     { display:"block" as const, fontSize:11, fontWeight:500 as const,
               color:T.muted, marginBottom:5, letterSpacing:"0.05em",
               textTransform:"uppercase" as const },
    btn:     (bg: string, extra?: any) => ({
               padding:"9px 18px", borderRadius:8, border:"none", color:"#fff",
               background:bg, fontSize:13, fontWeight:600 as const,
               cursor:"pointer", minHeight:44, ...extra }),
  };

  const showToast = (msg: string) => {
    setToast(msg); setTimeout(() => setToast(""), 3500);
  };

  const extraordinary = useMemo(() =>
    reservations.filter(r => r.tipo_reserva === "extraordinaria" || r.tipo_reserva === "bloqueo")
  , [reservations]);

  const filtered = useMemo(() => {
    let base = filterTipo === "all" ? extraordinary
      : extraordinary.filter(r => r.tipo_reserva === filterTipo);
    if (!showPast) base = base.filter(isUpcoming);
    return base.sort((a, b) =>
      (a.specific_date || "") > (b.specific_date || "") ? 1 : -1);
  }, [extraordinary, filterTipo, showPast]);

  const pastCount = useMemo(() =>
    extraordinary.filter(r => !isUpcoming(r)).length
  , [extraordinary]);

  const validateConflict = (): string | null => {
    const { room, day, hour, hour_end, specific_date } = form;
    if (!room || !day || !hour || !hour_end) return "Completa todos los campos obligatorios.";
    const si = HOURS.indexOf(hour), ei = HOURS.indexOf(hour_end);
    const block = si !== -1 && ei !== -1 && ei > si ? HOURS.slice(si, ei) : [hour];
    for (const h of block) {
      const clashAcad = reservations.find(r =>
        r.room === room && r.day === day && r.hour === h &&
        (!r.tipo_reserva || r.tipo_reserva === "academica")
      );
      if (clashAcad) return `Conflicto con clase: "${clashAcad.subject}" a las ${h}.`;
      if (specific_date) {
        const clashExtr = reservations.find(r =>
          r.room === room && r.specific_date === specific_date && r.hour === h &&
          (r.tipo_reserva === "extraordinaria" || r.tipo_reserva === "bloqueo")
        );
        if (clashExtr) return `Conflicto con reserva: "${clashExtr.subject}" a las ${h}.`;
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
        program:       form.program,
        subject:       form.subject || (form.tipo_reserva === "bloqueo" ? "🔒 BLOQUEADO" : "Reserva Extraordinaria"),
        teacher:       form.teacher || "Administración",
        day:           form.day,
        hour:          form.hour,
        hour_end:      form.hour_end,
        room:          form.room,
        tipo_espacio:  spaces.find(s => s.nombre === form.room)?.tipo === "Laboratorio" ? "lab" : "teoria",
        tipo_reserva:  form.tipo_reserva,
        specific_date: form.specific_date || null,
      };
      const res = await fetch(`${SUPABASE_URL}/rest/v1/reservations`, {
        method:"POST",
        headers:{ apikey:SUPABASE_KEY, Authorization:`Bearer ${token}`,
          "Content-Type":"application/json", Prefer:"return=minimal" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Error al guardar");
      showToast("✓ Reserva creada exitosamente");
      setForm(EMPTY); onSaved();
    } catch { setError("Error al guardar. Intenta de nuevo."); }
    finally { setSaving(false); }
  };

  // ← CAMBIO 1: función borrado total
  const handleDeleteAll = async () => {
    try {
      setDeleting(true);
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/reservations?or=(tipo_reserva.eq.extraordinaria,tipo_reserva.eq.bloqueo)`,
        {
          method: "DELETE",
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${token}`,
            Prefer: "return=minimal",
          },
        }
      );
      if (!res.ok) throw new Error("Error al borrar");
      showToast("✓ Todas las reservas extraordinarias eliminadas");
      setConfirmDelete(false);
      onSaved();
    } catch {
      showToast("❌ Error al eliminar");
    } finally {
      setDeleting(false);
    }
  };

  const checkAvailableNow = () => {
    const now      = new Date();
    const dayNames = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
    const today    = dayNames[now.getDay()];
    const currentH = `${String(now.getHours()).padStart(2,"0")}:00`;
    const free = spaces.filter(s => {
      if (!s.activo) return false;
      if (currentH < s.hora_apertura || currentH >= s.hora_cierre) return false;
      return !reservations.some(r => r.room === s.nombre && r.day === today && r.hour === currentH);
    });
    setNowFree(free); setTab("disponibles");
  };

  const processBulkFile = useCallback((file: File) => {
    setBulkErrors([]); setBulkRows([]); setBulkSavedCount(0);
    const reader = new FileReader();
    reader.onload = e => {
      const { rows, errors } = parseExcelMasivo(e.target!.result as ArrayBuffer, spaces);
      setBulkRows(rows); setBulkErrors(errors);
    };
    reader.readAsArrayBuffer(file);
  }, [spaces]);

  const handleBulkDrop = (e: React.DragEvent) => {
    e.preventDefault(); setBulkDragOver(false);
    const f = e.dataTransfer.files[0]; if (f) processBulkFile(f);
  };
  const handleBulkFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) processBulkFile(f);
  };

  const handleBulkSave = async () => {
    if (!bulkRows.length) return;
    setBulkSaving(true); let count = 0;
    try {
      for (let i = 0; i < bulkRows.length; i += 10) {
        const batch = bulkRows.slice(i, i + 10);
        const res = await fetch(`${SUPABASE_URL}/rest/v1/reservations`, {
          method:"POST",
          headers:{ apikey:SUPABASE_KEY, Authorization:`Bearer ${token}`,
            "Content-Type":"application/json", Prefer:"return=minimal" },
          body: JSON.stringify(batch),
        });
        if (res.ok) count += batch.length;
      }
      setBulkSavedCount(count);
      showToast(`✓ ${count} reservas guardadas`);
      setBulkRows([]); onSaved();
    } catch { setBulkErrors(["Error al guardar en la base de datos."]); }
    finally { setBulkSaving(false); }
  };

  const downloadTemplate = () => {
    const example = [
      { Tipo:"extraordinaria", Descripcion:"Seminario de Bioquímica", Programa:"Química",
        Responsable:"Dr. Juan Pérez", Espacio:"Lab 1 Qca", Dia:"Lunes",
        Fecha:"2026-04-15", Hora_Inicio:"08:00", Hora_Fin:"10:00" },
      { Tipo:"bloqueo", Descripcion:"Mantenimiento", Programa:"Otro",
        Responsable:"Administración", Espacio:"1001", Dia:"Martes",
        Fecha:"2026-04-16", Hora_Inicio:"10:00", Hora_Fin:"13:00" },
    ];
    const ws = XLSX.utils.json_to_sheet(example);
    ws["!cols"] = REQUIRED_COLUMNS.map(() => ({ wch:20 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reservas");
    const blob = new Blob([XLSX.write(wb, { bookType:"xlsx", type:"array" })],
      { type:"application/octet-stream" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "plantilla_reservas.xlsx"; a.click();
  };

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.box}>

        {/* HEADER */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"18px 24px", borderBottom:`1px solid ${T.border}` }}>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:T.text, fontFamily:"Montserrat,sans-serif" }}>
              ⭐ Reservas Extraordinarias & Bloqueos
            </div>
            <div style={{ fontSize:11, color:T.muted, marginTop:3 }}>
              Investigación · Eventos · Bloqueos · Carga masiva
            </div>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" as const }}>
            {toast && (
              <span style={{ fontSize:12, padding:"6px 12px", borderRadius:8, color:"#4ade80",
                background:"rgba(74,222,128,0.1)", border:"1px solid rgba(74,222,128,0.25)" }}>
                {toast}
              </span>
            )}
            {/* ← CAMBIO 1: botón borrar todas */}
            <button onClick={() => setConfirmDelete(true)}
              style={{ ...S.btn("rgba(239,68,68,0.15)"), color:"#f87171",
                border:"1px solid rgba(239,68,68,0.35)", fontSize:12,
                display:"flex", alignItems:"center", gap:6 }}>
              🗑️ Borrar todas
            </button>
            <button onClick={checkAvailableNow}
              style={{ ...S.btn("linear-gradient(135deg,#059669,#10b981)"),
                fontSize:12, display:"flex", alignItems:"center", gap:6 }}>
              🔍 ¿Libre ahora?
            </button>
            <button onClick={onClose}
              style={{ background:"transparent", border:"none", color:T.muted,
                fontSize:22, cursor:"pointer", minWidth:44, minHeight:44 }}>✕</button>
          </div>
        </div>

        {/* TABS */}
        <div style={{ display:"flex", borderBottom:`1px solid ${T.border}`, overflowX:"auto" }}>
          {[
            { key:"crear",       label:"➕ Crear" },
            { key:"masivo",      label:"📤 Carga Masiva" },
            { key:"disponibles", label:`🟢 Libres (${nowFree.length})` },
            { key:"lista",       label:`📋 Próximas (${extraordinary.filter(isUpcoming).length})` },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              style={{ flex:1, padding:"11px", fontSize:12, fontWeight:600, cursor:"pointer",
                border:"none", whiteSpace:"nowrap" as const,
                borderBottom: tab === t.key ? `2px solid ${T.udAccent}` : "2px solid transparent",
                background: tab === t.key ? "rgba(0,102,204,0.08)" : "transparent",
                color: tab === t.key ? "#60a5fa" : T.muted }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ padding:24 }}>

          {/* ══ TAB CREAR ══ */}
          {tab === "crear" && (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <div>
                <label style={S.lbl}>Tipo de Reserva</label>
                <div style={{ display:"flex", gap:8 }}>
                  {[
                    { key:"extraordinaria", label:"⭐ Extraordinaria", desc:"Investigación / Evento" },
                    { key:"bloqueo",        label:"🔒 Bloqueo",        desc:"Mantenimiento / Inhabilitado" },
                  ].map(t => (
                    <button key={t.key} onClick={() => upd({ tipo_reserva:t.key })}
                      style={{ flex:1, padding:"10px 14px", borderRadius:8, cursor:"pointer",
                        border:`1px solid ${form.tipo_reserva === t.key
                          ? (t.key==="bloqueo"?"#f87171":T.udAccent) : T.border2}`,
                        background: form.tipo_reserva === t.key
                          ? (t.key==="bloqueo"?"rgba(239,68,68,0.1)":"rgba(0,102,204,0.12)")
                          : "transparent",
                        color: form.tipo_reserva === t.key
                          ? (t.key==="bloqueo"?"#f87171":"#60a5fa") : T.muted,
                        textAlign:"left" as const, minHeight:44 }}>
                      <div style={{ fontWeight:700, fontSize:13 }}>{t.label}</div>
                      <div style={{ fontSize:10, marginTop:2, opacity:0.7 }}>{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display:"grid",
                gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr", gap:12 }}>
                <div>
                  <label style={S.lbl}>Descripción / Evento *</label>
                  <input style={S.inp} value={form.subject}
                    placeholder="Ej: Seminario de Investigación"
                    onChange={e => upd({ subject:e.target.value })} />
                </div>
                <div>
                  <label style={S.lbl}>Programa</label>
                  <select style={S.sel} value={form.program}
                    onChange={e => upd({ program:e.target.value })}>
                    {["Química","Biología","Física","Matemáticas","Otro"].map(p =>
                      <option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display:"grid",
                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:12 }}>
                <div>
                  <label style={S.lbl}>Responsable</label>
                  <input style={S.inp} value={form.teacher}
                    placeholder="Nombre del responsable"
                    onChange={e => upd({ teacher:e.target.value })} />
                </div>
                <div>
                  <label style={S.lbl}>Espacio *</label>
                  <select style={S.sel} value={form.room}
                    onChange={e => upd({ room:e.target.value })}>
                    <option value="">Seleccionar espacio</option>
                    {spaces.filter(s => s.activo).map(s => (
                      <option key={s.nombre} value={s.nombre}>
                        {s.tipo==="Laboratorio"?"🔬":"🏫"} {s.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display:"grid",
                gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap:12 }}>
                <div>
                  <label style={S.lbl}>Día *</label>
                  <select style={S.sel} value={form.day}
                    onChange={e => upd({ day:e.target.value })}>
                    {DAYS.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.lbl}>Fecha específica</label>
                  <input style={S.inp} type="date" value={form.specific_date}
                    onChange={e => upd({ specific_date:e.target.value })} />
                </div>
                <div>
                  <label style={S.lbl}>Hora inicio *</label>
                  <select style={S.sel} value={form.hour}
                    onChange={e => handleHourChange(e.target.value)}>
                    {HOURS.map(h => <option key={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.lbl}>Duración *</label>
                  <select style={S.sel} value={form.duracion}
                    onChange={e => handleDuracionChange(parseInt(e.target.value))}>
                    {DURACIONES.map(d => (
                      <option key={d} value={d}>{d} hora{d!==1?"s":""}</option>
                    ))}
                  </select>
                </div>
              </div>

              {form.hour && form.hour_end && (
                <div style={{ background:T.bg2, borderRadius:8, padding:"10px 14px",
                  border:`1px solid ${T.border}` }}>
                  <div style={{ fontSize:11, color:T.muted, marginBottom:6, fontWeight:600 }}>
                    ⏱ Rango reservado · {form.duracion} hora{form.duracion!==1?"s":""}
                  </div>
                  <div style={{ fontSize:15, fontWeight:700, color:"#60a5fa", marginBottom:8 }}>
                    {formatHourRange(form.hour, form.hour_end)}
                  </div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    {getFormattedBlocks(form.hour, form.hour_end).map((b, i) => (
                      <span key={i} style={{ fontSize:11, padding:"3px 10px", borderRadius:99,
                        background:"rgba(96,165,250,0.12)", color:"#93c5fd",
                        border:"1px solid rgba(96,165,250,0.25)" }}>{b}</span>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div style={{ background:"rgba(239,68,68,0.1)",
                  border:"1px solid rgba(239,68,68,0.3)", color:"#f87171",
                  fontSize:13, padding:"10px 12px", borderRadius:8, display:"flex", gap:8 }}>
                  <span>⚠</span><span>{error}</span>
                </div>
              )}

              <div style={{ display:"flex", gap:10 }}>
                <button onClick={() => setForm(EMPTY)}
                  style={{ ...S.btn("transparent"),
                    border:`1px solid ${T.border2}`, color:T.mutedL }}>
                  Limpiar
                </button>
                <button onClick={handleSave} disabled={saving}
                  style={{ ...S.btn(form.tipo_reserva==="bloqueo"
                    ? "linear-gradient(135deg,#dc2626,#ef4444)"
                    : `linear-gradient(135deg,${T.udBlue},${T.udAccent})`),
                    flex:1, opacity:saving?0.7:1 }}>
                  {saving ? "Guardando…"
                    : form.tipo_reserva==="bloqueo"
                      ? "🔒 Crear Bloqueo"
                      : "⭐ Crear Reserva Extraordinaria"}
                </button>
              </div>
            </div>
          )}

          {/* ══ TAB CARGA MASIVA ══ */}
          {tab === "masivo" && (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <div style={{ background:T.bg2, borderRadius:10, padding:16,
                border:`1px solid ${T.border}` }}>
                <div style={{ fontSize:13, fontWeight:700, color:T.text, marginBottom:10 }}>
                  📋 Columnas requeridas en el Excel
                </div>
                <div style={{ display:"grid",
                  gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap:6 }}>
                  {[
                    ["Tipo",        "extraordinaria | bloqueo"],
                    ["Descripcion", "Nombre del evento"],
                    ["Programa",    "Química | Biología | Física | Matemáticas | Otro"],
                    ["Responsable", "Nombre del responsable"],
                    ["Espacio",     "Nombre exacto del espacio"],
                    ["Dia",         "Lunes | Martes | ... | Sábado"],
                    ["Fecha",       "YYYY-MM-DD (ej: 2026-04-15)"],
                    ["Hora_Inicio", "06:00 a 19:00"],
                    ["Hora_Fin",    "07:00 a 19:00"],
                  ].map(([col, desc]) => (
                    <div key={col} style={{ display:"flex", gap:6, fontSize:11 }}>
                      <span style={{ color:"#60a5fa", fontWeight:700,
                        minWidth:120, flexShrink:0 }}>{col}</span>
                      <span style={{ color:T.muted }}>{desc}</span>
                    </div>
                  ))}
                </div>
                <button onClick={downloadTemplate}
                  style={{ ...S.btn("rgba(0,102,204,0.2)"), color:"#60a5fa",
                    border:"1px solid rgba(0,102,204,0.4)", marginTop:14, fontSize:12 }}>
                  📥 Descargar plantilla de ejemplo
                </button>
              </div>

              <div
                onDragOver={e => { e.preventDefault(); setBulkDragOver(true); }}
                onDragLeave={() => setBulkDragOver(false)}
                onDrop={handleBulkDrop}
                onClick={() => document.getElementById("bulk-input")?.click()}
                style={{ border:`2px dashed ${bulkDragOver ? T.udAccent : T.border2}`,
                  borderRadius:12, padding:36, textAlign:"center" as const,
                  background: bulkDragOver ? "rgba(0,102,204,0.08)" : T.bg2,
                  cursor:"pointer" }}>
                <div style={{ fontSize:40, marginBottom:10 }}>📊</div>
                <div style={{ fontSize:14, fontWeight:700, color:T.text, marginBottom:6 }}>
                  Arrastra tu archivo Excel aquí
                </div>
                <div style={{ fontSize:12, color:T.muted }}>o haz clic para seleccionar</div>
                <input id="bulk-input" type="file" accept=".xlsx,.xls"
                  style={{ display:"none" }} onChange={handleBulkFile} />
              </div>

              {bulkErrors.length > 0 && (
                <div style={{ background:"rgba(239,68,68,0.08)",
                  border:"1px solid rgba(239,68,68,0.3)", borderRadius:10, padding:14 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#f87171", marginBottom:8 }}>
                    ⚠️ {bulkErrors.length} error{bulkErrors.length!==1?"es":""} de validación
                  </div>
                  {bulkErrors.map((e, i) => (
                    <div key={i} style={{ fontSize:12, color:"#fca5a5", marginBottom:3 }}>• {e}</div>
                  ))}
                </div>
              )}

              {bulkRows.length > 0 && (
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:"#4ade80", marginBottom:10 }}>
                    ✅ {bulkRows.length} reserva{bulkRows.length!==1?"s":""} listas para guardar
                  </div>
                  <div style={{ background:T.bg2, borderRadius:10,
                    border:`1px solid ${T.border}`, overflow:"hidden",
                    maxHeight:280, overflowY:"auto" }}>
                    <table style={{ borderCollapse:"collapse", width:"100%", fontSize:11 }}>
                      <thead>
                        <tr style={{ background:T.bg3 }}>
                          {["Tipo","Descripción","Espacio","Día","Fecha","Rango Horario"].map(h => (
                            <th key={h} style={{ padding:"8px 10px", color:T.muted,
                              fontWeight:600, textAlign:"left" as const,
                              borderBottom:`1px solid ${T.border}`,
                              whiteSpace:"nowrap" as const }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {bulkRows.map((r, i) => (
                          <tr key={i} style={{ background: i%2===0 ? T.bg2 : T.bg,
                            borderBottom:`1px solid ${T.border}30` }}>
                            <td style={{ padding:"6px 10px" }}>
                              <span style={{ fontSize:10, padding:"2px 7px", borderRadius:99,
                                background: r.tipo_reserva==="bloqueo"
                                  ? "rgba(239,68,68,0.15)" : "rgba(251,146,60,0.15)",
                                color: r.tipo_reserva==="bloqueo" ? "#f87171" : "#fb923c",
                                fontWeight:600 }}>
                                {r.tipo_reserva==="bloqueo"?"🔒":"⭐"} {r.tipo_reserva}
                              </span>
                            </td>
                            <td style={{ padding:"6px 10px", color:T.text, maxWidth:160,
                              overflow:"hidden", textOverflow:"ellipsis",
                              whiteSpace:"nowrap" as const }}>{r.subject}</td>
                            <td style={{ padding:"6px 10px", color:T.mutedL }}>{r.room}</td>
                            <td style={{ padding:"6px 10px", color:T.mutedL }}>{r.day}</td>
                            <td style={{ padding:"6px 10px", color:T.muted }}>
                              {r.specific_date || "—"}
                            </td>
                            <td style={{ padding:"6px 10px", color:"#60a5fa",
                              fontFamily:"monospace", whiteSpace:"nowrap" as const }}>
                              {formatHourRange(r.hour, r.hour_end)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {bulkSavedCount > 0 && (
                    <div style={{ marginTop:10, padding:"10px 14px",
                      background:"rgba(74,222,128,0.08)",
                      border:"1px solid rgba(74,222,128,0.25)", borderRadius:8,
                      fontSize:13, color:"#4ade80" }}>
                      🎉 {bulkSavedCount} reservas guardadas exitosamente.
                    </div>
                  )}

                  <div style={{ display:"flex", gap:10, marginTop:14 }}>
                    <button onClick={() => { setBulkRows([]); setBulkErrors([]); }}
                      style={{ ...S.btn("transparent"),
                        border:`1px solid ${T.border2}`, color:T.mutedL }}>
                      Cancelar
                    </button>
                    <button onClick={handleBulkSave} disabled={bulkSaving}
                      style={{ ...S.btn(`linear-gradient(135deg,${T.udBlue},${T.udAccent})`),
                        flex:1, opacity:bulkSaving?0.7:1 }}>
                      {bulkSaving ? "Guardando…" : `✅ Guardar ${bulkRows.length} reservas`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ TAB DISPONIBLES ══ */}
          {tab === "disponibles" && (
            <div>
              <div style={{ fontSize:13, color:T.muted, marginBottom:16,
                textAlign:"center" as const }}>
                Espacios libres ahora ({new Date().toLocaleTimeString("es-CO",
                  { hour:"2-digit", minute:"2-digit" })})
              </div>
              {nowFree.length === 0 ? (
                <div style={{ textAlign:"center" as const, padding:40, color:T.muted }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>🔍</div>
                  <div>No hay espacios disponibles ahora.</div>
                  <button onClick={checkAvailableNow}
                    style={{ ...S.btn(`linear-gradient(135deg,${T.udBlue},${T.udAccent})`),
                      marginTop:16 }}>
                    Buscar de nuevo
                  </button>
                </div>
              ) : (
                <div style={{ display:"grid",
                  gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(3,1fr)", gap:12 }}>
                  {nowFree.map(s => (
                    <div key={s.nombre}
                      style={{ background:T.bg2, borderRadius:10, padding:"14px 16px",
                        border:`1px solid rgba(74,222,128,0.3)`, cursor:"pointer" }}
                      onClick={() => { upd({ room:s.nombre }); setTab("crear"); }}>
                      <div style={{ fontSize:20, marginBottom:6 }}>
                        {s.tipo==="Laboratorio"?"🔬":"🏫"}
                      </div>
                      <div style={{ fontSize:13, fontWeight:700, color:T.text, marginBottom:4 }}>
                        {s.nombre}
                      </div>
                      <div style={{ fontSize:11, color:T.muted }}>
                        {s.tipo} · Cap. {s.capacidad}
                      </div>
                      <div style={{ fontSize:10, color:"#4ade80", marginTop:6 }}>
                        ✓ Libre ahora · Clic para reservar
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══ TAB LISTA ══ */}
          {tab === "lista" && (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                {(["all","extraordinaria","bloqueo"] as const).map(k => (
                  <button key={k} onClick={() => setFilterTipo(k)}
                    style={{ padding:"6px 14px", borderRadius:8, fontSize:12,
                      fontWeight:600, cursor:"pointer", minHeight:44,
                      border:`1px solid ${filterTipo===k ? T.udAccent : T.border2}`,
                      background: filterTipo===k ? "rgba(0,102,204,0.15)" : "transparent",
                      color: filterTipo===k ? "#60a5fa" : T.muted }}>
                    {k==="all" ? "Todas" : k==="extraordinaria" ? "⭐ Extraordinarias" : "🔒 Bloqueos"}
                  </button>
                ))}
                {pastCount > 0 && (
                  <button onClick={() => setShowPast(p => !p)}
                    style={{ padding:"6px 14px", borderRadius:8, fontSize:12,
                      fontWeight:600, cursor:"pointer", marginLeft:"auto", minHeight:44,
                      border:`1px solid ${showPast ? "#f87171" : T.border2}`,
                      background: showPast ? "rgba(239,68,68,0.12)" : "transparent",
                      color: showPast ? "#f87171" : T.muted }}>
                    {showPast
                      ? `🕒 Ocultar pasadas (${pastCount})`
                      : `🕒 Ver pasadas (${pastCount})`}
                  </button>
                )}
              </div>

              {!showPast && pastCount > 0 && (
                <div style={{ background:"rgba(96,165,250,0.07)",
                  border:"1px solid rgba(96,165,250,0.2)", borderRadius:8,
                  padding:"8px 14px", fontSize:12, color:"#93c5fd",
                  display:"flex", alignItems:"center", gap:8 }}>
                  ℹ️ Se ocultaron <b>{pastCount}</b> reserva{pastCount!==1?"s":""} de fechas pasadas.
                </div>
              )}

              {filtered.length === 0 ? (
                <div style={{ textAlign:"center" as const, padding:40, color:T.muted }}>
                  {showPast ? "No hay reservas." : "No hay próximas reservas."}
                </div>
              ) : (
                filtered.map((r, i) => (
                  <div key={i} style={{ background:T.bg2, borderRadius:10,
                    padding:"12px 16px",
                    border:`1px solid ${r.tipo_reserva==="bloqueo"
                      ? "rgba(239,68,68,0.25)" : "rgba(251,146,60,0.25)"}`,
                    display:"flex", alignItems:"center",
                    justifyContent:"space-between", gap:12 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700,
                        color: r.tipo_reserva==="bloqueo" ? "#f87171" : "#fb923c",
                        marginBottom:4 }}>
                        {r.tipo_reserva==="bloqueo"?"🔒":"⭐"} {r.subject}
                      </div>
                      <div style={{ fontSize:11, color:T.muted }}>
                        📍 {r.room} · {r.day}
                        {r.specific_date
                          ? ` · ${new Date(r.specific_date+"T12:00:00")
                              .toLocaleDateString("es-CO",
                                { day:"2-digit", month:"short", year:"numeric" })}`
                          : ""}
                        {" · "}
                        <span style={{ color:"#60a5fa", fontWeight:600 }}>
                          {formatHourRange(r.hour, r.hour_end)}
                        </span>
                        {r.teacher && <span style={{ marginLeft:8 }}>· 👤 {r.teacher}</span>}
                      </div>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column",
                      alignItems:"flex-end", gap:4 }}>
                      <span style={{ fontSize:10, padding:"3px 10px", borderRadius:99,
                        background: r.tipo_reserva==="bloqueo"
                          ? "rgba(239,68,68,0.15)" : "rgba(251,146,60,0.15)",
                        color: r.tipo_reserva==="bloqueo" ? "#f87171" : "#fb923c",
                        fontWeight:600, whiteSpace:"nowrap" as const }}>
                        {r.tipo_reserva}
                      </span>
                      {r.program && r.program !== "Otro" && (
                        <span style={{ fontSize:10,
                          color: PROG_COLORS[r.program] || T.muted }}>
                          {r.program}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

        </div>
      </div>

      {/* ← CAMBIO 1: Modal de confirmación borrado total */}
      {confirmDelete && (
        <div style={{ position:"fixed", inset:0, zIndex:300,
          display:"flex", alignItems:"center", justifyContent:"center",
          background:"rgba(0,0,0,0.85)", backdropFilter:"blur(8px)", padding:16 }}>
          <div style={{ background:T.bg3, borderRadius:16,
            border:"1px solid rgba(239,68,68,0.4)",
            width:"100%", maxWidth:420, padding:28, boxShadow:T.shadow }}>
            <div style={{ fontSize:36, textAlign:"center" as const, marginBottom:12 }}>⚠️</div>
            <div style={{ fontSize:16, fontWeight:700, color:"#f87171",
              textAlign:"center" as const, marginBottom:8 }}>
              ¿Borrar todas las reservas extraordinarias?
            </div>
            <div style={{ fontSize:13, color:T.muted, textAlign:"center" as const,
              marginBottom:24, lineHeight:1.6 }}>
              Esta acción eliminará <b style={{color:T.text}}>permanentemente</b> todos
              los registros de tipo extraordinaria y bloqueo. No se puede deshacer.
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setConfirmDelete(false)}
                style={{ ...S.btn("transparent"), flex:1,
                  border:`1px solid ${T.border2}`, color:T.mutedL }}>
                Cancelar
              </button>
              <button onClick={handleDeleteAll} disabled={deleting}
                style={{ ...S.btn("linear-gradient(135deg,#dc2626,#ef4444)"),
                  flex:1, opacity:deleting ? 0.7 : 1 }}>
                {deleting ? "Borrando…" : "🗑️ Sí, borrar todo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}