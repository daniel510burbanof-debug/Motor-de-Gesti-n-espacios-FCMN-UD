import { useState, useEffect } from "react";
import { useTheme } from "./ThemeContext";
import { useBreakpoint } from "./useIsMobile"; // ← NUEVO

const SUPABASE_URL = "https://wlisbvcqqjlgzfvbnscp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsaXNidmNxcWpsZ3pmdmJuc2NwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0Njg5MDIsImV4cCI6MjA4ODA0NDkwMn0.66Ly-QcVzj0rM5DyH6o3NDE-jfPSlPgRuJYyTDMlW4g";

export interface Space {
  id:            number;
  nombre:        string;
  tipo:          "Teoria" | "Laboratorio";
  capacidad:     number;
  hora_apertura: string;
  hora_cierre:   string;
  activo:        boolean;
}

const EMPTY_SPACE: Omit<Space,"id"> = {
  nombre:"", tipo:"Teoria", capacidad:45,
  hora_apertura:"06:00", hora_cierre:"16:00", activo:true,
};

const HOURS = ["06:00","07:00","08:00","09:00","10:00","11:00",
               "12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00"];

async function apiSpaces(method:string, body?:any, id?:number, token?:string) {
  const url = id
    ? `${SUPABASE_URL}/rest/v1/spaces?id=eq.${id}`
    : `${SUPABASE_URL}/rest/v1/spaces`;
  const res = await fetch(url, {
    method,
    headers:{
      apikey:         SUPABASE_KEY,
      Authorization:  `Bearer ${token||SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer:         "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

interface SpacesManagerProps {
  session: any;
  onClose: () => void;
}

export default function SpacesManager({ session, onClose }: SpacesManagerProps) {
  const { T } = useTheme();
  const { isMobile } = useBreakpoint(); // ← NUEVO

  const [spaces,     setSpaces]     = useState<Space[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [editId,     setEditId]     = useState<number|null>(null);
  const [showForm,   setShowForm]   = useState(false);
  const [form,       setForm]       = useState<Omit<Space,"id">>(EMPTY_SPACE);
  const [error,      setError]      = useState("");
  const [toast,      setToast]      = useState("");
  const [filterTipo, setFilterTipo] = useState<"all"|"Teoria"|"Laboratorio">("all");
  const [confirmDel, setConfirmDel] = useState<number|null>(null);

  const token = session?.access_token;

  const S = {
    overlay:{ position:"fixed" as const,inset:0,zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",
              background:"rgba(0,0,0,0.85)",backdropFilter:"blur(8px)",
              padding: isMobile ? 0 : 16 },
    box:    { background:T.bg3,borderRadius: isMobile ? 0 : 16,
              border:`1px solid ${T.border2}`,width:"100%",maxWidth:960,
              maxHeight: isMobile ? "100vh" : "93vh",
              overflowY:"auto" as const,boxShadow:T.shadow },
    hdr:    { display:"flex",alignItems:"center",justifyContent:"space-between",
              padding: isMobile ? "14px 16px" : "18px 24px",
              borderBottom:`1px solid ${T.border}` },
    inp:    { width:"100%",background:T.inputBg,border:`1px solid ${T.inputBorder}`,
              color:T.text,borderRadius:8,padding:"9px 12px",fontSize:16,
              outline:"none",boxSizing:"border-box" as const,minHeight:44 },
    sel:    { width:"100%",background:T.inputBg,border:`1px solid ${T.inputBorder}`,
              color:T.text,borderRadius:8,padding:"9px 12px",fontSize:16,
              outline:"none",minHeight:44 },
    lbl:    { display:"block",fontSize:11,fontWeight:500 as const,color:T.muted,
              marginBottom:5,letterSpacing:"0.05em",textTransform:"uppercase" as const },
    btn:    (bg:string,extra?:any)=>({ padding:"8px 16px",borderRadius:8,border:"none",
              color:"#fff",background:bg,fontSize:12,fontWeight:600 as const,
              cursor:"pointer",minHeight:44,...extra }),
  };

  const showToast = (msg:string) => {
    setToast(msg);
    setTimeout(()=>setToast(""),3000);
  };

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/spaces?select=*&order=tipo.asc,nombre.asc`,
        { headers:{ apikey:SUPABASE_KEY, Authorization:`Bearer ${token}` }}
      );
      const list = await res.json();
      setSpaces(list);
    } catch { setError("Error al cargar espacios."); }
    finally { setLoading(false); }
  };

  useEffect(()=>{ load(); },[]);

  const upd = (p:any) => setForm(f=>({...f,...p}));

  const openCreate = () => {
    setForm(EMPTY_SPACE);
    setEditId(null);
    setShowForm(true);
    setError("");
  };

  const openEdit = (s:Space) => {
    setForm({ nombre:s.nombre, tipo:s.tipo, capacidad:s.capacidad,
              hora_apertura:s.hora_apertura, hora_cierre:s.hora_cierre, activo:s.activo });
    setEditId(s.id);
    setShowForm(true);
    setError("");
  };

  const save = async () => {
    if (!form.nombre.trim()) { setError("El nombre es obligatorio."); return; }
    if (form.capacidad < 1)  { setError("Capacidad debe ser ≥ 1."); return; }
    try {
      setSaving(true); setError("");
      if (editId !== null) {
        await apiSpaces("PATCH", form, editId, token);
        showToast("✓ Espacio actualizado");
      } else {
        await apiSpaces("POST", form, undefined, token);
        showToast("✓ Espacio creado");
      }
      setShowForm(false);
      await load();
    } catch { setError("Error al guardar. Intenta de nuevo."); }
    finally { setSaving(false); }
  };

  const toggleActivo = async (s:Space) => {
    try {
      await apiSpaces("PATCH",{ activo:!s.activo }, s.id, token);
      setSpaces(prev=>prev.map(x=>x.id===s.id?{...x,activo:!x.activo}:x));
      showToast(s.activo?"Espacio desactivado":"Espacio activado");
    } catch { showToast("Error al cambiar estado"); }
  };

  const deleteSpace = async (id:number) => {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/spaces?id=eq.${id}`,{
        method:"DELETE",
        headers:{ apikey:SUPABASE_KEY, Authorization:`Bearer ${token}` },
      });
      setSpaces(prev=>prev.filter(s=>s.id!==id));
      setConfirmDel(null);
      showToast("🗑️ Espacio eliminado");
    } catch { showToast("Error al eliminar"); }
  };

  const filtered    = spaces.filter(s=> filterTipo==="all" ? true : s.tipo===filterTipo);
  const teoriaCount = spaces.filter(s=>s.tipo==="Teoria").length;
  const labCount    = spaces.filter(s=>s.tipo==="Laboratorio").length;
  const activoCount = spaces.filter(s=>s.activo).length;

  return (
    <div style={S.overlay} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={S.box}>

        {/* HEADER */}
        <div style={S.hdr}>
          <div>
            <div style={{fontSize: isMobile ? 14 : 16,fontWeight:700,color:T.text,fontFamily:"Montserrat,sans-serif"}}>
              🏛️ {isMobile ? "Espacios" : "Gestión de Espacios — Sede Macarena B"}
            </div>
            {!isMobile&&(
              <div style={{fontSize:11,color:T.muted,marginTop:3}}>
                Solo visible para Superadministrador · Los cambios aplican en tiempo real
              </div>
            )}
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {toast&&(
              <span style={{fontSize:12,padding:"6px 12px",borderRadius:8,color:"#4ade80",
                background:"rgba(74,222,128,0.1)",border:"1px solid rgba(74,222,128,0.25)"}}>
                {toast}
              </span>
            )}
            <button onClick={onClose}
              style={{background:"transparent",border:"none",color:T.muted,fontSize:22,
                cursor:"pointer",minWidth:44,minHeight:44}}>✕</button>
          </div>
        </div>

        <div style={{padding: isMobile ? "12px 12px" : 24,display:"flex",flexDirection:"column",gap: isMobile ? 14 : 20}}>

          {/* STATS — 2 cols en móvil, 4 en desktop */}
          <div style={{display:"grid",gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)",gap:10}}>
            {[
              {label:"Total",       value:spaces.length,  color:"#60a5fa", icon:"🏫"},
              {label:"Activos",     value:activoCount,    color:"#4ade80", icon:"✅"},
              {label:"Teoría",      value:teoriaCount,    color:"#a78bfa", icon:"📚"},
              {label:"Laborat.",    value:labCount,       color:"#f472b6", icon:"🔬"},
            ].map(s=>(
              <div key={s.label} style={{background:T.bg2,borderRadius:10,
                padding: isMobile ? "10px 12px" : "12px 16px",
                border:`1px solid ${s.color}30`,display:"flex",alignItems:"center",gap:8}}>
                <div style={{fontSize: isMobile ? 18 : 22}}>{s.icon}</div>
                <div>
                  <div style={{fontSize: isMobile ? 18 : 20,fontWeight:800,color:s.color,
                    fontFamily:"Montserrat,sans-serif"}}>{s.value}</div>
                  <div style={{fontSize:10,color:T.muted}}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* TOOLBAR */}
          <div style={{display:"flex",gap:8,alignItems:"center",
            justifyContent:"space-between",flexWrap:"wrap" as const}}>
            <div style={{display:"flex",gap:6,flexWrap:"wrap" as const}}>
              <span style={{fontSize:12,color:T.muted,fontWeight:600,alignSelf:"center"}}>Filtrar:</span>
              {([["all","Todos"],["Teoria","🏫 Teoría"],["Laboratorio","🔬 Labs"]] as const).map(([key,lbl])=>(
                <button key={key} onClick={()=>setFilterTipo(key as any)}
                  style={{padding:"6px 12px",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",
                    minHeight:44,border:`1px solid ${filterTipo===key?T.udAccent:T.border2}`,
                    background:filterTipo===key?"rgba(0,102,204,0.15)":T.bg3,
                    color:filterTipo===key?"#60a5fa":T.muted}}>
                  {lbl}
                </button>
              ))}
            </div>
            <button onClick={openCreate}
              style={{...S.btn(`linear-gradient(135deg,${T.udBlue},${T.udAccent})`),
                display:"flex",alignItems:"center",gap:6,
                boxShadow:"0 4px 15px rgba(0,102,204,0.3)"}}>
              <span style={{fontSize:16}}>＋</span>
              {isMobile ? "Nuevo" : "Nuevo Espacio"}
            </button>
          </div>

          {/* FORMULARIO */}
          {showForm&&(
            <div style={{background:T.bg2,borderRadius:12,border:`1px solid ${T.udAccent}40`,padding: isMobile ? 14 : 20}}>
              <div style={{fontSize:14,fontWeight:700,color:T.text,marginBottom:16,fontFamily:"Montserrat,sans-serif"}}>
                {editId!==null ? "✏️ Editar Espacio" : "➕ Nuevo Espacio"}
              </div>
              {/* Grid del formulario — 1 col en móvil, 5 cols en desktop */}
              <div style={{display:"grid",
                gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr 1fr 1fr 1fr",
                gap:12,marginBottom:12}}>
                <div>
                  <label style={S.lbl}>Nombre *</label>
                  <input style={S.inp} value={form.nombre} placeholder="Ej: Lab 7 Bio"
                    onChange={e=>upd({nombre:e.target.value})}/>
                </div>
                <div>
                  <label style={S.lbl}>Tipo *</label>
                  <select style={S.sel} value={form.tipo} onChange={e=>upd({tipo:e.target.value})}>
                    <option value="Teoria">Teoría</option>
                    <option value="Laboratorio">Laboratorio</option>
                  </select>
                </div>
                <div>
                  <label style={S.lbl}>Capacidad *</label>
                  <input style={S.inp} type="number" min={1} max={300} value={form.capacidad}
                    onChange={e=>upd({capacidad:parseInt(e.target.value)||1})}/>
                </div>
                <div>
                  <label style={S.lbl}>Apertura</label>
                  <select style={S.sel} value={form.hora_apertura}
                    onChange={e=>upd({hora_apertura:e.target.value})}>
                    {HOURS.map(h=><option key={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.lbl}>Cierre</label>
                  <select style={S.sel} value={form.hora_cierre}
                    onChange={e=>upd({hora_cierre:e.target.value})}>
                    {HOURS.map(h=><option key={h}>{h}</option>)}
                  </select>
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",
                  fontSize:13,color:T.text,minHeight:44}}>
                  <div onClick={()=>upd({activo:!form.activo})}
                    style={{width:42,height:24,borderRadius:12,
                      background:form.activo?"#22c55e":"#374151",
                      position:"relative",transition:"background .2s",cursor:"pointer",flexShrink:0}}>
                    <div style={{position:"absolute",top:3,left:form.activo?20:3,
                      width:18,height:18,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
                  </div>
                  Espacio activo
                </label>
              </div>
              {error&&(
                <div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",
                  color:"#f87171",fontSize:13,padding:"10px 12px",borderRadius:8,marginBottom:12}}>
                  ⚠ {error}
                </div>
              )}
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{setShowForm(false);setError("");}}
                  style={{...S.btn("transparent"),border:`1px solid ${T.border2}`,color:T.mutedL}}>
                  Cancelar
                </button>
                <button onClick={save} disabled={saving}
                  style={{...S.btn(`linear-gradient(135deg,${T.udBlue},${T.udAccent})`),opacity:saving?0.7:1}}>
                  {saving?"Guardando…": editId!==null?"Guardar Cambios":"Crear Espacio"}
                </button>
              </div>
            </div>
          )}

          {/* LISTA / TABLA */}
          {loading ? (
            <div style={{textAlign:"center",padding:40,color:T.muted}}>
              <div style={{fontSize:32,marginBottom:12}}>⚛️</div>
              Cargando espacios…
            </div>
          ) : isMobile ? (

            // ══════════════════════════════════════
            // VISTA MÓVIL — Cards
            // ══════════════════════════════════════
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {filtered.length === 0 ? (
                <div style={{textAlign:"center",padding:40,color:T.muted,fontSize:13}}>
                  No hay espacios para mostrar.
                </div>
              ) : filtered.map(s => {
                const isLab = s.tipo === "Laboratorio";
                return (
                  <div key={s.id} style={{
                    background:T.bg2, borderRadius:12, padding:"14px 16px",
                    border:`1px solid ${T.border}`, opacity:s.activo ? 1 : 0.5,
                  }}>
                    {/* Encabezado card */}
                    <div style={{display:"flex",justifyContent:"space-between",
                      alignItems:"center",marginBottom:8}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:20}}>{isLab ? "🔬" : "🏫"}</span>
                        <span style={{fontSize:14,fontWeight:700,
                          color:s.activo ? T.text : T.muted}}>
                          {s.nombre}
                        </span>
                      </div>
                      {/* Toggle activo */}
                      <div onClick={()=>toggleActivo(s)} style={{
                        width:42,height:24,borderRadius:12,cursor:"pointer",
                        background:s.activo ? "#22c55e" : "#374151",
                        position:"relative",transition:"background .2s",flexShrink:0,
                      }}>
                        <div style={{
                          position:"absolute",top:4,left:s.activo ? 20 : 4,
                          width:16,height:16,borderRadius:"50%",
                          background:"#fff",transition:"left .2s",
                        }}/>
                      </div>
                    </div>

                    {/* Info badges */}
                    <div style={{display:"flex",gap:8,flexWrap:"wrap" as const,marginBottom:12}}>
                      <span style={{
                        fontSize:11,padding:"2px 8px",borderRadius:99,fontWeight:600,
                        background:isLab ? "rgba(74,222,128,0.15)" : "rgba(96,165,250,0.15)",
                        color:isLab ? "#4ade80" : "#60a5fa",
                        border:`1px solid ${isLab ? "rgba(74,222,128,0.3)" : "rgba(96,165,250,0.3)"}`,
                      }}>{s.tipo}</span>
                      <span style={{fontSize:11,color:T.muted}}>
                        👥 {s.capacidad} est.
                      </span>
                      <span style={{fontSize:11,color:T.muted,fontFamily:"monospace"}}>
                        🕐 {s.hora_apertura} – {s.hora_cierre}
                      </span>
                    </div>

                    {/* Acciones */}
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>openEdit(s)} style={{
                        flex:1,padding:"10px",borderRadius:8,minHeight:44,
                        border:`1px solid ${T.border2}`,background:"transparent",
                        color:"#60a5fa",fontSize:13,fontWeight:600,cursor:"pointer",
                      }}>✏️ Editar</button>

                      {confirmDel === s.id ? (
                        <>
                          <button onClick={()=>deleteSpace(s.id)} style={{
                            flex:1,padding:"10px",borderRadius:8,minHeight:44,
                            border:"none",background:"#dc2626",
                            color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",
                          }}>¿Confirmar?</button>
                          <button onClick={()=>setConfirmDel(null)} style={{
                            padding:"10px 14px",borderRadius:8,minHeight:44,
                            border:`1px solid ${T.border2}`,background:"transparent",
                            color:T.muted,fontSize:13,cursor:"pointer",
                          }}>No</button>
                        </>
                      ) : (
                        <button onClick={()=>setConfirmDel(s.id)} style={{
                          flex:1,padding:"10px",borderRadius:8,minHeight:44,
                          border:"1px solid rgba(239,68,68,0.3)",background:"transparent",
                          color:"#f87171",fontSize:13,fontWeight:600,cursor:"pointer",
                        }}>🗑️ Borrar</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

          ) : (

            // ══════════════════════════════════════
            // VISTA DESKTOP — Tabla
            // ══════════════════════════════════════
            <div style={{background:T.bg2,borderRadius:10,border:`1px solid ${T.border}`,overflow:"hidden"}}>
              <div style={{overflowX:"auto"}}>
                <table style={{borderCollapse:"collapse",width:"100%",fontSize:13,minWidth:600}}>
                  <thead>
                    <tr style={{background:T.bg3}}>
                      {["Nombre","Tipo","Capacidad","Apertura","Cierre","Estado","Acciones"].map(h=>(
                        <th key={h} style={{padding:"10px 14px",color:T.muted,fontWeight:600,
                          textAlign:"left",borderBottom:`1px solid ${T.border}`,
                          whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s,i)=>{
                      const isLab = s.tipo==="Laboratorio";
                      return(
                        <tr key={s.id} style={{background:i%2===0?T.bg2:T.bg,
                          borderBottom:`1px solid ${T.border}20`,opacity:s.activo?1:0.5}}>
                          <td style={{padding:"10px 14px",fontWeight:600,
                            color:s.activo?T.text:T.muted}}>
                            <span style={{marginRight:6}}>{isLab?"🔬":"🏫"}</span>{s.nombre}
                          </td>
                          <td style={{padding:"10px 14px"}}>
                            <span style={{fontSize:11,padding:"3px 9px",borderRadius:99,
                              background:isLab?"rgba(74,222,128,0.15)":"rgba(96,165,250,0.15)",
                              color:isLab?"#4ade80":"#60a5fa",
                              border:`1px solid ${isLab?"rgba(74,222,128,0.3)":"rgba(96,165,250,0.3)"}`,
                              fontWeight:600}}>
                              {s.tipo}
                            </span>
                          </td>
                          <td style={{padding:"10px 14px",color:T.text,
                            fontFamily:"monospace"}}>{s.capacidad} est.</td>
                          <td style={{padding:"10px 14px",color:T.mutedL,
                            fontFamily:"monospace"}}>{s.hora_apertura}</td>
                          <td style={{padding:"10px 14px",color:T.mutedL,
                            fontFamily:"monospace"}}>{s.hora_cierre}</td>
                          <td style={{padding:"10px 14px"}}>
                            <div onClick={()=>toggleActivo(s)}
                              style={{width:38,height:22,borderRadius:11,
                                background:s.activo?"#22c55e":"#374151",
                                position:"relative",cursor:"pointer",
                                transition:"background .2s",display:"inline-block"}}>
                              <div style={{position:"absolute",top:3,
                                left:s.activo?18:3,width:16,height:16,
                                borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
                            </div>
                          </td>
                          <td style={{padding:"10px 14px"}}>
                            <div style={{display:"flex",gap:6}}>
                              <button onClick={()=>openEdit(s)}
                                style={{padding:"5px 12px",borderRadius:6,
                                  border:`1px solid ${T.border2}`,background:"transparent",
                                  color:"#60a5fa",fontSize:11,fontWeight:600,cursor:"pointer"}}>
                                ✏️ Editar
                              </button>
                              {confirmDel===s.id?(
                                <div style={{display:"flex",gap:4}}>
                                  <button onClick={()=>deleteSpace(s.id)}
                                    style={{padding:"5px 10px",borderRadius:6,border:"none",
                                      background:"#dc2626",color:"#fff",
                                      fontSize:11,fontWeight:600,cursor:"pointer"}}>
                                    ¿Confirmar?
                                  </button>
                                  <button onClick={()=>setConfirmDel(null)}
                                    style={{padding:"5px 8px",borderRadius:6,
                                      border:`1px solid ${T.border2}`,background:"transparent",
                                      color:T.muted,fontSize:11,cursor:"pointer"}}>
                                    No
                                  </button>
                                </div>
                              ):(
                                <button onClick={()=>setConfirmDel(s.id)}
                                  style={{padding:"5px 12px",borderRadius:6,
                                    border:"1px solid rgba(239,68,68,0.3)",background:"transparent",
                                    color:"#f87171",fontSize:11,fontWeight:600,cursor:"pointer"}}>
                                  🗑️ Borrar
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filtered.length===0&&(
                      <tr>
                        <td colSpan={7} style={{padding:40,textAlign:"center",color:T.muted}}>
                          No hay espacios para mostrar.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}