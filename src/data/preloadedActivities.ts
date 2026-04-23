import { DEFAULT_COLORS } from '@/types/project';

export interface PreloadedActivity {
  name: string;
  category: 'estructura' | 'acabados' | 'preliminares';
  /** Estimated duration in working days — only used for category='preliminares' */
  durationDays?: number;
}

/**
 * The first block of activities (category 'preliminares') runs sequentially BEFORE
 * any apartment work. They are drawn as horizontal lines (start date → end date)
 * in their own band above the main LOB plot, similar to cubierta rows.
 */
export const PRELOADED_ACTIVITIES: PreloadedActivity[] = [
  // ===== Preliminares (linear, sequential, before apartments) =====
  { name: 'MOVIMIENTO DE TIERRAS', category: 'preliminares', durationDays: 15 },
  { name: 'PROVISIONALES DE OBRA', category: 'preliminares', durationDays: 10 },
  { name: 'ADECUACIÓN CAMPAMENTOS', category: 'preliminares', durationDays: 7 },
  { name: 'INSTALACIÓN TORRE GRÚA', category: 'preliminares', durationDays: 5 },
  { name: 'INSTALACIÓN PLANTA DE CONCRETO', category: 'preliminares', durationDays: 5 },
  { name: 'LOCALIZACION Y REPLANTEO', category: 'preliminares', durationDays: 3 },
  { name: 'HILADEROS', category: 'preliminares', durationDays: 5 },
  { name: 'CIMENTACIÓN PROFUNDA', category: 'preliminares', durationDays: 20 },
  { name: 'EXCAVACIÓN VIGAS DE CIMENTACIÓN', category: 'preliminares', durationDays: 10 },
  { name: 'SOLADOS', category: 'preliminares', durationDays: 5 },
  { name: 'ARMADO DE ACERO VIGAS', category: 'preliminares', durationDays: 8 },
  { name: 'VACIADO LOSA CIMENTACIÓN', category: 'preliminares', durationDays: 7 },
  // ===== Estructura (apartments — LOB lines) =====
  { name: 'EXCAVACIONES PARA TUBERÍA HIDROSANITARIA', category: 'estructura' },
  { name: 'INSTALACIÓN TUBERÍA HIDROSANITARIA', category: 'estructura' },
  { name: 'INSTALACIÓN TUBERÍA HIDROSANITARIA Y ELÉCTRICA', category: 'estructura' },
  { name: 'CIMBRADO MUROS', category: 'estructura' },
  { name: 'ARMADO ACERO', category: 'estructura' },
  { name: 'INSTALACIÓN TUBERÍA HIDROSANITARIA Y ELÉCTRICA MUROS', category: 'estructura' },
  { name: 'VACIADO MUROS', category: 'estructura' },
  { name: 'DESENCOFRADO', category: 'estructura' },
  { name: 'RESANES MUROS', category: 'estructura' },
  { name: 'ENCOFRADO LOSA', category: 'estructura' },
  { name: 'ARMADO DE ACERO LOSA', category: 'estructura' },
  { name: 'INSTALACIÓN TUBERÍA HIDROSANITARIA Y ELÉCTRICA LOSA', category: 'estructura' },
  { name: 'ARMADO REFUERZO ACERO SUPERIOR LOSA', category: 'estructura' },
  { name: 'VACIADO LOSA', category: 'estructura' },
  { name: 'CIMBRA DE MUROS P2', category: 'estructura' },
  { name: 'ARMADO ACERO P2', category: 'estructura' },
  { name: 'INSTALACIÓN TUBERÍA HIDROSANITARIA Y ELÉCTRICA MUROS P2', category: 'estructura' },
  { name: 'VACIADO MUROS P2', category: 'estructura' },
  { name: 'DESENCOFRADO P2', category: 'estructura' },
  { name: 'RESANES MUROS P2', category: 'estructura' },
  { name: 'PRUEBAS DE HERMETICIDAD Y PRESIÓN', category: 'estructura' },
  { name: 'SONDEO CAJAS ELÉCTRICAS', category: 'estructura' },
  { name: 'REDES DE GAS', category: 'estructura' },
  // Acabados
  { name: 'BORDILLOS', category: 'acabados' },
  { name: 'CARTERAS', category: 'acabados' },
  { name: 'REVOQUE', category: 'acabados' },
  { name: 'ARGAMASA', category: 'acabados' },
  { name: 'MORTERO', category: 'acabados' },
  { name: 'ESTUCO', category: 'acabados' },
  { name: 'FILETERÍA', category: 'acabados' },
  { name: 'ESTRUCTURA LIVIANA', category: 'acabados' },
  { name: 'PROLONGACIONES TUBERÍA HIDROSANITARIA Y ELÉCTRICA LIVIANA', category: 'acabados' },
  { name: 'INSTALACIÓN SUPERBOARD (ACABADOS)', category: 'acabados' },
  { name: 'ENCHAPE DE PARED', category: 'acabados' },
  { name: 'INSTALACIÓN PLACA DE PARED', category: 'acabados' },
  { name: 'MASILLADO', category: 'acabados' },
  { name: 'ESTUCO (ACABADOS)', category: 'acabados' },
  { name: 'PRIMERA Y SEGUNDA MANO DE PINTURA', category: 'acabados' },
  { name: 'ENCHAPE PISOS', category: 'acabados' },
  { name: 'PINTURA PARA CARPINTERÍA', category: 'acabados' },
  { name: 'CARPINTERÍA', category: 'acabados' },
  { name: 'ALAMBRADA', category: 'acabados' },
  { name: 'APARATOS ELÉCTRICOS', category: 'acabados' },
  { name: 'ENCHAPE PISOS (2)', category: 'acabados' },
  { name: 'PISO LAMINADO', category: 'acabados' },
  { name: '3RA MANO DE PINTURA', category: 'acabados' },
  { name: 'FRAGUA', category: 'acabados' },
  { name: 'APARATOS SANITARIOS', category: 'acabados' },
  { name: 'DIVISIONES DE BAÑOS', category: 'acabados' },
  { name: 'DETALLES FINALES', category: 'acabados' },
  { name: 'ASEO', category: 'acabados' },
  { name: 'PASAMANOS PUNTO FIJO ESCALAS', category: 'acabados' },
  { name: 'ARGAMASA / MUROS LIVIANOS FACHADAS', category: 'acabados' },
  { name: 'PINTURA DE FACHADA', category: 'acabados' },
  { name: 'RED CONTRAINCENDIOS', category: 'acabados' },
  { name: 'INSTALACIÓN VENTANAS', category: 'acabados' },
  { name: 'CTO', category: 'acabados' },
  { name: 'MEDIDORES ELÉCTRICOS', category: 'acabados' },
  { name: 'MEDIDORES DE AGUA', category: 'acabados' },
];
export function getDefaultColor(index: number): string {
  return DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}
