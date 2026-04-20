import './env'; // valida variables al arrancar
import app from './app';
import { env } from './env';

console.log(`🚀 Server running on http://localhost:${env.PORT}`);

export default {
  port: env.PORT,
  fetch: app.fetch,
};
