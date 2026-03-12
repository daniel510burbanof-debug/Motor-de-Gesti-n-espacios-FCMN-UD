// src/usePermisos.ts
export function usePermisos(profile: any) {
    const permisos: Record<string, boolean> = profile?.permisos || {};
    const role = profile?.role || "viewer";
    const espaciosPermitidos: string[] = profile?.espacios_permitidos || [];
    const isSuperAdmin = role === "superadmin";
  
    // Si es superadmin, todo permitido sin revisar permisos
    const can = (key: string): boolean => {
      if (isSuperAdmin) return true;
      return permisos[key] === true;
    };
  
    // Filtra lista de espacios según lo que tiene permitido
    const filtrarEspacios = (spaces: any[]): any[] => {
      if (isSuperAdmin || espaciosPermitidos.length === 0) return spaces;
      return spaces.filter(s => espaciosPermitidos.includes(s.nombre));
    };
  
    return { can, filtrarEspacios, isSuperAdmin };
  }