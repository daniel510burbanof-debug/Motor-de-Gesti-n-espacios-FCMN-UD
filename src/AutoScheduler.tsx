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

const DAYS  = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const DAYS_SIN_SABADO = ["Lunes","Martes","Miércoles","Jueves","Viernes"];
const HOURS = ["06:00","07:00","08:00","09:00","10:00","11:00",
               "12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00"];
const SUBGROUP_LABELS = ["Lab A","Lab B","Lab C","Lab D","Lab E","Lab F"];

// ── INTERFACES ────────────────────────────────────────────────────────────────
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
interface RoomEntry {
  name: string; capacity: number; espacio: "teoria"|"lab"; subtipo: string;
}

// ── UTILIDADES ────────────────────────────────────────────────────────────────
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

// ── SPLIT DE LABORATORIOS ─────────────────────────────────────────────────────
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

// ── CONSTRUIR POOLS DESDE LA BD (fuente de verdad) ───────────────────────────
// Si hay externalSpaces, la BD manda completamente.
// Los hardcoded solo sirven de fallback cuando no hay BD o para leer el subtipo.
function buildRoomPools(externalSpaces?: any[]): { teoriaPool: RoomEntry[]; labPool: RoomEntry[] } {
  if (externalSpaces && externalSpaces.length > 0) {
    const activeSpaces = externalSpaces.filter((s: any) => s.activo);
    const allHardcoded = [...TEORIA_ROOMS, ...LAB_ROOMS];
    const teoriaPool: RoomEntry[] = [];
    const labPool:    RoomEntry[] = [];

    for (const s of activeSpaces) {
      const hardcoded = allHardcoded.find(r => r.name === s.nombre);
      const isLab     = s.tipo === "Laboratorio" || (hardcoded?.espacio === "lab");
      const subtipo   = s.tipo || hardcoded?.subtipo || "Aula";
      const entry: RoomEntry = {
        name: s.nombre, capacity: s.capacidad,
        espacio: isLab ? "lab" : "teoria", subtipo,
      };
      if (isLab) labPool.push(entry);
      else       teoriaPool.push(entry);
    }

    // Fallback: si no hay aulas de teoría en BD, usar hardcoded
    const finalTeoria = teoriaPool.length > 0
      ? teoriaPool
      : TEORIA_ROOMS.map(r => ({ ...r }));

    return { teoriaPool: finalTeoria, labPool };
  }

  // Fallback sin BD — NO TOCAR
  return {
    teoriaPool: TEORIA_ROOMS.map(r => ({ ...r })),
    labPool:    LAB_ROOMS.map(r => ({ ...r })),
  };
}
// ── MOTOR DE ASIGNACIÓN ───────────────────────────────────────────────────────
function runScheduler(
  rawRequests: ClassRequest[], programConfig: ProgramConfig[],
  labAvailability: LabAvailability[], externalSpaces?: any[],
): { assignments: Assignment[]; conflicts: Conflict[] } {
  const assignments: Assignment[] = [];
  const conflicts:   Conflict[]   = [];

  const { teoriaPool, labPool } = buildRoomPools(externalSpaces);
// DEBUG — borra esto después de diagnosticar
console.log("=== POOLS ===");
console.log("teoriaPool:", teoriaPool.map(r => r.name));
console.log("labPool:", labPool.map(r => r.name));
console.log("externalSpaces activos:", externalSpaces?.filter((s:any) => s.activo).map((s:any) => `${s.nombre} (${s.tipo})`));
  const maxLabCap = labPool.length > 0
    ? Math.min(...labPool.map(r => r.capacity))
    : CAPACIDAD_MAX_LAB;

  const requests = splitLabRequests(rawRequests, maxLabCap);

  // ── ESTRUCTURAS DE OCUPACIÓN ──────────────────────────────────────────────
  type SlotMap = Record<string, Record<string, Record<string, boolean>>>;
  const roomOccupied:    SlotMap = {};
  const teacherOccupied: SlotMap = {};
  const cohortOccupied:  SlotMap = {};
  const teacherBreak:    SlotMap = {};
  const cohortDayHours:  Record<string, Record<string, number[]>> = {};
  const programDaySemesters: Record<string, Set<number>> = {};
  const parentAssignedSlots: Record<string, Array<{day:string; hours:string[]}>> = {};
  const parentRoomPreference: Record<string, string> = {};
  const teoriaSlots: Record<string, Array<{day:string; hours:string[]}>> = {};
  // Contador de uso por sala para balanceo de carga
  const roomUsageCount: Record<string, number> = {};

  DAYS.forEach(d => {
    roomOccupied[d] = {}; teacherOccupied[d] = {};
    cohortOccupied[d] = {}; teacherBreak[d] = {};
    HOURS.forEach(h => {
      roomOccupied[d][h] = {}; teacherOccupied[d][h] = {};
      cohortOccupied[d][h] = {}; teacherBreak[d][h] = {};
    });
  });
  [...teoriaPool, ...labPool].forEach(r => { roomUsageCount[r.name] = 0; });

  // ── ORDEN: MÁS DIFÍCIL PRIMERO ────────────────────────────────────────────
  const difficultyScore = (r: ClassRequest): number => {
    let score = 0;
    if (r.type === "Laboratorio") score += 1000;
    score += r.hoursBlock * 100;
    if (r.diasDisponibles && r.diasDisponibles.length > 0)
      score += (6 - r.diasDisponibles.length) * 50;
    if (r.espacioEspecifico) score += 200;
    score += r.students;
    return score;
  };
  const sorted = [...requests].sort((a, b) => difficultyScore(b) - difficultyScore(a));

  // ── SCORE SOFT ────────────────────────────────────────────────────────────
  // Incluye balanceo de carga: penaliza salas muy usadas para distribuir mejor
  const softScore = (
    req: ClassRequest, day: string,
    block: string[], room: RoomEntry,
  ): number => {
    let score = 0;

    // Semestres consecutivos en el mismo día → penalizar
    const pdKey = `${req.program}|${day}`;
    const semsEnDia = programDaySemesters[pdKey] || new Set<number>();
    if (semsEnDia.has(req.cohortNumber - 1) || semsEnDia.has(req.cohortNumber + 1))
      score -= 10; else score += 5;

    // Empaquetado: preferir sala ya usada si bloque impar
    if (req.hoursBlock % 2 !== 0) {
      const yaUsado = assignments.some(
        a => a.room === room.name && a.day === day && a.request.type === req.type
      );
      if (yaUsado) score += 8;
    }

    // Preferir mañana
    if (block[0] < "12:00") score += 3;

    // Penalizar sala sobredimensionada
    if (room.capacity - req.students > 30) score -= 2;

    // BALANCEO DE CARGA: penalizar salas más usadas para distribuir
    const usage = roomUsageCount[room.name] || 0;
    score -= usage * 3;

    // Preferir sala que ya usó el padre (subgrupos del mismo lab juntos)
    if (req.parentId) {
      const pref = parentRoomPreference[req.parentId];
      if (pref && pref !== room.name) score -= 5;
    }

    return score;
  };

  // ── BÚSQUEDA DE CANDIDATOS ────────────────────────────────────────────────
  // Ahora evalúa TODAS las salas disponibles en cada slot (no solo la primera)
  // para poder elegir la óptima por score
  const findCandidates = (
    req: ClassRequest,
    pool: RoomEntry[],
    respectarGap: boolean,
    respectarSede: boolean,
    includeSabado: boolean,
  ) => {
    const cohortKey     = `${req.program}__${req.cohort}`;
    const teoriaKey     = `${cohortKey}__${req.subject}`;
    const parentSlots   = req.parentId ? (parentAssignedSlots[req.parentId] || []) : [];
    const teoriaOcup    = teoriaSlots[teoriaKey] || [];
    const preferredRoom = req.parentId ? parentRoomPreference[req.parentId] : undefined;

    // Pool ordenado: preferir sala del padre si aplica, luego por capacidad ajustada
    const sortedPool = [...pool].sort((a, b) => {
      if (preferredRoom && !req.espacioEspecifico) {
        if (a.name === preferredRoom) return -1;
        if (b.name === preferredRoom) return 1;
      }
      // Ordenar por capacidad más ajustada al grupo (menos desperdicio)
      const wasteA = a.capacity - req.students;
      const wasteB = b.capacity - req.students;
      return wasteA - wasteB;
    });

    // Días válidos respetando sábado como último recurso
    let diasBase: string[];
    if (req.diasDisponibles && req.diasDisponibles.length > 0) {
      diasBase = req.diasDisponibles.filter(d => includeSabado ? true : d !== "Sábado");
    } else {
      diasBase = includeSabado ? DAYS : DAYS_SIN_SABADO;
    }

    const candidates: Array<{
      day: string; hour: string; block: string[];
      room: RoomEntry; score: number;
    }> = [];

    for (const day of diasBase) {

      // Restricción de sede: días exclusivos lab/teoría por cohorte
      if (respectarSede) {
        const existeLab    = assignments.some(a =>
          a.day === day && a.tipo_espacio === "lab" &&
          `${a.request.program}__${a.request.cohort}` === cohortKey
        );
        const existeTeoria = assignments.some(a =>
          a.day === day && a.tipo_espacio === "teoria" &&
          `${a.request.program}__${a.request.cohort}` === cohortKey
        );
        if (req.type === "Laboratorio" && existeTeoria) continue;
        if (req.type === "Teoría"      && existeLab)    continue;
      }

      for (let hi = 0; hi <= HOURS.length - req.hoursBlock; hi++) {
        const start = HOURS[hi];
        const block = getBlock(start, req.hoursBlock);
        if (block.length < req.hoursBlock) continue;

        // Ventana horaria del request
        if (req.horaDesde && req.horaHasta) {
          if (start < req.horaDesde || block[block.length - 1] > req.horaHasta) continue;
        }

        // Restricciones de docente
        if (block.some(h => teacherBreak[day][h]?.[req.teacher]))    continue;
        if (block.some(h => teacherOccupied[day][h]?.[req.teacher])) continue;

        // Restricción de cohorte
        if (block.some(h => cohortOccupied[day][h]?.[cohortKey])) continue;

        // Subgrupos del mismo padre no se solapan
        if (req.parentId) {
          const choca = parentSlots.some(
            ps => ps.day === day && ps.hours.some(h => block.includes(h))
          );
          if (choca) continue;
        }

        // Lab no se solapa con teoría de la misma asignatura
        if (req.type === "Laboratorio") {
          const cruza = teoriaOcup.some(
            ts => ts.day === day && ts.hours.some(h => block.includes(h))
          );
          if (cruza) continue;
        }

        // Restricción de gap entre clases
        if (respectarGap) {
          const cfg    = programConfig.find(p => p.program === req.program);
          const maxGap = cfg?.maxGapHours ?? 999;
          if (maxGap < 999) {
            const existentes = cohortDayHours[cohortKey]?.[day] || [];
            if (existentes.length > 0) {
              const startIdx   = getHourIndex(start);
              const minExist   = Math.min(...existentes);
              const maxExist   = Math.max(...existentes);
              const gapAntes   = startIdx - maxExist - 1;
              const gapDespues = minExist - (startIdx + req.hoursBlock);
              if (gapAntes   > maxGap) continue;
              if (gapDespues > 0 && gapDespues > maxGap) continue;
            }
          }
        }

        // ── EVALUACIÓN DE TODAS LAS SALAS DISPONIBLES EN ESTE SLOT ──────────
        // A diferencia de antes (break en la primera sala), aquí evaluamos
        // todas las salas válidas del slot y las agregamos como candidatos
        // separados para que el score decida cuál es la óptima.
        for (const room of sortedPool) {
          if (block.some(h => roomOccupied[day][h]?.[room.name])) continue;

          // Verificar subtipo para teoría
          if (!req.espacioEspecifico && req.type !== "Laboratorio") {
            if (room.subtipo !== req.tipoEspacio) continue;
          }

          // Horario apertura/cierre del espacio
          if (externalSpaces) {
            const ext = externalSpaces.find((s: any) => s.nombre === room.name);
            if (ext && block.some(h => h < ext.hora_apertura || h >= ext.hora_cierre))
              continue;
          }

          // Ventanas de disponibilidad de laboratorio
          if (req.type === "Laboratorio" && labAvailability.length > 0) {
            const progTieneVentanas = labAvailability.some(la => la.program === req.program);
            if (progTieneVentanas) {
              const ventanas = labAvailability.filter(
                la => la.lab === room.name && la.program === req.program && la.day === day
              );
              if (ventanas.length === 0) continue;
              const dentro = ventanas.some(v => block.every(h => h >= v.from && h < v.to));
              if (!dentro) continue;
            }
          }

          // Sala válida → agregar como candidato con su score
          candidates.push({
            day, hour: start, block, room,
            score: softScore(req, day, block, room),
          });
        }
        // Para teoría: con 1 candidato por slot es suficiente, seguir explorando días
        // Para lab: recolectar más para mejor distribución
        if (req.type === "Teoría" && candidates.length >= 30) break;
        if (req.type === "Laboratorio" && candidates.length >= 100) break;
      }
      if (req.type === "Teoría" && candidates.length >= 30) break;
      if (req.type === "Laboratorio" && candidates.length >= 100) break;
    }

    return candidates;
  };

  // ── CONFIRMAR ASIGNACIÓN ──────────────────────────────────────────────────
  const confirmarAsignacion = (
    req: ClassRequest,
    best: { day: string; hour: string; block: string[]; room: RoomEntry; score: number },
  ) => {
    const cohortKey = `${req.program}__${req.cohort}`;
    const teoriaKey = `${cohortKey}__${req.subject}`;
    const { day, hour: start, block, room } = best;

    block.forEach(h => {
      roomOccupied[day][h][room.name]      = true;
      teacherOccupied[day][h][req.teacher] = true;
      cohortOccupied[day][h][cohortKey]    = true;
    });

    if (!cohortDayHours[cohortKey])      cohortDayHours[cohortKey] = {};
    if (!cohortDayHours[cohortKey][day]) cohortDayHours[cohortKey][day] = [];
    block.forEach(h => cohortDayHours[cohortKey][day].push(getHourIndex(h)));

    const pdKey = `${req.program}|${day}`;
    if (!programDaySemesters[pdKey]) programDaySemesters[pdKey] = new Set();
    programDaySemesters[pdKey].add(req.cohortNumber);

    if (req.type === "Teoría") {
      if (!teoriaSlots[teoriaKey]) teoriaSlots[teoriaKey] = [];
      teoriaSlots[teoriaKey].push({ day, hours: block });
    }

    if (req.parentId) {
      if (!parentAssignedSlots[req.parentId]) parentAssignedSlots[req.parentId] = [];
      parentAssignedSlots[req.parentId].push({ day, hours: block });
      if (!parentRoomPreference[req.parentId]) parentRoomPreference[req.parentId] = room.name;
    }

    if (req.hoursBlock >= 4) {
      const bi = getHourIndex(start) + req.hoursBlock;
      if (bi < HOURS.length) teacherBreak[day][HOURS[bi]][req.teacher] = true;
    }

    // Actualizar contador de uso para balanceo
    roomUsageCount[room.name] = (roomUsageCount[room.name] || 0) + 1;

    const subgroupLabel = req.subgroup ? ` · ${req.subgroup}` : "";
    assignments.push({
      request: req, day, hour: start,
      hour_end: block[block.length - 1],
      room: room.name,
      tipo_espacio: req.type === "Laboratorio" ? "lab" : "teoria",
      displayLabel: `${req.subject}${subgroupLabel}`,
      score: best.score,
    });
  };

  // ── LOOP PRINCIPAL ────────────────────────────────────────────────────────
  for (const req of sorted) {

    // Construir pool según tipo de clase
    let basePool: RoomEntry[] = [];
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
    // No ordenar aquí — el score en findCandidates se encarga de la selección óptima

    if (req.espacioEspecifico) {
      const allRooms = [...teoriaPool, ...labPool];
      const forced = allRooms.find(r => r.name === req.espacioEspecifico);
      if (forced) {
        pool = [forced];
      } else {
        conflicts.push({
          request: req,
          reason: `Espacio específico "${req.espacioEspecifico}" no encontrado.`,
          type: "hard",
        });
        continue;
      }
    }

    if (pool.length === 0) {
      conflicts.push({
        request: req,
        reason: `Sin espacio tipo "${req.tipoEspacio}" con capacidad ≥ ${req.students}.`,
        type: "hard",
      });
      continue;
    }

    // 5 intentos en cascada: de más restrictivo a más flexible
    // Sábado solo entra como último recurso
    let candidates = findCandidates(req, pool, true,  true,  false);
    if (!candidates.length)
      candidates   = findCandidates(req, pool, false, true,  false);
    if (!candidates.length)
      candidates   = findCandidates(req, pool, true,  false, false);
    if (!candidates.length)
      candidates   = findCandidates(req, pool, false, false, false);
    if (!candidates.length)
      candidates   = findCandidates(req, pool, false, false, true);
    // Intento 6 (solo teoría): sábado + sin ninguna restricción
    if (!candidates.length && req.type === "Teoría")
      candidates   = findCandidates(req, pool, false, false, true);
if (candidates.length === 0) {
  console.log(`SIN CANDIDATOS: ${req.subject} | tipo: ${req.type} | tipoEspacio: ${req.tipoEspacio} | pool: ${pool.map(r=>r.name)}`);
}
    if (candidates.length > 0) {
      // Elegir el candidato con mejor score (incluye balanceo de carga)
      candidates.sort((a, b) => b.score - a.score);
      confirmarAsignacion(req, candidates[0]);
    } else {
      conflicts.push({
        request: req,
        reason: `No hay cupo para "${req.subject}"${req.subgroup ? ` (${req.subgroup})` : ""}`,
        type: "hard",
      });
    }
  }

  return { assignments, conflicts };
}

