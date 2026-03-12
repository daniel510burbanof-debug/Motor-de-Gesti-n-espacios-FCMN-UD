import { useState, useMemo, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { createClient } from "@supabase/supabase-js";
import { getImageBase64 } from "./logoUtils";
import AutoScheduler from "./AutoScheduler";
import SpacesManager from "./SpacesManager";
import Dashboard from "./Dashboard";
import ReservasExtraordinarias from "./ReservasExtraordinarias";
import { useTheme } from "./ThemeContext";
import TeacherView from "./TeacherView";
import MobileGrid from "./MobileGrid";
import { useBreakpoint } from "./useIsMobile";
import type { Space } from "./SpacesManager";

const SUPABASE_URL = "https://wlisbvcqqjlgzfvbnscp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsaXNidmNxcWpsZ3pmdmJuc2NwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0Njg5MDIsImV4cCI6MjA4ODA0NDkwMn0.66Ly-QcVzj0rM5DyH6o3NDE-jfPSlPgRuJYyTDMlW4g";
const supabaseRealtime = createClient(SUPABASE_URL, SUPABASE_KEY);

const authApi = async (path: string, opts: any = {}, token?: string) => {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
};

const sbAuth = {
  async signIn(email: string, password: string) {
    const res = await authApi("/auth/v1/token?grant_type=password", { method:"POST", body:JSON.stringify({email,password}) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || "Error al iniciar sesión");
    return data;
  },
  async signOut(token: string) { await authApi("/auth/v1/logout",{method:"POST"},token); },
  async getProfile(userId: string, token: string) {
    const res = await authApi(`/rest/v1/profiles?id=eq.${userId}&select=id,email,role,program`,{},token);
    const data = await res.json();
    if (data[0]?.program !== undefined) return data[0];
    const res2 = await authApi(`/rest/v1/profiles?select=id,email,role,program`,{},token);
    const data2 = await res2.json();
    return data2.find((p: any) => p.id === userId) || data[0] || null;
  },
};

const sbDb = {
  async getReservations(token: string) {
    const res = await authApi("/rest/v1/reservations?select=*&order=created_at.asc",{},token);
    if (!res.ok) throw new Error("Error al cargar");
    return res.json();
  },
  async insert(row: any, token: string) {
    const res = await authApi("/rest/v1/reservations",{method:"POST",body:JSON.stringify(row),headers:{Prefer:"return=representation"}},token);
    if (!res.ok) throw new Error("Error al guardar");
    return (await res.json())[0];
  },
  async remove(id: number, token: string) {
    const res = await authApi(`/rest/v1/reservations?id=eq.${id}`,{method:"DELETE"},token);
    if (!res.ok) throw new Error("Error al eliminar");
  },
};

const PROGRAMS: Record<string,{color:string;bg:string;border:string;icon:string;iconBg:string}> = {
  "Química":     {color:"#F472B6",bg:"rgba(244,114,182,0.15)",border:"#F472B6",icon:"⚛️",iconBg:"rgba(244,114,182,0.2)"},
  "Biología":    {color:"#4ADE80",bg:"rgba(74,222,128,0.15)", border:"#4ADE80",icon:"🧬",iconBg:"rgba(74,222,128,0.2)"},
  "Física":      {color:"#60A5FA",bg:"rgba(96,165,250,0.15)", border:"#60A5FA",icon:"🧲",iconBg:"rgba(96,165,250,0.2)"},
  "Matemáticas": {color:"#FB923C",bg:"rgba(251,146,60,0.15)", border:"#FB923C",icon:"π", iconBg:"rgba(251,146,60,0.2)"},
};

const ROOMS = ["AUDITORIO","1001","1002 Sala Sis","1003 Sala Sis","1004","1005","1006","1007","1008","1009","1010 Sala Sis","1101","1102 Sala Sis","1103 Sala Sis","1104","1105","1106","1107","1108","1109","1110 Sala Sis","SALA ESP. (PISO 4)"];
const LAB_ROOMS_NAMES = [
  "Lab 1 Bio","Lab 2 Bio","Lab 3 Bio","Lab 4 Bio",
  "Lab 1 Qca","Lab 2 Qca","Lab 3 Qca","Lab 5 Qca","Lab 6 Qca",
  "Instrumental",
];
const DAYS  = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const HOURS = Array.from({length:14},(_,i)=>`${String(i+6).padStart(2,"0")}:00`);
const EMPTY = {program:"",subject:"",teacher:"",day:"Lunes",hour:"",hour_end:"",room:""};

const ROLE_CONFIG: Record<string,{label:string;icon:string;color:string}> = {
  superadmin:{label:"Super Admin", icon:"👑",color:"#818cf8"},
  editor:    {label:"Editor",      icon:"✏️",color:"#4ade80"},
  viewer:    {label:"Solo lectura",icon:"👁️",color:"#60a5fa"},
};

const T_STATIC = {
  udBlue:    "#003087",
  udAccent:  "#0066CC",
  udLight:   "#E8F0FE",
  dark:      "#060C1A",
  dark2:     "#0A1628",
  dark3:     "#0F1E3C",
  border:    "#1A2E52",
  border2:   "#243a6e",
  text:      "#E2E8F0",
  muted:     "#64748b",
  mutedLight:"#94a3b8",
};

// ← CAMBIO: helper para formato de rango
function hourRangeLabel(h: string): string {
  const i = HOURS.indexOf(h);
  if (i === -1 || i >= HOURS.length - 1) return h;
  return `${h} a ${HOURS[i+1]}`;
}

function getHoursBetween(start:string,end:string):string[]{
  const si=HOURS.indexOf(start),ei=HOURS.indexOf(end);
  if(si===-1||ei===-1||ei<=si)return[start];
  return HOURS.slice(si,ei); // ← solo los bloques reales: 06:00 y 07:00
}
function getEndHourOptions(h:string):string[]{
  const i=HOURS.indexOf(h); return i===-1?[]:HOURS.slice(i);
}

// ← CAMBIO: fecha de hoy en YYYY-MM-DD
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

async function exportToExcel(data:any[],filters:{program:string;teacher:string}){
  let f=[...data];
  if(filters.program)f=f.filter(r=>r.program===filters.program);
  if(filters.teacher)f=f.filter(r=>r.teacher.toLowerCase().includes(filters.teacher.toLowerCase()));
  f=f.filter(r=>!r.specific_date && (!r.tipo_reserva || r.tipo_reserva==="academica"));
  const rows=f.map(r=>({"Programa":r.program,"Asignatura":r.subject,"Docente":r.teacher,"Día":r.day,"H. Inicio":r.hour,"H. Fin":r.hour_end||r.hour,"Salón":r.room}));
  const ws=XLSX.utils.json_to_sheet(rows);
  ws["!cols"]=[{wch:14},{wch:24},{wch:26},{wch:12},{wch:10},{wch:10},{wch:20}];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,"Reservas");
  saveAs(new Blob([XLSX.write(wb,{bookType:"xlsx",type:"array"})],{type:"application/octet-stream"}),`reservas_FCMN_${Date.now()}.xlsx`);
}

async function exportToPDF(data:any[],filters:{program:string;teacher:string}){
  let f=[...data];
  if(filters.program)f=f.filter(r=>r.program===filters.program);
  if(filters.teacher)f=f.filter(r=>r.teacher.toLowerCase().includes(filters.teacher.toLowerCase()));
  f=f.filter(r=>!r.specific_date && (!r.tipo_reserva || r.tipo_reserva==="academica"));
  const udLogo   = await getImageBase64("/logo-ud.png");
  const fcmnLogo = await getImageBase64("/logo-fcmn.png");
  const doc=new jsPDF({orientation:"landscape"});
  doc.setFillColor(0,48,135);doc.rect(0,0,297,38,"F");
  doc.setFillColor(0,102,204);doc.rect(0,34,297,4,"F");
  const udImg2 = document.querySelector('img[alt="Universidad Distrital"]') as HTMLImageElement|null;
  const fcmnImg2 = document.querySelector('img[alt="FCMN"]') as HTMLImageElement|null;
  let udW2 = 24, fcmnX = 36;
  if(udImg2 && udImg2.naturalWidth > 0){
    const ratio = udImg2.naturalWidth / udImg2.naturalHeight;
    udW2 = 24 * ratio;
    try{ doc.addImage(udLogo, "PNG", 8, 7, udW2, 24); }catch{}
  } else {
    try{ doc.addImage(udLogo, "PNG", 8, 7, 24, 24); }catch{}
  }
  fcmnX = 8 + udW2 + 4;
  if(fcmnImg2 && fcmnImg2.naturalWidth > 0){
    const ratio = fcmnImg2.naturalWidth / fcmnImg2.naturalHeight;
    const fcmnW = 22 * ratio;
    try{ doc.addImage(fcmnLogo, "PNG", fcmnX, 9, fcmnW, 22); }catch{}
    fcmnX += fcmnW;
  } else {
    try{ doc.addImage(fcmnLogo, "PNG", fcmnX, 9, 22, 22); }catch{}
    fcmnX += 22;
  }
  const textX = fcmnX + 6;
  doc.setDrawColor(255,255,255); doc.setLineWidth(0.3); doc.line(fcmnX+2, 6, fcmnX+2, 30);
  doc.setTextColor(255,255,255); doc.setFontSize(14); doc.setFont("helvetica","bold");
  doc.text("Universidad Distrital Francisco José de Caldas", textX, 14);
  doc.setFontSize(10); doc.setFont("helvetica","normal"); doc.setTextColor(180,210,255);
  doc.text("Facultad de Ciencias y Matemáticas · Sistema de Gestión de Espacios", textX, 22);
  doc.setFontSize(8); doc.setTextColor(140,180,255);
  doc.text(`Generado: ${new Date().toLocaleDateString("es-CO")} ${new Date().toLocaleTimeString("es-CO")}`, textX, 29);
  if(filters.program)doc.text(`Programa: ${filters.program}`,230,22);
  const PC:Record<string,[number,number,number]>={"Química":[244,114,182],"Biología":[74,222,128],"Física":[96,165,250],"Matemáticas":[251,146,60]};
  autoTable(doc,{
    startY:42,
    head:[["Programa","Asignatura","Docente","Día","H. Inicio","H. Fin","Salón"]],
    body:f.map(r=>[r.program,r.subject,r.teacher,r.day,r.hour,r.hour_end||r.hour,r.room]),
    styles:{fontSize:9,cellPadding:4,textColor:[226,232,240]},
    headStyles:{fillColor:[0,48,135],textColor:[255,255,255],fontStyle:"bold"},
    alternateRowStyles:{fillColor:[10,22,50]},bodyStyles:{fillColor:[6,12,26]},
    didParseCell:(d)=>{if(d.column.index===0&&d.section==="body"){const c=PC[d.cell.raw as string];if(c)d.cell.styles.textColor=c;}},
    margin:{left:14,right:14},
  });
  const n=(doc as any).internal.getNumberOfPages();
  for(let i=1;i<=n;i++){
    doc.setPage(i);
    const h=doc.internal.pageSize.height;
    doc.setFillColor(0,48,135);doc.rect(0,h-12,297,12,"F");
    doc.addImage(udLogo,  "PNG",10,h-11,6,6);
    doc.addImage(fcmnLogo,"PNG",18,h-11,6,6);
    doc.setFontSize(7);doc.setTextColor(180,210,255);
    doc.text("Universidad Distrital · FCMN · Sistema de Gestión de Espacios",32,h-5);
    doc.text(`Página ${i} de ${n} · Total: ${f.length} reservas`,230,h-5);
  }
  doc.save(`Reporte_FCMN_${Date.now()}.pdf`);
}

const UDLogo = () => {
  const { theme } = useTheme();
  return (
    <div style={{display:"flex",alignItems:"center",gap:8,height:55}}>
      <img src="/logo-ud.png" alt="Universidad Distrital"
        style={{height:55,width:"auto",objectFit:"contain",
          filter: theme==="light" ? "brightness(0)" : "none",
          transition:"filter 0.3s"
        }}/>
    </div>
  );
};

const FCMNLogo = () => {
  const { theme } = useTheme();
  return (
    <div style={{display:"flex",alignItems:"center",gap:8,height:45}}>
      <img src="/logo-fcmn.png" alt="FCMN"
        style={{height:45,width:"auto",objectFit:"contain",
          filter: theme==="light" ? "brightness(0)" : "none",
          transition:"filter 0.3s"
        }}/>
    </div>
  );
};

function ExportModal({reservations,onClose}:{reservations:any[];onClose:()=>void}){
  const { T } = useTheme();
  const [fp,setFp]=useState("");
  const [ft,setFt]=useState("");
  const filtered=useMemo(()=>{
    let d=[...reservations];
    if(fp)d=d.filter(r=>r.program===fp);
    if(ft)d=d.filter(r=>r.teacher.toLowerCase().includes(ft.toLowerCase()));
    return d;
  },[reservations,fp,ft]);
  const teachers=useMemo(()=>[...new Set(reservations.map(r=>r.teacher))].sort(),[reservations]);
  const S_local = {
    overlay:{position:"fixed" as const,inset:0,zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:16,background:"rgba(0,0,0,0.75)",backdropFilter:"blur(8px)"},
    mBox:{background:T.bg3,borderRadius:16,border:`1px solid ${T.border2}`,width:"100%",maxWidth:460,boxShadow:T.shadow,maxHeight:"90vh",overflowY:"auto" as const},
    lbl:{display:"block" as const,fontSize:11,fontWeight:500 as const,color:T.muted,marginBottom:5,letterSpacing:"0.05em",textTransform:"uppercase" as const},
    sel:{width:"100%",background:T.inputBg,border:`1px solid ${T.inputBorder}`,color:T.text,borderRadius:8,padding:"9px 12px",fontSize:16,outline:"none"},
    cancelBtn:{flex:1,padding:"11px",borderRadius:8,border:`1px solid ${T.border2}`,color:T.mutedL,background:"transparent",fontSize:13,fontWeight:500 as const,cursor:"pointer"},
  };
  return(
    <div style={S_local.overlay} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={S_local.mBox}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 22px",borderBottom:`1px solid ${T.border}`}}>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:"Montserrat,sans-serif"}}>📊 Exportar Reporte</div>
            <div style={{fontSize:11,color:T.muted,marginTop:2}}>{filtered.length} reserva(s) seleccionadas</div>
          </div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:T.muted,fontSize:20,cursor:"pointer",minWidth:44,minHeight:44}}>✕</button>
        </div>
        <div style={{padding:22,display:"flex",flexDirection:"column",gap:16}}>
          <div>
            <label style={S_local.lbl}>Filtrar por Programa</label>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <button onClick={()=>setFp("")} style={{padding:"8px 10px",borderRadius:8,border:`1px solid ${!fp?T.udAccent:T.border2}`,background:!fp?`rgba(0,102,204,0.15)`:"transparent",color:!fp?"#60a5fa":T.muted,fontSize:12,cursor:"pointer",fontWeight:!fp?600:400,minHeight:44}}>Todos</button>
              {Object.entries(PROGRAMS).map(([prog,{color,bg,icon}])=>(
                <button key={prog} onClick={()=>setFp(prog)}
                  style={{display:"flex",alignItems:"center",gap:6,padding:"8px 10px",borderRadius:8,border:`1px solid ${fp===prog?color:T.border2}`,background:fp===prog?bg:"transparent",color:fp===prog?color:T.muted,fontSize:12,cursor:"pointer",minHeight:44}}>
                  <span>{icon}</span>{prog}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={S_local.lbl}>Filtrar por Docente</label>
            <select style={S_local.sel} value={ft} onChange={e=>setFt(e.target.value)}>
              <option value="">Todos los docentes</option>
              {teachers.map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
          <div style={{background:T.bg2,borderRadius:10,padding:14,border:`1px solid ${T.border}`}}>
            <div style={{fontSize:11,color:T.muted,marginBottom:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em"}}>Vista previa</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}}>
              {Object.entries(PROGRAMS).map(([prog,{icon}])=>{
                const n=filtered.filter(r=>r.program===prog).length;
                return(
                  <div key={prog} style={{display:"flex",alignItems:"center",gap:6,fontSize:12}}>
                    <span style={{fontSize:14}}>{icon}</span>
                    <span style={{color:T.muted}}>{prog}:</span>
                    <span style={{color:T.text,fontWeight:700}}>{n}</span>
                  </div>
                );
              })}
            </div>
            <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${T.border}`,fontSize:12,color:T.muted,display:"flex",justifyContent:"space-between"}}>
              <span>Total:</span><span style={{color:T.text,fontWeight:700}}>{filtered.length} reservas</span>
            </div>
          </div>
          {filtered.length===0&&<div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",color:"#f87171",fontSize:13,padding:"10px 12px",borderRadius:8,textAlign:"center"}}>⚠ Sin resultados</div>}
        </div>
        <div style={{padding:"0 22px 22px",display:"flex",gap:10}}>
          <button onClick={onClose} style={S_local.cancelBtn}>Cancelar</button>
          <button disabled={filtered.length===0} onClick={()=>{exportToExcel(filtered,{program:fp,teacher:ft});onClose();}}
            style={{flex:1,padding:"11px",borderRadius:8,border:"none",color:"#fff",background:"linear-gradient(135deg,#059669,#10b981)",fontSize:13,fontWeight:600,cursor:filtered.length===0?"not-allowed":"pointer",opacity:filtered.length===0?0.5:1,minHeight:44}}>📗 Excel</button>
          <button disabled={filtered.length===0} onClick={()=>{exportToPDF(filtered,{program:fp,teacher:ft});onClose();}}
            style={{flex:1,padding:"11px",borderRadius:8,border:"none",color:"#fff",background:"linear-gradient(135deg,#dc2626,#ef4444)",fontSize:13,fontWeight:600,cursor:filtered.length===0?"not-allowed":"pointer",opacity:filtered.length===0?0.5:1,minHeight:44}}>📕 PDF</button>
        </div>
      </div>
    </div>
  );
}

function SearchModal({reservations,query,onClose,onJump}:{reservations:any[];query:string;onClose:()=>void;onJump:(day:string)=>void;}){
  const { T } = useTheme();
  const q=query.toLowerCase().trim();
  const results=useMemo(()=>{
    if(!q)return[];
    return reservations.filter(r=>r.teacher.toLowerCase().includes(q)||r.subject.toLowerCase().includes(q)||r.room.toLowerCase().includes(q)||r.program.toLowerCase().includes(q));
  },[reservations,q]);
  const S_local = {
    overlay:{position:"fixed" as const,inset:0,zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:16,background:"rgba(0,0,0,0.75)",backdropFilter:"blur(8px)"},
    mBox:{background:T.bg3,borderRadius:16,border:`1px solid ${T.border2}`,width:"100%",maxWidth:520,boxShadow:T.shadow,maxHeight:"90vh",overflowY:"auto" as const},
  };
  return(
    <div style={S_local.overlay} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={S_local.mBox}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 22px",borderBottom:`1px solid ${T.border}`}}>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:"Montserrat,sans-serif"}}>🔍 Resultados</div>
            <div style={{fontSize:11,color:T.muted,marginTop:2}}>{results.length} resultado{results.length!==1?"s":""} para "<span style={{color:"#60a5fa"}}>{query}</span>"</div>
          </div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:T.muted,fontSize:20,cursor:"pointer",minWidth:44,minHeight:44}}>✕</button>
        </div>
        <div style={{padding:16,maxHeight:460,overflowY:"auto"}}>
          {results.length===0?(
            <div style={{textAlign:"center",padding:40,color:T.muted}}>
              <div style={{fontSize:40,marginBottom:12}}>🔎</div>
              <div style={{fontSize:14}}>Sin resultados para "<b style={{color:T.mutedL}}>{query}</b>"</div>
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {results.map(r=>{
                const prog=PROGRAMS[r.program];
                if(!prog)return null;
                return(
                  <div key={r.id} onClick={()=>{onJump(r.day);onClose();}}
                    style={{background:T.bg2,borderRadius:10,padding:"12px 14px",border:`1px solid ${prog.border}25`,borderLeft:`3px solid ${prog.border}`,cursor:"pointer",transition:"background 0.15s",minHeight:44}}
                    onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background=T.bg}
                    onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background=T.bg2}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontSize:16}}>{prog.icon}</span>
                        <span style={{fontSize:11,color:prog.color,fontWeight:600}}>{r.program}</span>
                      </div>
                      <span style={{fontSize:10,color:T.muted,background:T.bg3,padding:"2px 8px",borderRadius:99}}>
                        {r.day} · {r.hour}{r.hour_end&&r.hour_end!==r.hour?` → ${r.hour_end}`:""}
                      </span>
                    </div>
                    <div style={{fontSize:13,fontWeight:600,color:T.text,marginBottom:4}}>{r.subject}</div>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <span style={{fontSize:11,color:T.mutedL}}>👤 {r.teacher}</span>
                      <span style={{fontSize:11,color:T.muted}}>📍 {r.room}</span>
                    </div>
                    <div style={{fontSize:10,color:"#4ade80",marginTop:4}}>→ Clic para ir al día</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LoginScreen({onLogin}:{onLogin:(s:any,p:any)=>void}){
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const S_local = {
    inp:{width:"100%",background:"rgba(15,30,60,0.8)",border:`1px solid ${T_STATIC.border2}`,color:T_STATIC.text,borderRadius:8,padding:"9px 12px",fontSize:16,outline:"none",boxSizing:"border-box" as const,minHeight:44},
    lbl:{display:"block" as const,fontSize:11,fontWeight:500 as const,color:T_STATIC.muted,marginBottom:5,letterSpacing:"0.05em",textTransform:"uppercase" as const},
    saveBtn:{width:"100%",padding:"13px",borderRadius:10,border:"none",color:"#fff",background:`linear-gradient(135deg,${T_STATIC.udBlue},${T_STATIC.udAccent})`,fontSize:14,fontWeight:600 as const,cursor:"pointer",minHeight:44},
  };
  const handle=async()=>{
    if(!email||!password){setError("Ingresa tu correo y contraseña.");return;}
    try{
      setLoading(true);setError("");
      const session=await sbAuth.signIn(email,password);
      const profile=await sbAuth.getProfile(session.user.id,session.access_token);
      onLogin(session,profile);
    }catch(e:any){setError(e.message||"Correo o contraseña incorrectos.");}
    finally{setLoading(false);}
  };
  return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',system-ui,sans-serif",position:"relative",overflow:"hidden",background:`linear-gradient(135deg,${T_STATIC.dark} 0%,#0a1628 50%,#0d1f3c 100%)`}}>
      <div style={{position:"absolute",inset:0,overflow:"hidden",pointerEvents:"none"}}>
        {["∫","∑","π","∞","√","Δ","∇","λ","σ","α","β","γ","⚛","🧬"].map((sym,i)=>(
          <div key={i} style={{position:"absolute",left:`${(i*7.3)%100}%`,top:`${(i*11.7)%100}%`,fontSize:`${20+i%3*10}px`,color:`rgba(0,102,204,${0.05+i%3*0.04})`,fontFamily:"serif",transform:`rotate(${i*25}deg)`,userSelect:"none"}}>{sym}</div>
        ))}
        <div style={{position:"absolute",width:400,height:400,borderRadius:"50%",background:`radial-gradient(circle,rgba(0,48,135,0.3),transparent)`,top:"-10%",left:"-5%",filter:"blur(40px)"}}/>
        <div style={{position:"absolute",width:300,height:300,borderRadius:"50%",background:`radial-gradient(circle,rgba(0,102,204,0.2),transparent)`,bottom:"0",right:"10%",filter:"blur(40px)"}}/>
      </div>
      <div style={{width:"100%",maxWidth:420,padding:16,position:"relative",zIndex:1}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:16,marginBottom:32}}>
          <UDLogo/>
          <div style={{width:1,height:40,background:T_STATIC.border2}}/>
          <FCMNLogo/>
        </div>
        <div style={{background:"rgba(10,22,40,0.7)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderRadius:20,border:`1px solid rgba(0,102,204,0.3)`,padding:32,boxShadow:`0 25px 50px rgba(0,0,0,0.5)`}}>
          <div style={{textAlign:"center",marginBottom:28}}>
            <div style={{fontSize:13,fontWeight:600,color:"#60a5fa",letterSpacing:"0.15em",textTransform:"uppercase" as const,fontFamily:"Montserrat,sans-serif"}}>Sistema de Gestión de Espacios</div>
            <h1 style={{fontSize:24,fontWeight:800,color:"#fff",marginTop:6,fontFamily:"Montserrat,sans-serif"}}>Bienvenido</h1>
            <p style={{fontSize:13,color:T_STATIC.muted,marginTop:4}}>Ingresa con tu correo institucional</p>
          </div>
          <div style={{marginBottom:16}}>
            <label style={S_local.lbl}>Correo electrónico</label>
            <input style={S_local.inp} type="email" placeholder="usuario@udistrital.edu.co"
              value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()}/>
          </div>
          <div style={{marginBottom:20}}>
            <label style={S_local.lbl}>Contraseña</label>
            <input style={S_local.inp} type="password" placeholder="••••••••"
              value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()}/>
          </div>
          {error&&(
            <div style={{background:"rgba(239,68,68,0.12)",border:"1px solid rgba(239,68,68,0.3)",color:"#f87171",fontSize:13,padding:"10px 12px",borderRadius:8,marginBottom:16,display:"flex",gap:8}}>
              <span>⚠</span><span>{error}</span>
            </div>
          )}
          <button onClick={handle} disabled={loading} style={{...S_local.saveBtn,opacity:loading?0.8:1}}>
            {loading?"Verificando credenciales…":"Ingresar al Sistema"}
          </button>
          <div style={{marginTop:20,padding:"14px 16px",background:"rgba(0,48,135,0.2)",borderRadius:10,border:`1px solid rgba(0,102,204,0.2)`,fontSize:11,color:T_STATIC.muted,lineHeight:1.8}}>
            <div style={{color:T_STATIC.mutedLight,fontWeight:600,marginBottom:4,fontSize:12}}>Niveles de acceso:</div>
            <div>👑 <b style={{color:"#818cf8"}}>Super Admin</b> — Ver, crear y eliminar</div>
            <div>✏️ <b style={{color:"#4ade80"}}>Editor</b> — Ver y crear reservas</div>
            <div>👁️ <b style={{color:"#60a5fa"}}>Viewer</b> — Solo lectura</div>
          </div>
        </div>
        <div style={{textAlign:"center",marginTop:16,fontSize:11,color:T_STATIC.muted}}>
          © {new Date().getFullYear()} Universidad Distrital · FCMN
        </div>
      </div>
    </div>
  );
}

export default function App(){
  const { theme, toggle, T } = useTheme();
  const { isMobile } = useBreakpoint();
  const [mobileTab, setMobileTab] = useState<"grid"|"admin">("grid");
  const [extraModal, setExtraModal] = useState<{room:string;reservations:any[]}|null>(null);

  const S: Record<string,any> = {
    page: {width:"100%",minHeight:"100vh",background:T.bg,fontFamily:"'Inter',system-ui,sans-serif",color:T.text,overflowX:"hidden" as const,paddingBottom: isMobile ? 64 : 0},
    hdr: {width:"100%",background:T.bg3,borderBottom:`1px solid ${T.border}`,padding:"0 12px",height:56,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky" as const,top:0,zIndex:50,backdropFilter:"blur(10px)",boxSizing:"border-box" as const},
    addBtn:    {background:`linear-gradient(135deg,${T.udBlue},${T.udAccent})`,color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",fontSize:13,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6,boxShadow:`0 4px 15px rgba(0,102,204,0.3)`,minHeight:44},
    outlineBtn:{background:"transparent",border:`1px solid ${T.border}`,color:T.mutedL,borderRadius:8,padding:"7px 12px",fontSize:12,cursor:"pointer",minHeight:44},
    sCard:     {background:T.card,borderRadius:12,border:`1px solid ${T.border}`,padding:"16px 18px",display:"flex",alignItems:"center",gap:12,transition:"transform .2s,box-shadow .2s"},
    gridWrap:  {width:"100%",background:T.bg2,borderRadius:12,border:`1px solid ${T.border}`,overflow:"hidden"},
    th:        {color:T.muted,fontWeight:600,padding:"8px 6px",borderRight:`1px solid ${T.border}`,borderBottom:`1px solid ${T.border}`,textAlign:"center" as const,fontSize:10,minWidth:98,background:T.bg3},
    // ← CAMBIO: hourTd más ancho para mostrar rango
    hourTd:    {position:"sticky" as const,left:0,zIndex:10,background:T.bg2,color:T.mutedL,fontFamily:"monospace",fontWeight:700,padding:"4px 6px",borderRight:`1px solid ${T.border}`,borderBottom:`1px solid ${T.border}`,textAlign:"center" as const,fontSize:10,width:80},
    cell:      {borderRight:`1px solid ${T.border}`,borderBottom:`1px solid ${T.border}`,padding:2,height:56,verticalAlign:"top" as const},
    overlay:   {position:"fixed" as const,inset:0,zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:16,background:"rgba(0,0,0,0.85)",backdropFilter:"blur(8px)"},
    mBox:      {background:T.bg3,borderRadius:16,border:`1px solid ${T.border2}`,width:"100%",maxWidth:480,boxShadow:T.shadow,maxHeight:"90vh",overflowY:"auto" as const},
    inp:       {width:"100%",background:T.inputBg,border:`1px solid ${T.inputBorder}`,color:T.text,borderRadius:8,padding:"9px 12px",fontSize:16,outline:"none",boxSizing:"border-box" as const,minHeight:44},
    sel:       {width:"100%",background:T.inputBg,border:`1px solid ${T.inputBorder}`,color:T.text,borderRadius:8,padding:"9px 12px",fontSize:16,outline:"none",minHeight:44},
    lbl:       {display:"block" as const,fontSize:11,fontWeight:500 as const,color:T.muted,marginBottom:5,letterSpacing:"0.05em",textTransform:"uppercase" as const},
    saveBtn:   {flex:1,padding:"11px",borderRadius:8,border:"none",color:"#fff",background:`linear-gradient(135deg,${T.udBlue},${T.udAccent})`,fontSize:13,fontWeight:600 as const,cursor:"pointer",minHeight:44},
    cancelBtn: {flex:1,padding:"11px",borderRadius:8,border:`1px solid ${T.border2}`,color:T.mutedL,background:"transparent",fontSize:13,fontWeight:500 as const,cursor:"pointer",minHeight:44},
    dayBtn:    (a:boolean)=>({padding:"7px 16px",borderRadius:8,fontSize:12,fontWeight:500 as const,cursor:"pointer",border:a?"none":`1px solid ${T.border}`,background:a?`linear-gradient(135deg,${T.udBlue},${T.udAccent})`:T.bg3,color:a?"#fff":T.mutedL,transition:"all .15s",boxShadow:a?`0 4px 12px rgba(0,102,204,0.3)`:"none",minHeight:44}),
  };

  const globalStyle = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Montserrat:wght@600;700;800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #root { width: 100%; min-height: 100vh; overflow-x: hidden; }
    body { font-family: 'Inter', system-ui, sans-serif; background: ${T.bg}; color: ${T.text}; transition: background 0.3s, color 0.3s; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: ${T.bg2}; }
    ::-webkit-scrollbar-thumb { background: ${T.border2}; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: ${T.udAccent}; }
    @media (max-width: 768px) {
      .hide-mobile { display: none !important; }
      .header-actions { gap: 4px !important; }
      .stats-grid { grid-template-columns: repeat(2,1fr) !important; }
      .day-tabs { gap: 4px !important; overflow-x: auto; flex-wrap: nowrap !important; padding-bottom: 4px; }
      .day-tab { padding: 5px 10px !important; font-size: 11px !important; white-space: nowrap; }
    }
  `;

  const [session,setSession]=useState<any>(null);
  const [profile,setProfile]=useState<any>(null);
  const [reservations,setReservations]=useState<any[]>([]);
  const [selDay,setSelDay]=useState("Lunes");
  const [modal,setModal]=useState(false);
  const [exportModal,setExportModal]=useState(false);
  const [autoScheduler,setAutoScheduler]=useState(false);
  const [searchQuery,setSearchQuery]=useState("");
  const [searchOpen,setSearchOpen]=useState(false);
  const [form,setForm]=useState(EMPTY);
  const [err,setErr]=useState("");
  const [toast,setToast]=useState({msg:"",type:"ok"});
  const [hovered,setHovered]=useState<number|null>(null);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [vistaEspacio,setVistaEspacio]=useState<"teoria"|"lab">("teoria");
  const [spacesModal,setSpacesModal]=useState(false);
  const [spaces,setSpaces]=useState<Space[]>([]);
  const [dashboard,setDashboard]=useState(false);
  const [reservasExt,setReservasExt]=useState(false);
  const [spacesLoaded,setSpacesLoaded]=useState(false);
  const [teacherView, setTeacherView] = useState(false);

  const role=profile?.role||"viewer";
  const isSuperAdmin=role==="superadmin";
  const isEditor=role==="editor";
  const canCreate=isSuperAdmin||isEditor;
  const canDelete=isSuperAdmin;
  const roleInfo=ROLE_CONFIG[role]||ROLE_CONFIG.viewer;

  const showToast=(msg:string,type="ok")=>{
    setToast({msg,type});
    setTimeout(()=>setToast({msg:"",type:"ok"}),3000);
  };

  const handleLogin=async(sess:any,prof:any)=>{
    const freshProfile=await sbAuth.getProfile(sess.user.id,sess.access_token);
    setSession(sess);
    setProfile(freshProfile||prof);
  };

  const handleLogout=async()=>{
    if(session)await sbAuth.signOut(session.access_token);
    setSession(null);setProfile(null);setReservations([]);
  };

  const load=useCallback(async()=>{
    if(!session)return;
    try{setLoading(true);setReservations(await sbDb.getReservations(session.access_token));}
    catch{showToast("Error al cargar reservas","err");}
    finally{setLoading(false);}
  },[session]);

  const loadSpaces=useCallback(async()=>{
    if(!session)return;
    try{
      const res=await fetch(`${SUPABASE_URL}/rest/v1/spaces?select=*&activo=eq.true&order=tipo.asc,nombre.asc`,
        {headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${session.access_token}`}});
      const data=await res.json();
      setSpaces(data);setSpacesLoaded(true);
    }catch{showToast("Error al cargar espacios","err");}
  },[session]);

  useEffect(()=>{
    if(!session)return;
    load();loadSpaces();
    const channel=supabaseRealtime.channel("reservations-changes")
      .on("postgres_changes",{event:"*",schema:"public",table:"reservations"},(payload)=>{
        if(payload.eventType==="INSERT"){
          setReservations(prev=>{
            const exists=prev.find(r=>r.id===(payload.new as any).id);
            if(exists)return prev;
            showToast("📅 Nueva reserva agregada");
            return[...prev,payload.new as any];
          });
        }
        if(payload.eventType==="DELETE"){
          setReservations(prev=>{
            showToast("🗑️ Reserva eliminada","warn");
            return prev.filter(r=>r.id!==(payload.old as any).id);
          });
        }
      }).subscribe();
    return()=>{supabaseRealtime.removeChannel(channel);};
  },[session]);

  const highlightedIds=useMemo(()=>{
    if(!searchQuery.trim())return new Set<number>();
    const q=searchQuery.toLowerCase();
    return new Set(reservations.filter(r=>
      r.teacher.toLowerCase().includes(q)||r.subject.toLowerCase().includes(q)||
      r.room.toLowerCase().includes(q)||r.program.toLowerCase().includes(q)
    ).map(r=>r.id));
  },[reservations,searchQuery]);

  const resMap=useMemo(()=>{
    const today = todayStr(); // ← CAMBIO
    const m:Record<string,any>={};
    reservations
      .filter(r=>vistaEspacio==="lab"?r.tipo_espacio==="lab":r.tipo_espacio!=="lab")
      .filter(r=>!r.specific_date || r.specific_date >= today) // ← CAMBIO: ocultar pasadas
      .forEach(r=>{
        getHoursBetween(r.hour,r.hour_end||r.hour).forEach(h=>{
          m[`${r.day}|${h}|${r.room}`]=r;
        });
      });
    return m;
  },[reservations,vistaEspacio]);

  const extraCountMap = useMemo(()=>{
    const today = todayStr(); // ← CAMBIO
    const m: Record<string,any[]> = {};
    reservations
      .filter(r=>(r.tipo_reserva==="extraordinaria"||r.tipo_reserva==="bloqueo")&&
        (vistaEspacio==="lab"?r.tipo_espacio==="lab":r.tipo_espacio!=="lab"))
      .filter(r=>!r.specific_date || r.specific_date >= today) // ← CAMBIO: ocultar pasadas
      .forEach(r=>{
        getHoursBetween(r.hour,r.hour_end||r.hour).forEach(h=>{
          const key=`${r.day}|${h}|${r.room}`;
          if(!m[key])m[key]=[];
          if(!m[key].find((x:any)=>x.id===r.id))m[key].push(r);
        });
      });
    return m;
  },[reservations,vistaEspacio]);

  const firstHourMap=useMemo(()=>{
    const m:Record<number,string>={};
    reservations.forEach(r=>{m[r.id]=r.hour;});
    return m;
  },[reservations]);

  const currentRooms=spacesLoaded
    ?spaces.filter(s=>vistaEspacio==="lab"?s.tipo==="Laboratorio":s.tipo==="Teoria").map(s=>s.nombre)
    :(vistaEspacio==="lab"?LAB_ROOMS_NAMES:ROOMS);

  const currentHours=spacesLoaded&&spaces.length>0
    ?(()=>{
      const tipoActual=vistaEspacio==="lab"?"Laboratorio":"Teoria";
      const spacesDelTipo=spaces.filter(s=>s.tipo===tipoActual);
      if(spacesDelTipo.length===0)return HOURS;
      const minApertura=spacesDelTipo.map(s=>s.hora_apertura).sort()[0];
      const maxCierre=spacesDelTipo.map(s=>s.hora_cierre).sort().reverse()[0];
      return HOURS.filter(h=>h>=minApertura&&h<=maxCierre);
    })()
    :HOURS;

  const openModal=(room="",hour="")=>{
    const preProgram=(!isSuperAdmin&&profile?.program)?profile.program:"";
    setForm({...EMPTY,day:selDay,room,hour,hour_end:hour,program:preProgram});
    setErr("");setModal(true);
  };
  const closeModal=()=>{setModal(false);setErr("");};
  const upd=(p:any)=>setForm(f=>({...f,...p}));

  const save=async()=>{
    const{program,subject,teacher,day,hour,hour_end,room}=form;
    if(!program||!subject||!teacher||!hour||!hour_end||!room){setErr("Todos los campos son obligatorios.");return;}
    const blockHours=getHoursBetween(hour,hour_end);
    for(const h of blockHours){
      if(resMap[`${day}|${h}|${room}`]){setErr(`El salón "${room}" ya está ocupado el ${day} a las ${h}.`);return;}
      const clash=reservations.find(r=>{
        const rH=getHoursBetween(r.hour,r.hour_end||r.hour);
        return r.day===day&&rH.includes(h)&&r.teacher.trim().toLowerCase()===teacher.trim().toLowerCase();
      });
      if(clash){setErr(`"${teacher}" ya tiene clase en ${clash.room} a las ${h}.`);return;}
    }
    try{
      setSaving(true);
      const tipo_espacio=vistaEspacio==="lab"?"lab":"teoria";
      const saved=await sbDb.insert({program,subject,teacher,day,hour,hour_end,room,tipo_espacio},session.access_token);
      setReservations(p=>[...p,saved]);
      showToast(`✓ Reserva guardada · ${blockHours.length} bloque${blockHours.length>1?"s":""}`);
      closeModal();
    }catch{setErr("Error al guardar.");}
    finally{setSaving(false);}
  };

  const del=async(id:number)=>{
    try{
      await sbDb.remove(id,session.access_token);
      setReservations(p=>p.filter(r=>r.id!==id));
      showToast("Reserva eliminada","warn");
    }catch{showToast("Error al eliminar","err");}
  };

  if(!session)return(<><style>{globalStyle}</style><LoginScreen onLogin={handleLogin}/></>);

  const isSearchActive=searchQuery.trim().length>0;

  const MobileAdminMenu = () => (
    <div style={{padding:16,display:"flex",flexDirection:"column",gap:10}}>
      <div style={{fontSize:12,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4}}>
        Acciones disponibles
      </div>
      {canCreate&&(
        <button onClick={()=>openModal()} style={{...S.addBtn,justifyContent:"center",fontSize:14}}>
          ＋ Nueva Reserva
        </button>
      )}
      <button onClick={()=>setExportModal(true)}
        style={{...S.outlineBtn,width:"100%",textAlign:"center" as const,padding:"12px"}}>
        📊 Exportar Reporte
      </button>
      {isSuperAdmin&&(
        <>
          <button onClick={()=>setAutoScheduler(true)}
            style={{...S.outlineBtn,width:"100%",textAlign:"center" as const,padding:"12px",borderColor:T.udAccent,color:"#60a5fa"}}>
            🤖 Auto-Horario
          </button>
          <button onClick={()=>setSpacesModal(true)}
            style={{...S.outlineBtn,width:"100%",textAlign:"center" as const,padding:"12px",borderColor:"#a78bfa",color:"#a78bfa"}}>
            🏛️ Gestión de Espacios
          </button>
          <button onClick={()=>setReservasExt(true)}
            style={{...S.outlineBtn,width:"100%",textAlign:"center" as const,padding:"12px",borderColor:"#4ade80",color:"#4ade80"}}>
            ⭐ Reservas Extraordinarias
          </button>
          <button onClick={()=>setDashboard(true)}
            style={{...S.outlineBtn,width:"100%",textAlign:"center" as const,padding:"12px",borderColor:"#f472b6",color:"#f472b6"}}>
            📊 Dashboard
          </button>
        </>
      )}
      {(isSuperAdmin||isEditor)&&(
        <button onClick={()=>setTeacherView(true)}
          style={{...S.outlineBtn,width:"100%",textAlign:"center" as const,padding:"12px",borderColor:"#60a5fa",color:"#60a5fa"}}>
          👤 Vista Docentes
        </button>
      )}
      <div style={{marginTop:8,padding:"12px 16px",background:T.bg2,borderRadius:10,border:`1px solid ${T.border}`}}>
        <div style={{fontSize:12,color:T.muted,marginBottom:8,fontWeight:600}}>Sesión activa</div>
        <div style={{fontSize:13,color:T.text,fontWeight:600}}>{profile?.email}</div>
        <div style={{fontSize:11,color:roleInfo.color,marginTop:2}}>{roleInfo.icon} {roleInfo.label}{profile?.program?` · ${profile.program}`:""}</div>
        <button onClick={handleLogout} style={{...S.outlineBtn,width:"100%",marginTop:12,padding:"10px",textAlign:"center" as const}}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );

  return(
    <>
      <style>{globalStyle}</style>
      <div style={S.page}>

        <header style={S.hdr}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <UDLogo/>
            <div style={{width:1,height:36,background:T.border2}} className="hide-mobile"/>
            <FCMNLogo/>
            <div style={{width:1,height:36,background:T.border2}} className="hide-mobile"/>
            <div className="hide-mobile">
              <div style={{fontSize:11,fontWeight:600,color:T.mutedL,fontFamily:"Montserrat,sans-serif"}}>Gestión de Espacios</div>
              <div style={{fontSize:10,color:T.muted}}>Sistema de Reservas Académicas</div>
            </div>
          </div>

          <div style={{display:"flex",alignItems:"center",gap:6}} className="header-actions">
            <div style={{position:"relative"}} className="hide-mobile">
              <input type="text" placeholder="🔍 Buscar docente, asignatura…"
                value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&searchQuery.trim())setSearchOpen(true);}}
                style={{background:T.inputBg,border:`1px solid ${isSearchActive?T.udAccent:T.inputBorder}`,color:T.text,borderRadius:8,padding:"7px 32px 7px 12px",fontSize:12,outline:"none",width:240}}/>
              {searchQuery&&(
                <button onClick={()=>setSearchQuery("")} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:14}}>✕</button>
              )}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:loading?"#f59e0b":"#4ade80"}} className="hide-mobile">
              <span style={{width:7,height:7,borderRadius:"50%",background:loading?"#f59e0b":"#4ade80",boxShadow:`0 0 6px ${loading?"#f59e0b":"#4ade80"}`,display:"inline-block"}}/>
              {loading?"Sync…":"Online"}
            </div>
            {toast.msg&&(
              <span style={{fontSize:11,padding:"5px 10px",borderRadius:8,
                color:toast.type==="err"?"#f87171":toast.type==="warn"?"#fb923c":"#4ade80",
                background:toast.type==="err"?"rgba(248,113,113,0.1)":toast.type==="warn"?"rgba(251,146,60,0.1)":"rgba(74,222,128,0.1)",
                border:`1px solid ${toast.type==="err"?"rgba(248,113,113,0.25)":toast.type==="warn"?"rgba(251,146,60,0.25)":"rgba(74,222,128,0.25)"}`}}>
                {toast.msg}
              </span>
            )}
            <div style={{display:"flex",alignItems:"center",gap:8,background:T.bg3,borderRadius:8,padding:"6px 12px",border:`1px solid ${T.border}`}} className="hide-mobile">
              <div style={{width:28,height:28,borderRadius:"50%",background:`linear-gradient(135deg,${T.udBlue},${T.udAccent})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>
                {roleInfo.icon}
              </div>
              <div>
                <div style={{fontSize:11,color:T.text,fontWeight:600}}>{profile?.email?.split("@")[0]}</div>
                <div style={{fontSize:10,color:roleInfo.color}}>{roleInfo.label}{profile?.program?` · ${profile.program}`:""}</div>
              </div>
            </div>
            <button style={S.outlineBtn} onClick={()=>setExportModal(true)} className="hide-mobile">📊 Exportar</button>
            {isSuperAdmin&&<button style={{...S.outlineBtn,borderColor:T.udAccent,color:"#60a5fa"}} onClick={()=>setAutoScheduler(true)} className="hide-mobile">🤖 Auto-Horario</button>}
            {isSuperAdmin&&<button style={{...S.outlineBtn,borderColor:"#a78bfa",color:"#a78bfa"}} onClick={()=>setSpacesModal(true)} className="hide-mobile">🏛️ Espacios</button>}
            {isSuperAdmin&&<button style={{...S.outlineBtn,borderColor:"#4ade80",color:"#4ade80"}} onClick={()=>setReservasExt(true)} className="hide-mobile">⭐ Reservas</button>}
            {isSuperAdmin&&<button style={{...S.outlineBtn,borderColor:"#f472b6",color:"#f472b6"}} onClick={()=>setDashboard(true)} className="hide-mobile">📊 Dashboard</button>}
            {(isSuperAdmin||isEditor)&&<button style={{...S.outlineBtn,borderColor:"#60a5fa",color:"#60a5fa"}} onClick={()=>setTeacherView(true)} className="hide-mobile">👤 Docentes</button>}
            <button onClick={toggle} title={theme==="dark"?"Modo claro":"Modo oscuro"}
              style={{background:"transparent",border:`1px solid ${T.border2}`,borderRadius:8,
                padding:"6px 10px",cursor:"pointer",fontSize:16,color:T.text,
                minWidth:44,minHeight:44,display:"flex",alignItems:"center",justifyContent:"center"}}>
              {theme==="dark"?"☀️":"🌙"}
            </button>
            {canCreate&&(
              <button style={S.addBtn} onClick={()=>openModal()} className="hide-mobile">
                <span style={{fontSize:16,lineHeight:1}}>＋</span>
                <span>Nueva Reserva</span>
              </button>
            )}
            <button onClick={handleLogout} style={S.outlineBtn} className="hide-mobile">Salir</button>
          </div>
        </header>

        {isMobile ? (
          <div style={{flex:1}}>
            {mobileTab === "grid" ? (
              <MobileGrid
                reservations={reservations}
                onCellClick={r => {
                  if(r.tipo_reserva==="extraordinaria"||r.tipo_reserva==="bloqueo"){
                    const roomExtras = reservations.filter(x=>
  x.room===r.room && x.day===r.day &&
  (x.tipo_reserva==="extraordinaria"||x.tipo_reserva==="bloqueo") &&
  (!x.specific_date || x.specific_date >= todayStr())
).sort((a:any,b:any)=>a.specific_date>b.specific_date?1:-1);
                    setExtraModal({room:r.room, reservations:roomExtras});
                  }
                }}
              />
            ) : (
              <MobileAdminMenu />
            )}
          </div>
        ) : (
          <div style={{width:"100%",padding:"16px 20px",boxSizing:"border-box"}}>

            {isSearchActive&&(
              <div style={{background:"rgba(0,102,204,0.1)",border:`1px solid rgba(0,102,204,0.3)`,borderRadius:10,padding:"10px 16px",marginBottom:16,fontSize:13,color:"#93c5fd",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span>🔍 "<b>{searchQuery}</b>" — <b style={{color:"#60a5fa"}}>{highlightedIds.size}</b> resultado{highlightedIds.size!==1?"s":""}</span>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setSearchOpen(true)} style={{background:"rgba(0,102,204,0.2)",border:`1px solid rgba(0,102,204,0.4)`,color:"#60a5fa",borderRadius:6,padding:"4px 10px",fontSize:11,cursor:"pointer"}}>Ver lista</button>
                  <button onClick={()=>setSearchQuery("")} style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer"}}>✕</button>
                </div>
              </div>
            )}

            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}} className="stats-grid">
              {Object.entries(PROGRAMS).map(([prog,{color,icon,iconBg}])=>{
                const n=reservations.filter(r=>r.program===prog).length;
                return(
                  <div key={prog} style={S.sCard}
                    onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.transform="translateY(-2px)";(e.currentTarget as HTMLElement).style.boxShadow=`0 8px 25px rgba(0,0,0,0.3)`;}}
                    onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform="translateY(0)";(e.currentTarget as HTMLElement).style.boxShadow="none";}}>
                    <div style={{width:42,height:42,borderRadius:10,background:iconBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0,border:`1px solid ${color}30`}}>{icon}</div>
                    <div>
                      <div style={{fontSize:11,color:T.muted,fontWeight:500}}>{prog}</div>
                      <div style={{fontSize:26,fontWeight:800,color:T.text,lineHeight:1.1,fontFamily:"Montserrat,sans-serif"}}>{n}</div>
                      <div style={{fontSize:10,color}}>reserva{n!==1?"s":""}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {!canCreate&&(
              <div style={{background:`rgba(0,102,204,0.08)`,border:`1px solid rgba(0,102,204,0.2)`,borderRadius:10,padding:"10px 16px",marginBottom:16,fontSize:13,color:"#93c5fd",display:"flex",gap:8}}>
                👁️ Estás en <b>modo lectura</b>. Contacta al administrador para obtener acceso.
              </div>
            )}
            {isEditor&&(
              <div style={{background:"rgba(74,222,128,0.06)",border:"1px solid rgba(74,222,128,0.18)",borderRadius:10,padding:"10px 16px",marginBottom:16,fontSize:13,color:"#86efac",display:"flex",gap:8}}>
                ✏️ Puedes <b>crear reservas</b>{profile?.program?` para ${profile.program}`:""}.{" "}Solo el Super Admin puede eliminar.
              </div>
            )}

            <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center"}}>
              <span style={{fontSize:12,color:T.muted,fontWeight:600}}>Vista:</span>
              <button onClick={()=>setVistaEspacio("teoria")}
                style={{padding:"7px 16px",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",border:`1px solid ${vistaEspacio==="teoria"?T.udAccent:T.border}`,background:vistaEspacio==="teoria"?"rgba(0,102,204,0.15)":T.bg3,color:vistaEspacio==="teoria"?"#60a5fa":T.muted,transition:"all .15s"}}>
                🏫 Salones Teoría
              </button>
              <button onClick={()=>setVistaEspacio("lab")}
                style={{padding:"7px 16px",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",border:`1px solid ${vistaEspacio==="lab"?"#4ade80":T.border}`,background:vistaEspacio==="lab"?"rgba(74,222,128,0.1)":T.bg3,color:vistaEspacio==="lab"?"#4ade80":T.muted,transition:"all .15s"}}>
                🔬 Laboratorios Macarena B
              </button>
              <span style={{fontSize:11,color:T.muted,marginLeft:4}}>
                {vistaEspacio==="lab"?`${LAB_ROOMS_NAMES.length} laboratorios`:`${ROOMS.length} salones`}
              </span>
            </div>

            <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}} className="day-tabs">
              {DAYS.map(d=>{
                const n=reservations.filter(r=>r.day===d).length;
                const nh=isSearchActive?reservations.filter(r=>r.day===d&&highlightedIds.has(r.id)).length:0;
                return(
                  <button key={d} style={S.dayBtn(selDay===d)} onClick={()=>setSelDay(d)} className="day-tab">
                    {d}
                    {n>0&&<span style={{marginLeft:5,fontSize:10,background:"rgba(255,255,255,0.2)",borderRadius:99,padding:"1px 6px"}}>{n}</span>}
                    {isSearchActive&&nh>0&&<span style={{marginLeft:4,fontSize:10,background:"rgba(0,102,204,0.4)",borderRadius:99,padding:"1px 5px",color:"#bfdbfe"}}>🔍{nh}</span>}
                  </button>
                );
              })}
            </div>

            {loading?(
              <div style={{...S.gridWrap,padding:60,textAlign:"center"}}>
                <div style={{fontSize:40,marginBottom:16}}>⚛️</div>
                <div style={{color:T.muted,fontSize:14,fontFamily:"Montserrat,sans-serif"}}>Cargando reservas…</div>
              </div>
            ):(
              <div style={S.gridWrap}>
                <div style={{padding:"12px 18px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",background:T.bg3}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,color:T.text,fontFamily:"Montserrat,sans-serif"}}>
                      {selDay} — {vistaEspacio==="lab"?"🔬 Laboratorios Macarena B":"🏫 Salones Teoría"}
                    </div>
                    <div style={{fontSize:11,color:T.muted,marginTop:2}}>
                      {reservations.filter(r=>r.day===selDay).length} reserva(s)
                      {isSuperAdmin&&" · Hover para eliminar"}
                      {isEditor&&" · Clic en celda vacía para reservar"}
                      {!canCreate&&" · Modo solo lectura"}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
                    {Object.entries(PROGRAMS).map(([prog,{color,icon}])=>(
                      <span key={prog} style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:T.muted}}>
                        <span>{icon}</span><span style={{color}}>{prog}</span>
                      </span>
                    ))}
                    <span style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:T.muted}}>
                      <span>⭐</span><span style={{color:"#c084fc"}}>Extraordinaria</span>
                    </span>
                  </div>
                </div>
                <div style={{overflowX:"auto"}}>
                  <table style={{borderCollapse:"collapse",minWidth:currentRooms.length*100+90}}>
                    <thead>
                      <tr>
                        {/* ← CAMBIO: header Hora más ancho */}
                        <th style={{...S.th,position:"sticky" as const,left:0,zIndex:10,textAlign:"left" as const,paddingLeft:8,width:80}}>Hora</th>
                        {currentRooms.map(room=>(
                          <th key={room} style={S.th}>
                            <span style={{display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:90}} title={room}>{room}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {currentHours.map(hour=>(
                        <tr key={hour} style={{background:T.bg2}}>
                          {/* ← CAMBIO: mostrar rango "06:00 a 07:00" */}
                          <td style={S.hourTd}>
                            <span style={{display:"block",fontSize:11,fontWeight:700}}>{hour}</span>
                            <span style={{display:"block",fontSize:9,color:T.muted,fontWeight:400}}>
                              a {HOURS[HOURS.indexOf(hour)+1] || hour}
                            </span>
                          </td>
                          {currentRooms.map(room=>{
                            const res=resMap[`${selDay}|${hour}|${room}`];
                            const spaceConfig=spacesLoaded?spaces.find(s=>s.nombre===room):null;
                            const isClosed=spaceConfig?(hour<spaceConfig.hora_apertura||hour>=spaceConfig.hora_cierre):false;
                            const cellKey=`${selDay}|${hour}|${room}`;
                            const extraGroup=extraCountMap[cellKey];
                            const isGrouped=extraGroup&&extraGroup.length>1;
                            const isExtra=res&&(res.tipo_reserva==="extraordinaria"||res.tipo_reserva==="bloqueo");
                            const prog=res?(PROGRAMS[res.program]||PROGRAMS["Biología"]):null;
                            const cellColor=isExtra||isGrouped
                              ?{color:"#c084fc",bg:"rgba(147,51,234,0.18)",border:"#9333ea",icon:res?.tipo_reserva==="bloqueo"?"🔒":"⭐"}
                              :prog?{color:prog.color,bg:prog.bg,border:prog.border,icon:prog.icon}
                              :null;
                            const isFirst=res&&firstHourMap[res.id]===hour;
                            const isContinuation=res&&!isFirst;
                            const isHighlighted=res&&highlightedIds.has(res.id);
                            const isDimmed=isSearchActive&&res&&!isHighlighted;
                            const tooltipText=isExtra&&res.specific_date
                              ?`${res.tipo_reserva==="bloqueo"?"🔒 Bloqueado":"⭐ Extraordinaria"} · ${new Date(res.specific_date+"T12:00:00").toLocaleDateString("es-CO",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}`
                              :isGrouped?`⭐ ${extraGroup.length} reservas programadas en este horario`
                              :undefined;
                            return(
                              <td key={room} style={S.cell}>
                                {isClosed?(
                                  <div style={{height:"100%",background:"rgba(0,0,0,0.35)",borderRadius:5,display:"flex",alignItems:"center",justifyContent:"center",cursor:"not-allowed"}}>
                                    <span style={{fontSize:10,color:"#374151",fontWeight:700}}>🔒</span>
                                  </div>
                                ):isGrouped?(
                                  <div
                                    title={tooltipText}
                                    onClick={()=>{
                                      const roomExtras=reservations.filter(r=>
  r.room===room&&r.day===selDay&&
  (r.tipo_reserva==="extraordinaria"||r.tipo_reserva==="bloqueo") &&
  (!r.specific_date || r.specific_date >= todayStr())
).sort((a,b)=>a.specific_date>b.specific_date?1:-1);
                                      setExtraModal({room,reservations:roomExtras});
                                    }}
                                    style={{height:"100%",borderRadius:5,padding:"3px 6px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"rgba(147,51,234,0.22)",borderLeft:"3px solid #9333ea",border:"1px dashed #9333ea",cursor:"pointer",gap:2,transition:"background .15s"}}
                                    onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background="rgba(147,51,234,0.35)"}
                                    onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background="rgba(147,51,234,0.22)"}>
                                    <span style={{fontSize:14}}>⭐</span>
                                    <div style={{fontSize:9,color:"#c084fc",fontWeight:700,textAlign:"center",lineHeight:1.2}}>{extraGroup.length} reservas</div>
                                    <div style={{fontSize:8,color:"#a855f7",textAlign:"center"}}>programadas</div>
                                  </div>
                                ):res?(
                                  <div
                                    onMouseEnter={()=>canDelete&&isFirst&&setHovered(res.id)}
                                    onMouseLeave={()=>setHovered(null)}
                                    onClick={()=>{
                                      if(isExtra&&isFirst){
                                        const roomExtras=reservations.filter(r=>
  r.room===res.room&&r.day===selDay&&
  (r.tipo_reserva==="extraordinaria"||r.tipo_reserva==="bloqueo") &&
  (!r.specific_date || r.specific_date >= todayStr())
).sort((a,b)=>a.specific_date>b.specific_date?1:-1);
                                        setExtraModal({room:res.room,reservations:roomExtras});
                                      }
                                    }}
                                    title={tooltipText}
                                    style={{height:"100%",borderRadius:5,padding:"3px 6px",display:"flex",flexDirection:"column",justifyContent:"center",background:cellColor!.bg,borderLeft:`3px solid ${cellColor!.border}`,borderTop:isContinuation?`1px dashed ${cellColor!.border}25`:"none",position:"relative",cursor:isExtra?"pointer":"default",opacity:isDimmed?0.2:isContinuation?0.65:1,boxShadow:isHighlighted&&isFirst?`0 0 0 2px ${cellColor!.color}`:"none",transition:"opacity .2s"}}>
                                    {isFirst&&(
                                      <>
                                        <div style={{fontWeight:700,fontSize:10,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:3}}>
                                          <span style={{fontSize:9}}>{cellColor!.icon}</span>
                                          <span title={res.subject}>{res.subject}</span>
                                        </div>
                                        <div style={{fontSize:10,color:T.mutedL,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={res.teacher}>{res.teacher}</div>
                                        {res.hour_end&&res.hour_end!==res.hour&&(
                                          <div style={{fontSize:9,color:cellColor!.color}}>⏱ {res.hour}–{res.hour_end}</div>
                                        )}
                                        {isExtra&&(
                                          <div style={{fontSize:9,color:"#c084fc",marginTop:1}}>
                                            {res.tipo_reserva==="bloqueo"?"🔒 Bloqueado":"⭐ Extraordinaria"}
                                          </div>
                                        )}
                                      </>
                                    )}
                                    {isContinuation&&<div style={{fontSize:9,color:cellColor!.color,textAlign:"center"}}>┃</div>}
                                    {canDelete&&isFirst&&hovered===res.id&&(
                                      <button onClick={e=>{e.stopPropagation();del(res.id);}}
                                        style={{position:"absolute",top:2,right:2,color:"#f87171",background:"rgba(6,8,24,0.9)",border:"none",borderRadius:4,padding:"0 4px",fontSize:10,fontWeight:700,cursor:"pointer",lineHeight:"16px"}}>✕</button>
                                    )}
                                  </div>
                                ):canCreate?(
                                  <div onClick={()=>openModal(room,hour)}
                                    style={{height:"100%",borderRadius:5,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}
                                    onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background=`rgba(0,102,204,0.12)`;(e.currentTarget as HTMLElement).style.outline=`1px dashed rgba(0,102,204,0.4)`;}}
                                    onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="transparent";(e.currentTarget as HTMLElement).style.outline="none";}}>
                                    <span style={{color:"rgba(0,102,204,0.3)",fontSize:18}}>+</span>
                                  </div>
                                ):<div style={{height:"100%"}}/>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {isMobile&&(
          <nav style={{position:"fixed",bottom:0,left:0,right:0,zIndex:100,background:T.bg2,borderTop:`1px solid ${T.border}`,display:"flex",height:60,paddingBottom:"env(safe-area-inset-bottom)"}}>
            {[
              {key:"grid",  icon:"📅", label:"Horario"},
              {key:"admin", icon:"⚙️",  label:"Gestión"},
            ].map(item=>(
              <button key={item.key} onClick={()=>setMobileTab(item.key as any)} style={{
                flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                gap:2,border:"none",cursor:"pointer",background:"transparent",
                color:mobileTab===item.key?T.udAccent:T.muted,
                fontSize:10,fontWeight:600,
                borderTop:mobileTab===item.key?`2px solid ${T.udAccent}`:"2px solid transparent",
                transition:"color 0.15s",minWidth:44,
              }}>
                <span style={{fontSize:22}}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
        )}

        {exportModal&&<ExportModal reservations={reservations} onClose={()=>setExportModal(false)}/>}
        {searchOpen&&<SearchModal reservations={reservations} query={searchQuery} onClose={()=>setSearchOpen(false)} onJump={d=>{setSelDay(d);}}/>}
        {autoScheduler&&(
          <AutoScheduler session={session} spaces={spaces} onClose={()=>setAutoScheduler(false)}
            onSaved={(count)=>{setAutoScheduler(false);showToast(`✓ ${count} reservas generadas automáticamente`);setTimeout(()=>load(),500);}}/>
        )}
        {spacesModal&&<SpacesManager session={session} onClose={()=>{setSpacesModal(false);loadSpaces();}}/>}
        {dashboard&&<Dashboard reservations={reservations} spaces={spaces} session={session} onClose={()=>setDashboard(false)}/>}
        {reservasExt&&(
          <ReservasExtraordinarias session={session} reservations={reservations} spaces={spaces}
            onClose={()=>setReservasExt(false)} onSaved={()=>{setReservasExt(false);load();}}/>
        )}
        {teacherView&&<TeacherView reservations={reservations} onClose={()=>setTeacherView(false)}/>}

        {extraModal&&(
          <div style={S.overlay} onClick={e=>{if(e.target===e.currentTarget)setExtraModal(null);}}>
            <div style={{...S.mBox,maxWidth:520}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 22px",borderBottom:`1px solid ${T.border}`,background:T.bg3}}>
                <div>
                  <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:"Montserrat,sans-serif"}}>⭐ Reservas Extraordinarias</div>
                  <div style={{fontSize:11,color:"#c084fc",marginTop:2}}>📍 {extraModal.room} · {extraModal.reservations.length} reserva{extraModal.reservations.length!==1?"s":""}</div>
                </div>
                <button onClick={()=>setExtraModal(null)} style={{background:"transparent",border:"none",color:T.muted,fontSize:20,cursor:"pointer",minWidth:44,minHeight:44}}>✕</button>
              </div>
              <div style={{padding:16,maxHeight:480,overflowY:"auto",display:"flex",flexDirection:"column",gap:10}}>
                {extraModal.reservations.length===0?(
                  <div style={{textAlign:"center",padding:40,color:T.muted}}>Sin reservas extraordinarias para este espacio.</div>
                ):extraModal.reservations.map(r=>{
                  const isBloqueo=r.tipo_reserva==="bloqueo";
                  const fechaStr=r.specific_date
                    ?new Date(r.specific_date+"T12:00:00").toLocaleDateString("es-CO",{weekday:"long",year:"numeric",month:"long",day:"numeric"})
                    :"Fecha no especificada";
                  return(
                    <div key={r.id} style={{background:T.bg2,borderRadius:10,padding:"12px 16px",border:`1px solid rgba(147,51,234,0.3)`,borderLeft:`3px solid ${isBloqueo?"#ef4444":"#9333ea"}`}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                        <span style={{fontSize:12,fontWeight:700,color:isBloqueo?"#f87171":"#c084fc"}}>{isBloqueo?"🔒 Bloqueo":"⭐ Extraordinaria"}</span>
                        {/* ← CAMBIO: rango de hora en modal detalle */}
                        <span style={{fontSize:11,color:T.muted,background:T.bg3,padding:"2px 10px",borderRadius:99}}>
                          {r.hour_end && r.hour_end !== r.hour ? `${r.hour} a ${r.hour_end}` : hourRangeLabel(r.hour)}
                        </span>
                      </div>
                      <div style={{fontSize:13,color:T.text,fontWeight:600,marginBottom:4}}>📅 {fechaStr}</div>
                      {r.subject&&<div style={{fontSize:12,color:T.mutedL,marginBottom:2}}>📚 {r.subject}</div>}
                      {r.teacher&&<div style={{fontSize:12,color:T.mutedL,marginBottom:2}}>👤 {r.teacher}</div>}
                      {r.program&&<div style={{fontSize:11,color:PROGRAMS[r.program]?.color||T.muted}}>{PROGRAMS[r.program]?.icon} {r.program}</div>}
                      {r.motivo&&<div style={{marginTop:6,fontSize:11,color:T.muted,background:T.bg,borderRadius:6,padding:"6px 10px",border:`1px solid ${T.border}`}}>💬 {r.motivo}</div>}
                    </div>
                  );
                })}
              </div>
              <div style={{padding:"12px 22px",borderTop:`1px solid ${T.border}`}}>
                <button onClick={()=>setExtraModal(null)} style={{...S.cancelBtn,width:"100%"}}>Cerrar</button>
              </div>
            </div>
          </div>
        )}

        {modal&&canCreate&&(
          <div style={S.overlay} onClick={e=>{if(e.target===e.currentTarget)closeModal();}}>
            <div style={S.mBox}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 22px",borderBottom:`1px solid ${T.border}`,background:T.bg3}}>
                <div>
                  <div style={{fontSize:15,fontWeight:700,color:T.text,fontFamily:"Montserrat,sans-serif"}}>Nueva Reserva</div>
                  {form.room&&form.hour&&<div style={{fontSize:11,color:"#60a5fa",marginTop:2}}>{form.room} · {form.hour}{form.hour_end&&form.hour_end!==form.hour?` → ${form.hour_end}`:""}</div>}
                </div>
                <button onClick={closeModal} style={{background:"transparent",border:"none",color:T.muted,fontSize:20,cursor:"pointer",minWidth:44,minHeight:44}}>✕</button>
              </div>
              <div style={{padding:22,display:"flex",flexDirection:"column",gap:14}}>
                <div>
                  <label style={S.lbl}>Programa Académico *</label>
                  {profile?.program&&!isSuperAdmin&&(
                    <div style={{background:"rgba(0,102,204,0.1)",border:`1px solid rgba(0,102,204,0.3)`,borderRadius:8,padding:"8px 12px",marginBottom:8,fontSize:12,color:"#60a5fa",display:"flex",alignItems:"center",gap:6}}>
                      {PROGRAMS[profile.program]?.icon} Programa asignado: <b>{profile.program}</b>
                    </div>
                  )}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    {Object.entries(PROGRAMS)
                      .filter(([prog])=>{
                        if(isSuperAdmin)return true;
                        if(profile?.program)return prog===profile.program;
                        return true;
                      })
                      .map(([prog,{color,bg,icon}])=>{
                        const active=form.program===prog;
                        return(
                          <button key={prog} type="button" onClick={()=>upd({program:prog})}
                            style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",borderRadius:8,border:`1px solid ${active?color:T.border2}`,background:active?bg:"transparent",color:active?color:T.muted,fontSize:13,fontWeight:active?600:400,cursor:"pointer",transition:"all .15s",minHeight:44}}>
                            <span style={{fontSize:18}}>{icon}</span>{prog}
                          </button>
                        );
                      })}
                  </div>
                </div>
                <div>
                  <label style={S.lbl}>Asignatura *</label>
                  <input style={S.inp} type="text" value={form.subject} placeholder="Ej: Cálculo Diferencial" onChange={e=>upd({subject:e.target.value})}/>
                </div>
                <div>
                  <label style={S.lbl}>Docente *</label>
                  <input style={S.inp} type="text" value={form.teacher} placeholder="Nombre completo del docente" onChange={e=>upd({teacher:e.target.value})}/>
                </div>
                <div>
                  <label style={S.lbl}>Día *</label>
                  <select style={S.sel} value={form.day} onChange={e=>upd({day:e.target.value})}>
                    {DAYS.map(d=><option key={d}>{d}</option>)}
                  </select>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <div>
                    <label style={S.lbl}>Hora inicio *</label>
                    {/* ← CAMBIO: muestra rango en selector */}
                    <select style={S.sel} value={form.hour} onChange={e=>upd({hour:e.target.value,hour_end:e.target.value})}>
                      <option value="">Seleccionar</option>
                      {HOURS.slice(0,-1).map((h,i)=>(
                        <option key={h} value={h}>{h} a {HOURS[i+1]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={S.lbl}>Hora fin *</label>
                    {/* ← CAMBIO: muestra rango consolidado en selector fin */}
                    <select style={S.sel} value={form.hour_end} disabled={!form.hour} onChange={e=>upd({hour_end:e.target.value})}>
                      <option value="">Seleccionar</option>
                      {getEndHourOptions(form.hour).slice(1).map((h,i)=>(
                        <option key={h} value={h}>
                          {form.hour} a {h} ({i+1} hora{i!==0?"s":""})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {form.hour&&form.hour_end&&(
                  <div style={{background:T.bg,borderRadius:8,padding:"10px 14px",border:`1px solid ${T.border}`,fontSize:12}}>
                    <span style={{color:T.muted}}>Bloques: </span>
                    <span style={{color:"#60a5fa",fontWeight:600}}>
                      {/* ← CAMBIO: mostrar bloques como rangos */}
                      {getHoursBetween(form.hour,form.hour_end).map((h,i)=>(
                        `${h} a ${HOURS[HOURS.indexOf(h)+1]}`
                      )).join(" · ")}
                    </span>
                    <span style={{color:T.muted,marginLeft:8}}>({getHoursBetween(form.hour,form.hour_end).length}h)</span>
                  </div>
                )}
                <div>
                  <label style={S.lbl}>Salón *</label>
                  <select style={S.sel} value={form.room} onChange={e=>upd({room:e.target.value})}>
                    <option value="">Seleccionar salón</option>
                    {currentRooms.map(r=><option key={r}>{r}</option>)}
                  </select>
                </div>
                {err&&(
                  <div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.35)",color:"#f87171",fontSize:13,padding:"10px 12px",borderRadius:8,display:"flex",gap:8}}>
                    <span>⚠</span><span>{err}</span>
                  </div>
                )}
              </div>
              <div style={{padding:"0 22px 22px",display:"flex",gap:10}}>
                <button style={S.cancelBtn} onClick={closeModal} disabled={saving}>Cancelar</button>
                <button style={{...S.saveBtn,opacity:saving?0.7:1}} onClick={save} disabled={saving}>
                  {saving?"Guardando…":"Guardar Reserva"}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}