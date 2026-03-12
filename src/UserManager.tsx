import { useState, useEffect } from "react";
import { useTheme } from "./ThemeContext";
import { useBreakpoint } from "./useIsMobile";

const SUPABASE_URL = "https://wlisbvcqqjlgzfvbnscp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsaXNidmNxcWpsZ3pmdmJuc2NwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0Njg5MDIsImV4cCI6MjA4ODA0NDkwMn0.66Ly-QcVzj0rM5DyH6o3NDE-jfPSlPgRuJYyTDMlW4g";

// Definición de todos los módulos/botones del sistema
const MODULOS = [
  { key: "crear_reserva",           label: "➕ Crear Reserva",              grupo: "Reservas" },
  { key: "eliminar_reserva",        label: "🗑️ Eliminar Reserva",           grupo: "Reservas" },
  { key: "exportar",                label: "📊 Exportar Reportes",           grupo: "Reservas" },
  { key: "reservas_extraordinarias",label: "⭐ Reservas Extraordinarias",    grupo: "Reservas" },
  { key: "auto_horario",            label: "🤖 Auto-Horario",               grupo: "Admin" },
  { key: "gestion_espacios",        label: "🏛️ Gestión de Espacios",        grupo: "Admin" },
  { key: "vista_docentes",          label: "👤 Vista Docentes",             grupo: "Vistas" },
  { key: "ver_dashboard",           label: "📊 Dashboard Analytics",        grupo: "Vistas" },
  { key: "carga_masiva",            label: "📤 Carga Masiva Excel",         grupo: "Reservas" },
  { key: "borrar_extraordinarias",  label: "🗑️ Borrar Todas Extraordinarias",grupo: "Admin" },
];

const ROLES = [
  { key: "viewer",     label: "👁️ Solo lectura",  desc: "Solo puede ver la grilla" },
  { key: "editor",     label: "✏️ Editor",         desc: "Puede crear reservas" },
  { key: "superadmin", label: "👑 Super Admin",    desc: "Acceso total" },
];

const PERMISOS_POR_ROL: Record<string, Record<string, boolean>> = {
  viewer:     { crear_reserva:false, eliminar_reserva:false, exportar:true,  reservas_extraordinarias:false, auto_horario:false, gestion_espacios:false, vista_docentes:true,  ver_dashboard:false, carga_masiva:false, borrar_extraordinarias:false },
  editor:     { crear_reserva:true,  eliminar_reserva:false, exportar:true,  reservas_extraordinarias:true,  auto_horario:false, gestion_espacios:false, vista_docentes:true,  ver_dashboard:false, carga_masiva:false, borrar_extraordinarias:false },
  superadmin: { crear_reserva:true,  eliminar_reserva:true,  exportar:true,  reservas_extraordinarias:true,  auto_horario:true,  gestion_espacios:true,  vista_docentes:true,  ver_dashboard:true,  carga_masiva:true,  borrar_extraordinarias:true  },
};

interface UserManagerProps {
  session: any;
  spaces:  any[];
  onClose: () => void;
}

const EMPTY_FORM = {
  email: "", password: "", nombre: "", role: "editor",
  permisos: { ...PERMISOS_POR_ROL.editor },
  espacios_permitidos: [] as string[],
};

