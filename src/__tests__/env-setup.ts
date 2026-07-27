// Corre antes de cada archivo de test vía el preload de bunfig.toml, y tiene
// que ejecutarse antes de que se importe cualquier módulo: `src/env.ts` corta
// el proceso al importarse si falta una variable.
//
// La lista vive en scripts/lib/placeholder-env.ts, compartida con la
// generación del OpenAPI. Tenerla en un solo lugar es a propósito: cuando
// estaba duplicada acá quedó incompleta, y los tests pasaban en local tomando
// el resto del .env del dev mientras en CI ni arrancaban.
import { applyPlaceholderEnv } from '../../scripts/lib/placeholder-env';

applyPlaceholderEnv();
