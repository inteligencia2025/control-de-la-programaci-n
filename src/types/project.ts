export type ProjectType = 'casas' | 'edificio';

export interface BuildingConfig {
  floors: number;
  unitsPerFloor: number;
  hasCubierta?: boolean;
}

export type CubiertaRow = 'cubierta' | 'muros_cubierta' | 'ascensores';

export interface Activity {
  id: string;
  name: string;
  unitStart: number;
  unitEnd: number;
  startDate: string; // YYYY-MM-DD
  endDate?: string;  // YYYY-MM-DD (only for category='cubierta')
  rate: number; // units per day
  color: string;
  category: 'estructura' | 'acabados' | 'zonas_sociales' | 'cubierta';
  cubiertaRow?: CubiertaRow; // only for category='cubierta'
  predecessorId?: string;
  bufferDays: number;
  bufferUnits: number;
  crews: number;
  enabled: boolean;
}

export interface RestrictionCategory {
  id: string;
  name: string;
  items: { id: string; label: string }[];
}

export const RESTRICTION_CATEGORIES: RestrictionCategory[] = [
  {
    id: 'diseno', name: 'Diseño', items: [
      { id: 'diseno_planos', label: 'Planos' },
      { id: 'diseno_espec_inst', label: 'Especificaciones de instalación' },
      { id: 'diseno_espec', label: 'Especificaciones' },
      { id: 'diseno_modif', label: 'Modificaciones o ajustes en diseño' },
    ],
  },
  {
    id: 'materiales', name: 'Materiales', items: [
      { id: 'mat_cantidades', label: 'Cantidades de obra' },
      { id: 'mat_req_compra', label: 'Requerimiento de compra' },
      { id: 'mat_orden_compra', label: 'Orden de compra' },
      { id: 'mat_llegada', label: 'Llegada de material' },
      { id: 'mat_disposicion', label: 'Disposición en sitio de trabajo' },
    ],
  },
  {
    id: 'contratos', name: 'Contratos / Suministro', items: [
      { id: 'con_pliegos', label: 'Pliegos de solicitud de contratación' },
      { id: 'con_envio_prov', label: 'Envío a proveedor' },
      { id: 'con_recibo_prop', label: 'Recibo de propuestas' },
      { id: 'con_cuadro_comp', label: 'Cuadro comparativo' },
      { id: 'con_adjudicacion', label: 'Adjudicación de contrato' },
      { id: 'con_minuta', label: 'Minuta de contrato' },
      { id: 'con_polizas', label: 'Pólizas' },
      { id: 'con_valid_polizas', label: 'Validación de pólizas' },
      { id: 'con_anticipo', label: 'Entrega de anticipo' },
      { id: 'con_fabricacion', label: 'Fabricación' },
      { id: 'con_almacenamiento', label: 'Disponibilidad de almacenamiento' },
      { id: 'con_recibo_insumos', label: 'Recibo de insumos' },
      { id: 'con_transporte', label: 'Transporte interno' },
    ],
  },
  {
    id: 'mano_obra', name: 'Mano de Obra', items: [
      { id: 'mo_pliegos', label: 'Pliego de solicitud de cotizaciones' },
      { id: 'mo_envio_cot', label: 'Envío de cotizaciones' },
      { id: 'mo_cuadro_comp', label: 'Cuadro comparativo' },
      { id: 'mo_adjudicacion', label: 'Adjudicación del contrato' },
      { id: 'mo_sst', label: 'Validación requerimientos SST' },
      { id: 'mo_reunion', label: 'Reunión de inicio' },
      { id: 'mo_logistica', label: 'Logística interna' },
    ],
  },
  {
    id: 'equipo', name: 'Herramienta y Equipo', items: [
      { id: 'eq_maquinaria', label: 'Maquinaria y equipo' },
      { id: 'eq_herramienta', label: 'Herramienta y equipo menor' },
      { id: 'eq_logistica', label: 'Logística de disposición en sitio' },
    ],
  },
];

export function getAllRestrictionIds(): string[] {
  return RESTRICTION_CATEGORIES.flatMap(c => c.items.map(i => i.id));
}