// ── PARSER EXCEL ──────────────────────────────────────────────────────────────
function parseExcel(buffer: ArrayBuffer): {requests:ClassRequest[];labAvailability:LabAvailability[];error?:string} {
  try {
    const wb = XLSX.read(new Uint8Array(buffer), {type:"array"});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws) as any[];
    if (!rows.length) return {requests:[],labAvailability:[],error:"El archivo está vacío."};

    const requests: ClassRequest[] = rows.map((row,i)=>{
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

      const type: "Teoría"|"Laboratorio" = rawT.toLowerCase().includes("lab")?"Laboratorio":"Teoría";
      const tipoEspacio = type==="Laboratorio"?"Laboratorio" as const:normalizarTipoEspacio(rawTE);
      const diasDisponibles = parsearDias(diasR);
      const horasP = parsearHoras(horaR);

      return {
        id:`req-${i}`, program:prog, cohort:coh,
        cohortNumber:extraerNumeroSemestre(coh),
        subject:subj, type, tipoEspacio, teacher:tchr,
        hoursBlock:isNaN(hrs)?2:Math.min(Math.max(hrs,1),4),
        students:isNaN(stu)?30:stu,
        diasDisponibles:diasDisponibles.length>0?diasDisponibles:undefined,
        horaDesde:horasP?.desde,
        horaHasta:horasP?.hasta,
        espacioEspecifico:espE||undefined,
      };
    });

    let labAvailability: LabAvailability[] = [];
    const labSheet = wb.Sheets["Disponibilidad_Labs"];
    if (labSheet) {
      const labRows = XLSX.utils.sheet_to_json(labSheet) as any[];
      labAvailability = labRows.map(r=>({
        lab:     String(r["Lab"]||"").trim(),
        program: normalizarPrograma(String(r["Programa"]||"")),
        day:     String(r["Dia"]||"").trim(),
        from:    normalizarHora(r["Desde"]??"06:00"),
        to:      normalizarHora(r["Hasta"]??"19:00"),
      })).filter(r=>r.lab&&r.program&&r.day);
    }
    return {requests, labAvailability};
  } catch(err:any) {
    return {requests:[],labAvailability:[],error:err.message||"Error al leer el archivo."};
  }
}

