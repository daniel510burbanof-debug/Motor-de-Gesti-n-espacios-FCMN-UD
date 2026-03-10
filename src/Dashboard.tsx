import { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import * as XLSX from "xlsx";
import { useTheme, PROG_COLORS_DARK, PROG_COLORS_LIGHT, PROG_ICONS } from "./ThemeContext";
import { useBreakpoint } from "./useIsMobile"; // ← NUEVO

interface Reservation {
  id?: number; program: string; subject: string; teacher: string;
  day: string; hour: string; hour_end: string; room: string;
  tipo_espacio: "teoria" | "lab";
  specific_date?: string | null;
  tipo_reserva?: string | null;
}
interface Space {
  id?: number; nombre: string; tipo: string; activo: boolean;
  hora_apertura?: string; hora_cierre?: string; capacidad?: number;
}
interface Props {
  reservations: Reservation[]; spaces: Space[];
  onClose: () => void; session?: any;
}

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DAYS_ES = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const DAY_TO_JS: Record<string,number> = {
  "Lunes":1,"Martes":2,"Miércoles":3,"Jueves":4,"Viernes":5,"Sábado":6
};

function countDayOccurrences(dayName: string, year: number, month: number): number {
  const target = DAY_TO_JS[dayName];
  if (target === undefined) return 0;
  const dim = new Date(year, month, 0).getDate();
  let n = 0;
  for (let d = 1; d <= dim; d++) {
    if (new Date(year, month - 1, d).getDay() === target) n++;
  }
  return n;
}

function isInMonth(dateStr: string | null | undefined, y: number, m: number): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d.getFullYear() === y && d.getMonth() + 1 === m;
}

function hourToNum(h: string): number {
  const [hh] = h.split(":"); return parseInt(hh);
}

function blockHours(hour: string, hour_end: string): number {
  return Math.max(1, hourToNum(hour_end) - hourToNum(hour) + 1);
}

