import './env'; // valida variables al arrancar
import app from './app';
import { env } from './env';

console.log(`🚀 Server running on http://localhost:${env.PORT}`);

export default {
  port: env.PORT,
  fetch: app.fetch,
  // Tope del body en el socket, antes de buffering: con el tope total de
  // adjuntos en 30MB, 35MB da margen para el multipart sin exponer el proceso
  // a payloads gigantes (Bun por defecto acepta 128MB).
  maxRequestBodySize: 35 * 1024 * 1024,
};