// ── COLORES ───────────────────────────────────────────────────────────────────
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

// ── COMPONENTE ────────────────────────────────────────────────────────────────
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

  const Sty = {
    overlay:{position:"fixed" as const,inset:0,zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.85)",backdropFilter:"blur(8px)",padding:16},
    box:{background:T.bg3,borderRadius:16,border:`1px solid ${T.border2}`,width:"100%",maxWidth:980,maxHeight:"93vh",overflowY:"auto" as const,boxShadow:T.shadow},
    inp:{background:T.inputBg,border:`1px solid ${T.inputBorder}`,color:T.text,borderRadius:8,padding:"7px 10px",fontSize:16,outline:"none",width:60,textAlign:"center" as const,minHeight:44},
    btn:(bg:string,extra?:any)=>({padding:"10px 20px",borderRadius:8,border:"none",color:"#fff",background:bg,fontSize:13,fontWeight:600 as const,cursor:"pointer",...extra}),
  };

  const processFile = useCallback((file:File)=>{
    setError("");
    const reader = new FileReader();
    reader.onload = e => {
      const {requests:parsed,labAvailability,error:err} = parseExcel(e.target!.result as ArrayBuffer);
      if (err) { setError(err); return; }
      setRequests(parsed); setLabAvail(labAvailability); setStep("config");
    };
    reader.readAsArrayBuffer(file);
  },[]);

  const handleDrop  = (e:React.DragEvent)=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer.files[0];if(f)processFile(f);};
  const handleFile  = (e:React.ChangeEvent<HTMLInputElement>)=>{const f=e.target.files?.[0];if(f)processFile(f);};
  const generateSchedule = ()=>{
    const result=runScheduler(requests,programConfig,labAvail,externalSpaces);
    setAssignments(result.assignments); setConflicts(result.conflicts); setStep("preview");
  };

  const handleSave=async()=>{
    if(!session)return; setSaving(true); let count=0;
    try {
      for(let i=0;i<assignments.length;i+=10){
        const batch=assignments.slice(i,i+10).map(a=>({
          program:a.request.program, subject:a.displayLabel, teacher:a.request.teacher,
          day:a.day, hour:a.hour, hour_end:a.hour_end, room:a.room, tipo_espacio:a.tipo_espacio,
        }));
        const res=await fetch(`${SUPABASE_URL}/rest/v1/reservations`,{
          method:"POST",
          headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json",Prefer:"return=minimal"},
          body:JSON.stringify(batch),
        });
        if(res.ok) count+=batch.length;
      }
      setSavedCount(count); setStep("done"); onSaved(count);
    } catch { setError("Error al guardar."); } finally { setSaving(false); }
  };

  const filtered      = assignments.filter(a=>filterView==="all"?true:filterView==="teoria"?a.tipo_espacio==="teoria":a.tipo_espacio==="lab");
  const teoriaCount   = assignments.filter(a=>a.tipo_espacio==="teoria").length;
  const labCount      = assignments.filter(a=>a.tipo_espacio==="lab").length;
  const splitCount    = assignments.filter(a=>a.request.parentId).length;
  const overrideCount = assignments.filter(a=>a.request.espacioEspecifico).length;
  const hardConflicts = conflicts.filter(c=>c.type==="hard");
  const sabadoCount   = assignments.filter(a=>a.day==="Sábado").length;

  const { teoriaPool, labPool } = buildRoomPools(externalSpaces);

  return (
    <div style={Sty.overlay} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={Sty.box}>

        {/* HEADER */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"18px 24px",borderBottom:`1px solid ${T.border}`}}>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:T.text,fontFamily:"Montserrat,sans-serif"}}>🤖 AutoScheduler — Motor v4</div>
            <div style={{fontSize:11,color:T.muted,marginTop:3}}>
              Hard: Docente · Cohorte · Subtipo · Sede · Gap · Sábado como último recurso
              {" · "}<span style={{color:"#4ade80"}}>🏫 {teoriaPool.length} aulas · 🔬 {labPool.length} labs</span>
            </div>
          </div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:T.muted,fontSize:22,cursor:"pointer"}}>✕</button>
        </div>

        {/* STEPS */}
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

          {/* ══ STEP 1: UPLOAD ══ */}
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

          {/* ══ STEP 2: CONFIG ══ */}
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
                <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:10}}>🏛️ Espacios disponibles para este horario</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap" as const}}>
                  <span style={{fontSize:12,padding:"4px 12px",borderRadius:99,background:"rgba(96,165,250,0.1)",color:"#60a5fa",border:"1px solid rgba(96,165,250,0.3)"}}>
                    🏫 Teoría: {teoriaPool.length} aulas
                  </span>
                  <span style={{fontSize:12,padding:"4px 12px",borderRadius:99,background:"rgba(74,222,128,0.1)",color:"#4ade80",border:"1px solid rgba(74,222,128,0.3)"}}>
                    🔬 Labs: {labPool.length} laboratorios
                  </span>
                  <span style={{fontSize:12,padding:"4px 12px",borderRadius:99,background:"rgba(251,146,60,0.1)",color:"#fb923c",border:"1px solid rgba(251,146,60,0.3)"}}>
                    ✂️ Cap. max lab: {labPool.length>0?Math.min(...labPool.map(r=>r.capacity)):CAPACIDAD_MAX_LAB} est.
                  </span>
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
                <button onClick={generateSchedule} style={{...Sty.btn(`linear-gradient(135deg,${T.udBlue},${T.udAccent})`),flex:1}}>🚀 Generar Horario</button>
              </div>
            </div>
          )}

          {/* ══ STEP 3: PREVIEW ══ */}
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
                          const color=PROG_COLORS[a.request.program]||"#94a3b8";
                          const icon=PROG_ICONS[a.request.program]||"📚";
                          const isLab=a.tipo_espacio==="lab";
                          const isSplit=!!a.request.parentId;
                          const isOverride=!!a.request.espacioEspecifico;
                          const isSabado=a.day==="Sábado";
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
                              <td style={{padding:"7px 10px",color}}>
                                <span style={{display:"flex",alignItems:"center",gap:4}}><span>{icon}</span>{a.request.program}</span>
                              </td>
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
                                <span style={{color:isSabado?"#94a3b8":T.mutedL,fontWeight:isSabado?600:400}}>
                                  {isSabado?"📅 ":""}{a.day}
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

          {/* ══ STEP 4: DONE ══ */}
          {step==="done"&&(
            <div style={{textAlign:"center" as const,padding:"40px 20px"}}>
              <div style={{fontSize:64,marginBottom:20}}>🎉</div>
              <div style={{fontSize:22,fontWeight:800,color:T.text,fontFamily:"Montserrat,sans-serif",marginBottom:8}}>¡Horario generado con éxito!</div>
              <div style={{fontSize:14,color:T.muted,marginBottom:32,lineHeight:1.8}}>
                <span style={{color:"#4ade80",fontWeight:700}}>{savedCount} reservas</span> guardadas.
                {splitCount>0&&<><br/><span style={{color:"#fb923c"}}>{splitCount} subgrupos</span> por capacidad.</>}
                {overrideCount>0&&<><br/><span style={{color:"#fb923c"}}>{overrideCount} clases</span> con espacio específico.</>}
                {sabadoCount>0&&<><br/><span style={{color:"#94a3b8"}}>{sabadoCount} clases</span> asignadas en sábado (último recurso).</>}
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