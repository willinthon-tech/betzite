import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import wsPlugin from './plugins/ws.js';
import authPlugin from './plugins/auth.js';
import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';
import { runInitAndSeed } from './db/seed.js';

dotenv.config();

const fastify = Fastify({
  logger: true
});

// Registrar CORS
await fastify.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
});

// Aceptar bodies vacíos con Content-Type: application/json sin fallar
fastify.removeAllContentTypeParsers();
fastify.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body, done) {
  try {
    if (!body || (typeof body === 'string' && body.trim() === '')) {
      done(null, null);
      return;
    }
    const json = JSON.parse(body);
    done(null, json);
  } catch (err) {
    err.statusCode = 400;
    done(err, undefined);
  }
});

// Registrar plugins de WebSocket y autenticación
await fastify.register(wsPlugin);
await fastify.register(authPlugin);


// Registrar rutas
await fastify.register(authRoutes, { prefix: '/api/auth' });
await fastify.register(publicRoutes, { prefix: '/api/public' });
await fastify.register(adminRoutes, { prefix: '/api/admin' });

// Ruta de comprobación de salud
fastify.get('/api/health', async (request, reply) => {
  return { status: 'ok', service: 'betzite-api', timestamp: new Date().toISOString() };
});

const PORT = parseInt(process.env.PORT, 10) || 3045;
const HOST = process.env.HOST || '0.0.0.0';

async function start() {
  try {
    // Asegurar inicialización y seed de la base de datos al arrancar
    await runInitAndSeed();
    
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`Servidor Fastify de BETZITE activo en http://localhost:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
