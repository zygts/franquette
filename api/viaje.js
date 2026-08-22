const { getClient, ensureSchema } = require('../lib/db');
const crypto = require('crypto');

function generarCodigo() {
  return crypto.randomBytes(4).toString('hex');
}
function generarId(prefijo) {
  return prefijo + '_' + crypto.randomBytes(4).toString('hex');
}

module.exports = async function handler(req, res) {
  try {
  await ensureSchema();
} catch (e) {
  console.error('Error conectando con Turso:', e);
  return res.status(500).json({
    error: 'No se pudo conectar con la base de datos: ' + e.message,
  });
}
  const db = getClient();

  if (req.method === 'GET') {
    const { codigo } = req.query;
    if (!codigo) return res.status(400).json({ error: 'Falta el código del viaje' });

    const viaje = await db.execute({ sql: 'SELECT * FROM viajes WHERE codigo = ?', args: [codigo] });
    if (viaje.rows.length === 0) return res.status(404).json({ error: 'Viaje no encontrado' });

    const participantes = await db.execute({
      sql: 'SELECT * FROM participantes WHERE viaje_codigo = ?',
      args: [codigo],
    });
    const gastos = await db.execute({ sql: 'SELECT * FROM gastos WHERE viaje_codigo = ?', args: [codigo] });
    const partes = await db.execute({
      sql: 'SELECT gp.* FROM gasto_participantes gp JOIN gastos g ON g.id = gp.gasto_id WHERE g.viaje_codigo = ?',
      args: [codigo],
    });

    const gastosConPartes = gastos.rows.map((g) => ({
      id: g.id,
      descripcion: g.descripcion,
      importe: g.importe,
      pagadorId: g.pagador_id,
      participantesIds: partes.rows.filter((p) => p.gasto_id === g.id).map((p) => p.participante_id),
    }));

    return res.status(200).json({
      nombre: viaje.rows[0].nombre,
      participantes: participantes.rows.map((p) => ({ id: p.id, nombre: p.nombre })),
      gastos: gastosConPartes,
    });
  }

  if (req.method === 'POST') {
    const { accion, codigo, payload } = req.body || {};

    if (accion === 'crear') {
      const nuevoCodigo = generarCodigo();
      await db.execute({
        sql: 'INSERT INTO viajes (codigo, nombre, creado_en) VALUES (?, ?, ?)',
        args: [nuevoCodigo, (payload && payload.nombre) || 'Cuentas del viaje', new Date().toISOString()],
      });
      return res.status(200).json({ codigo: nuevoCodigo });
    }

    if (!codigo) return res.status(400).json({ error: 'Falta el código del viaje' });

    if (accion === 'renombrar') {
      await db.execute({ sql: 'UPDATE viajes SET nombre = ? WHERE codigo = ?', args: [payload.nombre, codigo] });
      return res.status(200).json({ ok: true });
    }

    if (accion === 'add_participante') {
      const id = generarId('p');
      await db.execute({
        sql: 'INSERT INTO participantes (id, viaje_codigo, nombre) VALUES (?, ?, ?)',
        args: [id, codigo, payload.nombre],
      });
      return res.status(200).json({ id });
    }

    if (accion === 'remove_participante') {
      const enUso = await db.execute({
        sql:
          'SELECT 1 FROM gastos WHERE viaje_codigo = ? AND pagador_id = ? ' +
          'UNION SELECT 1 FROM gasto_participantes gp JOIN gastos g ON g.id = gp.gasto_id ' +
          'WHERE g.viaje_codigo = ? AND gp.participante_id = ?',
        args: [codigo, payload.id, codigo, payload.id],
      });
      if (enUso.rows.length > 0) {
        return res.status(400).json({ error: 'Esa persona aparece en gastos. Bórralos antes de quitarla.' });
      }
      await db.execute({ sql: 'DELETE FROM participantes WHERE id = ? AND viaje_codigo = ?', args: [payload.id, codigo] });
      return res.status(200).json({ ok: true });
    }

    if (accion === 'add_gasto') {
      const id = generarId('g');
      await db.execute({
        sql: 'INSERT INTO gastos (id, viaje_codigo, descripcion, importe, pagador_id) VALUES (?, ?, ?, ?, ?)',
        args: [id, codigo, payload.descripcion, payload.importe, payload.pagadorId],
      });
      for (const pid of payload.participantesIds) {
        await db.execute({
          sql: 'INSERT INTO gasto_participantes (gasto_id, participante_id) VALUES (?, ?)',
          args: [id, pid],
        });
      }
      return res.status(200).json({ id });
    }

    if (accion === 'remove_gasto') {
      await db.execute({ sql: 'DELETE FROM gasto_participantes WHERE gasto_id = ?', args: [payload.id] });
      await db.execute({ sql: 'DELETE FROM gastos WHERE id = ? AND viaje_codigo = ?', args: [payload.id, codigo] });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Acción no reconocida' });
  }

  return res.status(405).json({ error: 'Método no soportado' });
};