export default function Dashboard({ reservations, spaces, onClose }: Props) {
  const { T, theme } = useTheme();
  const { isMobile, isTablet } = useBreakpoint(); // ← NUEVO

  // Columnas dinámicas según pantalla
  const statCols  = isMobile ? 1 : isTablet ? 2 : 4;
  const chartH    = isMobile ? 180 : 200;
  const tickSize  = isMobile ? 9 : 11;
  const tickSizeS = isMobile ? 8 : 10;

  const PROG_COLORS = theme === "dark" ? PROG_COLORS_DARK : PROG_COLORS_LIGHT;
  const now = new Date();

  const [selYear,  setSelYear]  = useState(now.getFullYear());
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1);
  const [selRoom,  setSelRoom]  = useState("__all__");
  const [selCat,   setSelCat]   = useState<"all"|"teoria"|"lab">("all");
  const [extModal, setExtModal] = useState<Reservation[]|null>(null);
  const [extModalTitle, setExtModalTitle] = useState("");
  const [exporting, setExporting] = useState<"pdf"|"excel"|null>(null);

  const years = useMemo(()=>{
    const set = new Set<number>();
    set.add(now.getFullYear()); set.add(now.getFullYear()-1);
    reservations.forEach(r => { if(r.specific_date) set.add(new Date(r.specific_date).getFullYear()); });
    return Array.from(set).sort((a,b)=>b-a);
  },[reservations]);

  const allRooms = useMemo(()=>
    Array.from(new Set(reservations.map(r=>r.room))).sort()
  ,[reservations]);

  const monthData = useMemo(()=>{
    const academic = reservations.filter(r =>
      (!r.tipo_reserva || r.tipo_reserva === "academica") && !r.specific_date
    );
    const extraordinary = reservations.filter(r =>
      r.specific_date && isInMonth(r.specific_date, selYear, selMonth)
    );
    type EffRow = Reservation & { occurrences: number; isExtra: boolean };
    const rows: EffRow[] = [];
    academic.forEach(r => {
      const occ = countDayOccurrences(r.day, selYear, selMonth);
      if (occ > 0) rows.push({ ...r, occurrences: occ, isExtra: false });
    });
    extraordinary.forEach(r => {
      rows.push({ ...r, occurrences: 1, isExtra: true });
    });
    const filtered = rows.filter(r => {
      if (selRoom !== "__all__" && r.room !== selRoom) return false;
      if (selCat !== "all" && r.tipo_espacio !== selCat) return false;
      return true;
    });
    return { rows: filtered, academic, extraordinary };
  },[reservations, selYear, selMonth, selRoom, selCat]);

  const metrics = useMemo(()=>{
    const { rows } = monthData;
    let totalHours = 0, academicHours = 0, extraHours = 0;
    const roomUsage: Record<string,number> = {};
    const progUsage: Record<string,number> = {};
    const dayUsage: Record<string,number>  = {};
    const hourUsage: Record<number,number> = {};
    rows.forEach(r => {
      const hrs = blockHours(r.hour, r.hour_end) * r.occurrences;
      totalHours += hrs;
      if (r.isExtra) extraHours += hrs;
      else           academicHours += hrs;
      roomUsage[r.room] = (roomUsage[r.room]||0) + hrs;
      if (r.program) progUsage[r.program] = (progUsage[r.program]||0) + hrs;
      dayUsage[r.day] = (dayUsage[r.day]||0) + hrs;
      for (let h=hourToNum(r.hour); h<=hourToNum(r.hour_end); h++) {
        hourUsage[h] = (hourUsage[h]||0) + r.occurrences;
      }
    });
    const daysInMonth = new Date(selYear, selMonth, 0).getDate();
    const workingHoursPerDay = 13;
    const activeSpaces = selRoom !== "__all__" ? 1
      : selCat === "all"    ? spaces.filter(s=>s.activo).length
      : selCat === "teoria" ? spaces.filter(s=>s.activo&&s.tipo==="teoria").length
      :                       spaces.filter(s=>s.activo&&s.tipo==="lab").length;
    const totalCapacity = activeSpaces * workingHoursPerDay * Math.floor(daysInMonth * 5/7);
    return {
      totalHours, academicHours, extraHours, roomUsage, progUsage,
      dayUsage, hourUsage, totalCapacity,
      occupancyPct: totalCapacity > 0 ? Math.min(100, Math.round(totalHours/totalCapacity*100)) : 0
    };
  },[monthData, spaces, selRoom, selCat, selYear, selMonth]);

  const chartByProgram = useMemo(()=>
    Object.entries(metrics.progUsage)
      .map(([name,value])=>({ name, value, icon: PROG_ICONS[name]||"📚" }))
      .sort((a,b)=>b.value-a.value)
  ,[metrics.progUsage]);

  const chartByDay = useMemo(()=>
    DAYS_ES.map(d=>({ dia:d.slice(0,3), horas: metrics.dayUsage[d]||0 }))
  ,[metrics.dayUsage]);

  const chartByHour = useMemo(()=>
    Array.from({length:13},(_,i)=>i+6).map(h=>({
      hora:`${String(h).padStart(2,"0")}:00`,
      reservas: metrics.hourUsage[h]||0,
    }))
  ,[metrics.hourUsage]);

  const pieData = useMemo(()=>[
    { name:"Clases Semestrales",  value: metrics.academicHours },
    { name:"Reservas Especiales", value: metrics.extraHours    },
  ],[metrics]);

  const topRooms = useMemo(()=>
    Object.entries(metrics.roomUsage)
      .sort((a,b)=>b[1]-a[1]).slice(0,8)
      .map(([room,hours])=>{
        const sp = spaces.find(s=>s.nombre===room);
        const cap = sp ? (sp.tipo==="lab"?15:45) * (new Date(selYear,selMonth,0).getDate())*5/7 : 500;
        return { room, hours, pct: Math.min(100,Math.round(hours/cap*100)) };
      })
  ,[metrics.roomUsage, spaces, selYear, selMonth]);

  // ── EXPORT EXCEL ─────────────────────────────────────────────────────────
  const exportExcel = async () => {
    setExporting("excel");
    try {
      const wb = XLSX.utils.book_new();
      const mesNombre = `${MONTHS[selMonth-1]} ${selYear}`;

      const resumenData: any[][] = [
        [`REPORTE MENSUAL FCMN — ${mesNombre.toUpperCase()}`],
        [`Período: ${mesNombre}  |  Espacio: ${selRoom==="__all__"?"Todos":selRoom}  |  Categoría: ${selCat==="all"?"Todas":selCat==="teoria"?"Teoría":"Laboratorios"}`],
        [`Generado: ${new Date().toLocaleString("es-CO")}`],
        [],
        ["INDICADORES GENERALES",""],
        ["Métrica","Valor"],
        ["Total Horas Ocupadas", metrics.totalHours],
        ["Horas Clases Académicas", metrics.academicHours],
        ["Horas Reservas Extraordinarias", metrics.extraHours],
        ["Porcentaje de Ocupación", `${metrics.occupancyPct}%`],
        ["Capacidad Total Estimada (h)", metrics.totalCapacity],
        [],
        ["TOP ESPACIOS MÁS USADOS","",""],
        ["Espacio","Horas Usadas","% Ocupación"],
        ...topRooms.map(r=>[r.room, r.hours, `${r.pct}%`]),
        [],
        ["USO POR PROGRAMA",""],
        ["Programa","Horas Totales","% del Total"],
        ...chartByProgram.map(p=>[
          p.name, p.value,
          metrics.totalHours>0?`${Math.round(p.value/metrics.totalHours*100)}%`:"0%"
        ]),
        [],
        ["DISTRIBUCIÓN SEMANAL",""],
        ["Día","Horas"],
        ...DAYS_ES.map(d=>[d, metrics.dayUsage[d]||0]),
      ];
      const ws1 = XLSX.utils.aoa_to_sheet(resumenData);
      ws1["!cols"] = [{wch:38},{wch:20},{wch:16}];
      ws1["!merges"] = [
        {s:{r:0,c:0},e:{r:0,c:2}},
        {s:{r:1,c:0},e:{r:1,c:2}},
        {s:{r:2,c:0},e:{r:2,c:2}},
      ];
      XLSX.utils.book_append_sheet(wb, ws1, "📊 Resumen");

      const headers = [
        "Tipo","Programa","Asignatura","Docente",
        "Día / Fecha","H. Inicio","H. Fin","Espacio",
        "Tipo Espacio","Ocurrencias","Horas Totales Mes"
      ];
      const detalleRows: any[][] = [headers];
      monthData.rows.forEach(r => {
        detalleRows.push([
          r.isExtra?"⭐ Extraordinaria":"📚 Académica",
          r.program||"", r.subject||"", r.teacher||"",
          r.isExtra
            ?(r.specific_date?new Date(r.specific_date+"T12:00:00").toLocaleDateString("es-CO"):"")
            :(r.day||""),
          r.hour||"", r.hour_end||r.hour||"", r.room||"",
          r.tipo_espacio==="lab"?"Laboratorio":"Teoría",
          (r as any).occurrences||1,
          blockHours(r.hour,r.hour_end)*((r as any).occurrences||1),
        ]);
      });
      const ws2 = XLSX.utils.aoa_to_sheet(detalleRows);
      ws2["!cols"] = [{wch:18},{wch:14},{wch:30},{wch:30},{wch:18},{wch:10},{wch:10},{wch:22},{wch:14},{wch:12},{wch:18}];
      ws2["!autofilter"] = { ref:"A1:K1" };
      XLSX.utils.book_append_sheet(wb, ws2, "📋 Detalle");

      const extFiltered = monthData.extraordinary
        .filter(r=>(selRoom==="__all__"||r.room===selRoom)&&(selCat==="all"||r.tipo_espacio===selCat))
        .sort((a,b)=>(a.specific_date||"").localeCompare(b.specific_date||""));
      const extHeaders = ["Tipo","Programa","Asignatura","Docente","Espacio","Fecha","H. Inicio","H. Fin"];
      const extRows: any[][] = [extHeaders];
      extFiltered.forEach(r=>{
        extRows.push([
          r.tipo_reserva==="bloqueo"?"🔒 Bloqueo":"⭐ Extraordinaria",
          r.program||"—", r.subject||"—", r.teacher||"—", r.room,
          r.specific_date?new Date(r.specific_date+"T12:00:00").toLocaleDateString("es-CO",{weekday:"long",day:"numeric",month:"long",year:"numeric"}):"—",
          r.hour, r.hour_end,
        ]);
      });
      const ws3 = XLSX.utils.aoa_to_sheet(extRows);
      ws3["!cols"] = [{wch:18},{wch:14},{wch:30},{wch:30},{wch:22},{wch:38},{wch:10},{wch:10}];
      ws3["!autofilter"] = { ref:"A1:H1" };
      XLSX.utils.book_append_sheet(wb, ws3, "⭐ Extraordinarias");

      const buf = XLSX.write(wb,{bookType:"xlsx",type:"array"});
      const blob = new Blob([buf],{type:"application/octet-stream"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href=url;
      a.download=`FCMN_${MONTHS[selMonth-1]}_${selYear}${selRoom!=="__all__"?`_${selRoom}`:""}.xlsx`;
      a.click(); URL.revokeObjectURL(url);
    } catch(e){ console.error("Error Excel:",e); }
    finally{ setExporting(null); }
  };

  // ── EXPORT PDF ────────────────────────────────────────────────────────────
  const exportPDF = async () => {
    setExporting("pdf");
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});
      const pageW=210, pageH=297, margin=14, contentW=pageW-margin*2;

      doc.setFillColor(0,48,135); doc.rect(0,0,pageW,40,"F");
      doc.setFillColor(0,102,204); doc.rect(0,36,pageW,4,"F");

      const imgToBase64=(img:HTMLImageElement)=>{
        try{
          const c=document.createElement("canvas");
          c.width=img.naturalWidth||100; c.height=img.naturalHeight||100;
          c.getContext("2d")!.drawImage(img,0,0); return c.toDataURL("image/png");
        }catch{return "";}
      };
      const udImg=document.querySelector('img[alt="Universidad Distrital"]') as HTMLImageElement|null;
      const fcmnImg=document.querySelector('img[alt="FCMN"]') as HTMLImageElement|null;
      if(udImg){
        try{
          const ratio = udImg.naturalWidth / udImg.naturalHeight;
          const h = 24, w = h * ratio;
          doc.addImage(imgToBase64(udImg),"PNG", margin, 8, w, h);
        }catch{}
      }
      if(fcmnImg){
        try{
          const ratio = fcmnImg.naturalWidth / fcmnImg.naturalHeight;
          const h = 22, w = h * ratio;
          const udW = udImg ? 24 * (udImg.naturalWidth/udImg.naturalHeight) : 24;
          doc.addImage(imgToBase64(fcmnImg),"PNG", margin + udW + 4, 9, w, h);
        }catch{}
      }

      doc.setTextColor(255,255,255); doc.setFontSize(13); doc.setFont("helvetica","bold");
      const logoOffset = margin + (udImg ? 24*(udImg.naturalWidth/udImg.naturalHeight) : 24) + (fcmnImg ? 22*(fcmnImg.naturalWidth/fcmnImg.naturalHeight) : 18) + 10;
      doc.text("Universidad Distrital Francisco José de Caldas", logoOffset, 14);
      doc.setFontSize(9); doc.setFont("helvetica","normal"); doc.setTextColor(180,210,255);
      doc.text("Facultad de Ciencias y Matemáticas · Sistema de Gestión de Espacios", logoOffset, 21);
      doc.text(`Período: ${MONTHS[selMonth-1]} ${selYear}`, logoOffset, 28);
      doc.text(`Generado: ${new Date().toLocaleDateString("es-CO")} ${new Date().toLocaleTimeString("es-CO")}`, pageW-margin-55, 28);
      if(selRoom!=="__all__") doc.text(`Espacio: ${selRoom}`, logoOffset, 34);

      let y=48;

      doc.setFontSize(10); doc.setFont("helvetica","bold"); doc.setTextColor(0,48,135);
      doc.text("Indicadores del Período",margin,y); y+=6;

      const statsGrid=[
        {label:"Horas Totales",    val:`${metrics.totalHours}h`,    color:[0,102,204]   as [number,number,number]},
        {label:"Horas Académicas", val:`${metrics.academicHours}h`, color:[16,185,129]  as [number,number,number]},
        {label:"Horas Extraordin.",val:`${metrics.extraHours}h`,    color:[147,51,234]  as [number,number,number]},
        {label:"% Ocupación",      val:`${metrics.occupancyPct}%`,  color:(metrics.occupancyPct>80?[239,68,68]:metrics.occupancyPct>50?[245,158,11]:[34,197,94]) as [number,number,number]},
      ];
      const cardW=(contentW-9)/4;
      statsGrid.forEach(({label,val,color},i)=>{
        const x=margin+i*(cardW+3);
        doc.setFillColor(color[0],color[1],color[2]); doc.setDrawColor(color[0],color[1],color[2]);
        doc.roundedRect(x,y,cardW,18,2,2,"FD");
        doc.setTextColor(255,255,255); doc.setFontSize(14); doc.setFont("helvetica","bold");
        doc.text(val,x+cardW/2,y+10,{align:"center"});
        doc.setFontSize(7); doc.setFont("helvetica","normal");
        doc.text(label,x+cardW/2,y+16,{align:"center"});
      });
      y+=24;

      const charts=[
        {id:"dash-chart-day",     label:"Horas por Día de la Semana"},
        {id:"dash-chart-pie",     label:"Composición de Reservas"},
        {id:"dash-chart-program", label:"Uso por Programa"},
        {id:"dash-chart-hour",    label:"Horas Pico"},
      ];
      const colW=(contentW-6)/2;
      let col=0, rowY=y;

      for(const chart of charts){
        const el=document.getElementById(chart.id);
        if(!el) continue;
        if(col===0&&rowY+65>pageH-16){doc.addPage();rowY=16;}
        const xPos=margin+col*(colW+6);
        doc.setFontSize(7); doc.setFont("helvetica","bold"); doc.setTextColor(0,48,135);
        doc.text(chart.label,xPos,rowY);
        try{
          const canvas=await html2canvas(el,{
            scale:2,
            backgroundColor:theme==="dark"?"#0a1628":"#ffffff",
            useCORS:true, logging:false, allowTaint:true,
          });
          const ratio=canvas.width/canvas.height;
          const imgH=colW/ratio;
          doc.addImage(canvas.toDataURL("image/png"),"PNG",xPos,rowY+3,colW,Math.min(imgH,58));
        }catch{
          doc.setFillColor(245,247,250); doc.roundedRect(xPos,rowY+3,colW,58,2,2,"F");
          doc.setFontSize(8); doc.setTextColor(150,150,150);
          doc.text("Gráfica no disponible",xPos+colW/2,rowY+32,{align:"center"});
        }
        col++;
        if(col===2){col=0; rowY+=68;}
      }
      if(col===1) rowY+=68;
      y=rowY;

      if(y+8+topRooms.length*9>pageH-16){doc.addPage();y=16;}
      doc.setFontSize(10); doc.setFont("helvetica","bold"); doc.setTextColor(0,48,135);
      doc.text("Ocupación por Espacio",margin,y); y+=6;
      topRooms.forEach(r=>{
        doc.setFontSize(8); doc.setFont("helvetica","normal"); doc.setTextColor(60,60,80);
        doc.text(r.room, margin, y);
        const barX = margin + 52;
        const pctLabel = `${r.hours}h · ${r.pct}%`;
        const labelWidth = 28;
        const barW2 = contentW - 52 - labelWidth - 4;
        const barH = 3.5;
        doc.setFillColor(226,232,240);
        doc.roundedRect(barX, y-3.5, barW2, barH, 1, 1, "F");
        const fc = r.pct>80?[239,68,68] as [number,number,number]:r.pct>50?[245,158,11] as [number,number,number]:[0,102,204] as [number,number,number];
        doc.setFillColor(fc[0],fc[1],fc[2]);
        doc.roundedRect(barX, y-3.5, Math.max(2, barW2*r.pct/100), barH, 1, 1, "F");
        doc.setTextColor(60,60,80);
        doc.text(pctLabel, barX + barW2 + 3, y, {align:"left"});
        y+=8;
      });

      const extFilt=monthData.extraordinary
        .filter(r=>(selRoom==="__all__"||r.room===selRoom)&&(selCat==="all"||r.tipo_espacio===selCat))
        .sort((a,b)=>(a.specific_date||"").localeCompare(b.specific_date||""));
      if(extFilt.length>0){
        if(y+40>pageH-16){doc.addPage();y=16;}
        doc.setFontSize(10); doc.setFont("helvetica","bold"); doc.setTextColor(124,58,237);
        doc.text(`Reservas Extraordinarias — ${MONTHS[selMonth-1]} ${selYear} (${extFilt.length})`,margin,y); y+=4;
        autoTable(doc,{
          startY:y,
          head:[["Tipo","Asignatura","Docente","Espacio","Fecha","Horario"]],
          body:extFilt.map(r=>[
            r.tipo_reserva==="bloqueo"?"Bloqueo":"Extraordinaria",
            r.subject, r.teacher, r.room,
            r.specific_date?new Date(r.specific_date+"T12:00:00").toLocaleDateString("es-CO"):"—",
            `${r.hour} – ${r.hour_end}`,
          ]),
          styles:{fontSize:8,cellPadding:3},
          headStyles:{fillColor:[124,58,237],textColor:[255,255,255],fontStyle:"bold"},
          alternateRowStyles:{fillColor:[248,245,255]},
          margin:{left:margin,right:margin},
        });
      }

      const total=(doc as any).internal.getNumberOfPages();
      for(let i=1;i<=total;i++){
        doc.setPage(i);
        doc.setFillColor(0,48,135); doc.rect(0,pageH-10,pageW,10,"F");
        doc.setFontSize(7); doc.setTextColor(180,210,255);
        doc.text("Universidad Distrital · FCMN · Sistema de Gestión de Espacios",margin,pageH-4);
        doc.text(`Página ${i} de ${total}`,pageW-margin-18,pageH-4);
      }

      doc.save(`Reporte_FCMN_${MONTHS[selMonth-1]}_${selYear}${selRoom!=="__all__"?`_${selRoom}`:""}.pdf`);
    }catch(e){console.error("Error PDF:",e);}
    finally{setExporting(null);}
  };

  // ── ESTILOS ───────────────────────────────────────────────────────────────
  const S = {
    overlay: {position:"fixed" as const,inset:0,zIndex:200,background:"rgba(0,0,0,0.85)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",padding: isMobile ? 0 : 16},
    box:     {background:T.bg2,borderRadius: isMobile ? 0 : 16,border:`1px solid ${T.border2}`,width:"100%",maxWidth:1100,maxHeight: isMobile ? "100vh" : "94vh",overflowY:"auto" as const,boxShadow:T.shadow},
    hdr:     {display:"flex",alignItems:"center",justifyContent:"space-between",padding: isMobile ? "12px 16px" : "18px 24px",borderBottom:`1px solid ${T.border}`,background:T.bg3,borderRadius: isMobile ? 0 : "16px 16px 0 0"},
    card:    (accent?:string)=>({background:T.card,borderRadius:10,border:`1px solid ${accent||T.border}`,padding: isMobile ? "12px 12px" : "14px 16px"}),
    label:   {fontSize:11,fontWeight:600 as const,color:T.muted,textTransform:"uppercase" as const,letterSpacing:"0.05em",marginBottom:4,display:"block" as const},
    select:  {background:T.inputBg,border:`1px solid ${T.inputBorder}`,color:T.text,borderRadius:8,padding:"7px 10px",fontSize: isMobile ? 16 : 13,outline:"none",cursor:"pointer",minHeight:44},
    btn:     (bg:string)=>({padding:"9px 14px",borderRadius:8,border:"none",background:bg,color:"#fff",fontSize:12,fontWeight:600 as const,cursor:exporting?"not-allowed":"pointer",display:"flex" as const,alignItems:"center" as const,gap:6,opacity:exporting?0.5:1,minHeight:44}),
    section: {fontSize:14,fontWeight:700 as const,color:T.text,marginBottom:12},
  };

  const CustomTooltip = ({active,payload,label}:any) => {
    if(!active||!payload?.length) return null;
    return(
      <div style={{background:T.tooltipBg,border:`1px solid ${T.tooltipBorder}`,borderRadius:8,padding:"8px 14px",fontSize:12,color:T.text,boxShadow:T.shadow}}>
        <div style={{fontWeight:700,marginBottom:4}}>{label}</div>
        {payload.map((p:any,i:number)=>(
          <div key={i} style={{color:p.color||T.text}}>{p.name}: <b>{p.value}</b></div>
        ))}
      </div>
    );
  };

  return(
    <div style={S.overlay} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={S.box}>

        {/* HEADER */}
        <div style={S.hdr}>
          <div>
            <div style={{fontSize: isMobile ? 14 : 17,fontWeight:800,color:T.text,fontFamily:"Montserrat,sans-serif"}}>📊 Dashboard</div>
            <div style={{fontSize:11,color:T.muted,marginTop:2}}>
              {MONTHS[selMonth-1]} {selYear} · {selCat==="all"?"Todas":selCat==="teoria"?"Teoría":"Labs"}
            </div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button onClick={exportExcel} disabled={!!exporting} style={S.btn("#16a34a")}>
              {exporting==="excel"?"⏳":"⬇"} Excel
            </button>
            <button onClick={exportPDF} disabled={!!exporting} style={S.btn("#dc2626")}>
              {exporting==="pdf"?"⏳":"⬇"} PDF
            </button>
            <button onClick={onClose}
              style={{background:"transparent",border:"none",color:T.muted,fontSize:22,cursor:"pointer",marginLeft:8,minWidth:44,minHeight:44}}>✕</button>
          </div>
        </div>

        <div style={{padding: isMobile ? "12px 12px" : 24,display:"flex",flexDirection:"column",gap: isMobile ? 14 : 20}}>

          {/* FILTROS */}
          <div style={{display:"flex",gap:10,flexWrap:"wrap" as const,alignItems:"flex-end"}}>
            <div>
              <label style={S.label}>Año</label>
              <select value={selYear} onChange={e=>setSelYear(+e.target.value)} style={S.select}>
                {years.map(y=><option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Mes</label>
              <select value={selMonth} onChange={e=>setSelMonth(+e.target.value)} style={S.select}>
                {MONTHS.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Espacio</label>
              <select value={selRoom} onChange={e=>setSelRoom(e.target.value)} style={{...S.select,minWidth: isMobile ? 120 : 160}}>
                <option value="__all__">Todos</option>
                {allRooms.map(r=><option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Categoría</label>
              <select value={selCat} onChange={e=>setSelCat(e.target.value as any)} style={S.select}>
                <option value="all">Todas</option>
                <option value="teoria">Teoría</option>
                <option value="lab">Labs</option>
              </select>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center",marginLeft: isMobile ? 0 : "auto"}}>
              <span style={{fontSize:12,color:T.muted,background:T.tagBg,padding:"4px 12px",borderRadius:99,border:`1px solid ${T.border}`}}>
                {monthData.rows.length} bloques · {metrics.totalHours}h
              </span>
            </div>
          </div>

          {/* ── STAT CARDS — columnas dinámicas ── */}
          <div style={{
            display:"grid",
            gridTemplateColumns:`repeat(${statCols}, 1fr)`,
            gap: isMobile ? 10 : 12,
          }}>
            {[
              {label:"Horas Totales",     value:metrics.totalHours,         color:"#60a5fa",sub:"en el mes"},
              {label:"Clases Académicas", value:metrics.academicHours,      color:"#4ade80",sub:"recurrentes"},
              {label:"Horas Extraordin.", value:metrics.extraHours,         color:T.extraordinary,sub:"eventos únicos"},
              {label:"% Ocupación",       value:`${metrics.occupancyPct}%`, color:metrics.occupancyPct>80?"#f87171":metrics.occupancyPct>50?"#fb923c":"#4ade80",sub:"vs capacidad"},
            ].map(s=>(
              <div key={s.label} style={{...S.card(`${s.color}30`),display:"flex",flexDirection:"column" as const,gap:4}}>
                <div style={{fontSize: isMobile ? 22 : 28,fontWeight:800,color:s.color,fontFamily:"Montserrat,sans-serif"}}>{s.value}</div>
                <div style={{fontSize: isMobile ? 11 : 12,fontWeight:600,color:T.text}}>{s.label}</div>
                <div style={{fontSize:10,color:T.muted}}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* ── CHARTS ROW 1 — apiladas en móvil ── */}
          <div style={{
            display:"grid",
            gridTemplateColumns: isMobile ? "1fr" : "1.4fr 1fr",
            gap: isMobile ? 14 : 16,
          }}>
            <div style={S.card()}>
              <div style={S.section}>📅 Horas por Día</div>
              <div id="dash-chart-day" style={{width:"100%", height: chartH}}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartByDay} margin={{top:4,right:8,left: isMobile ? -28 : -20,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid}/>
                    <XAxis dataKey="dia" tick={{fill:T.muted,fontSize:tickSize}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:T.muted,fontSize:tickSizeS}} axisLine={false} tickLine={false}/>
                    <Tooltip content={<CustomTooltip/>}/>
                    <Bar dataKey="horas" name="Horas" fill={T.udAccent} radius={[4,4,0,0]}>
                      {chartByDay.map((_,i)=><Cell key={i} fill={i%2===0?T.udAccent:"#3b82f6"}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div style={S.card()}>
              <div style={S.section}>🧩 Composición</div>
              <div id="dash-chart-pie" style={{width:"100%", height: chartH}}>
                {metrics.totalHours>0?(
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" outerRadius={isMobile ? 55 : 70} dataKey="value"
                        label={({name,percent})=>`${Math.round(percent*100)}%`} labelLine={false}>
                        <Cell fill={T.udAccent}/><Cell fill={T.extraordinary}/>
                      </Pie>
                      <Tooltip content={<CustomTooltip/>}/>
                      <Legend iconSize={10} wrapperStyle={{fontSize: isMobile ? 10 : 11,color:T.muted}}/>
                    </PieChart>
                  </ResponsiveContainer>
                ):(
                  <div style={{height:chartH,display:"flex",alignItems:"center",justifyContent:"center",color:T.muted,fontSize:13}}>Sin datos</div>
                )}
              </div>
            </div>
          </div>

          {/* ── CHARTS ROW 2 — apiladas en móvil ── */}
          <div style={{
            display:"grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
            gap: isMobile ? 14 : 16,
          }}>
            <div style={S.card()}>
              <div style={S.section}>🎓 Uso por Programa</div>
              <div id="dash-chart-program" style={{width:"100%", height: chartH}}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartByProgram} layout="vertical"
                    margin={{top:0,right:20,left: isMobile ? 60 : 70,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid} horizontal={false}/>
                    <XAxis type="number" tick={{fill:T.muted,fontSize:tickSizeS}} axisLine={false} tickLine={false}/>
                    <YAxis type="category" dataKey="name" tick={{fill:T.text,fontSize:tickSize}} axisLine={false} tickLine={false} width={isMobile ? 56 : 65}/>
                    <Tooltip content={<CustomTooltip/>}/>
                    <Bar dataKey="value" name="Horas" radius={[0,4,4,0]}>
                      {chartByProgram.map((p,i)=><Cell key={i} fill={PROG_COLORS[p.name]||"#94a3b8"}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div style={S.card()}>
              <div style={S.section}>⏰ Horas Pico</div>
              <div id="dash-chart-hour" style={{width:"100%", height: chartH}}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartByHour} margin={{top:4,right:8,left: isMobile ? -28 : -20,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid}/>
                    <XAxis dataKey="hora" tick={{fill:T.muted,fontSize: isMobile ? 7 : 9}} axisLine={false} tickLine={false}
                      interval={isMobile ? 2 : 0}/>
                    <YAxis tick={{fill:T.muted,fontSize:tickSizeS}} axisLine={false} tickLine={false}/>
                    <Tooltip content={<CustomTooltip/>}/>
                    <Bar dataKey="reservas" name="Reservas" radius={[3,3,0,0]}>
                      {chartByHour.map((d,i)=>{
                        const pct=d.reservas/(Math.max(...chartByHour.map(x=>x.reservas))||1);
                        const r=Math.round(pct*239), g=Math.round((1-pct)*180+60);
                        return <Cell key={i} fill={`rgb(${r},${g},60)`}/>;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* TOP ROOMS — 1 columna en móvil */}
          <div style={S.card()}>
            <div style={S.section}>🏛️ Ocupación por Espacio (Top {topRooms.length})</div>
            <div style={{
              display:"grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(2,1fr)",
              gap:"8px 24px",
            }}>
              {topRooms.map(r=>(
                <div key={r.room}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:T.text,marginBottom:3}}>
                    <span style={{fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"60%"}}>{r.room}</span>
                    <span style={{color:T.muted,flexShrink:0}}>{r.hours}h · <span style={{color:r.pct>80?"#f87171":r.pct>50?"#fb923c":"#4ade80",fontWeight:700}}>{r.pct}%</span></span>
                  </div>
                  <div style={{height:8,borderRadius:4,background:T.border,overflow:"hidden"}}>
                    <div style={{height:"100%",borderRadius:4,width:`${r.pct}%`,background:r.pct>80?"#ef4444":r.pct>50?"#f59e0b":T.udAccent,transition:"width 0.5s ease"}}/>
                  </div>
                </div>
              ))}
              {topRooms.length===0&&(
                <div style={{gridColumn:"1/-1",textAlign:"center" as const,color:T.muted,fontSize:13,padding:20}}>
                  Sin datos para los filtros seleccionados
                </div>
              )}
            </div>
          </div>

          {/* EXTRAORDINARIAS */}
          <div style={S.card(`${T.extraordinary}30`)}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap" as const,gap:8}}>
              <div style={{...S.section,margin:0,color:T.extraordinary}}>
                ⭐ Extraordinarias — {MONTHS[selMonth-1]}
              </div>
              <span style={{fontSize:12,color:T.extraordinary,background:`${T.extraordinary}18`,padding:"3px 12px",borderRadius:99,border:`1px solid ${T.extraordinary}40`,fontWeight:600}}>
                {monthData.extraordinary.filter(r=>(selRoom==="__all__"||r.room===selRoom)&&(selCat==="all"||r.tipo_espacio===selCat)).length} eventos
              </span>
            </div>
            {(()=>{
              const extFiltered=monthData.extraordinary
                .filter(r=>(selRoom==="__all__"||r.room===selRoom)&&(selCat==="all"||r.tipo_espacio===selCat))
                .sort((a,b)=>(a.specific_date||"").localeCompare(b.specific_date||""));
              if(extFiltered.length===0) return(
                <div style={{textAlign:"center" as const,color:T.muted,fontSize:13,padding:"20px 0"}}>
                  No hay reservas extraordinarias en este período
                </div>
              );
              const byRoom:Record<string,Reservation[]>={};
              extFiltered.forEach(r=>{ if(!byRoom[r.room])byRoom[r.room]=[]; byRoom[r.room].push(r); });
              return(
                <div style={{display:"flex",flexDirection:"column" as const,gap:8}}>
                  {Object.entries(byRoom).map(([room,list])=>(
                    <div key={room}
                      onClick={()=>{setExtModalTitle(`${room} — ${MONTHS[selMonth-1]} ${selYear}`);setExtModal(list);}}
                      style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:T.bg3,borderRadius:8,padding:"10px 16px",border:`1px solid ${T.extraordinary}25`,cursor:"pointer",transition:"all 0.15s",minHeight:44}}
                      onMouseEnter={e=>(e.currentTarget.style.border=`1px solid ${T.extraordinary}60`)}
                      onMouseLeave={e=>(e.currentTarget.style.border=`1px solid ${T.extraordinary}25`)}>
                      <div style={{display:"flex",alignItems:"center",gap:12}}>
                        <div style={{width:10,height:10,borderRadius:"50%",background:T.extraordinary,flexShrink:0}}/>
                        <div>
                          <div style={{fontSize:13,fontWeight:600,color:T.text}}>{room}</div>
                          <div style={{fontSize:11,color:T.muted}}>{list.map(r=>r.specific_date?.slice(5)).join(", ")}</div>
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                        <span style={{fontSize:12,color:T.extraordinary,fontWeight:700}}>{list.length} evento{list.length!==1?"s":""}</span>
                        {!isMobile&&<span style={{fontSize:12,color:T.muted}}>Ver detalle →</span>}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

        </div>
      </div>

      {/* SPINNER */}
      {exporting&&(
        <div style={{position:"fixed",inset:0,zIndex:400,background:"rgba(0,0,0,0.82)",backdropFilter:"blur(10px)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:20}}>
          <div style={{width:64,height:64,borderRadius:"50%",border:"5px solid rgba(0,102,204,0.2)",borderTop:"5px solid #0066CC",animation:"fcmn-spin 0.8s linear infinite"}}/>
          <div style={{color:"#fff",fontSize:17,fontWeight:700,fontFamily:"Montserrat,sans-serif"}}>
            Generando reporte…
          </div>
          <div style={{color:"#60a5fa",fontSize:13,maxWidth:300,textAlign:"center",padding:"0 16px"}}>
            {exporting==="pdf"?"📄 Composiendo PDF con encabezado institucional…":"📗 Organizando hojas de cálculo…"}
          </div>
          <style>{`@keyframes fcmn-spin{to{transform:rotate(360deg);}}`}</style>
        </div>
      )}

      {/* MODAL DETALLE EXTRAORDINARIAS */}
      {extModal&&(
        <div style={{position:"fixed" as const,inset:0,zIndex:300,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"center",justifyContent:"center",padding: isMobile ? 0 : 16}} onClick={()=>setExtModal(null)}>
          <div style={{background:T.bg2,borderRadius: isMobile ? 0 : 12,border:`1px solid ${T.extraordinary}50`,width:"100%",maxWidth:640,maxHeight: isMobile ? "100vh" : "80vh",overflowY:"auto" as const,boxShadow:T.shadow}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",borderBottom:`1px solid ${T.border}`,background:`${T.extraordinary}10`,borderRadius: isMobile ? 0 : "12px 12px 0 0"}}>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:T.extraordinary}}>⭐ {extModalTitle}</div>
                <div style={{fontSize:11,color:T.muted,marginTop:2}}>Reservas extraordinarias detalladas</div>
              </div>
              <button onClick={()=>setExtModal(null)} style={{background:"transparent",border:"none",color:T.muted,fontSize:20,cursor:"pointer",minWidth:44,minHeight:44}}>✕</button>
            </div>
            <div style={{padding:16,display:"flex",flexDirection:"column" as const,gap:10}}>
              {extModal.sort((a,b)=>(a.specific_date||"").localeCompare(b.specific_date||"")).map((r,i)=>(
                <div key={i} style={{background:T.bg3,borderRadius:8,padding:"12px 16px",border:`1px solid ${T.extraordinary}25`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                    <div style={{fontSize:13,fontWeight:700,color:T.text}}>{r.subject}</div>
                    <span style={{fontSize:10,background:`${T.extraordinary}20`,color:T.extraordinary,padding:"2px 8px",borderRadius:99,border:`1px solid ${T.extraordinary}40`,fontWeight:600,flexShrink:0,marginLeft:8}}>
                      {r.tipo_reserva==="bloqueo"?"🔒 Bloqueo":"⭐ Extra"}
                    </span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",gap:"4px 12px",fontSize:11,color:T.muted}}>
                    <span>📅 <b style={{color:T.text}}>{r.specific_date?new Date(r.specific_date+"T12:00:00").toLocaleDateString("es-CO",{weekday:"long",year:"numeric",month:"long",day:"numeric"}):"—"}</b></span>
                    <span>⏰ <b style={{color:T.text}}>{r.hour} – {r.hour_end}</b></span>
                    <span>👤 <b style={{color:T.text}}>{r.teacher||"—"}</b></span>
                    <span>🎓 <b style={{color:PROG_COLORS[r.program]||T.text}}>{r.program||"—"}</b></span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}