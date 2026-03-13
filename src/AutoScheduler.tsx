import { useState, useCallback } from "react";
import * as XLSX from "xlsx";
import { useTheme } from "./ThemeContext";
import { useBreakpoint } from "./useIsMobile";

const CAPACIDAD_MAX_LAB = 15;
const SUPABASE_URL = "https://wlisbvcqqjlgzfvbnscp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsaXNidmNxcWpsZ3pmdmJuc2NwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0Njg5MDIsImV4cCI6MjA4ODA0NDkwMn0.66Ly-QcVzj0rM5DyH6o3NDE-jfPSlPgRuJYyTDMlW4g";

const TEORIA_ROOMS = [
  { name:"AUDITORIO",          capacity:200, espacio:"teoria" as const, subtipo:"Aula" },
  { name:"1001",               capacity:45,  espacio:"teoria" as const, subtipo:"Aula" },
  { name:"1004",               capacity:45,  espacio:"teoria" as const, subtipo:"Aula" },
  { name:"1005",               capacity:45,  espacio:"teoria" as const, subtipo:"Aula" },
  { name:"1006",               capacity:45,  espacio:"teoria" as const, subtipo:"Aula" },
  { name:"1007",               capacity:45,  espacio:"teoria" as const, subtipo:"Aula" },
  { name:"1008",               capacity:45,  espacio:"teoria" as const, subtipo:"Aula" },
  { name:"1009",               capacity:45,  espacio:"teoria" as const, subtipo:"Aula" },
  { name:"1101",               capacity:45,  espacio:"teoria" as const, subtipo:"Aula" },
  { name:"1104",               capacity:45,  espacio:"teoria" as const, subtipo:"Aula" },
  { name:"1105",               capacity:45,  espacio:"teoria" as const, subtipo:"Aula" },
  { name:"1106",               capacity:45,  espacio:"teoria" as const, subtipo:"Aula" },
  { name:"1107",               capacity:45,  espacio:"teoria" as const, subtipo:"Aula" },
  { name:"1108",               capacity:45,  espacio:"teoria" as const, subtipo:"Aula" },
  { name:"1109",               capacity:45,  espacio:"teoria" as const, subtipo:"Aula" },
  { name:"1002 Sala Sis",      capacity:30,  espacio:"teoria" as const, subtipo:"Sala de Sistemas" },
  { name:"1003 Sala Sis",      capacity:30,  espacio:"teoria" as const, subtipo:"Sala de Sistemas" },
  { name:"1010 Sala Sis",      capacity:30,  espacio:"teoria" as const, subtipo:"Sala de Sistemas" },
  { name:"1102 Sala Sis",      capacity:30,  espacio:"teoria" as const, subtipo:"Sala de Sistemas" },
  { name:"1103 Sala Sis",      capacity:30,  espacio:"teoria" as const, subtipo:"Sala de Sistemas" },
  { name:"1110 Sala Sis",      capacity:30,  espacio:"teoria" as const, subtipo:"Sala de Sistemas" },
  { name:"SALA ESP. (PISO 4)", capacity:25,  espacio:"teoria" as const, subtipo:"Aula" },
];

const LAB_ROOMS = [
  { name:"Lab 1 Bio",    capacity:CAPACIDAD_MAX_LAB, espacio:"lab" as const, subtipo:"Laboratorio" },
  { name:"Lab 2 Bio",    capacity:CAPACIDAD_MAX_LAB, espacio:"lab" as const, subtipo:"Laboratorio" },
  { name:"Lab 3 Bio",    capacity:CAPACIDAD_MAX_LAB, espacio:"lab" as const, subtipo:"Laboratorio" },
  { name:"Lab 4 Bio",    capacity:CAPACIDAD_MAX_LAB, espacio:"lab" as const, subtipo:"Laboratorio" },
  { name:"Lab 1 Qca",    capacity:CAPACIDAD_MAX_LAB, espacio:"lab" as const, subtipo:"Laboratorio" },
  { name:"Lab 2 Qca",    capacity:CAPACIDAD_MAX_LAB, espacio:"lab" as const, subtipo:"Laboratorio" },
  { name:"Lab 3 Qca",    capacity:CAPACIDAD_MAX_LAB, espacio:"lab" as const, subtipo:"Laboratorio" },
  { name:"Lab 5 Qca",    capacity:CAPACIDAD_MAX_LAB, espacio:"lab" as const, subtipo:"Laboratorio" },
  { name:"Lab 6 Qca",    capacity:CAPACIDAD_MAX_LAB, espacio:"lab" as const, subtipo:"Laboratorio" },
  { name:"Instrumental", capacity:CAPACIDAD_MAX_LAB, espacio:"lab" as const, subtipo:"Laboratorio" },
];

const DAYS            = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const DAYS_SIN_SABADO = ["Lunes","Martes","Miércoles","Jueves","Viernes"];
const HOURS = ["06:00","07:00","08:00","09:00","10:00","11:00",
               "12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00"];
const SUBGROUP_LABELS = ["Lab A","Lab B","Lab C","Lab D","Lab E","Lab F"];

interface ProgramConfig { program: string; maxGapHours: number; }
interface LabAvailability { lab: string; program: string; day: string; from: string; to: string; }
interface ClassRequest {
  id: string; program: string; cohort: string; cohortNumber: number;
  subject: string; type: "Teoría"|"Laboratorio";
  tipoEspacio: "Aula"|"Sala de Sistemas"|"Laboratorio";
  teacher: string; hoursBlock: number; students: number;
  subgroup?: string; parentId?: string;
  diasDisponibles?: string[]; horaDesde?: string; horaHasta?: string;
  espacioEspecifico?: string;
}
interface Assignment {
  request: ClassRequest; day: string; hour: string; hour_end: string;
  room: string; tipo_espacio: "teoria"|"lab"; displayLabel: string; score: number;
}
interface Conflict { request: ClassRequest; reason: string; type: "hard"|"soft"; }
interface RoomEntry { name: string; capacity: number; espacio: "teoria"|"lab"; subtipo: string; }

