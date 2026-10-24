import { pool } from '../db/connection.js';

export default async function authRoutes(fastify, opts) {
  // Login de usuarios administrativos
  fastify.post('/login', async (request, reply) => {
    const { usuario, clave } = request.body || {};

    if (!usuario || !clave) {
      return reply.status(400).send({
        error: 'Datos incompletos',
        message: 'Debe ingresar el usuario y la contraseña.'
      });
    }

    try {
      const { rows } = await pool.query(
        'SELECT id, usuario, nombre, clave FROM usuarios WHERE usuario = $1',
        [usuario.trim()]
      );

      if (rows.length === 0) {
        return reply.status(401).send({
          error: 'Credenciales inválidas',
          message: 'El usuario o la contraseña son incorrectos.'
        });
      }

      const user = rows[0];
      // Verificación directa en texto plano solicitada por el usuario
      if (user.clave !== clave) {
        return reply.status(401).send({
          error: 'Credenciales inválidas',
          message: 'El usuario o la contraseña son incorrectos.'
        });
      }

      const tokenPayload = {
        id: user.id,
        usuario: user.usuario,
        nombre: user.nombre
      };

      const token = fastify.jwt.sign(tokenPayload);

      return reply.send({
        success: true,
        message: 'Inicio de sesión exitoso.',
        token,
        user: tokenPayload
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({
        error: 'Error del servidor',
        message: 'No se pudo procesar la solicitud de inicio de sesión.'
      });
    }
  });

  // Verificar sesión activa
  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { rows } = await pool.query(
        'SELECT id, usuario, nombre, created_at FROM usuarios WHERE id = $1',
        [request.user.id]
      );

      if (rows.length === 0) {
        return reply.status(404).send({
          error: 'Usuario no encontrado',
          message: 'El usuario autenticado ya no existe en el sistema.'
        });
      }

      return reply.send({
        success: true,
        user: rows[0]
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({
        error: 'Error del servidor',
        message: 'Error al verificar la identidad del usuario.'
      });
    }
  });
}
