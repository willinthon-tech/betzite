import { pool } from '../db/connection.js';

export async function fetchCurrentMetrics() {
  const totalRes = await pool.query('SELECT COUNT(*) as total FROM quejas');
  const totalQuejas = parseInt(totalRes.rows[0].total, 10);

  const totalClientsRes = await pool.query('SELECT COUNT(*) as total FROM clientes');
  const totalClientes = parseInt(totalClientsRes.rows[0].total, 10);

  const porCategoriaRes = await pool.query(`
    SELECT categoria_queja, COUNT(*) as count 
    FROM quejas 
    GROUP BY categoria_queja
  `);

  const categoriasMap = {
    'atencion al cliente': 0,
    'maquinas': 0,
    'casino en vivo': 0,
    'apuestas deportivas': 0,
    'general': 0
  };

  for (const row of porCategoriaRes.rows) {
    if (categoriasMap[row.categoria_queja] !== undefined) {
      categoriasMap[row.categoria_queja] = parseInt(row.count, 10);
    }
  }

  const porTipoRes = await pool.query(`
    SELECT c.tipo_usuario, COUNT(q.id) as count 
    FROM clientes c
    JOIN quejas q ON q.cliente_id = c.id
    GROUP BY c.tipo_usuario
  `);

  const tiposMap = {
    'empleado': 0,
    'general': 0
  };

  for (const row of porTipoRes.rows) {
    if (tiposMap[row.tipo_usuario] !== undefined) {
      tiposMap[row.tipo_usuario] = parseInt(row.count, 10);
    }
  }

  const porEstadoRes = await pool.query(`
    SELECT estado, COUNT(*) as count 
    FROM quejas 
    GROUP BY estado
  `);

  const estadosMap = {
    'pendiente': 0,
    'en revision': 0,
    'resuelto': 0
  };

  for (const row of porEstadoRes.rows) {
    if (estadosMap[row.estado] !== undefined) {
      estadosMap[row.estado] = parseInt(row.count, 10);
    }
  }

  const ultimasRes = await pool.query(`
    SELECT 
      q.id,
      q.categoria_queja,
      q.estado,
      q.created_at,
      c.tipo_usuario,
      LEFT(c.nombre_apellido, 1) || '*** ' || SPLIT_PART(c.nombre_apellido, ' ', 2) as cliente_anonimo
    FROM quejas q
    JOIN clientes c ON c.id = q.cliente_id
    ORDER BY q.created_at DESC
    LIMIT 6
  `);

  return {
    total_quejas: totalQuejas,
    total_clientes: totalClientes,
    por_categoria: categoriasMap,
    por_tipo_usuario: tiposMap,
    por_estado: estadosMap,
    ultimas_quejas: ultimasRes.rows
  };
}