export default function UserManager({ session, spaces, onClose }: UserManagerProps) {
  const { T } = useTheme();
  const { isMobile } = useBreakpoint();

  const [tab,        setTab]        = useState<"lista"|"crear"|"editar">("lista");
  const [users,      setUsers]      = useState<any[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [toast,      setToast]      = useState("");
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [editingId,  setEditingId]  = useState<string|null>(null);
  const [confirmDel, setConfirmDel] = useState<string|null>(null);

  const token = session?.access_token;

  const S = {
    overlay: { position:"fixed" as const, inset:0, zIndex:200, display:"flex",
               alignItems:"center", justifyContent:"center",
               background:"rgba(0,0,0,0.85)", backdropFilter:"blur(8px)", padding:16 },
    box:     { background:T.bg3, borderRadius: isMobile ? 0 : 16,
               border:`1px solid ${T.border2}`, width:"100%", maxWidth:820,
               maxHeight: isMobile ? "100vh" : "93vh",
               overflowY:"auto" as const, boxShadow:T.shadow },
    inp:     { width:"100%", background:T.inputBg, border:`1px solid ${T.inputBorder}`,
               color:T.text, borderRadius:8, padding:"9px 12px", fontSize:16,
               outline:"none", boxSizing:"border-box" as const, minHeight:44 },
    lbl:     { display:"block" as const, fontSize:11, fontWeight:600 as const,
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

  // Cargar usuarios
  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=*&order=created_at.asc`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch { showToast("Error al cargar usuarios"); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadUsers(); }, []);

  // Aplicar preset de permisos al cambiar rol
  const handleRoleChange = (role: string) => {
    setForm(f => ({
      ...f,
      role,
      permisos: { ...PERMISOS_POR_ROL[role] || PERMISOS_POR_ROL.viewer },
    }));
  };

  const togglePermiso = (key: string) => {
    setForm(f => ({ ...f, permisos: { ...f.permisos, [key]: !f.permisos[key] } }));
  };

  const toggleEspacio = (nombre: string) => {
    setForm(f => ({
      ...f,
      espacios_permitidos: f.espacios_permitidos.includes(nombre)
        ? f.espacios_permitidos.filter(e => e !== nombre)
        : [...f.espacios_permitidos, nombre],
    }));
  };

  // Crear usuario via Edge Function
  const handleCreate = async () => {
    if (!form.email || !form.password || !form.nombre) {
      showToast("⚠ Email, contraseña y nombre son obligatorios"); return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email:               form.email,
          password:            form.password,
          nombre:              form.nombre,
          role:                form.role,
          permisos:            form.permisos,
          espacios_permitidos: form.espacios_permitidos,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al crear usuario");
      showToast("✓ Usuario creado exitosamente");
      setForm(EMPTY_FORM);
      setTab("lista");
      loadUsers();
    } catch (e: any) { showToast(`❌ ${e.message}`); }
    finally { setSaving(false); }
  };

  // Editar usuario existente (solo actualiza perfil, no crea auth)
  const handleUpdate = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${editingId}`,
        {
          method: "PATCH",
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            nombre:              form.nombre,
            role:                form.role,
            permisos:            form.permisos,
            espacios_permitidos: form.espacios_permitidos,
          }),
        }
      );
      if (!res.ok) throw new Error("Error al actualizar");
      showToast("✓ Usuario actualizado");
      setTab("lista");
      setEditingId(null);
      loadUsers();
    } catch (e: any) { showToast(`❌ ${e.message}`); }
    finally { setSaving(false); }
  };

  const handleEdit = (user: any) => {
    setForm({
      email:               user.email || "",
      password:            "",
      nombre:              user.nombre || "",
      role:                user.role || "viewer",
      permisos:            user.permisos || { ...PERMISOS_POR_ROL.viewer },
      espacios_permitidos: user.espacios_permitidos || [],
    });
    setEditingId(user.id);
    setTab("editar");
  };

  const handleToggleActivo = async (user: any) => {
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`,
        "Content-Type": "application/json", Prefer: "return=minimal",
      },
      body: JSON.stringify({ activo: !user.activo }),
    });
    loadUsers();
  };

  // Grupos únicos de módulos
  const grupos = [...new Set(MODULOS.map(m => m.grupo))];

  const FormularioUsuario = ({ isEdit = false }: { isEdit?: boolean }) => (
    <div style={{ display:"flex", flexDirection:"column", gap:20, padding:24 }}>

      {/* Datos básicos */}
      <div style={{ background:T.bg2, borderRadius:12, padding:16, border:`1px solid ${T.border}` }}>
        <div style={{ fontSize:13, fontWeight:700, color:T.text, marginBottom:14 }}>
          👤 Datos del Usuario
        </div>
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:12 }}>
          <div>
            <label style={S.lbl}>Nombre completo *</label>
            <input style={S.inp} value={form.nombre} placeholder="Ej: María García"
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
          </div>
          <div>
            <label style={S.lbl}>Correo electrónico *</label>
            <input style={S.inp} type="email" value={form.email}
              placeholder="usuario@udistrital.edu.co"
              disabled={isEdit}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              style={{ ...S.inp, opacity: isEdit ? 0.5 : 1 }} />
          </div>
          {!isEdit && (
            <div>
              <label style={S.lbl}>Contraseña *</label>
              <input style={S.inp} type="password" value={form.password}
                placeholder="Mínimo 8 caracteres"
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </div>
          )}
        </div>
      </div>

      {/* Rol base */}
      <div style={{ background:T.bg2, borderRadius:12, padding:16, border:`1px solid ${T.border}` }}>
        <div style={{ fontSize:13, fontWeight:700, color:T.text, marginBottom:14 }}>
          🎭 Rol Base
        </div>
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap:8 }}>
          {ROLES.map(r => (
            <button key={r.key} onClick={() => handleRoleChange(r.key)}
              style={{ padding:"12px 14px", borderRadius:10, cursor:"pointer",
                textAlign:"left" as const, minHeight:60,
                border:`1px solid ${form.role === r.key ? "#60a5fa" : T.border2}`,
                background: form.role === r.key ? "rgba(96,165,250,0.12)" : "transparent",
                color: form.role === r.key ? "#60a5fa" : T.muted }}>
              <div style={{ fontWeight:700, fontSize:13 }}>{r.label}</div>
              <div style={{ fontSize:10, marginTop:3, opacity:0.7 }}>{r.desc}</div>
            </button>
          ))}
        </div>
        <div style={{ fontSize:11, color:T.muted, marginTop:10,
          background:"rgba(96,165,250,0.06)", borderRadius:8, padding:"8px 12px",
          border:"1px solid rgba(96,165,250,0.15)" }}>
          ℹ️ El rol aplica permisos predeterminados. Puedes ajustarlos individualmente abajo.
        </div>
      </div>

      {/* Permisos granulares por módulo */}
      <div style={{ background:T.bg2, borderRadius:12, padding:16, border:`1px solid ${T.border}` }}>
        <div style={{ fontSize:13, fontWeight:700, color:T.text, marginBottom:14 }}>
          🔐 Permisos por Módulo
        </div>
        {grupos.map(grupo => (
          <div key={grupo} style={{ marginBottom:16 }}>
            <div style={{ fontSize:10, fontWeight:700, color:T.muted, letterSpacing:"0.1em",
              textTransform:"uppercase", marginBottom:8 }}>{grupo}</div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {MODULOS.filter(m => m.grupo === grupo).map(mod => (
                <div key={mod.key}
                  onClick={() => togglePermiso(mod.key)}
                  style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                    padding:"10px 14px", borderRadius:8, cursor:"pointer",
                    background: form.permisos[mod.key] ? "rgba(74,222,128,0.06)" : T.bg,
                    border:`1px solid ${form.permisos[mod.key] ? "rgba(74,222,128,0.2)" : T.border}`,
                    transition:"all 0.15s" }}>
                  <span style={{ fontSize:13, color:T.text }}>{mod.label}</span>
                  {/* Toggle switch */}
                  <div style={{ width:44, height:24, borderRadius:12, position:"relative",
                    background: form.permisos[mod.key] ? "#4ade80" : T.border2,
                    transition:"background 0.2s", flexShrink:0 }}>
                    <div style={{ position:"absolute", top:3,
                      left: form.permisos[mod.key] ? 23 : 3,
                      width:18, height:18, borderRadius:"50%", background:"#fff",
                      transition:"left 0.2s", boxShadow:"0 1px 3px rgba(0,0,0,0.3)" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Filtro de espacios */}
      <div style={{ background:T.bg2, borderRadius:12, padding:16, border:`1px solid ${T.border}` }}>
        <div style={{ fontSize:13, fontWeight:700, color:T.text, marginBottom:6 }}>
          🏛️ Espacios Permitidos
        </div>
        <div style={{ fontSize:12, color:T.muted, marginBottom:14 }}>
          Si no seleccionas ninguno, el usuario tendrá acceso a <b style={{color:T.text}}>todos</b> los espacios.
          Selecciona solo los que apliquen para restringir su acceso.
        </div>

        {/* Labs */}
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:10, fontWeight:700, color:T.muted, letterSpacing:"0.1em",
            textTransform:"uppercase", marginBottom:8 }}>🔬 Laboratorios</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {spaces.filter(s => s.tipo === "Laboratorio").map(s => {
              const sel = form.espacios_permitidos.includes(s.nombre);
              return (
                <button key={s.nombre} onClick={() => toggleEspacio(s.nombre)}
                  style={{ padding:"6px 12px", borderRadius:99, fontSize:12,
                    cursor:"pointer", border:`1px solid ${sel ? "#4ade80" : T.border2}`,
                    background: sel ? "rgba(74,222,128,0.12)" : "transparent",
                    color: sel ? "#4ade80" : T.muted, fontWeight: sel ? 600 : 400 }}>
                  {sel ? "✓ " : ""}{s.nombre}
                </button>
              );
            })}
          </div>
        </div>

        {/* Teoría */}
        <div>
          <div style={{ fontSize:10, fontWeight:700, color:T.muted, letterSpacing:"0.1em",
            textTransform:"uppercase", marginBottom:8 }}>🏫 Salones Teoría</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {spaces.filter(s => s.tipo === "Teoria").map(s => {
              const sel = form.espacios_permitidos.includes(s.nombre);
              return (
                <button key={s.nombre} onClick={() => toggleEspacio(s.nombre)}
                  style={{ padding:"6px 12px", borderRadius:99, fontSize:12,
                    cursor:"pointer", border:`1px solid ${sel ? "#60a5fa" : T.border2}`,
                    background: sel ? "rgba(96,165,250,0.12)" : "transparent",
                    color: sel ? "#60a5fa" : T.muted, fontWeight: sel ? 600 : 400 }}>
                  {sel ? "✓ " : ""}{s.nombre}
                </button>
              );
            })}
          </div>
        </div>

        {form.espacios_permitidos.length > 0 && (
          <div style={{ marginTop:12, padding:"8px 12px", background:"rgba(96,165,250,0.06)",
            borderRadius:8, border:"1px solid rgba(96,165,250,0.2)", fontSize:12, color:"#93c5fd" }}>
            🔒 Este usuario solo verá: <b>{form.espacios_permitidos.join(", ")}</b>
          </div>
        )}
      </div>

      {/* Botones */}
      <div style={{ display:"flex", gap:10 }}>
        <button onClick={() => { setTab("lista"); setEditingId(null); setForm(EMPTY_FORM); }}
          style={{ ...S.btn("transparent"), border:`1px solid ${T.border2}`, color:T.mutedL }}>
          Cancelar
        </button>
        <button onClick={isEdit ? handleUpdate : handleCreate} disabled={saving}
          style={{ ...S.btn(`linear-gradient(135deg,${T.udBlue},#0066CC)`), flex:1,
            opacity: saving ? 0.7 : 1 }}>
          {saving ? "Guardando…" : isEdit ? "💾 Guardar Cambios" : "✅ Crear Usuario"}
        </button>
      </div>
    </div>
  );

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.box}>

        {/* HEADER */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"18px 24px", borderBottom:`1px solid ${T.border}` }}>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:T.text, fontFamily:"Montserrat,sans-serif" }}>
              👥 Administración de Usuarios
            </div>
            <div style={{ fontSize:11, color:T.muted, marginTop:3 }}>
              {users.length} usuario{users.length!==1?"s":""} registrados
            </div>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {toast && (
              <span style={{ fontSize:12, padding:"6px 12px", borderRadius:8,
                color: toast.startsWith("❌") ? "#f87171" : "#4ade80",
                background: toast.startsWith("❌") ? "rgba(248,113,113,0.1)" : "rgba(74,222,128,0.1)",
                border: `1px solid ${toast.startsWith("❌") ? "rgba(248,113,113,0.25)" : "rgba(74,222,128,0.25)"}` }}>
                {toast}
              </span>
            )}
            <button onClick={onClose}
              style={{ background:"transparent", border:"none", color:T.muted,
                fontSize:22, cursor:"pointer", minWidth:44, minHeight:44 }}>✕</button>
          </div>
        </div>

        {/* TABS */}
        <div style={{ display:"flex", borderBottom:`1px solid ${T.border}` }}>
          {[
            { key:"lista",  label:`👥 Usuarios (${users.length})` },
            { key:"crear",  label:"➕ Crear Usuario" },
          ].map(t => (
            <button key={t.key} onClick={() => { setTab(t.key as any); setEditingId(null); setForm(EMPTY_FORM); }}
              style={{ flex:1, padding:"11px", fontSize:12, fontWeight:600, cursor:"pointer",
                border:"none", whiteSpace:"nowrap" as const,
                borderBottom: tab === t.key ? `2px solid ${T.udAccent}` : "2px solid transparent",
                background: tab === t.key ? "rgba(0,102,204,0.08)" : "transparent",
                color: tab === t.key ? "#60a5fa" : T.muted }}>
              {t.label}
            </button>
          ))}
          {tab === "editar" && (
            <button style={{ flex:1, padding:"11px", fontSize:12, fontWeight:600,
              border:"none", borderBottom:`2px solid ${T.udAccent}`,
              background:"rgba(0,102,204,0.08)", color:"#60a5fa", cursor:"default" }}>
              ✏️ Editando
            </button>
          )}
        </div>

        {/* TAB LISTA */}
        {tab === "lista" && (
          <div style={{ padding:20, display:"flex", flexDirection:"column", gap:10 }}>
            {loading ? (
              <div style={{ textAlign:"center", padding:40, color:T.muted }}>Cargando usuarios…</div>
            ) : users.length === 0 ? (
              <div style={{ textAlign:"center", padding:40, color:T.muted }}>
                No hay usuarios registrados.
              </div>
            ) : users.map(u => {
              const rolInfo = { superadmin:{color:"#818cf8",icon:"👑"}, editor:{color:"#4ade80",icon:"✏️"}, viewer:{color:"#60a5fa",icon:"👁️"} }[u.role as string] || {color:T.muted,icon:"?"};
              const permCount = Object.values(u.permisos || {}).filter(Boolean).length;
              const espacioCount = (u.espacios_permitidos || []).length;
              return (
                <div key={u.id} style={{ background:T.bg2, borderRadius:12, padding:"14px 16px",
                  border:`1px solid ${u.activo ? T.border : "rgba(239,68,68,0.2)"}`,
                  opacity: u.activo ? 1 : 0.6 }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                        <span style={{ fontSize:18 }}>{rolInfo.icon}</span>
                        <span style={{ fontSize:14, fontWeight:700, color:T.text }}>
                          {u.nombre || u.email?.split("@")[0]}
                        </span>
                        <span style={{ fontSize:10, padding:"2px 8px", borderRadius:99,
                          background:`${rolInfo.color}20`, color:rolInfo.color, fontWeight:600 }}>
                          {u.role}
                        </span>
                        {!u.activo && (
                          <span style={{ fontSize:10, padding:"2px 8px", borderRadius:99,
                            background:"rgba(239,68,68,0.15)", color:"#f87171", fontWeight:600 }}>
                            Inactivo
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize:11, color:T.muted }}>{u.email}</div>
                      <div style={{ fontSize:10, color:T.muted, marginTop:4, display:"flex", gap:12 }}>
                        <span>🔐 {permCount} permiso{permCount!==1?"s":""}</span>
                        <span>🏛️ {espacioCount === 0 ? "Todos los espacios" : `${espacioCount} espacio${espacioCount!==1?"s":""}`}</span>
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                      <button onClick={() => handleEdit(u)}
                        style={{ padding:"6px 12px", borderRadius:8, fontSize:11, fontWeight:600,
                          cursor:"pointer", border:`1px solid ${T.border2}`,
                          background:"transparent", color:"#60a5fa", minHeight:36 }}>
                        ✏️ Editar
                      </button>
                      <button onClick={() => handleToggleActivo(u)}
                        style={{ padding:"6px 12px", borderRadius:8, fontSize:11, fontWeight:600,
                          cursor:"pointer", border:`1px solid ${T.border2}`,
                          background:"transparent",
                          color: u.activo ? "#f87171" : "#4ade80", minHeight:36 }}>
                        {u.activo ? "🔴" : "🟢"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "crear" && <FormularioUsuario />}
        {tab === "editar" && <FormularioUsuario isEdit />}

      </div>
    </div>
  );
}