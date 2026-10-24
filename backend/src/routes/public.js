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

export default async function publicRoutes(fastify, opts) {
  // 1. Obtener métricas públicas de quejas
  fastify.get('/metrics', async (request, reply) => {
    try {
      const metrics = await fetchCurrentMetrics();
      return reply.send({
        success: true,
        metrics
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({
        error: 'Error del servidor',
        message: 'No fue posible obtener las métricas del sistema.'
      });
    }
  });

  // 2. Búsqueda y sugerencias en tiempo real para datalist de clientes
  // Permite buscar por nombre de usuario, correo o nombre completo
  fastify.get('/clientes-buscar', async (request, reply) => {
    try {
      const { q } = request.query;
      if (!q || !q.trim()) {
        // Devolver los clientes más recientes como sugerencias iniciales
        const { rows } = await pool.query(`
          SELECT id, nombre_usuario, nombre_apellido, correo, tipo_usuario 
          FROM clientes 
          ORDER BY updated_at DESC, id DESC 
          LIMIT 100
        `);
        return reply.send({ success: true, clientes: rows });
      }

      const searchTerm = `%${q.trim()}%`;
      const { rows } = await pool.query(`
        SELECT id, nombre_usuario, nombre_apellido, correo, tipo_usuario
        FROM clientes
        WHERE 
          nombre_usuario ILIKE $1 OR
          correo ILIKE $1 OR
          nombre_apellido ILIKE $1
        ORDER BY 
          CASE 
            WHEN LOWER(nombre_usuario) = LOWER($2) THEN 1
            WHEN LOWER(correo) = LOWER($2) THEN 2
            WHEN nombre_usuario ILIKE $1 THEN 3
            ELSE 4
          END,
          id DESC
        LIMIT 10
      `, [searchTerm, q.trim()]);

      return reply.send({
        success: true,
        clientes: rows
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({
        error: 'Error de búsqueda',
        message: 'No fue posible buscar sugerencias de clientes.'
      });
    }
  });

  // 3. Validación de identidad y conflictos en tiempo real
  fastify.get('/validar-identidad', async (request, reply) => {
    const { usuario = '', correo = '' } = request.query;
    const cleanU = (usuario || '').trim().toLowerCase();
    const cleanE = (correo || '').trim().toLowerCase();

    let userConflict = null;
    let emailConflict = null;
    let existingClient = null;
    let isNew = false;

    try {
      const uRes = cleanU ? await pool.query(
        'SELECT id, nombre_usuario, nombre_apellido, correo, tipo_usuario FROM clientes WHERE LOWER(nombre_usuario) = $1',
        [cleanU]
      ) : { rows: [] };

      const eRes = cleanE ? await pool.query(
        'SELECT id, nombre_usuario, nombre_apellido, correo, tipo_usuario FROM clientes WHERE LOWER(correo) = $1',
        [cleanE]
      ) : { rows: [] };

      const userClient = uRes.rows[0] || null;
      const emailClient = eRes.rows[0] || null;

      if (cleanU && cleanE) {
        if (userClient && emailClient) {
          if (userClient.id !== emailClient.id) {
            userConflict = `El usuario @${userClient.nombre_usuario} está registrado con otro correo (${userClient.correo}).`;
            emailConflict = `Este correo ya pertenece al usuario @${emailClient.nombre_usuario} (${emailClient.nombre_apellido}).`;
          } else {
            existingClient = userClient;
          }
        } else if (userClient && !emailClient) {
          userConflict = `El usuario @${userClient.nombre_usuario} ya está registrado con el correo ${userClient.correo}.`;
        } else if (!userClient && emailClient) {
          emailConflict = `Este correo ya pertenece al usuario @${emailClient.nombre_usuario} (${emailClient.nombre_apellido}).`;
        } else {
          isNew = true;
        }
      } else if (cleanE && emailClient) {
        emailConflict = `Este correo ya pertenece al usuario @${emailClient.nombre_usuario} (${emailClient.nombre_apellido}).`;
      } else if (cleanU && userClient) {
        existingClient = userClient;
      } else {
        isNew = true;
      }

      const hasConflict = Boolean(userConflict || emailConflict);

      return reply.send({
        success: true,
        hasConflict,
        userConflict,
        emailConflict,
        existingClient,
        isNew
      });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Error de validación de identidad' });
    }
  });

  // 4. Registrar nueva queja desde el formulario público
  fastify.post('/quejas', async (request, reply) => {
    const {
      nombre_usuario,
      nombre_apellido,
      correo,
      tipo_usuario,
      categoria_queja,
      descripcion
    } = request.body || {};

    if (!nombre_usuario || !nombre_usuario.trim()) {
      return reply.status(400).send({
        error: 'Campo requerido',
        message: 'Debe ingresar un nombre de usuario.'
      });
    }

    if (!nombre_apellido || !nombre_apellido.trim()) {
      return reply.status(400).send({
        error: 'Campo requerido',
        message: 'Debe ingresar el nombre y apellido completo.'
      });
    }

    if (!correo || !correo.trim()) {
      return reply.status(400).send({
        error: 'Campo requerido',
        message: 'Debe ingresar un correo electrónico.'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(correo.trim())) {
      return reply.status(400).send({
        error: 'Formato inválido',
        message: 'El correo electrónico suministrado no tiene un formato válido.'
      });
    }

    if (!tipo_usuario || !VALID_TIPOS.includes(tipo_usuario)) {
      return reply.status(400).send({
        error: 'Valor inválido',
        message: 'El tipo de usuario debe ser "empleado" o "general".'
      });
    }

    if (!categoria_queja || !VALID_CATEGORIAS.includes(categoria_queja)) {
      return reply.status(400).send({
        error: 'Valor inválido',
        message: 'Debe seleccionar una categoría de queja válida.'
      });
    }

    if (!descripcion || !descripcion.trim() || descripcion.trim().length < 10) {
      return reply.status(400).send({
        error: 'Descripción insuficiente',
        message: 'La descripción de la queja debe tener al menos 10 caracteres explicativos.'
      });
    }

    const cleanUsername = nombre_usuario.trim().toLowerCase();
    const cleanEmail = correo.trim().toLowerCase();
    const cleanFullName = nombre_apellido.trim();
    const cleanDescription = descripcion.trim();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Comprobar si el cliente ya existe por usuario o correo
      const { rows: existingByUser } = await client.query(
        'SELECT id, nombre_usuario, correo, tipo_usuario FROM clientes WHERE LOWER(nombre_usuario) = $1',
        [cleanUsername]
      );

      const { rows: existingByEmail } = await client.query(
        'SELECT id, nombre_usuario, correo, tipo_usuario FROM clientes WHERE LOWER(correo) = $1',
        [cleanEmail]
      );

      let clienteId;
      let esNuevoCliente = false;

      if (existingByUser.length > 0 && existingByEmail.length > 0) {
        if (existingByUser[0].id !== existingByEmail[0].id) {
          await client.query('ROLLBACK');
          return reply.status(400).send({
            error: 'Conflicto de identidad',
            message: `El usuario @${existingByUser[0].nombre_usuario} y el correo ${cleanEmail} pertenecen a clientes diferentes en el sistema.`
          });
        }
        clienteId = existingByUser[0].id;
        // Actualizar datos del cliente (nombre completo y tipo) si es el mismo cliente
        await client.query(`
          UPDATE clientes 
          SET nombre_apellido = $1, tipo_usuario = $2, updated_at = NOW()
          WHERE id = $3
        `, [cleanFullName, tipo_usuario, clienteId]);
      } else if (existingByUser.length > 0) {
        // El usuario ya existe pero el correo no coincide con el registrado
        await client.query('ROLLBACK');
        return reply.status(400).send({
          error: 'Conflicto de usuario',
          message: `El usuario @${existingByUser[0].nombre_usuario} ya está registrado con el correo ${existingByUser[0].correo}.`
        });
      } else if (existingByEmail.length > 0) {
        // El correo ya pertenece a otro usuario registrado
        await client.query('ROLLBACK');
        return reply.status(400).send({
          error: 'Conflicto de correo',
          message: `El correo ${cleanEmail} ya pertenece al usuario @${existingByEmail[0].nombre_usuario} (${existingByEmail[0].nombre_apellido}).`
        });
      } else {
        // Cliente nuevo -> Se crea directamente en la tabla clientes
        esNuevoCliente = true;
        const insertClientRes = await client.query(`
          INSERT INTO clientes (nombre_usuario, nombre_apellido, correo, tipo_usuario)
          VALUES ($1, $2, $3, $4)
          RETURNING id
        `, [cleanUsername, cleanFullName, cleanEmail, tipo_usuario]);

        clienteId = insertClientRes.rows[0].id;
      }

      // Insertar la queja vinculada a la tabla clientes
      const insertQuejaRes = await client.query(`
        INSERT INTO quejas (cliente_id, categoria_queja, descripcion, estado)
        VALUES ($1, $2, $3, 'pendiente')
        RETURNING id, categoria_queja, descripcion, estado, created_at
      `, [clienteId, categoria_queja, cleanDescription]);

      await client.query('COMMIT');

      const nuevaQueja = insertQuejaRes.rows[0];

      // Emitir evento por WebSocket a todos los clientes conectados en tiempo real
      try {
        const freshMetrics = await fetchCurrentMetrics();
        fastify.broadcast('queja_creada', {
          queja: {
            id: nuevaQueja.id,
            cliente_id: clienteId,
            nombre_usuario: cleanUsername,
            nombre_apellido: cleanFullName,
            correo: cleanEmail,
            tipo_usuario,
            categoria_queja,
            descripcion: cleanDescription,
            estado: nuevaQueja.estado,
            created_at: nuevaQueja.created_at
          },
          esNuevoCliente,
          metrics: freshMetrics
        });
      } catch (broadcastErr) {
        fastify.log.error(broadcastErr, 'Error al emitir broadcast de queja_creada');
      }

      return reply.status(201).send({
        success: true,
        message: esNuevoCliente 
          ? 'Nuevo cliente registrado y queja ingresada exitosamente.'
          : 'Queja registrada exitosamente para el cliente existente.',
        queja_id: nuevaQueja.id,
        cliente_id: clienteId,
        fecha: nuevaQueja.created_at,
        categoria: categoria_queja
      });
    } catch (err) {
      await client.query('ROLLBACK');
      fastify.log.error(err);
      return reply.status(500).send({
        error: 'Error del servidor',
        message: 'No se pudo guardar la queja. Intente de nuevo.'
      });
    } finally {
      client.release();
    }
  });

  // 5. Listado público de quejas para vista de reporte
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

  // 6. Listado público de clientes para vista de reporte
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
}
