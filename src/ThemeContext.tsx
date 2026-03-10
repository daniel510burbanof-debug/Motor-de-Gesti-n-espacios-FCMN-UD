import { createContext, useContext, useState, ReactNode } from "react";

export type Theme = "dark" | "light";

export const DARK = {
  bg:"#060C1A", bg2:"#0A1628", bg3:"#0F1E3C",
  border:"#1A2E52", border2:"#243a6e",
  text:"#E2E8F0", muted:"#64748b", mutedL:"#94a3b8",
  card:"#0A1628", cardHover:"#0F2040",
  udBlue:"#003087", udAccent:"#0066CC",
  chartGrid:"#1A2E52", tooltipBg:"#0F1E3C", tooltipBorder:"#243a6e",
  inputBg:"#0F1E3C", inputBorder:"#243a6e",
  shadow:"0 4px 24px rgba(0,0,0,0.5)",
  tagBg:"rgba(255,255,255,0.05)",
  extraordinary:"#9333ea",
};

export const LIGHT = {
  bg:"#F8FAFC", bg2:"#FFFFFF", bg3:"#F1F5F9",
  border:"#E2E8F0", border2:"#CBD5E1",
  text:"#0F172A", muted:"#64748B", mutedL:"#475569",
  card:"#FFFFFF", cardHover:"#F8FAFC",
  udBlue:"#003087", udAccent:"#0055AA",
  chartGrid:"#E2E8F0", tooltipBg:"#FFFFFF", tooltipBorder:"#CBD5E1",
  inputBg:"#FFFFFF", inputBorder:"#CBD5E1",
  shadow:"0 4px 24px rgba(0,0,0,0.08)",
  tagBg:"rgba(0,0,0,0.04)",
  extraordinary:"#7C3AED",
};

export type ThemeTokens = typeof DARK;

interface ThemeCtx { theme: Theme; toggle: () => void; T: ThemeTokens; }
const Ctx = createContext<ThemeCtx>({} as ThemeCtx);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const toggle = () => setTheme(t => t === "dark" ? "light" : "dark");
  const T = theme === "dark" ? DARK : LIGHT;
  return <Ctx.Provider value={{ theme, toggle, T }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);

// Program colors adapted for each theme
export const PROG_COLORS_DARK: Record<string,string> = {
  "Química":"#F472B6", "Biología":"#4ADE80", "Física":"#60A5FA", "Matemáticas":"#FB923C",
};
export const PROG_COLORS_LIGHT: Record<string,string> = {
  "Química":"#DB2777", "Biología":"#16A34A", "Física":"#2563EB", "Matemáticas":"#EA580C",
};
export const PROG_ICONS: Record<string,string> = {
  "Química":"⚛️", "Biología":"🧬", "Física":"🧲", "Matemáticas":"π",
};