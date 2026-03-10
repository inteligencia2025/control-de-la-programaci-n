import { DEFAULT_COLORS } from '@/types/project';

export interface PreloadedActivity {
  name: string;
  category: 'estructura' | 'acabados';
}

export const PRELOADED_ACTIVITIES: PreloadedActivity[] = [
  { name: 'MOVIMIENTO DE TIERRAS', category: 'estructura' },
  { name: 'PROVISIONALES DE OBRA', category: 'estructura' },
  { name: 'ADECUACIÓN CAMPAMENTOS', category: 'estructura' },
  { name: 'INSTALACIÓN TORRE GRÚA', category: 'estructura' },
  { name: 'INSTALACIÓN PLANTA DE CONCRETO', category: 'estructura' },
  { name: 'CIMENTACIÓN PROFUNDA', category: 'estructura' },
  { name: 'LOSA CIMENTACIÓN', category: 'estructura' },
  { name: 'ARMADO ACERO', category: 'estructura' },
  { name: 'TUBERÍA HIDROSANITARIA Y ELÉCTRICA', category: 'estructura' },
  { name: 'VACIADO MUROS', category: 'estructura' },
  { name: 'DESENCOFRADO', category: 'estructura' },
  { name: 'RESANES', category: 'estructura' },
  { name: 'PRUEBAS DE HERMETICIDAD Y PRESIÓN', category: 'estructura' },
  { name: 'SONDEO CAJAS ELÉCTRICAS', category: 'estructura' },
  { name: 'REDES DE GAS', category: 'estructura' },
  { name: 'BORDILLOS', category: 'acabados' },
  { name: 'CARTERAS', category: 'acabados' },
  { name: 'REVOQUE', category: 'acabados' },
  { name: 'ARGAMASA', category: 'acabados' },
  { name: 'MORTERO', category: 'acabados' },
  { name: 'ESTUCO', category: 'acabados' },
  { name: 'FILETERÍA', category: 'acabados' },
  { name: 'ESTRUCTURA LIVIANA', category: 'acabados' },
  { name: 'TUBERÍA HIDROSANITARIA Y ELÉCTRICA (ACABADOS)', category: 'acabados' },
  { name: 'INSTALACIÓN SUPERBOARD', category: 'acabados' },
  { name: 'ENCHAPE DE PARED', category: 'acabados' },
  { name: 'INSTALACIÓN PLACA', category: 'acabados' },
  { name: 'MASILLADO', category: 'acabados' },
  { name: 'ESTUCO (ACABADOS)', category: 'acabados' },
  { name: 'PRIMERA Y SEGUNDA MANO DE PINTURA', category: 'acabados' },
  { name: 'ENCHAPE PAREDES', category: 'acabados' },
  { name: 'PINTURA PARA CARPINTERÍA', category: 'acabados' },
  { name: 'CARPINTERÍA', category: 'acabados' },
  { name: 'ALAMBRADA', category: 'acabados' },
  { name: 'APARATOS ELÉCTRICOS', category: 'acabados' },
  { name: 'ENCHAPE PISOS', category: 'acabados' },
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
