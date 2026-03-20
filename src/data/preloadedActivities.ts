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
  { name: 'LOCALIZACION Y REPLANTEO', category: 'estructura' },
  { name: 'HILADEROS', category: 'estructura' },
  { name: 'CIMENTACIÓN PROFUNDA', category: 'estructura' },
  { name: 'EXCAVACIONES PARA TUBERÍA HIDROSANITARIA', category: 'estructura' },
  { name: 'INSTALACIÓN TUBERÍA HIDROSANITARIA', category: 'estructura' },
  { name: 'EXCAVACIÓN VIGAS DE CIMENTACIÓN', category: 'estructura' },
  { name: 'SOLADOS', category: 'estructura' },
  { name: 'ARMADO DE ACERO VIGAS', category: 'estructura' },
  { name: 'INSTALACIÓN TUBERÍA HIDROSANITARIA Y ELÉCTRICA', category: 'estructura' },
  { name: 'VACIADO LOSA CIMENTACIÓN', category: 'estructura' },
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
  { name: 'BORDILLOS', category: 'acabados' },
  { name: 'CARTERAS', category: 'acabados' },
];
export function getDefaultColor(index: number): string {
  return DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}
