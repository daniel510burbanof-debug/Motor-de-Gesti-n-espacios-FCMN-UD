import { useState, useMemo } from "react";
import { useTheme } from "./ThemeContext";

const DAYS  = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const HOURS = Array.from({length:14},(_,i)=>`${String(i+6).padStart(2,"0")}:00`);

import { PROG_COLORS_DARK, PROG_COLORS_LIGHT, PROG_ICONS } from "./ThemeContext";

function hourToNum(h:string){ return parseInt(h.split(":")[0]); }
function getHoursBetween(start:string,end:string):string[]{
  const si=HOURS.indexOf(start), ei=HOURS.indexOf(end);
  if(si===-1||ei===-1||ei<si) return [start];
  return HOURS.slice(si,ei+1);
}

interface Props {
  reservations: any[];
  onClose: () => void;
}

export default function TeacherView({ reservations, onClose }: Props) {
  const { T, theme } = useTheme();
const PROGRAMS = {
  "Química":     { color: theme==="dark"?"#F472B6":"#db2777", bg: theme==="dark"?"rgba(244,114,182,0.15)":"rgba(244,114,182,0.12)", border: theme==="dark"?"#F472B6":"#db2777", icon:"⚛️" },
  "Biología":    { color: theme==="dark"?"#4ADE80":"#16a34a", bg: theme==="dark"?"rgba(74,222,128,0.15)":"rgba(74,222,128,0.12)",  border: theme==="dark"?"#4ADE80":"#16a34a", icon:"🧬" },
  "Física":      { color: theme==="dark"?"#60A5FA":"#2563eb", bg: theme==="dark"?"rgba(96,165,250,0.15)":"rgba(96,165,250,0.12)",  border: theme==="dark"?"#60A5FA":"#2563eb", icon:"🧲" },
  "Matemáticas": { color: theme==="dark"?"#FB923C":"#ea580c", bg: theme==="dark"?"rgba(251,146,60,0.15)":"rgba(251,146,60,0.12)",  border: theme==="dark"?"#FB923C":"#ea580c", icon:"π"  },
};

  const teachers = useMemo(()=>
    [...new Set(reservations.map(r=>r.teacher))].filter(Boolean).sort()
  ,[reservations]);

  const [selTeacher, setSelTeacher] = useState(teachers[0]||"");
  const [search, setSearch]         = useState("");
  const [exporting, setExporting]   = useState(false);

  const filteredTeachers = useMemo(()=>
    teachers.filter(t=>t.toLowerCase().includes(search.toLowerCase()))
  ,[teachers, search]);

  const teacherReservations = useMemo(()=>
    reservations.filter(r=>r.teacher===selTeacher && (!r.tipo_reserva||r.tipo_reserva==="academica") && !r.specific_date)
  ,[reservations, selTeacher]);

  // Build grid map
  const resMap = useMemo(()=>{
    const m: Record<string,any> = {};
    teacherReservations.forEach(r=>{
      getHoursBetween(r.hour, r.hour_end||r.hour).forEach(h=>{
        m[`${r.day}|${h}`] = r;
      });
    });
    return m;
  },[teacherReservations]);

  const firstHourMap = useMemo(()=>{
    const m: Record<number,string> = {};
    teacherReservations.forEach(r=>{ m[r.id]=r.hour; });
    return m;
  },[teacherReservations]);

  // Stats
  const stats = useMemo(()=>{
    let totalHours = 0;
    const byDay: Record<string,number> = {};
    const byProgram: Record<string,number> = {};
    teacherReservations.forEach(r=>{
      const h = Math.max(1, hourToNum(r.hour_end||r.hour) - hourToNum(r.hour) + 1);
      totalHours += h;
      byDay[r.day] = (byDay[r.day]||0) + h;
      byProgram[r.program] = (byProgram[r.program]||0) + h;
    });
    const maxDay = 10;
    const isOverloaded = totalHours > maxDay * 5;
    return { totalHours, byDay, byProgram, isOverloaded };
  },[teacherReservations]);

  // Active hours (only rows with at least one class)
  const activeHours = useMemo(()=>
    HOURS.filter(h=>DAYS.some(d=>resMap[`${d}|${h}`]))
  ,[resMap]);

  const exportPDF = async () => {
    setExporting(true);
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable  = (await import("jspdf-autotable")).default;

      const doc  = new jsPDF({orientation:"landscape", unit:"mm", format:"a4"});
      const pageW = 297, pageH = 210, margin = 12;

      // ── ENCABEZADO ──────────────────────────────────────────────────
      doc.setFillColor(0,48,135); doc.rect(0,0,pageW,36,"F");
      doc.setFillColor(0,102,204); doc.rect(0,32,pageW,4,"F");

      const imgToB64 = (img:HTMLImageElement) => {
        try{
          const c=document.createElement("canvas");
          c.width=img.naturalWidth||100; c.height=img.naturalHeight||100;
          c.getContext("2d")!.drawImage(img,0,0); return c.toDataURL("image/png");
        }catch{return "";}
      };
      const udImg   = document.querySelector('img[alt="Universidad Distrital"]') as HTMLImageElement|null;
      const fcmnImg = document.querySelector('img[alt="FCMN"]') as HTMLImageElement|null;

      let curX = margin;
      if(udImg && udImg.naturalWidth>0){
        const w = 22*(udImg.naturalWidth/udImg.naturalHeight);
        try{ doc.addImage(imgToB64(udImg),"PNG",curX,6,w,22); curX+=w+4; }catch{}
      }
      if(fcmnImg && fcmnImg.naturalWidth>0){
        const w = 20*(fcmnImg.naturalWidth/fcmnImg.naturalHeight);
        try{ doc.addImage(imgToB64(fcmnImg),"PNG",curX,8,w,18); curX+=w+6; }catch{}
      }

      doc.setDrawColor(255,255,255); doc.setLineWidth(0.3); doc.line(curX,6,curX,28);
      const tx = curX+6;
      doc.setTextColor(255,255,255); doc.setFontSize(13); doc.setFont("helvetica","bold");
      doc.text("Universidad Distrital Francisco José de Caldas", tx, 13);
      doc.setFontSize(9); doc.setFont("helvetica","normal"); doc.setTextColor(180,210,255);
      doc.text("Facultad de Ciencias y Matemáticas · Horario Docente", tx, 20);
      doc.setFontSize(8); doc.setTextColor(140,180,255);
      doc.text(`Docente: ${selTeacher}`, tx, 27);
      doc.text(`Generado: ${new Date().toLocaleDateString("es-CO")} ${new Date().toLocaleTimeString("es-CO")}`, pageW-margin-60, 27);

      // ── RESUMEN ──────────────────────────────────────────────────────
      let y = 43;
      doc.setFontSize(9); doc.setFont("helvetica","bold"); doc.setTextColor(0,48,135);
      doc.text(`Total horas semanales: ${stats.totalHours}h`, margin, y);
      if(stats.isOverloaded){
        doc.setTextColor(239,68,68);
        doc.text("⚠ Carga horaria elevada", margin+60, y);
      }
      y += 6;

      // ── TABLA GRID ───────────────────────────────────────────────────
      const usedHours = activeHours.length > 0 ? activeHours : HOURS;

      autoTable(doc, {
  startY: y,
  head: [["Hora", ...DAYS]],
  body: usedHours.map(hour => [
    hour,
    ...DAYS.map(day => {
      const res = resMap[`${day}|${hour}`];
      if(!res) return "";
      const isFirst = firstHourMap[res.id] === hour;
      if(!isFirst) return "";
      return `${res.subject}\n${res.room}\n${res.hour} - ${res.hour_end}`;
    }),
  ]),
  styles: { fontSize:7, cellPadding:3, minCellHeight:16, valign:"middle", halign:"center", overflow:"linebreak" },
  headStyles: { fillColor:[0,48,135], textColor:[255,255,255], fontStyle:"bold", halign:"center" },
  columnStyles: {
    0:{cellWidth:18, fontStyle:"bold", halign:"center", fillColor:[240,245,255] as any},
    1:{cellWidth:38}, 2:{cellWidth:38}, 3:{cellWidth:38},
    4:{cellWidth:38}, 5:{cellWidth:38}, 6:{cellWidth:38},
  },
  didParseCell: (data) => {
  if(data.section==="body" && data.column.index > 0){
    const day = DAYS[data.column.index-1];
    const hour = usedHours[data.row.index];
    const res = resMap[`${day}|${hour}`];
    if(res){
      const SOLID: Record<string,[number,number,number]> = {
        "Química":     [253,220,240],
        "Biología":    [220,252,231],
        "Física":      [219,234,254],
        "Matemáticas": [254,235,220],
      };
      const bg = SOLID[res.program] || [240,245,255];
      data.cell.styles.fillColor = bg;
      data.cell.styles.textColor = [20,20,60];
      data.cell.styles.fontStyle = "bold";
    }
  }
},
  margin: { left:margin, right:margin },
});

      // ── PIE ───────────────────────────────────────────────────────────
      const total = (doc as any).internal.getNumberOfPages();
      for(let i=1;i<=total;i++){
        doc.setPage(i);
        doc.setFillColor(0,48,135); doc.rect(0,pageH-10,pageW,10,"F");
        doc.setFontSize(7); doc.setTextColor(180,210,255);
        doc.text("Universidad Distrital · FCMN · Sistema de Gestión de Espacios", margin, pageH-4);
        doc.text(`Página ${i} de ${total}`, pageW-margin-18, pageH-4);
      }

      doc.save(`Horario_${selTeacher.replace(/\s+/g,"_")}.pdf`);
    } catch(e){ console.error(e); }
    finally{ setExporting(false); }
  };

  const S = {
    overlay: {position:"fixed" as const,inset:0,zIndex:200,background:"rgba(0,0,0,0.85)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",padding:16},
    box:     {background:T.bg2,borderRadius:16,border:`1px solid ${T.border2}`,width:"100%",maxWidth:1200,maxHeight:"94vh",overflowY:"auto" as const,boxShadow:T.shadow},
    hdr:     {display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 22px",borderBottom:`1px solid ${T.border}`,background:T.bg3,borderRadius:"16px 16px 0 0",position:"sticky" as const,top:0,zIndex:10},
    th:      {color:T.muted,fontWeight:600,padding:"8px 6px",borderRight:`1px solid ${T.border}`,borderBottom:`1px solid ${T.border}`,textAlign:"center" as const,fontSize:11,minWidth:110,background:T.bg3},
    hourTd:  {position:"sticky" as const,left:0,zIndex:5,background:T.bg2,color:T.mutedL,fontFamily:"monospace",fontWeight:700,padding:"4px 10px",borderRight:`1px solid ${T.border}`,borderBottom:`1px solid ${T.border}`,textAlign:"center" as const,fontSize:11,width:58},
    cell:    {borderRight:`1px solid ${T.border}`,borderBottom:`1px solid ${T.border}`,padding:2,height:52,verticalAlign:"top" as const,minWidth:110},
  };

  return (
    <div style={S.overlay} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={S.box}>

        {/* HEADER */}
        <div style={S.hdr}>
          <div style={{display:"flex",alignItems:"center",gap:16}}>
            <div>
              <div style={{fontSize:16,fontWeight:800,color:T.text,fontFamily:"Montserrat,sans-serif"}}>
                👤 Vista por Docente
              </div>
              <div style={{fontSize:11,color:T.muted,marginTop:2}}>
                {teachers.length} docente{teachers.length!==1?"s":""} · {teacherReservations.length} clases
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button onClick={exportPDF} disabled={!selTeacher||exporting}
              style={{padding:"9px 16px",borderRadius:8,border:"none",background:"linear-gradient(135deg,#dc2626,#ef4444)",color:"#fff",fontSize:12,fontWeight:600,cursor:(!selTeacher||exporting)?"not-allowed":"pointer",opacity:(!selTeacher||exporting)?0.5:1,display:"flex",alignItems:"center",gap:6}}>
              {exporting?"⏳":"📕"} Exportar PDF
            </button>
            <button onClick={onClose} style={{background:"transparent",border:"none",color:T.muted,fontSize:22,cursor:"pointer"}}>✕</button>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"220px 1fr",height:"calc(94vh - 70px)"}}>

          {/* SIDEBAR — lista de docentes */}
          <div style={{borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",background:T.bg3}}>
            <div style={{padding:"12px 14px",borderBottom:`1px solid ${T.border}`}}>
              <input
                type="text"
                placeholder="🔍 Buscar docente…"
                value={search}
                onChange={e=>setSearch(e.target.value)}
                style={{width:"100%",background:T.inputBg,border:`1px solid ${T.inputBorder}`,color:T.text,borderRadius:8,padding:"7px 10px",fontSize:12,outline:"none",boxSizing:"border-box" as const}}
              />
            </div>
            <div style={{overflowY:"auto",flex:1}}>
              {filteredTeachers.map(t=>{
                const n = reservations.filter(r=>r.teacher===t&&(!r.tipo_reserva||r.tipo_reserva==="academica")&&!r.specific_date).length;
                const active = t===selTeacher;
                return(
                  <div key={t} onClick={()=>setSelTeacher(t)}
                    style={{padding:"10px 14px",cursor:"pointer",borderBottom:`1px solid ${T.border}`,background:active?`rgba(0,102,204,0.15)`:"transparent",borderLeft:active?`3px solid ${T.udAccent}`:"3px solid transparent",transition:"all 0.15s"}}
                    onMouseEnter={e=>{ if(!active)(e.currentTarget as HTMLElement).style.background=`rgba(0,102,204,0.07)`; }}
                    onMouseLeave={e=>{ if(!active)(e.currentTarget as HTMLElement).style.background="transparent"; }}>
                    <div style={{fontSize:12,fontWeight:active?700:500,color:active?"#60a5fa":T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t}</div>
                    <div style={{fontSize:10,color:T.muted,marginTop:2}}>{n} clase{n!==1?"s":""}</div>
                  </div>
                );
              })}
              {filteredTeachers.length===0&&(
                <div style={{padding:20,textAlign:"center" as const,color:T.muted,fontSize:12}}>Sin resultados</div>
              )}
            </div>
          </div>

          {/* MAIN — grid + stats */}
          <div style={{overflowY:"auto",padding:20,display:"flex",flexDirection:"column",gap:16}}>

            {!selTeacher ? (
              <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:T.muted,fontSize:14}}>
                Selecciona un docente
              </div>
            ) : (
              <>
                {/* STATS */}
                <div style={{display:"flex",gap:12,flexWrap:"wrap" as const}}>
                  <div style={{background:T.card,borderRadius:10,border:`1px solid ${T.border}`,padding:"12px 20px",display:"flex",flexDirection:"column" as const,gap:2}}>
                    <div style={{fontSize:24,fontWeight:800,color:"#60a5fa",fontFamily:"Montserrat,sans-serif"}}>{stats.totalHours}h</div>
                    <div style={{fontSize:11,color:T.muted}}>Total horas semanales</div>
                  </div>
                  <div style={{background:T.card,borderRadius:10,border:`1px solid ${T.border}`,padding:"12px 20px",display:"flex",flexDirection:"column" as const,gap:2}}>
                    <div style={{fontSize:24,fontWeight:800,color:"#4ade80",fontFamily:"Montserrat,sans-serif"}}>{teacherReservations.length}</div>
                    <div style={{fontSize:11,color:T.muted}}>Clases asignadas</div>
                  </div>
                  <div style={{background:T.card,borderRadius:10,border:`1px solid ${T.border}`,padding:"12px 20px",display:"flex",flexDirection:"column" as const,gap:2}}>
                    <div style={{fontSize:24,fontWeight:800,color:"#fb923c",fontFamily:"Montserrat,sans-serif"}}>{Object.keys(stats.byDay).length}</div>
                    <div style={{fontSize:11,color:T.muted}}>Días con actividad</div>
                  </div>
                  {Object.entries(stats.byProgram).map(([prog,h])=>{
                    const p = PROGRAMS[prog];
                    return p?(
                      <div key={prog} style={{background:T.card,borderRadius:10,border:`1px solid ${p.border}30`,padding:"12px 20px",display:"flex",flexDirection:"column" as const,gap:2}}>
                        <div style={{fontSize:24,fontWeight:800,color:p.color,fontFamily:"Montserrat,sans-serif"}}>{h}h</div>
                        <div style={{fontSize:11,color:T.muted}}>{p.icon} {prog}</div>
                      </div>
                    ):null;
                  })}
                  {stats.isOverloaded&&(
                    <div style={{background:"rgba(239,68,68,0.1)",borderRadius:10,border:"1px solid rgba(239,68,68,0.3)",padding:"12px 20px",display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontSize:22}}>⚠️</span>
                      <div>
                        <div style={{fontSize:12,fontWeight:700,color:"#f87171"}}>Carga elevada</div>
                        <div style={{fontSize:10,color:T.muted}}>Más de 50h semanales</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* GRID */}
                {teacherReservations.length===0 ? (
                  <div style={{textAlign:"center" as const,padding:40,color:T.muted,fontSize:14,background:T.card,borderRadius:12,border:`1px solid ${T.border}`}}>
                    <div style={{fontSize:40,marginBottom:12}}>📭</div>
                    <div>Este docente no tiene clases asignadas</div>
                  </div>
                ):(
                  <div style={{background:T.bg2,borderRadius:12,border:`1px solid ${T.border}`,overflow:"hidden"}}>
                    <div style={{padding:"10px 16px",borderBottom:`1px solid ${T.border}`,background:T.bg3,fontSize:13,fontWeight:700,color:T.text}}>
                      📅 Horario Semanal — {selTeacher}
                    </div>
                    <div style={{overflowX:"auto"}}>
                      <table style={{borderCollapse:"collapse",minWidth:700,width:"100%"}}>
                        <thead>
                          <tr>
                            <th style={{...S.th,position:"sticky" as const,left:0,zIndex:6,width:58,textAlign:"left" as const,paddingLeft:10}}>Hora</th>
                            {DAYS.map(d=>(
                              <th key={d} style={{...S.th,background:Object.keys(stats.byDay).includes(d)?`rgba(0,102,204,0.08)`:T.bg3}}>
                                <div>{d}</div>
                                {stats.byDay[d]&&<div style={{fontSize:9,color:T.udAccent,fontWeight:400,marginTop:1}}>{stats.byDay[d]}h</div>}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {activeHours.map(hour=>(
                            <tr key={hour} style={{background:T.bg2}}>
                              <td style={S.hourTd}>{hour}</td>
                              {DAYS.map(day=>{
                                const res = resMap[`${day}|${hour}`];
                                const prog = res?(PROGRAMS[res.program]||PROGRAMS["Biología"]):null;
                                const isFirst = res&&firstHourMap[res.id]===hour;
                                const isContinuation = res&&!isFirst;
                                return(
                                  <td key={day} style={S.cell}>
                                    {res?(
                                      <div style={{height:"100%",borderRadius:5,padding:"3px 6px",display:"flex",flexDirection:"column" as const,justifyContent:"center",background:prog!.bg,borderLeft:`3px solid ${prog!.border}`,borderTop:isContinuation?`1px dashed ${prog!.border}40`:"none",opacity:isContinuation?0.6:1}}>
                                        {isFirst&&(
                                          <>
                                            <div style={{fontWeight:700,fontSize:10,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:3}}>
                                              <span style={{fontSize:9}}>{prog!.icon}</span>
                                              <span title={res.subject}>{res.subject}</span>
                                            </div>
                                            <div style={{fontSize:10,color:T.mutedL,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={res.room}>📍 {res.room}</div>
                                            {res.hour_end&&res.hour_end!==res.hour&&(
                                              <div style={{fontSize:9,color:prog!.color}}>⏱ {res.hour}–{res.hour_end}</div>
                                            )}
                                          </>
                                        )}
                                        {isContinuation&&<div style={{fontSize:9,color:prog!.color,textAlign:"center" as const}}>┃</div>}
                                      </div>
                                    ):(
                                      <div style={{height:"100%"}}/>
                                    )}
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
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// helpers
function hexToRgb(hex:string){
  const m=hex.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if(m) return {r:+m[1],g:+m[2],b:+m[3]};
  return null;
}
function hexToRgb255(hex:string):[number,number,number]{
  const m=hex.match(/^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if(m) return [parseInt(m[1],16),parseInt(m[2],16),parseInt(m[3],16)];
  return [255,255,255];
}