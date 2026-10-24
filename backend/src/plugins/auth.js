import fastifyJwt from '@fastify/jwt';
import fp from 'fastify-plugin';

async function authPlugin(fastify, opts) {
  await fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET || 'betzite_super_secure_jwt_secret_key_2026_x8923',
    sign: {
      expiresIn: '7d'
    }
  });

  fastify.decorate('authenticate', async function (request, reply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      return reply.status(401).send({
        error: 'No autorizado',
        message: 'Sesión inválida o expirada. Por favor inicie sesión nuevamente.'
      });
    }
  });

  // Sin niveles: cualquier usuario autenticado tiene acceso completo a editar y eliminar
  fastify.decorate('requireLevel1', async function (request, reply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      return reply.status(401).send({
        error: 'No autorizado',
        message: 'Sesión inválida o expirada. Por favor inicie sesión nuevamente.'
      });
    }
  });
}

export default fp(authPlugin);

