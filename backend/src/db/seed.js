import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { pool } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runInitAndSeed() {
  const client = await pool.connect();
  try {
    console.log('Iniciando esquema de base de datos...');
    const initSqlPath = path.join(__dirname, 'init.sql');
    const initSql = fs.readFileSync(initSqlPath, 'utf8');
    await client.query(initSql);

    // Revisar si existen usuarios administrativos
    const { rows: existingUsers } = await client.query('SELECT COUNT(*) as count FROM usuarios');
    if (parseInt(existingUsers[0].count, 10) === 0) {
      console.log('Insertando usuarios administrativos iniciales...');
      await client.query(`
        INSERT INTO usuarios (usuario, nombre, clave)
        VALUES 
          ('admin', 'Administrador General', 'admin123'),
          ('operador', 'Operador de Consulta', 'operador123')
      `);
      console.log('Usuarios creados: admin (admin123), operador (operador123)');
    }

    // Revisar si existen clientes iniciales para demostración
    const { rows: existingComplaints } = await client.query('SELECT COUNT(*) as count FROM quejas');
    if (parseInt(existingComplaints[0].count, 10) === 0) {
      console.log('Insertando datos de muestra para métricas y seguimiento inicial...');
      
      const sampleClients = [
        {
          usuario: 'carlos_mora',
          nombre: 'Carlos Mora Valenzuela',
          correo: 'carlos.mora@correo.com',
          tipo: 'general',
          categoria: 'maquinas',
          descripcion: 'La máquina de ruleta digital número 4 se trabó al momento de validar el ticket y no acreditó los puntos correspondientes.',
          estado: 'en revision'
        },
        {
          usuario: 'lucia_herrera',
          nombre: 'Lucía Herrera Ramos',
          correo: 'lucia.herrera@betzite.com',
          tipo: 'empleado',
          categoria: 'atencion al cliente',
          descripcion: 'El personal del turno vespertino no recibió a tiempo los lineamientos de atención prioritaria y el sistema de turnos presenta lentitud.',
          estado: 'pendiente'
        },
        {
          usuario: 'roberto_sanz',
          nombre: 'Roberto Sanz Gil',
          correo: 'roberto.sanz@correo.com',
          tipo: 'general',
          categoria: 'casino en vivo',
          descripcion: 'Desconexión durante la ronda de blackjack en vivo en la mesa 2, el saldo quedó retenido durante más de 30 minutos sin resolución.',
          estado: 'resuelto'
        },
        {
          usuario: 'mariana_diaz',
          nombre: 'Mariana Díaz Pérez',
          correo: 'mariana.diaz@betzite.com',
          tipo: 'empleado',
          categoria: 'apuestas deportivas',
          descripcion: 'Error en la liquidación de momios en el evento de tenis del domingo. Varios boletos emitidos físicamente requirieron ajuste manual.',
          estado: 'en revision'
        },
        {
          usuario: 'fernando_torres',
          nombre: 'Fernando Torres Castro',
          correo: 'fernando.torres@correo.com',
          tipo: 'general',
          categoria: 'general',
          descripcion: 'Demora excesiva en el proceso de verificación de identidad para retiro de fondos mediante transferencia bancaria.',
          estado: 'pendiente'
        },
        {
          usuario: 'andrea_rios',
          nombre: 'Andrea Ríos Molina',
          correo: 'andrea.rios@correo.com',
          tipo: 'general',
          categoria: 'maquinas',
          descripcion: 'El lector de billetes de la terminal 12 rechaza continuamente billetes nuevos y no devuelve el cambio.',
          estado: 'pendiente'
        }
      ];

      for (const item of sampleClients) {
        const clientRes = await client.query(`
          INSERT INTO clientes (nombre_usuario, nombre_apellido, correo, tipo_usuario)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (nombre_usuario) DO UPDATE 
            SET nombre_apellido = EXCLUDED.nombre_apellido,
                tipo_usuario = EXCLUDED.tipo_usuario
          RETURNING id
        `, [item.usuario, item.nombre, item.correo, item.tipo]);

        const clienteId = clientRes.rows[0].id;

        await client.query(`
          INSERT INTO quejas (cliente_id, categoria_queja, descripcion, estado)
          VALUES ($1, $2, $3, $4)
        `, [clienteId, item.categoria, item.descripcion, item.estado]);
      }
      console.log('Datos de muestra insertados con éxito.');
    }

    console.log('Base de datos inicializada correctamente.');
  } catch (error) {
    console.error('Error al inicializar la base de datos:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runInitAndSeed().then(() => {
    console.log('Script de seed completado.');
    process.exit(0);
  }).catch((err) => {
    console.error('Fallo en seed:', err);
    process.exit(1);
  });
}