export function createEmptyRestrictions(): Record<string, boolean> {
  const r: Record<string, boolean> = {};
  for (const cat of RESTRICTION_CATEGORIES) {
    for (const item of cat.items) {
      r[item.id] = false;
    }
  }
  return r;
}

export interface LookaheadItem {
  id: string;
  activityId: string;
  activityName: string;
  responsible: string;
  week: number;
  restrictions: Record<string, boolean>;
  commitment?: string;
  commitmentDate?: string;
  commitmentMet?: boolean;
  commitmentCause?: string;
}

export interface PACRecord {
  id: string;
  date: string;
  weekNumber: number;
  activityName: string;
  responsible: string;
  planned: boolean;
  completed: boolean;
  /** Programado (%) — porcentaje planificado para la actividad en la semana */
  plannedPct: number;
  /** Ejecutado (%) — porcentaje real ejecutado en la semana */
  completedPct: number;
  failureCause: string;
  failureDescription?: string;
}

/** Una actividad cumple PAC cuando lo ejecutado ≥ lo programado y lo programado > 0 */
export function isPACCompliant(r: Pick<PACRecord, 'plannedPct' | 'completedPct'>): boolean {
  return r.plannedPct > 0 && r.completedPct >= r.plannedPct;
}

export const DEFAULT_FAILURE_CAUSES: string[] = [
  'Falta de materiales en obra',
  'Falta de materiales en el sitio de trabajo',
  'Materiales defectuosos',
  'Ausentismo de mano de obra',
  'Mano de obra insuficiente',
  'Falta de herramientas y/o equipo en la obra',
  'Falta de herramienta y/o equipo en el sitio de trabajo',
  'Daño en herramientas y/o equipo',
  'Actividad predecesora incompleta',
  'Actividad predecesora mal ejecutada',
  'Actividad predecesora no ejecutada',
  'Dificultades técnicas',
  'Falta de diseños',
  'Falta de especificaciones',
  'Condiciones climáticas',
  'Incumplimiento del proveedor',
  'Rendimiento',
  'Incumplimiento del contratista',
  'Falta de planificación',
  'Reprocesos',
];

export interface ProjectData {
  name: string;
  projectType: ProjectType;
  buildingConfig: BuildingConfig;
  activities: Activity[];
  lookahead: LookaheadItem[];
  pacRecords: PACRecord[];
  contractors: string[];
  responsibles: string[];
  customFailureCauses: string[];
  projectStartDate?: string;
  defaultUnits?: number;
  unitLabels?: Record<string, string>; // key: unit number as string, value: custom label
}

export const DEFAULT_COLORS = [
  '#1e3a5f', '#e69500', '#2d8a56', '#c0392b',
  '#2980b9', '#8e44ad', '#16a085', '#d35400',
  '#7f8c8d', '#27ae60',
];

/** When hasCubierta is enabled, three extra unit slots are appended on top of the building */
export function getCubiertaUnits(buildingConfig: BuildingConfig): { cubierta: number; muros: number; ascensores: number } | null {
  if (!buildingConfig.hasCubierta) return null;
  const totalReg = buildingConfig.floors * buildingConfig.unitsPerFloor;
  return { cubierta: totalReg + 1, muros: totalReg + 2, ascensores: totalReg + 3 };
}

/** Generate unit label based on project type */
export function getUnitLabel(unit: number, projectType: ProjectType, buildingConfig: BuildingConfig): string {
  if (projectType === 'casas') return `${unit}`;
  const cu = getCubiertaUnits(buildingConfig);
  if (cu) {
    if (unit === cu.cubierta) return 'Cubierta';
    if (unit === cu.muros) return 'Muros Cub.';
    if (unit === cu.ascensores) return 'Ascensores';
  }
  const floor = Math.ceil(unit / buildingConfig.unitsPerFloor);
  const unitOnFloor = ((unit - 1) % buildingConfig.unitsPerFloor) + 1;
  return `${floor}${unitOnFloor.toString().padStart(2, '0')}`;
}
