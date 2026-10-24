import { pool } from '../db/connection.js';
import { fetchCurrentMetrics } from '../services/metrics.js';

const VALID_CATEGORIAS = [
  'atencion al cliente',
  'maquinas',
  'casino en vivo',
  'apuestas deportivas',
  'general'
];

const VALID_TIPOS = ['empleado', 'general'];
const VALID_ESTADOS = ['pendiente', 'en revision', 'resuelto'];

export default async function adminRoutes(fastify, opts) {
  // Todas las rutas de este plugin requieren autenticación
  fastify.addHook('preHandler', fastify.authenticate);

  // 1. Resumen y métricas para panel administrativo
  fastify.get('/metrics', async (request, reply) => {
    try {
      const totalQuejasRes = await pool.query('SELECT COUNT(*) as count FROM quejas');
      const totalClientesRes = await pool.query('SELECT COUNT(*) as count FROM clientes');
      
      const porCategoriaRes = await pool.query(`
        SELECT categoria_queja, COUNT(*) as count,
          SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END) as pendientes,
          SUM(CASE WHEN estado = 'en revision' THEN 1 ELSE 0 END) as en_revision,
          SUM(CASE WHEN estado = 'resuelto' THEN 1 ELSE 0 END) as resueltos
        FROM quejas 
        GROUP BY categoria_queja
      `);

      const porTipoRes = await pool.query(`
        SELECT c.tipo_usuario, COUNT(q.id) as count
        FROM clientes c
        LEFT JOIN quejas q ON q.cliente_id = c.id
        GROUP BY c.tipo_usuario
      `);

      const porEstadoRes = await pool.query(`
        SELECT estado, COUNT(*) as count 
        FROM quejas 
        GROUP BY estado
      `);

      return reply.send({
        success: true,
        summary: {
          total_quejas: parseInt(totalQuejasRes.rows[0].count, 10),
          total_clientes: parseInt(totalClientesRes.rows[0].count, 10),
          por_categoria: porCategoriaRes.rows,
          por_tipo: porTipoRes.rows,
          por_estado: porEstadoRes.rows
        }
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({
        error: 'Error del servidor',
        message: 'No fue posible obtener el resumen métrico.'
      });
    }
  });

  // 2. Listado de quejas con filtros avanzados
  fastify.get('/quejas', async (request, reply) => {
    try {
      const { categoria, tipo_usuario, estado, cliente_id, search, sort = 'desc' } = request.query;

      const conditions = [];
      const params = [];
      let paramIndex = 1;

      if (categoria && VALID_CATEGORIAS.includes(categoria)) {
        conditions.push(`q.categoria_queja = $${paramIndex++}`);
        params.push(categoria);
      }

      if (tipo_usuario && VALID_TIPOS.includes(tipo_usuario)) {
        conditions.push(`c.tipo_usuario = $${paramIndex++}`);
        params.push(tipo_usuario);
      }

      if (estado && VALID_ESTADOS.includes(estado)) {
        conditions.push(`q.estado = $${paramIndex++}`);
        params.push(estado);
      }

      if (cliente_id) {
        conditions.push(`q.cliente_id = $${paramIndex++}`);
        params.push(parseInt(cliente_id, 10));
      }

      if (search && search.trim()) {
        conditions.push(`(
          c.nombre_usuario ILIKE $${paramIndex} OR
          c.nombre_apellido ILIKE $${paramIndex} OR
          c.correo ILIKE $${paramIndex} OR
          q.descripcion ILIKE $${paramIndex}
        )`);
        params.push(`%${search.trim()}%`);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const orderDir = sort.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

      const query = `
        SELECT 
          q.id,
          q.cliente_id,
          q.categoria_queja,
          q.descripcion,
          q.estado,
          q.created_at,
          q.updated_at,
          c.nombre_usuario,
          c.nombre_apellido,
          c.correo,
          c.tipo_usuario
        FROM quejas q
        JOIN clientes c ON c.id = q.cliente_id
        ${whereClause}
        ORDER BY q.created_at ${orderDir}
      `;

      const { rows } = await pool.query(query, params);
      return reply.send({ success: true, quejas: rows, total: rows.length });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({
        error: 'Error del servidor',
        message: 'No fue posible obtener el listado de quejas.'
      });
    }
  });

  // 3. Detalle de una queja específica con identificadores para navegación (anterior / siguiente)
  fastify.get('/quejas/:id', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ error: 'ID inválido' });
      }

      const query = `
        SELECT 
          q.id,
          q.cliente_id,
          q.categoria_queja,
          q.descripcion,
          q.estado,
          q.created_at,
          q.updated_at,
          c.nombre_usuario,
          c.nombre_apellido,
          c.correo,
          c.tipo_usuario
        FROM quejas q
        JOIN clientes c ON c.id = q.cliente_id
        WHERE q.id = $1
      `;

      const { rows } = await pool.query(query, [id]);
      if (rows.length === 0) {
        return reply.status(404).send({
          error: 'No encontrado',
          message: 'La queja solicitada no existe.'
        });
      }

      const queja = rows[0];

      // Obtener el ID de la queja anterior y siguiente para navegación continua
      const prevRes = await pool.query(
        'SELECT id FROM quejas WHERE id < $1 ORDER BY id DESC LIMIT 1',
        [id]
      );
      const nextRes = await pool.query(
        'SELECT id FROM quejas WHERE id > $1 ORDER BY id ASC LIMIT 1',
        [id]
      );

      return reply.send({
        success: true,
        queja,
        navigation: {
          prev_id: prevRes.rows.length > 0 ? prevRes.rows[0].id : null,
          next_id: nextRes.rows.length > 0 ? nextRes.rows[0].id : null
        }
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({
        error: 'Error del servidor',
        message: 'No fue posible cargar el detalle de la queja.'
      });
    }
  });

  // 4. Edición de queja y de la información del cliente
  fastify.put('/quejas/:id', { preHandler: [fastify.requireLevel1] }, async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'ID inválido' });
    }

    const {
      categoria_queja,
      descripcion,
      estado,
      nombre_usuario,
      nombre_apellido,
      correo,
      tipo_usuario
    } = request.body || {};

    // Validar categoría si se proporciona
    if (categoria_queja && !VALID_CATEGORIAS.includes(categoria_queja)) {
      return reply.status(400).send({
        error: 'Categoría inválida',
        message: 'Categoría no permitida.'
      });
    }

    // Validar tipo de usuario si se proporciona
    if (tipo_usuario && !VALID_TIPOS.includes(tipo_usuario)) {
      return reply.status(400).send({
        error: 'Tipo de usuario inválido',
        message: 'El tipo debe ser empleado o general.'
      });
    }

    // Validar estado si se proporciona
    if (estado && !VALID_ESTADOS.includes(estado)) {
      return reply.status(400).send({
        error: 'Estado inválido',
        message: 'El estado debe ser pendiente, en revision o resuelto.'
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Obtener cliente_id actual
      const qRes = await client.query('SELECT cliente_id FROM quejas WHERE id = $1', [id]);
      if (qRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.status(404).send({ error: 'Queja no encontrada' });
      }

      const clienteId = qRes.rows[0].cliente_id;

      // Si se actualizan datos del cliente, comprobar duplicados
      if (nombre_usuario || correo) {
        if (nombre_usuario) {
          const userCheck = await client.query(
            'SELECT id FROM clientes WHERE LOWER(nombre_usuario) = LOWER($1) AND id != $2',
            [nombre_usuario.trim(), clienteId]
          );
          if (userCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return reply.status(400).send({
              error: 'Nombre de usuario duplicado',
              message: 'El nombre de usuario ya pertenece a otro cliente.'
            });
          }
        }

        if (correo) {
          const emailCheck = await client.query(
            'SELECT id FROM clientes WHERE LOWER(correo) = LOWER($1) AND id != $2',
            [correo.trim(), clienteId]
          );
          if (emailCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return reply.status(400).send({
              error: 'Correo duplicado',
              message: 'El correo electrónico ya pertenece a otro cliente.'
            });
          }
        }
      }

      // Actualizar cliente si corresponde
      await client.query(`
        UPDATE clientes
        SET 
          nombre_usuario = COALESCE($1, nombre_usuario),
          nombre_apellido = COALESCE($2, nombre_apellido),
          correo = COALESCE($3, correo),
          tipo_usuario = COALESCE($4, tipo_usuario),
          updated_at = NOW()
        WHERE id = $5
      `, [
        nombre_usuario ? nombre_usuario.trim().toLowerCase() : null,
        nombre_apellido ? nombre_apellido.trim() : null,
        correo ? correo.trim().toLowerCase() : null,
        tipo_usuario || null,
        clienteId
      ]);

      // Actualizar queja
      await client.query(`
        UPDATE quejas
        SET
          categoria_queja = COALESCE($1, categoria_queja),
          descripcion = COALESCE($2, descripcion),
          estado = COALESCE($3, estado),
          updated_at = NOW()
        WHERE id = $4
      `, [
        categoria_queja || null,
        descripcion ? descripcion.trim() : null,
        estado || null,
        id
      ]);

      await client.query('COMMIT');

      // Retornar registro completo actualizado
      const updated = await pool.query(`
        SELECT 
          q.id,
          q.cliente_id,
          q.categoria_queja,
          q.descripcion,
          q.estado,
          q.created_at,
          q.updated_at,
          c.nombre_usuario,
          c.nombre_apellido,
          c.correo,
          c.tipo_usuario
        FROM quejas q
        JOIN clientes c ON c.id = q.cliente_id
        WHERE q.id = $1
      `, [id]);

      // Emitir actualización por WebSocket
      try {
        const freshMetrics = await fetchCurrentMetrics();
        fastify.broadcast('queja_actualizada', {
          queja: updated.rows[0],
          metrics: freshMetrics
        });
      } catch (broadcastErr) {
        fastify.log.error(broadcastErr, 'Error al emitir broadcast queja_actualizada');
      }

      return reply.send({
        success: true,
        message: 'Información de la queja y del cliente actualizada exitosamente.',
        queja: updated.rows[0]
      });
    } catch (err) {
      await client.query('ROLLBACK');
      fastify.log.error(err);
      return reply.status(500).send({
        error: 'Error del servidor',
        message: 'No fue posible guardar los cambios en la queja.'
      });
    } finally {
      client.release();
    }
  });

  // 5. Eliminar una queja y su registro por completo
  fastify.delete('/quejas/:id', { preHandler: [fastify.requireLevel1] }, async (request, reply) => {
    const client = await pool.connect();
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ error: 'ID inválido' });
      }

      await client.query('BEGIN');

      const qRes = await client.query('SELECT cliente_id FROM quejas WHERE id = $1', [id]);
      if (qRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.status(404).send({
          error: 'No encontrada',
          message: 'El registro que intenta eliminar no existe.'
        });
      }

      const clienteId = qRes.rows[0].cliente_id;

      // Eliminar la queja
      await client.query('DELETE FROM quejas WHERE id = $1', [id]);

      // Verificar si el cliente tiene otras quejas en el sistema
      const otherQuejas = await client.query(
        'SELECT COUNT(*) as count FROM quejas WHERE cliente_id = $1',
        [clienteId]
      );

      let clienteEliminado = false;
      if (parseInt(otherQuejas.rows[0].count, 10) === 0) {
        await client.query('DELETE FROM clientes WHERE id = $1', [clienteId]);
        clienteEliminado = true;
      }

      await client.query('COMMIT');

      // Emitir eliminación por WebSocket con métricas actualizadas
      try {
        const freshMetrics = await fetchCurrentMetrics();
        fastify.broadcast('queja_eliminada', {
          id,
          cliente_id: clienteEliminado ? clienteId : null,
          metrics: freshMetrics
        });
      } catch (broadcastErr) {
        fastify.log.error(broadcastErr, 'Error al emitir broadcast queja_eliminada');
      }

      return reply.send({
        success: true,
        message: `Registro #${id} eliminado por completo del sistema.`,
        cliente_eliminado: clienteEliminado
      });
    } catch (err) {
      await client.query('ROLLBACK');
      fastify.log.error(err);
      return reply.status(500).send({
        error: 'Error del servidor',
        message: 'No fue posible eliminar el registro por completo.'
      });
    } finally {
      client.release();
    }
  });

  // 6. Listado de clientes con conteo de quejas
  fastify.get('/clientes', async (request, reply) => {
    try {
      const { tipo_usuario, search } = request.query;

      const conditions = [];
      const params = [];
      let paramIndex = 1;

      if (tipo_usuario && VALID_TIPOS.includes(tipo_usuario)) {
        conditions.push(`c.tipo_usuario = $${paramIndex++}`);
        params.push(tipo_usuario);
      }

      if (search && search.trim()) {
        conditions.push(`(
          c.nombre_usuario ILIKE $${paramIndex} OR
          c.nombre_apellido ILIKE $${paramIndex} OR
          c.correo ILIKE $${paramIndex}
        )`);
        params.push(`%${search.trim()}%`);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const query = `
        SELECT 
          c.id,
          c.nombre_usuario,
          c.nombre_apellido,
          c.correo,
          c.tipo_usuario,
          c.created_at,
          c.updated_at,
          COUNT(q.id) as total_quejas,
          SUM(CASE WHEN q.estado = 'pendiente' THEN 1 ELSE 0 END) as quejas_pendientes,
          MAX(q.created_at) as ultima_queja_fecha
        FROM clientes c
        LEFT JOIN quejas q ON q.cliente_id = c.id
        ${whereClause}
        GROUP BY c.id
        ORDER BY total_quejas DESC, c.nombre_apellido ASC
      `;

      const { rows } = await pool.query(query, params);
      return reply.send({ success: true, clientes: rows, total: rows.length });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({
        error: 'Error del servidor',
        message: 'No se pudo obtener el directorio de clientes.'
      });
    }
  });

  // 7. Detalle de cliente con historial completo de quejas y navegación
  fastify.get('/clientes/:id', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ error: 'ID inválido' });
      }

      const clientRes = await pool.query(
        'SELECT id, nombre_usuario, nombre_apellido, correo, tipo_usuario, created_at, updated_at FROM clientes WHERE id = $1',
        [id]
      );

      if (clientRes.rows.length === 0) {
        return reply.status(404).send({
          error: 'No encontrado',
          message: 'El cliente no existe en la base de datos.'
        });
      }

      const cliente = clientRes.rows[0];

      // Quejas asociadas a este cliente
      const quejasRes = await pool.query(
        'SELECT id, categoria_queja, descripcion, estado, created_at, updated_at FROM quejas WHERE cliente_id = $1 ORDER BY created_at DESC',
        [id]
      );

      // Navegación secuencial de clientes
      const prevRes = await pool.query(
        'SELECT id FROM clientes WHERE id < $1 ORDER BY id DESC LIMIT 1',
        [id]
      );
      const nextRes = await pool.query(
        'SELECT id FROM clientes WHERE id > $1 ORDER BY id ASC LIMIT 1',
        [id]
      );

      return reply.send({
        success: true,
        cliente,
        quejas: quejasRes.rows,
        navigation: {
          prev_id: prevRes.rows.length > 0 ? prevRes.rows[0].id : null,
          next_id: nextRes.rows.length > 0 ? nextRes.rows[0].id : null
        }
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({
        error: 'Error del servidor',
        message: 'No fue posible cargar el perfil del cliente.'
      });
    }
  });

  // 8. Edición de cliente individual
  fastify.put('/clientes/:id', { preHandler: [fastify.requireLevel1] }, async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ error: 'ID inválido' });
      }

      const { nombre_usuario, nombre_apellido, correo, tipo_usuario } = request.body || {};

      if (tipo_usuario && !VALID_TIPOS.includes(tipo_usuario)) {
        return reply.status(400).send({
          error: 'Tipo inválido',
          message: 'El tipo debe ser empleado o general.'
        });
      }

      if (nombre_usuario) {
        const uCheck = await pool.query(
          'SELECT id FROM clientes WHERE LOWER(nombre_usuario) = LOWER($1) AND id != $2',
          [nombre_usuario.trim(), id]
        );
        if (uCheck.rows.length > 0) {
          return reply.status(400).send({
            error: 'Usuario duplicado',
            message: 'El nombre de usuario ya está asignado a otro registro.'
          });
        }
      }

      if (correo) {
        const eCheck = await pool.query(
          'SELECT id FROM clientes WHERE LOWER(correo) = LOWER($1) AND id != $2',
          [correo.trim(), id]
        );
        if (eCheck.rows.length > 0) {
          return reply.status(400).send({
            error: 'Correo duplicado',
            message: 'El correo electrónico ya está asignado a otro registro.'
          });
        }
      }

      const updateRes = await pool.query(`
        UPDATE clientes
        SET
          nombre_usuario = COALESCE($1, nombre_usuario),
          nombre_apellido = COALESCE($2, nombre_apellido),
          correo = COALESCE($3, correo),
          tipo_usuario = COALESCE($4, tipo_usuario),
          updated_at = NOW()
        WHERE id = $5
        RETURNING id, nombre_usuario, nombre_apellido, correo, tipo_usuario, created_at, updated_at
      `, [
        nombre_usuario ? nombre_usuario.trim().toLowerCase() : null,
        nombre_apellido ? nombre_apellido.trim() : null,
        correo ? correo.trim().toLowerCase() : null,
        tipo_usuario || null,
        id
      ]);

      if (updateRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Cliente no encontrado' });
      }

      // Emitir actualización de cliente por WebSocket
      try {
        const freshMetrics = await fetchCurrentMetrics();
        fastify.broadcast('cliente_actualizado', {
          cliente: updateRes.rows[0],
          metrics: freshMetrics
        });
      } catch (broadcastErr) {
        fastify.log.error(broadcastErr, 'Error al emitir broadcast cliente_actualizado');
      }

      return reply.send({
        success: true,
        message: 'Cliente actualizado correctamente.',
        cliente: updateRes.rows[0]
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({
        error: 'Error del servidor',
        message: 'No fue posible actualizar el cliente.'
      });
    }
  });

  // 9. Eliminar cliente y sus quejas
  fastify.delete('/clientes/:id', { preHandler: [fastify.requireLevel1] }, async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ error: 'ID inválido' });
      }

      const res = await pool.query('DELETE FROM clientes WHERE id = $1 RETURNING id, nombre_usuario', [id]);
      if (res.rows.length === 0) {
        return reply.status(404).send({
          error: 'No encontrado',
          message: 'El cliente no existe o ya fue eliminado.'
        });
      }

      // Emitir eliminación de cliente por WebSocket
      try {
        const freshMetrics = await fetchCurrentMetrics();
        fastify.broadcast('cliente_eliminado', {
          id,
          metrics: freshMetrics
        });
      } catch (broadcastErr) {
        fastify.log.error(broadcastErr, 'Error al emitir broadcast cliente_eliminado');
      }

      return reply.send({
        success: true,
        message: `Cliente ${res.rows[0].nombre_usuario} y sus quejas asociadas han sido eliminados correctamente.`
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({
        error: 'Error del servidor',
        message: 'No se pudo eliminar el cliente.'
      });
    }
  });

  // 10. Vista analítica de fallas y categorías ("porder ver que falla quien se queja por eso")
  fastify.get('/fallas', async (request, reply) => {
    try {
      const categoriesSummary = [];

      for (const cat of VALID_CATEGORIAS) {
        const countRes = await pool.query(`
          SELECT 
            COUNT(q.id) as total,
            SUM(CASE WHEN q.estado = 'pendiente' THEN 1 ELSE 0 END) as pendientes,
            SUM(CASE WHEN q.estado = 'en revision' THEN 1 ELSE 0 END) as en_revision,
            SUM(CASE WHEN q.estado = 'resuelto' THEN 1 ELSE 0 END) as resueltos,
            SUM(CASE WHEN c.tipo_usuario = 'empleado' THEN 1 ELSE 0 END) as quejas_empleados,
            SUM(CASE WHEN c.tipo_usuario = 'general' THEN 1 ELSE 0 END) as quejas_generales
          FROM quejas q
          JOIN clientes c ON c.id = q.cliente_id
          WHERE q.categoria_queja = $1
        `, [cat]);

        const clientsRes = await pool.query(`
          SELECT DISTINCT
            c.id,
            c.nombre_usuario,
            c.nombre_apellido,
            c.correo,
            c.tipo_usuario,
            COUNT(q.id) as total_quejas_categoria,
            MAX(q.created_at) as fecha_mas_reciente
          FROM clientes c
          JOIN quejas q ON q.cliente_id = c.id
          WHERE q.categoria_queja = $1
          GROUP BY c.id
          ORDER BY total_quejas_categoria DESC
        `, [cat]);

        categoriesSummary.push({
          categoria: cat,
          stats: countRes.rows[0],
          clientes_afectados: clientsRes.rows
        });
      }

      return reply.send({
        success: true,
        fallas: categoriesSummary
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({
        error: 'Error del servidor',
        message: 'No se pudo generar la vista de fallas y áreas afectadas.'
      });
    }
  });
}
