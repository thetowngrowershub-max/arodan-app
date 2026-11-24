import { buildApp } from './app.js';
import { config } from './config.js';

const app = await buildApp({ workers: config.workers });
await app.listen({ port: config.port, host: config.host });