function normalizarPrograma(p: string): string {
  const s = p.toLowerCase().trim();
  if (s.includes("quím") || s === "quimica") return "Química";
  if (s.includes("biol")) return "Biología";
  if (s.includes("físic") || s === "fisica") return "Física";
  if (s.includes("matem")) return "Matemáticas";
  return p.trim();
}
function normalizarTipoEspacio(t?: string): "Aula"|"Sala de Sistemas"|"Laboratorio" {
  if (!t) return "Aula";
  const s = t.toLowerCase().trim();
  if (s.includes("sistem")) return "Sala de Sistemas";
  if (s.includes("lab"))    return "Laboratorio";
  return "Aula";
}
function normalizarHora(h: string|number): string {
  if (typeof h === "number") {
    const totalMinutes = Math.round(h * 24 * 60);
    const hh = Math.floor(totalMinutes / 60);
    const mm = totalMinutes % 60;
    return `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
  }
  const parts = String(h).split(":");
  if (parts.length !== 2) return String(h);
  return `${parts[0].padStart(2,"0")}:${parts[1].padStart(2,"0")}`;
}
function extraerNumeroSemestre(cohort: string): number {
  const m = cohort.match(/\d+/); return m ? parseInt(m[0]) : 0;
}
function parsearDias(raw?: string): string[] {
  if (!raw || !raw.trim()) return [];
  return raw.split(",").map(d => d.trim()).filter(d => DAYS.includes(d));
}
function parsearHoras(raw?: string): { desde: string; hasta: string }|null {
  if (!raw || !raw.trim()) return null;
  const parts = raw.split("-").map(h => h.trim());
  if (parts.length !== 2) return null;
  return { desde: parts[0], hasta: parts[1] };
}
function getHourIndex(h: string): number { return HOURS.indexOf(h); }
function getBlock(start: string, n: number): string[] {
  const i = getHourIndex(start);
  if (i === -1 || i + n > HOURS.length) return [];
  return HOURS.slice(i, i + n);
}

function splitLabRequests(requests: ClassRequest[], maxLabCap: number = CAPACIDAD_MAX_LAB): ClassRequest[] {
  const result: ClassRequest[] = [];
  for (const req of requests) {
    if (req.type !== "Laboratorio") { result.push(req); continue; }
    const n = Math.ceil(req.students / maxLabCap);
    if (n <= 1) { result.push({ ...req, subgroup: req.subgroup || SUBGROUP_LABELS[0] }); continue; }
    const perGroup = Math.ceil(req.students / n);
    for (let i = 0; i < n; i++) {
      const label = SUBGROUP_LABELS[i] || `Lab ${String.fromCharCode(65+i)}`;
      result.push({
        ...req, id:`${req.id}-sg${i}`, parentId:req.id, subgroup:label,
        students: i===n-1 ? req.students-perGroup*(n-1) : perGroup,
      });
    }
  }
  return result;
}

function buildRoomPools(externalSpaces?: any[]): { teoriaPool: RoomEntry[]; labPool: RoomEntry[] } {
  if (externalSpaces && externalSpaces.length > 0) {
    const activeSpaces = externalSpaces.filter((s: any) => s.activo);
    const allHardcoded = [...TEORIA_ROOMS, ...LAB_ROOMS];
    const teoriaPool: RoomEntry[] = [];
    const labPool:    RoomEntry[] = [];
    for (const s of activeSpaces) {
      const hardcoded = allHardcoded.find(r => r.name === s.nombre);
      const isLab     = s.tipo === "Laboratorio" || (hardcoded?.espacio === "lab");
      const subtipo   = hardcoded?.subtipo || s.tipo || "Aula";
      const entry: RoomEntry = { name: s.nombre, capacity: s.capacidad, espacio: isLab ? "lab" : "teoria", subtipo };
      if (isLab) labPool.push(entry); else teoriaPool.push(entry);
    }
    return {
      teoriaPool: teoriaPool.length > 0 ? teoriaPool : TEORIA_ROOMS.map(r => ({ ...r })),
      labPool,
    };
  }
  return {
    teoriaPool: TEORIA_ROOMS.map(r => ({ ...r })),
    labPool:    LAB_ROOMS.map(r => ({ ...r })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MOTOR v5 — OPTIMIZADO (5 niveles)
// OPT 1a: Pool ordenado una vez fuera de findCandidates
// OPT 1b: Bucles con índices numéricos puros, strings solo al guardar
// OPT 2:  Índices en SlotMap y teoriaSlots (evitar HOURS.indexOf en hot path)
// OPT 3:  Desempate estocástico en softScore
// OPT 4:  Rip-up and Reroute two-phase (sin bucles infinitos)
// OPT 5:  generateSchedule async con estado "Calculando..." (ver componente)
// ─────────────────────────────────────────────────────────────────────────────
function runScheduler(
  rawRequests: ClassRequest[], programConfig: ProgramConfig[],
  labAvailability: LabAvailability[], externalSpaces?: any[],
): { assignments: Assignment[]; conflicts: Conflict[] } {
  const assignments: Assignment[] = [];
  const conflicts:   Conflict[]   = [];

  const { teoriaPool, labPool } = buildRoomPools(externalSpaces);
  const maxLabCap = labPool.length > 0 ? Math.min(...labPool.map(r => r.capacity)) : CAPACIDAD_MAX_LAB;
  const requests  = splitLabRequests(rawRequests, maxLabCap);

  // ── Mapas de ocupación ──────────────────────────────────────────────────────
  // OPT 1b: Indexamos horas como number (0–13) en cohortDayHours/teoriaSlots
  //         Los SlotMap siguen usando string como key para compatibilidad con
  //         teacherBreak/roomOccupied que se inicializan con HOURS string keys
  type SlotMap = Record<string, Record<string, Record<string, boolean>>>;
  const roomOccupied:         SlotMap = {};
  const teacherOccupied:      SlotMap = {};
  const cohortOccupied:       SlotMap = {};
  const teacherBreak:         SlotMap = {};
  const cohortDayHours:       Record<string, Record<string, number[]>> = {};
  const programDaySemesters:  Record<string, Set<number>> = {};
  const parentAssignedSlots:  Record<string, Array<{day:string; hours:string[]}>> = {};
  const parentRoomPreference: Record<string, string> = {};
  // OPT 1b: teoriaSlots ahora guarda índices numéricos en lugar de string arrays
  const teoriaSlots:          Record<string, Array<{day:string; hi:number; len:number}>> = {};
  const roomUsageCount:       Record<string, number> = {};

  DAYS.forEach(d => {
    roomOccupied[d] = {}; teacherOccupied[d] = {};
    cohortOccupied[d] = {}; teacherBreak[d] = {};
    HOURS.forEach(h => {
      roomOccupied[d][h] = {}; teacherOccupied[d][h] = {};
      cohortOccupied[d][h] = {}; teacherBreak[d][h] = {};
    });
  });
  [...teoriaPool, ...labPool].forEach(r => { roomUsageCount[r.name] = 0; });

  // ── Ordenamiento y prioridad ────────────────────────────────────────────────
  const difficultyScore = (r: ClassRequest): number => {
    let s = r.hoursBlock * 150;
    if (r.diasDisponibles?.length) s += (6 - r.diasDisponibles.length) * 80;
    if (r.espacioEspecifico) s += 300;
    if (r.type === "Laboratorio") s += 50;
    s += r.students;
    return s;
  };

  const cohortOrder = new Map<string, number>();
  let cohortIdx = 0;
  for (const r of requests) {
    const key = `${r.program}__${r.cohort}`;
    if (!cohortOrder.has(key)) cohortOrder.set(key, cohortIdx++);
  }
  const sorted = [...requests].sort((a, b) => {
    const diff = (cohortOrder.get(`${a.program}__${a.cohort}`) ?? 0)
               - (cohortOrder.get(`${b.program}__${b.cohort}`) ?? 0);
    return diff !== 0 ? diff : difficultyScore(b) - difficultyScore(a);
  });

  // ── softScore ───────────────────────────────────────────────────────────────
  // OPT 1b: recibe hi (índice numérico) en lugar de block (string[])
  // OPT 3:  desempate estocástico al final
  const softScore = (
    req: ClassRequest, day: string,
    hi: number,            // OPT 1b: índice numérico de inicio
    room: RoomEntry,
    sedeViolation: boolean,
  ): number => {
    let score = 0;
    if (sedeViolation) score -= 40;

    const pdKey = `${req.program}|${day}`;
    const semsEnDia = programDaySemesters[pdKey] || new Set<number>();
    if (semsEnDia.has(req.cohortNumber - 1) || semsEnDia.has(req.cohortNumber + 1))
      score -= 10; else score += 5;

    // OPT 1b: comparación de índice en lugar de string "12:00"
    if (hi < 6) score += 3; // índice 6 = "12:00"

    const ck = `${req.program}__${req.cohort}`;
    const existentesHoy = cohortDayHours[ck]?.[day] || [];
    if (existentesHoy.length > 0) {
      const ei = hi + req.hoursBlock - 1;
      const pegadoDespues = existentesHoy.some(idx => idx === hi - 1);
      const pegadoAntes   = existentesHoy.some(idx => idx === ei + 1);
      if (pegadoDespues || pegadoAntes) score += 50;
      const hayHueco1h = existentesHoy.some(idx => idx === hi - 2 || idx === ei + 2);
      if (hayHueco1h && !pegadoDespues && !pegadoAntes) score -= 20;
    }

    if (sedeViolation) {
      const tipoOpuesto = req.type === "Laboratorio" ? "teoria" : "lab";
      // OPT 1b: construimos índices en lugar de strings para comparar proximidad
      const horasOpuestasIdx = assignments
        .filter(a =>
          a.day === day &&
          a.tipo_espacio === tipoOpuesto &&
          `${a.request.program}__${a.request.cohort}` === ck
        )
        .flatMap(a => {
          const ai = getHourIndex(a.hour);
          return Array.from({ length: a.request.hoursBlock }, (_, k) => ai + k);
        });
      const ei = hi + req.hoursBlock - 1;
      const demasiadoCerca = horasOpuestasIdx.some(th =>
        Math.abs(th - hi) <= 1 || Math.abs(th - ei) <= 1
      );
      if (demasiadoCerca) score -= 999;
    }

    if (room.capacity - req.students > 30) score -= 2;
    score -= (roomUsageCount[room.name] || 0) * 3;

    if (req.parentId) {
      const pref = parentRoomPreference[req.parentId];
      if (pref && pref !== room.name) score -= 5;
      const pSlots = parentAssignedSlots[req.parentId] || [];
      const sgAdyacente = pSlots.some(ps => {
        if (ps.day !== day) return false;
        const lastIdx = getHourIndex(ps.hours[ps.hours.length - 1]);
        return lastIdx + 1 === hi;
      });
      if (sgAdyacente) score += 30;
    }

    // OPT 3: Desempate estocástico — nudge aleatorio pequeño para evitar
    //         sesgos estructurales (e.g. siempre llena "1001" antes que "1004")
    score += Math.random() * 0.5;

    return score;
  };

  // ── findCandidates ──────────────────────────────────────────────────────────
  // OPT 1a: recibe sortedPool ya ordenado (no hace sort interno)
  // OPT 1b: todo el hot path usa índices numéricos; strings solo para lookups de SlotMap
  const findCandidates = (
    req: ClassRequest,
    sortedPool: RoomEntry[],       // OPT 1a: pre-sorted, passed from outside
    respectarGap: boolean,
    sedeModo: "hard"|"soft"|"off",
    includeSabado: boolean,
  ) => {
    const cohortKey = `${req.program}__${req.cohort}`;
    const effectiveCohortKey = (req.type === "Laboratorio" && req.subgroup)
      ? `${req.program}__${req.cohort}__${req.subgroup}`
      : cohortKey;
    const teoriaKey   = `${cohortKey}__${req.subject}`;
    const parentSlots = req.parentId ? (parentAssignedSlots[req.parentId] || []) : [];
    const teoriaOcup  = teoriaSlots[teoriaKey] || [];

    // OPT 1b: convertir hora constraints a índices una sola vez, fuera de los loops
    const hiDesde = req.horaDesde ? getHourIndex(req.horaDesde) : 0;
    const hiHasta = req.horaHasta ? getHourIndex(req.horaHasta) : HOURS.length - 1;

    let diasBase: string[];
    if (req.diasDisponibles?.length) {
      diasBase = req.diasDisponibles.filter(d => includeSabado ? true : d !== "Sábado");
    } else {
      diasBase = includeSabado ? DAYS : DAYS_SIN_SABADO;
    }

    const candidates: Array<{ day:string; hi:number; room:RoomEntry; score:number }> = [];

    for (const day of diasBase) {
      const existeLab    = assignments.some(a => a.day === day && a.tipo_espacio === "lab"    && `${a.request.program}__${a.request.cohort}` === cohortKey);
      const existeTeoria = assignments.some(a => a.day === day && a.tipo_espacio === "teoria" && `${a.request.program}__${a.request.cohort}` === cohortKey);
      const sedeConflicto = (req.type === "Laboratorio" && existeTeoria) || (req.type === "Teoría" && existeLab);
      if (sedeModo === "hard" && sedeConflicto) continue;

      const maxHi = HOURS.length - req.hoursBlock;
      for (let hi = 0; hi <= maxHi; hi++) { // OPT 1b: loop numérico puro
        // OPT 1b: constraints horarias como índices (sin string compare)
        if (hi < hiDesde) continue;
        if (hi + req.hoursBlock - 1 > hiHasta) continue;

        // OPT 1b: verificar teacher/cohort con loop de índices — evita getBlock + .some
        let slotBlocked = false;
        for (let bi = hi; bi < hi + req.hoursBlock; bi++) {
          const h = HOURS[bi];
          if (
            teacherBreak[day][h]?.[req.teacher] ||
            teacherOccupied[day][h]?.[req.teacher] ||
            cohortOccupied[day][h]?.[effectiveCohortKey]
          ) { slotBlocked = true; break; }
        }
        if (slotBlocked) continue;

        // parentSlots: poco frecuente, OK con strings
        if (req.parentId && parentSlots.length > 0) {
          const blockStr = HOURS.slice(hi, hi + req.hoursBlock);
          if (parentSlots.some(ps => ps.day === day && ps.hours.some(h => blockStr.includes(h)))) continue;
        }

        // OPT 1b: teoriaOcup ahora guarda {hi, len} — comparación numérica directa
        if (req.type === "Laboratorio" && teoriaOcup.length > 0) {
          let cruza = false;
          for (const ts of teoriaOcup) {
            if (ts.day !== day) continue;
            for (let bi = hi; bi < hi + req.hoursBlock; bi++) {
              if (bi >= ts.hi && bi < ts.hi + ts.len) { cruza = true; break; }
            }
            if (cruza) break;
          }
          if (cruza) continue;
        }

        // Gap constraint
        if (respectarGap) {
          const cfg    = programConfig.find(p => p.program === req.program);
          const maxGap = cfg?.maxGapHours ?? 999;
          if (maxGap < 999) {
            const existentes = cohortDayHours[cohortKey]?.[day] || [];
            if (existentes.length > 0) {
              const minE = Math.min(...existentes);
              const maxE = Math.max(...existentes);
              if (hi - maxE - 1 > maxGap) continue;
              const gapD = minE - (hi + req.hoursBlock);
              if (gapD > 0 && gapD > maxGap) continue;
            }
          }
        }

        for (const room of sortedPool) {
          // OPT 1b: room occupancy con loop de índices
          let roomBlocked = false;
          for (let bi = hi; bi < hi + req.hoursBlock; bi++) {
            if (roomOccupied[day][HOURS[bi]]?.[room.name]) { roomBlocked = true; break; }
          }
          if (roomBlocked) continue;

          if (!req.espacioEspecifico && req.type !== "Laboratorio") {
            if (room.subtipo !== req.tipoEspacio) continue;
          }

          // Hora apertura/cierre con índices
          if (externalSpaces) {
            const ext = externalSpaces.find((s: any) => s.nombre === room.name);
            if (ext) {
              const normT = (t: any): string => {
                if (!t) return "";
                const m = String(t).trim().match(/^(\d{1,2}):(\d{2})/);
                return m ? `${m[1].padStart(2,"0")}:${m[2]}` : "";
              };
              const apertura = normT(ext.hora_apertura) || "06:00";
              const cierre   = normT(ext.hora_cierre)   || "19:00";
              let fuera = false;
              for (let bi = hi; bi < hi + req.hoursBlock; bi++) {
                if (HOURS[bi] < apertura || HOURS[bi] >= cierre) { fuera = true; break; }
              }
              if (fuera) continue;
            }
          }

          // Ventanas de lab
          if (req.type === "Laboratorio" && labAvailability.length > 0) {
            const progTieneVentanas = labAvailability.some(la => la.program === req.program);
            if (progTieneVentanas) {
              const ventanas = labAvailability.filter(la =>
                la.lab === room.name && la.program === req.program && la.day === day
              );
              if (ventanas.length === 0) continue;
              const dentro = ventanas.some(v => {
                for (let bi = hi; bi < hi + req.hoursBlock; bi++) {
                  if (HOURS[bi] < v.from || HOURS[bi] >= v.to) return false;
                }
                return true;
              });
              if (!dentro) continue;
            }
          }

          const sedeViolation = sedeModo === "soft" && sedeConflicto;
          // OPT 1b: guardamos hi numérico en el candidato
          candidates.push({ day, hi, room, score: softScore(req, day, hi, room, sedeViolation) });
        }
      }
    }
    return candidates;
  };

  // ── confirmarAsignacion ─────────────────────────────────────────────────────
  // OPT 1b: recibe hi numérico, convierte a strings solo al guardar en Assignment
  const confirmarAsignacion = (
    req: ClassRequest,
    best: { day:string; hi:number; room:RoomEntry; score:number },
  ) => {
    const cohortKey = `${req.program}__${req.cohort}`;
    const effectiveCohortKey = (req.type === "Laboratorio" && req.subgroup)
      ? `${req.program}__${req.cohort}__${req.subgroup}`
      : cohortKey;
    const teoriaKey = `${cohortKey}__${req.subject}`;
    const { day, hi, room } = best;
    // OPT 1b: strings solo aquí, al momento de persistir
    const startStr = HOURS[hi];
    const block    = HOURS.slice(hi, hi + req.hoursBlock);

    for (let bi = hi; bi < hi + req.hoursBlock; bi++) {
      const h = HOURS[bi];
      roomOccupied[day][h][room.name]            = true;
      teacherOccupied[day][h][req.teacher]       = true;
      cohortOccupied[day][h][effectiveCohortKey] = true;
    }
    if (!cohortDayHours[cohortKey])      cohortDayHours[cohortKey] = {};
    if (!cohortDayHours[cohortKey][day]) cohortDayHours[cohortKey][day] = [];
    // OPT 1b: guardamos índices numéricos en cohortDayHours
    for (let bi = hi; bi < hi + req.hoursBlock; bi++) cohortDayHours[cohortKey][day].push(bi);

    const pdKey = `${req.program}|${day}`;
    if (!programDaySemesters[pdKey]) programDaySemesters[pdKey] = new Set();
    programDaySemesters[pdKey].add(req.cohortNumber);

    if (req.type === "Teoría") {
      if (!teoriaSlots[teoriaKey]) teoriaSlots[teoriaKey] = [];
      // OPT 1b: teoriaSlots guarda {hi, len} numéricos
      teoriaSlots[teoriaKey].push({ day, hi, len: req.hoursBlock });
    }
    if (req.parentId) {
      if (!parentAssignedSlots[req.parentId]) parentAssignedSlots[req.parentId] = [];
      parentAssignedSlots[req.parentId].push({ day, hours: block });
      if (!parentRoomPreference[req.parentId]) parentRoomPreference[req.parentId] = room.name;
    }
    if (req.hoursBlock >= 4) {
      const bi = hi + req.hoursBlock;
      if (bi < HOURS.length) teacherBreak[day][HOURS[bi]][req.teacher] = true;
    }
    roomUsageCount[room.name] = (roomUsageCount[room.name] || 0) + 1;

    const subgroupLabel = req.subgroup ? ` · ${req.subgroup}` : "";
    assignments.push({
      request: req, day,
      hour:     startStr,
      // OPT 1b: hour_end = índice siguiente = end exclusivo correcto para el grid
      hour_end: HOURS[hi + req.hoursBlock] || HOURS[hi + req.hoursBlock - 1],
      room: room.name,
      tipo_espacio: req.type === "Laboratorio" ? "lab" : "teoria",
      displayLabel: `${req.subject}${subgroupLabel}`,
      score: best.score,
    });
  };

  // ── OPT 4: Rip-up and Reroute ───────────────────────────────────────────────
  // Garantías anti-bucle infinito:
  //   1. ripupDone: cada req.id dispara rip-up como máximo UNA VEZ
  //   2. reroutedIds: clases ya desalojadas NO pueden desalojar a nadie más
  //   3. Solo desaloja si evictee.hoursBlock < req.hoursBlock (jerarquía estricta)
  //   4. Two-phase commit: libera mapas temporalmente → verifica → restaura si falla
  const ripupDone   = new Set<string>();
  const reroutedIds = new Set<string>();
  const rerouteQueue: ClassRequest[] = [];

  const attemptRipup = (req: ClassRequest, sortedPool: RoomEntry[]): boolean => {
    if (ripupDone.has(req.id)) return false; // garantía 1
    ripupDone.add(req.id);

    for (let i = 0; i < assignments.length; i++) {
      const a = assignments[i];
      if (a.request.hoursBlock >= req.hoursBlock) continue; // garantía 3
      if (reroutedIds.has(a.request.id)) continue;          // garantía 2

      const evictReq = a.request;
      const evictHi  = getHourIndex(a.hour);
      const evictCK  = `${evictReq.program}__${evictReq.cohort}`;
      const evictECK = (evictReq.type === "Laboratorio" && evictReq.subgroup)
        ? `${evictReq.program}__${evictReq.cohort}__${evictReq.subgroup}`
        : evictCK;

      // FASE 1: liberar temporalmente solo los mapas de ocupación (no assignments[])
      for (let bi = evictHi; bi < evictHi + evictReq.hoursBlock; bi++) {
        const h = HOURS[bi];
        delete roomOccupied[a.day][h][a.room];
        delete teacherOccupied[a.day][h][evictReq.teacher];
        delete cohortOccupied[a.day][h][evictECK];
      }

      // FASE 2: buscar candidatos para la clase crítica
      let cands = findCandidates(req, sortedPool, true,  "hard", false);
      if (!cands.length) cands = findCandidates(req, sortedPool, false, "hard", false);
      if (!cands.length) cands = findCandidates(req, sortedPool, false, "soft", false);

      if (cands.length > 0) {
        // FASE 3a: COMMIT — remover evictee de todas las estructuras de datos
        assignments.splice(i, 1);
        if (cohortDayHours[evictCK]?.[a.day]) {
          cohortDayHours[evictCK][a.day] = cohortDayHours[evictCK][a.day]
            .filter(idx => idx < evictHi || idx >= evictHi + evictReq.hoursBlock);
        }
        const evictTeoKey = `${evictCK}__${evictReq.subject}`;
        if (evictReq.type === "Teoría" && teoriaSlots[evictTeoKey]) {
          teoriaSlots[evictTeoKey] = teoriaSlots[evictTeoKey]
            .filter(ts => !(ts.day === a.day && ts.hi === evictHi));
        }
        if (evictReq.parentId && parentAssignedSlots[evictReq.parentId]) {
          parentAssignedSlots[evictReq.parentId] = parentAssignedSlots[evictReq.parentId]
            .filter(ps => !(ps.day === a.day && ps.hours[0] === a.hour));
        }
        if (evictReq.hoursBlock >= 4) {
          const bi = evictHi + evictReq.hoursBlock;
          if (bi < HOURS.length) delete teacherBreak[a.day][HOURS[bi]][evictReq.teacher];
        }
        roomUsageCount[a.room] = Math.max(0, (roomUsageCount[a.room] || 1) - 1);

        // Asignar la clase crítica
        const ck = `${req.program}__${req.cohort}`;
        const adj = cands.filter(c => {
          const ex = cohortDayHours[ck]?.[c.day] || [];
          if (!ex.length) return false;
          const ei = c.hi + req.hoursBlock - 1;
          return ex.some(idx => idx === c.hi - 1) || ex.some(idx => idx === ei + 1);
        });
        const finalPool = adj.length > 0 ? adj : cands;
        finalPool.sort((x, y) => y.score - x.score);
        confirmarAsignacion(req, finalPool[0]);

        // Re-encolar evictee (marcado: no puede hacer rip-up)
        reroutedIds.add(evictReq.id);
        rerouteQueue.push(evictReq);
        return true;
      } else {
        // FASE 3b: ROLLBACK — restaurar mapas de ocupación
        for (let bi = evictHi; bi < evictHi + evictReq.hoursBlock; bi++) {
          const h = HOURS[bi];
          roomOccupied[a.day][h][a.room]              = true;
          teacherOccupied[a.day][h][evictReq.teacher] = true;
          cohortOccupied[a.day][h][evictECK]          = true;
        }
        // Continuar al siguiente candidato de desalojo
      }
    }
    return false;
  };

  // ── Helper: elegir mejor candidato con filtro de adyacencia ─────────────────
  const elegirMejor = (req: ClassRequest, candidates: Array<{day:string;hi:number;room:RoomEntry;score:number}>) => {
    const ck = `${req.program}__${req.cohort}`;
    const adyacentes = candidates.filter(c => {
      const ex = cohortDayHours[ck]?.[c.day] || [];
      if (!ex.length) return false;
      const ei = c.hi + req.hoursBlock - 1;
      return ex.some(idx => idx === c.hi - 1) || ex.some(idx => idx === ei + 1);
    });
    const pool2 = adyacentes.length > 0 ? adyacentes : candidates;
    pool2.sort((a, b) => b.score - a.score);
    return pool2[0];
  };

  // ── Función auxiliar para construir sortedPool ──────────────────────────────
  // OPT 1a: lógica de pool extraída para reusar en main loop y reroute loop
  const buildSortedPool = (req: ClassRequest): RoomEntry[] | null => {
    let basePool: RoomEntry[];
    if (req.type === "Laboratorio") {
      basePool = labPool;
    } else {
      basePool = teoriaPool.filter(r => r.subtipo === req.tipoEspacio);
      if (!basePool.length) basePool = teoriaPool;
    }
    let pool = basePool.filter(r => {
      if (r.capacity < req.students) return false;
      const ext = externalSpaces?.find((s: any) => s.nombre === r.name);
      if (ext && !ext.activo) return false;
      return true;
    });
    if (req.espacioEspecifico) {
      const forced = [...teoriaPool, ...labPool].find(r => r.name === req.espacioEspecifico);
      if (!forced) return null;
      pool = [forced];
    }
    if (!pool.length) return null;

    // OPT 1a: sort UNA sola vez aquí, fuera de findCandidates
    const preferredRoom = req.parentId ? parentRoomPreference[req.parentId] : undefined;
    return [...pool].sort((a, b) => {
      if (preferredRoom && !req.espacioEspecifico) {
        if (a.name === preferredRoom) return -1;
        if (b.name === preferredRoom) return 1;
      }
      return (a.capacity - req.students) - (b.capacity - req.students);
    });
  };

  // ── Loop principal ──────────────────────────────────────────────────────────
  for (const req of sorted) {
    const sortedPool = buildSortedPool(req);

    if (!sortedPool) {
      const reason = req.espacioEspecifico
        ? `Espacio específico "${req.espacioEspecifico}" no encontrado.`
        : `Sin espacio tipo "${req.tipoEspacio}" con capacidad ≥ ${req.students}.`;
      conflicts.push({ request: req, reason, type: "hard" });
      continue;
    }

    // Cascada de 6 intentos
    let candidates = findCandidates(req, sortedPool, true,  "hard", false);
    if (!candidates.length) candidates = findCandidates(req, sortedPool, false, "hard", false);
    if (!candidates.length) candidates = findCandidates(req, sortedPool, true,  "soft", false);
    if (!candidates.length) candidates = findCandidates(req, sortedPool, false, "soft", false);
    if (!candidates.length) candidates = findCandidates(req, sortedPool, false, "soft", true);
    if (!candidates.length) candidates = findCandidates(req, sortedPool, false, "off",  true);

    if (candidates.length > 0) {
      confirmarAsignacion(req, elegirMejor(req, candidates));
    } else {
      // OPT 4: Rip-up solo para clases críticas y no ya-desalojadas
      const isCritical = req.hoursBlock >= 3 || !!req.espacioEspecifico;
      if (isCritical && !reroutedIds.has(req.id) && attemptRipup(req, sortedPool)) {
        // éxito silencioso — ya asignado dentro de attemptRipup
      } else {
        conflicts.push({
          request: req,
          reason: `No hay cupo para "${req.subject}"${req.subgroup ? ` (${req.subgroup})` : ""}`,
          type: "hard",
        });
      }
    }
  }

  // OPT 4: Procesar cola de re-enrutados (sin rip-up, sin cascade completa)
  for (const req of rerouteQueue) {
    const sortedPool = buildSortedPool(req);
    if (!sortedPool) {
      conflicts.push({ request: req, reason: `[Reroute] Sin espacio para "${req.subject}"`, type: "hard" });
      continue;
    }
    let cands = findCandidates(req, sortedPool, true,  "hard", false);
    if (!cands.length) cands = findCandidates(req, sortedPool, false, "hard", false);
    if (!cands.length) cands = findCandidates(req, sortedPool, false, "soft", false);
    if (!cands.length) cands = findCandidates(req, sortedPool, false, "off",  true);

    if (cands.length > 0) {
      confirmarAsignacion(req, elegirMejor(req, cands));
    } else {
      conflicts.push({
        request: req,
        reason: `[Reroute] No hay cupo para "${req.subject}"`,
        type: "hard",
      });
    }
  }

  return { assignments, conflicts };
}

function parseExcel(buffer: ArrayBuffer): {requests:ClassRequest[];labAvailability:LabAvailability[];error?:string} {
  try {
    const wb   = XLSX.read(new Uint8Array(buffer), {type:"array"});
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws) as any[];
    if (!rows.length) return {requests:[],labAvailability:[],error:"El archivo está vacío."};

    const requests: ClassRequest[] = rows.map((row,i) => {
      const prog  = normalizarPrograma(String(row["Programa"]||""));
      const coh   = String(row["Semestre_Cohorte"]||"").trim();
      const subj  = String(row["Asignatura"]||"").trim();
      const rawT  = String(row["Tipo_Clase"]||"Teoría").trim();
      const rawTE = String(row["Tipo_Espacio"]||"").trim();
      const tchr  = String(row["Docente"]||"").trim();
      const hrs   = parseInt(String(row["Horas_Bloque"]||"2"));
      const stu   = parseInt(String(row["Estudiantes_Inscritos"]||"30"));
      const diasR = String(row["Dias_Disponibles"]||"").trim();
      const horaR = String(row["Horas_Disponibles"]||"").trim();
      const espE  = String(row["Espacio_Especifico"]||"").trim();

      if (!prog||!subj||!tchr) throw new Error(`Fila ${i+2}: faltan Programa, Asignatura o Docente.`);

      const type: "Teoría"|"Laboratorio" = rawT.toLowerCase().includes("lab") ? "Laboratorio" : "Teoría";
      const tipoEspacio = type === "Laboratorio" ? "Laboratorio" as const : normalizarTipoEspacio(rawTE);
      const diasDisponibles = parsearDias(diasR);
      const horasP = parsearHoras(horaR);

      return {
        id:`req-${i}`, program:prog, cohort:coh,
        cohortNumber: extraerNumeroSemestre(coh),
        subject:subj, type, tipoEspacio, teacher:tchr,
        hoursBlock: isNaN(hrs) ? 2 : Math.min(Math.max(hrs,1),4),
        students: isNaN(stu) ? 30 : stu,
        diasDisponibles: diasDisponibles.length > 0 ? diasDisponibles : undefined,
        horaDesde: horasP?.desde,
        horaHasta: horasP?.hasta,
        espacioEspecifico: espE || undefined,
      };
    });

    let labAvailability: LabAvailability[] = [];
    const labSheet = wb.Sheets["Disponibilidad_Labs"];
    if (labSheet) {
      const labRows = XLSX.utils.sheet_to_json(labSheet) as any[];
      labAvailability = labRows.map(r => ({
        lab:     String(r["Lab"]||"").trim(),
        program: normalizarPrograma(String(r["Programa"]||"")),
        day:     String(r["Dia"]||"").trim(),
        from:    normalizarHora(r["Desde"]??"06:00"),
        to:      normalizarHora(r["Hasta"]??"19:00"),
      })).filter(r => r.lab && r.program && r.day);
    }
    return {requests, labAvailability};
  } catch(err:any) {
    return {requests:[],labAvailability:[],error:err.message||"Error al leer el archivo."};
  }
}

const PROG_COLORS: Record<string,string> = {
  "Química":"#F472B6","Biología":"#4ADE80","Física":"#60A5FA","Matemáticas":"#FB923C",
};
const PROG_ICONS: Record<string,string> = {
  "Química":"⚛️","Biología":"🧬","Física":"🧲","Matemáticas":"π",
};

interface AutoSchedulerProps { session:any; onClose:()=>void; onSaved:(count:number)=>void; spaces?:any[]; }

const DEFAULT_PROGRAM_CONFIG: ProgramConfig[] = [
  {program:"Química",maxGapHours:3},{program:"Biología",maxGapHours:3},
  {program:"Física",maxGapHours:3},{program:"Matemáticas",maxGapHours:3},
];

export default function AutoScheduler({session,onClose,onSaved,spaces:externalSpaces}:AutoSchedulerProps) {
  const { T } = useTheme();
  const { isMobile } = useBreakpoint();

  const [step,setStep]                   = useState<"upload"|"config"|"preview"|"done">("upload");
  const [requests,setRequests]           = useState<ClassRequest[]>([]);
  const [labAvail,setLabAvail]           = useState<LabAvailability[]>([]);
  const [assignments,setAssignments]     = useState<Assignment[]>([]);
  const [conflicts,setConflicts]         = useState<Conflict[]>([]);
  const [programConfig,setProgramConfig] = useState<ProgramConfig[]>(DEFAULT_PROGRAM_CONFIG);
  const [dragOver,setDragOver]           = useState(false);
  const [error,setError]                 = useState("");
  const [saving,setSaving]               = useState(false);
  const [savedCount,setSavedCount]       = useState(0);
  const [filterView,setFilterView]       = useState<"all"|"teoria"|"lab">("all");
  const [calculating, setCalculating] = useState(false);

  const Sty = {
    overlay:{position:"fixed" as const,inset:0,zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.85)",backdropFilter:"blur(8px)",padding:16},
    box:{background:T.bg3,borderRadius:16,border:`1px solid ${T.border2}`,width:"100%",maxWidth:980,maxHeight:"93vh",overflowY:"auto" as const,boxShadow:T.shadow},
    inp:{background:T.inputBg,border:`1px solid ${T.inputBorder}`,color:T.text,borderRadius:8,padding:"7px 10px",fontSize:16,outline:"none",width:60,textAlign:"center" as const,minHeight:44},
    btn:(bg:string,extra?:any)=>({padding:"10px 20px",borderRadius:8,border:"none",color:"#fff",background:bg,fontSize:13,fontWeight:600 as const,cursor:"pointer",...extra}),
  };

  const processFile = useCallback((file:File) => {
    setError("");
    const reader = new FileReader();
    reader.onload = e => {
      const {requests:parsed,labAvailability,error:err} = parseExcel(e.target!.result as ArrayBuffer);
      if (err) { setError(err); return; }
      setRequests(parsed); setLabAvail(labAvailability); setStep("config");
    };
    reader.readAsArrayBuffer(file);
  },[]);

  const handleDrop = (e:React.DragEvent) => { e.preventDefault(); setDragOver(false); const f=e.dataTransfer.files[0]; if(f) processFile(f); };
  const handleFile = (e:React.ChangeEvent<HTMLInputElement>) => { const f=e.target.files?.[0]; if(f) processFile(f); };

  const generateSchedule = () => {
  setCalculating(true);
  setTimeout(() => {
    try {
      const result = runScheduler(requests, programConfig, labAvail, externalSpaces);
      setAssignments(result.assignments);
      setConflicts(result.conflicts);
      setStep("preview");
    } finally {
      setCalculating(false);
    }
  }, 60); // 60ms: suficiente para que React haga flush del estado "calculando"
};

  const handleSave = async () => {
    if(!session) return; setSaving(true); let count=0;
    try {
      for(let i=0; i<assignments.length; i+=10) {
        const batch = assignments.slice(i,i+10).map(a=>({
          program:a.request.program, subject:a.displayLabel, teacher:a.request.teacher,
          day:a.day, hour:a.hour, hour_end:a.hour_end, room:a.room, tipo_espacio:a.tipo_espacio,
        }));
        const res = await fetch(`${SUPABASE_URL}/rest/v1/reservations`,{
          method:"POST",
          headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json",Prefer:"return=minimal"},
          body:JSON.stringify(batch),
        });
        if(res.ok) count+=batch.length;
      }
      setSavedCount(count); setStep("done"); onSaved(count);
    } catch { setError("Error al guardar."); } finally { setSaving(false); }
  };

  const filtered      = assignments.filter(a => filterView==="all" ? true : filterView==="teoria" ? a.tipo_espacio==="teoria" : a.tipo_espacio==="lab");
  const teoriaCount   = assignments.filter(a => a.tipo_espacio==="teoria").length;
  const labCount      = assignments.filter(a => a.tipo_espacio==="lab").length;
  const splitCount    = assignments.filter(a => a.request.parentId).length;
  const overrideCount = assignments.filter(a => a.request.espacioEspecifico).length;
  const hardConflicts = conflicts.filter(c => c.type==="hard");
  const sabadoCount   = assignments.filter(a => a.day==="Sábado").length;
  const sedeSoftCount = assignments.filter(a => a.score <= -35).length;
  const { teoriaPool, labPool } = buildRoomPools(externalSpaces);

  return (
    <div style={Sty.overlay} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={Sty.box}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"18px 24px",borderBottom:`1px solid ${T.border}`}}>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:"Montserrat,sans-serif"}}>🤖 AutoScheduler — Motor v5</div>
            <div style={{fontSize:11,color:T.muted,marginTop:3}}>
              Intercalado · Sede Soft · Compactación máxima · Sábado como último recurso
              {" · "}<span style={{color:"#4ade80"}}>🏫 {teoriaPool.length} aulas · 🔬 {labPool.length} labs</span>
            </div>
          </div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:T.muted,fontSize:22,cursor:"pointer"}}>✕</button>
        </div>

        <div style={{display:"flex",borderBottom:`1px solid ${T.border}`}}>
          {[{key:"upload",label:"1. Subir Excel"},{key:"config",label:"2. Configurar"},{key:"preview",label:"3. Vista Previa"},{key:"done",label:"4. Guardado"}].map(s=>(
            <div key={s.key} style={{flex:1,padding:"10px",textAlign:"center" as const,fontSize:12,fontWeight:600,
              color:step===s.key?"#60a5fa":T.muted,
              borderBottom:step===s.key?`2px solid ${T.udAccent}`:"2px solid transparent",
              background:step===s.key?"rgba(0,102,204,0.08)":"transparent"}}>
              {s.label}
            </div>
          ))}
        </div>

        <div style={{padding:24}}>
          {step==="upload"&&(
            <div style={{display:"flex",flexDirection:"column",gap:20}}>
              <div
                onDragOver={e=>{e.preventDefault();setDragOver(true);}}
                onDragLeave={()=>setDragOver(false)}
                onDrop={handleDrop}
                onClick={()=>document.getElementById("xl-input-v2")?.click()}
                style={{border:`2px dashed ${dragOver?T.udAccent:T.border2}`,borderRadius:12,padding:48,
                  textAlign:"center" as const,background:dragOver?"rgba(0,102,204,0.08)":T.bg2,cursor:"pointer"}}>
                <div style={{fontSize:48,marginBottom:12}}>📊</div>
                <div style={{fontSize:15,fontWeight:700,color:T.text,marginBottom:6}}>Arrastra tu archivo Excel</div>
                <div style={{fontSize:13,color:T.muted,marginBottom:16}}>Hoja 1: clases · Hoja "Disponibilidad_Labs" (opcional)</div>
                <div style={{display:"inline-block",padding:"8px 20px",borderRadius:8,
                  background:`linear-gradient(135deg,${T.udBlue},${T.udAccent})`,color:"#fff",fontSize:13,fontWeight:600}}>
                  Seleccionar .xlsx
                </div>
                <input id="xl-input-v2" type="file" accept=".xlsx,.xls" style={{display:"none"}} onChange={handleFile}/>
              </div>
              {error&&<div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",color:"#f87171",padding:"12px 16px",borderRadius:8,fontSize:13}}>⚠ {error}</div>}
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:16}}>
                <div style={{background:T.bg2,borderRadius:10,padding:16,border:`1px solid ${T.border}`}}>
                  <div style={{fontSize:12,fontWeight:700,color:T.mutedL,marginBottom:10,textTransform:"uppercase" as const}}>📋 Columnas obligatorias</div>
                  {[["Programa","Química/Biología…"],["Semestre_Cohorte","Semestre 3"],["Asignatura","Nombre materia"],
                    ["Tipo_Clase","Teoría o Laboratorio"],["Tipo_Espacio","Aula · Sala de Sistemas"],
                    ["Docente","Nombre completo"],["Horas_Bloque","1–4"],
                    ["Estudiantes_Inscritos","Total (split auto si > cap. lab)"]].map(([c,d])=>(
                    <div key={c} style={{display:"flex",gap:8,marginBottom:4,fontSize:11}}>
                      <span style={{color:"#60a5fa",fontWeight:600,minWidth:160,flexShrink:0}}>{c}</span>
                      <span style={{color:T.muted}}>{d}</span>
                    </div>
                  ))}
                </div>
                <div style={{background:T.bg2,borderRadius:10,padding:16,border:`1px solid rgba(74,222,128,0.2)`}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#4ade80",marginBottom:10,textTransform:"uppercase" as const}}>✨ Columnas opcionales</div>
                  {[["Dias_Disponibles","Lunes, Miércoles (Sábado = permitido)"],["Horas_Disponibles","08:00-12:00"],
                    ["Espacio_Especifico","Lab 1 Qca · 1001 (override)"]].map(([c,d])=>(
                    <div key={c} style={{display:"flex",gap:8,marginBottom:4,fontSize:11}}>
                      <span style={{color:"#4ade80",fontWeight:600,minWidth:160,flexShrink:0}}>{c}</span>
                      <span style={{color:T.muted}}>{d}</span>
                    </div>
                  ))}
                  <div style={{marginTop:12,fontSize:12,fontWeight:700,color:"#fb923c",marginBottom:8,textTransform:"uppercase" as const}}>📋 Hoja "Disponibilidad_Labs"</div>
                  {[["Lab","Lab 1 Bio"],["Programa","Biología"],["Dia","Lunes"],["Desde","06:00"],["Hasta","14:00"]].map(([c,d])=>(
                    <div key={c} style={{display:"flex",gap:8,marginBottom:4,fontSize:11}}>
                      <span style={{color:"#fb923c",fontWeight:600,minWidth:80,flexShrink:0}}>{c}</span>
                      <span style={{color:T.muted}}>{d}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step==="config"&&(
            <div style={{display:"flex",flexDirection:"column",gap:20}}>
              <div style={{background:T.bg2,borderRadius:10,padding:16,border:`1px solid rgba(0,102,204,0.3)`}}>
                <div style={{fontSize:14,fontWeight:700,color:T.text,marginBottom:4}}>⚙️ Configuración de Restricciones por Programa</div>
                <div style={{fontSize:12,color:T.muted,marginBottom:16}}>Máximo de horas muertas entre clases del mismo semestre en un día.</div>
                <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(2,1fr)",gap:12}}>
                  {programConfig.map((pc,i)=>(
                    <div key={pc.program} style={{background:T.bg,borderRadius:8,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",border:`1px solid ${T.border}`}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:18}}>{PROG_ICONS[pc.program]}</span>
                        <div>
                          <div style={{fontSize:13,fontWeight:600,color:PROG_COLORS[pc.program]||"#60a5fa"}}>{pc.program}</div>
                          <div style={{fontSize:11,color:T.muted}}>Gap máximo</div>
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <input type="number" min={0} max={8} value={pc.maxGapHours}
                          onChange={e=>{const val=parseInt(e.target.value)||0;setProgramConfig(prev=>prev.map((p,j)=>j===i?{...p,maxGapHours:val}:p));}}
                          style={Sty.inp}/>
                        <span style={{fontSize:12,color:T.muted}}>horas</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{background:T.bg2,borderRadius:10,padding:16,border:`1px solid rgba(74,222,128,0.2)`}}>
                <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:10}}>🏛️ Espacios disponibles</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap" as const}}>
                  <span style={{fontSize:12,padding:"4px 12px",borderRadius:99,background:"rgba(96,165,250,0.1)",color:"#60a5fa",border:"1px solid rgba(96,165,250,0.3)"}}>🏫 Teoría: {teoriaPool.length} aulas</span>
                  <span style={{fontSize:12,padding:"4px 12px",borderRadius:99,background:"rgba(74,222,128,0.1)",color:"#4ade80",border:"1px solid rgba(74,222,128,0.3)"}}>🔬 Labs: {labPool.length} laboratorios</span>
                  <span style={{fontSize:12,padding:"4px 12px",borderRadius:99,background:"rgba(251,146,60,0.1)",color:"#fb923c",border:"1px solid rgba(251,146,60,0.3)"}}>✂️ Cap. max lab: {labPool.length>0?Math.min(...labPool.map(r=>r.capacity)):CAPACIDAD_MAX_LAB} est.</span>
                </div>
              </div>
              <div style={{background:T.bg2,borderRadius:10,padding:16,border:`1px solid ${T.border}`}}>
                <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:10}}>
                  📋 Excel cargado: <span style={{color:"#60a5fa"}}>{requests.length} clases</span>
                  {labAvail.length>0&&<span style={{color:"#fb923c",marginLeft:12}}>🔬 {labAvail.length} ventanas de labs</span>}
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap" as const}}>
                  {["Teoría","Laboratorio"].map(tipo=>{
                    const n=requests.filter(r=>r.type===tipo).length;
                    return(
                      <span key={tipo} style={{fontSize:12,padding:"4px 12px",borderRadius:99,
                        background:tipo==="Laboratorio"?"rgba(74,222,128,0.1)":"rgba(96,165,250,0.1)",
                        color:tipo==="Laboratorio"?"#4ade80":"#60a5fa",
                        border:`1px solid ${tipo==="Laboratorio"?"rgba(74,222,128,0.3)":"rgba(96,165,250,0.3)"}`}}>
                        {tipo==="Laboratorio"?"🔬":"🏫"} {tipo}: {n}
                      </span>
                    );
                  })}
                  {requests.filter(r=>r.espacioEspecifico).length>0&&(
                    <span style={{fontSize:12,padding:"4px 12px",borderRadius:99,background:"rgba(251,146,60,0.1)",color:"#fb923c",border:"1px solid rgba(251,146,60,0.3)"}}>
                      📌 Espacio fijo: {requests.filter(r=>r.espacioEspecifico).length}
                    </span>
                  )}
                </div>
              </div>
              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>setStep("upload")} style={{...Sty.btn(T.bg),border:`1px solid ${T.border2}`,color:T.mutedL}}>← Volver</button>
                <button
  onClick={generateSchedule}
  disabled={calculating}
  style={{
    ...Sty.btn(`linear-gradient(135deg,${T.udBlue},${T.udAccent})`),
    flex: 1,
    opacity: calculating ? 0.8 : 1,
    transition: "opacity 0.2s",
  }}
>
  {calculating ? "⏳ Calculando horario óptimo..." : "🚀 Generar Horario"}
</button>
              </div>
            </div>
          )}

          {step==="preview"&&(
            <div style={{display:"flex",flexDirection:"column",gap:20}}>
              <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(2,1fr)":"repeat(4,1fr)",gap:12}}>
                {[{label:"En Excel",value:requests.length,color:"#60a5fa",icon:"📋"},
                  {label:"Asignados",value:assignments.length,color:"#4ade80",icon:"✅"},
                  {label:"Splits Lab",value:splitCount,color:"#fb923c",icon:"✂️"},
                  {label:"Sin espacio",value:hardConflicts.length,color:"#f87171",icon:"⚠️"}].map(s=>(
                  <div key={s.label} style={{background:T.bg2,borderRadius:10,padding:"14px 16px",border:`1px solid ${s.color}30`,display:"flex",alignItems:"center",gap:12}}>
                    <div style={{fontSize:24}}>{s.icon}</div>
                    <div>
                      <div style={{fontSize:22,fontWeight:800,color:s.color,fontFamily:"Montserrat,sans-serif"}}>{s.value}</div>
                      <div style={{fontSize:11,color:T.muted}}>{s.label}</div>
                    </div>
                  </div>
                ))}
              </div>
              {splitCount>0&&<div style={{background:"rgba(74,222,128,0.07)",border:"1px solid rgba(74,222,128,0.25)",borderRadius:10,padding:"12px 16px",fontSize:13,color:"#86efac"}}>✂️ <b style={{color:"#4ade80"}}>{splitCount} subgrupos</b> generados automáticamente.</div>}
              {overrideCount>0&&<div style={{background:"rgba(251,146,60,0.07)",border:"1px solid rgba(251,146,60,0.25)",borderRadius:10,padding:"12px 16px",fontSize:13,color:"#fed7aa"}}>📌 <b style={{color:"#fb923c"}}>{overrideCount} clases</b> asignadas a espacio específico.</div>}
              {sabadoCount>0&&<div style={{background:"rgba(148,163,184,0.07)",border:"1px solid rgba(148,163,184,0.25)",borderRadius:10,padding:"12px 16px",fontSize:13,color:"#cbd5e1"}}>📅 <b style={{color:"#94a3b8"}}>{sabadoCount} clases</b> asignadas en sábado (último recurso).</div>}
              {sedeSoftCount>0&&<div style={{background:"rgba(251,191,36,0.07)",border:"1px solid rgba(251,191,36,0.25)",borderRadius:10,padding:"12px 16px",fontSize:13,color:"#fde68a"}}>⚠️ <b style={{color:"#fbbf24"}}>{sedeSoftCount} clases</b> comparten día lab+teoría (sede relajada).</div>}
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={{fontSize:12,color:T.muted,fontWeight:600}}>Ver:</span>
                {[{key:"all",label:`Todas (${assignments.length})`,color:"#94a3b8"},
                  {key:"teoria",label:`🏫 Teoría (${teoriaCount})`,color:"#60a5fa"},
                  {key:"lab",label:`🔬 Labs (${labCount})`,color:"#4ade80"}].map(v=>(
                  <button key={v.key} onClick={()=>setFilterView(v.key as any)}
                    style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${filterView===v.key?v.color:T.border2}`,
                      background:filterView===v.key?`${v.color}18`:"transparent",
                      color:filterView===v.key?v.color:T.muted,fontSize:12,cursor:"pointer"}}>
                    {v.label}
                  </button>
                ))}
              </div>
              {filtered.length>0&&(
                <div style={{background:T.bg2,borderRadius:10,border:`1px solid ${T.border}`,overflow:"hidden"}}>
                  <div style={{overflowX:"auto" as const,maxHeight:360,overflowY:"auto" as const}}>
                    <table style={{borderCollapse:"collapse" as const,width:"100%",fontSize:12}}>
                      <thead style={{position:"sticky" as const,top:0,zIndex:1}}>
                        <tr style={{background:T.bg3}}>
                          {["Tipo","Subtipo","Programa","Asignatura","Subgrupo","Docente","Día","Horario","Espacio","Est.","Score"].map(h=>(
                            <th key={h} style={{padding:"8px 10px",color:T.muted,fontWeight:600,textAlign:"left" as const,whiteSpace:"nowrap" as const,borderBottom:`1px solid ${T.border}`}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((a,i)=>{
                          const color      = PROG_COLORS[a.request.program]||"#94a3b8";
                          const icon       = PROG_ICONS[a.request.program]||"📚";
                          const isLab      = a.tipo_espacio==="lab";
                          const isSplit    = !!a.request.parentId;
                          const isOverride = !!a.request.espacioEspecifico;
                          const isSabado   = a.day==="Sábado";
                          const isSedeSoft = a.score<=-35;
                          return(
                            <tr key={i} style={{background:i%2===0?T.bg2:T.bg,borderBottom:`1px solid ${T.border}30`}}>
                              <td style={{padding:"7px 10px"}}>
                                <span style={{fontSize:10,padding:"2px 8px",borderRadius:99,
                                  background:isLab?"rgba(74,222,128,0.15)":"rgba(96,165,250,0.15)",
                                  color:isLab?"#4ade80":"#60a5fa",fontWeight:600}}>
                                  {isLab?"🔬 Lab":"🏫 Teoría"}
                                </span>
                              </td>
                              <td style={{padding:"7px 10px",fontSize:10,color:T.muted}}>{a.request.tipoEspacio}</td>
                              <td style={{padding:"7px 10px",color}}><span style={{display:"flex",alignItems:"center",gap:4}}><span>{icon}</span>{a.request.program}</span></td>
                              <td style={{padding:"7px 10px",color:T.text,maxWidth:130,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const}} title={a.request.subject}>{a.request.subject}</td>
                              <td style={{padding:"7px 10px"}}>
                                {a.request.subgroup?(
                                  <span style={{fontSize:10,padding:"2px 8px",borderRadius:99,
                                    background:isSplit?"rgba(251,146,60,0.15)":"rgba(74,222,128,0.1)",
                                    color:isSplit?"#fb923c":"#4ade80",fontWeight:600}}>
                                    {a.request.subgroup}{isSplit?" ✂️":""}
                                  </span>
                                ):<span style={{color:T.muted,fontSize:11}}>—</span>}
                              </td>
                              <td style={{padding:"7px 10px",color:T.mutedL,whiteSpace:"nowrap" as const}}>{a.request.teacher}</td>
                              <td style={{padding:"7px 10px"}}>
                                <span style={{color:isSabado?"#94a3b8":isSedeSoft?"#fbbf24":T.mutedL,fontWeight:isSabado||isSedeSoft?600:400}}>
                                  {isSabado?"📅 ":isSedeSoft?"⚠️ ":""}{a.day}
                                </span>
                              </td>
                              <td style={{padding:"7px 10px",color:"#60a5fa",fontFamily:"monospace",whiteSpace:"nowrap" as const}}>{a.hour} → {a.hour_end}</td>
                              <td style={{padding:"7px 10px",whiteSpace:"nowrap" as const}}>
                                <span style={{color:isOverride?"#fb923c":isLab?"#4ade80":T.mutedL,fontWeight:isOverride||isLab?600:400}}>
                                  {isOverride?"📌 ":""}{a.room}
                                </span>
                              </td>
                              <td style={{padding:"7px 10px",color:T.muted,textAlign:"center" as const}}>{a.request.students}</td>
                              <td style={{padding:"7px 10px",color:a.score>0?"#4ade80":"#f87171",fontFamily:"monospace",fontWeight:600,textAlign:"center" as const}}>{a.score>0?"+":""}{a.score}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {hardConflicts.length>0&&(
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:"#f87171",marginBottom:10}}>⚠️ Sin espacio disponible ({hardConflicts.length})</div>
                  {hardConflicts.map((c,i)=>(
                    <div key={i} style={{background:"rgba(239,68,68,0.07)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:8,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:6}}>
                      <div>
                        <div style={{fontSize:12,fontWeight:600,color:"#fca5a5",marginBottom:2}}>
                          {PROG_ICONS[c.request.program]} {c.request.subject}{c.request.subgroup?` (${c.request.subgroup})`:""} — {c.request.teacher}
                        </div>
                        <div style={{fontSize:11,color:T.muted}}>
                          {c.request.program} · {c.request.cohort} · {c.request.type} · {c.request.hoursBlock}h
                          {c.request.espacioEspecifico&&<span style={{color:"#fb923c",marginLeft:6}}>📌 {c.request.espacioEspecifico}</span>}
                        </div>
                      </div>
                      <div style={{fontSize:11,color:"#f87171",background:"rgba(239,68,68,0.12)",padding:"4px 10px",borderRadius:6,whiteSpace:"nowrap" as const,flexShrink:0}}>{c.reason}</div>
                    </div>
                  ))}
                </div>
              )}
              {error&&<div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",color:"#f87171",padding:"12px 16px",borderRadius:8,fontSize:13}}>⚠ {error}</div>}
              <div style={{display:"flex",gap:10,paddingTop:8}}>
                <button onClick={()=>setStep("config")} style={{...Sty.btn(T.bg),border:`1px solid ${T.border2}`,color:T.mutedL}}>← Ajustar config</button>
                {assignments.length>0&&(
                  <button onClick={handleSave} disabled={saving}
                    style={{...Sty.btn(`linear-gradient(135deg,${T.udBlue},${T.udAccent})`),flex:1,opacity:saving?0.7:1}}>
                    {saving?`Guardando… ${savedCount}/${assignments.length}`:`✅ Aprobar y guardar ${assignments.length} reservas`}
                  </button>
                )}
              </div>
            </div>
          )}

          {step==="done"&&(
            <div style={{textAlign:"center" as const,padding:"40px 20px"}}>
              <div style={{fontSize:64,marginBottom:20}}>🎉</div>
              <div style={{fontSize:22,fontWeight:800,color:T.text,fontFamily:"Montserrat,sans-serif",marginBottom:8}}>¡Horario generado con éxito!</div>
              <div style={{fontSize:14,color:T.muted,marginBottom:32,lineHeight:1.8}}>
                <span style={{color:"#4ade80",fontWeight:700}}>{savedCount} reservas</span> guardadas.
                {splitCount>0&&<><br/><span style={{color:"#fb923c"}}>{splitCount} subgrupos</span> por capacidad.</>}
                {overrideCount>0&&<><br/><span style={{color:"#fb923c"}}>{overrideCount} clases</span> con espacio específico.</>}
                {sabadoCount>0&&<><br/><span style={{color:"#94a3b8"}}>{sabadoCount} clases</span> asignadas en sábado.</>}
                {sedeSoftCount>0&&<><br/><span style={{color:"#fbbf24"}}>{sedeSoftCount} clases</span> con sede relajada.</>}
                {hardConflicts.length>0&&<><br/><span style={{color:"#f87171"}}>{hardConflicts.length} clases</span> sin espacio.</>}
              </div>
              <div style={{display:"flex",gap:10,justifyContent:"center"}}>
                <button
                  onClick={()=>{setStep("upload");setRequests([]);setAssignments([]);setConflicts([]);setSavedCount(0);setProgramConfig(DEFAULT_PROGRAM_CONFIG);}}
                  style={{...Sty.btn(T.bg),border:`1px solid ${T.border2}`,color:T.mutedL}}>
                  Generar otro horario
                </button>
                <button onClick={onClose} style={Sty.btn(`linear-gradient(135deg,${T.udBlue},${T.udAccent})`)}>
                  Ver en el tablero →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}