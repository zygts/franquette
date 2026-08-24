const { run, runMany, ensureSchema } = require('../lib/db');
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

    if (req.method === 'GET') {
      const { codigo } = req.query;
      if (!codigo) return res.status(400).json({ error: 'Falta el código del viaje' });

      const viajeRes = await run('SELECT * FROM viajes WHERE codigo = ?', [codigo]);
      if (viajeRes.rows.length === 0) return res.status(404).json({ error: 'Viaje no encontrado' });

      const participantesRes = await run('SELECT * FROM participantes WHERE viaje_codigo = ?', [codigo]);
      const gastosRes = await run('SELECT * FROM gastos WHERE viaje_codigo = ?', [codigo]);
      const partesRes = await run(
        'SELECT gp.* FROM gasto_participantes gp JOIN gastos g ON g.id = gp.gasto_id WHERE g.viaje_codigo = ?',
        [codigo]
      );

      const gastosConPartes = gastosRes.rows.map((g) => ({
        id: g.id,
        descripcion: g.descripcion,
        importe: g.importe,
        pagadorId: g.pagador_id,
        participantesIds: partesRes.rows.filter((p) => p.gasto_id === g.id).map((p) => p.participante_id),
      }));

      return res.status(200).json({
        nombre: viajeRes.rows[0].nombre,
        participantes: participantesRes.rows.map((p) => ({ id: p.id, nombre: p.nombre })),
        gastos: gastosConPartes,
      });
    }

    if (req.method === 'POST') {
      const { accion, codigo, payload } = req.body || {};

      if (accion === 'crear') {
        const nuevoCodigo = generarCodigo();
        await run('INSERT INTO viajes (codigo, nombre, creado_en) VALUES (?, ?, ?)', [
          nuevoCodigo,
          (payload && payload.nombre) || 'Cuentas del viaje',
          new Date().toISOString(),
        ]);
        return res.status(200).json({ codigo: nuevoCodigo });
      }

      if (!codigo) return res.status(400).json({ error: 'Falta el código del viaje' });

      if (accion === 'renombrar') {
        await run('UPDATE viajes SET nombre = ? WHERE codigo = ?', [payload.nombre, codigo]);
        return res.status(200).json({ ok: true });
      }

      if (accion === 'add_participante') {
        const id = generarId('p');
        await run('INSERT INTO participantes (id, viaje_codigo, nombre) VALUES (?, ?, ?)', [
          id,
          codigo,
          payload.nombre,
        ]);
        return res.status(200).json({ id });
      }

      if (accion === 'remove_participante') {
        const enUso = await run(
          'SELECT 1 as x FROM gastos WHERE viaje_codigo = ? AND pagador_id = ? ' +
            'UNION SELECT 1 as x FROM gasto_participantes gp JOIN gastos g ON g.id = gp.gasto_id ' +
            'WHERE g.viaje_codigo = ? AND gp.participante_id = ?',
          [codigo, payload.id, codigo, payload.id]
        );
        if (enUso.rows.length > 0) {
          return res.status(400).json({ error: 'Esa persona aparece en gastos. Bórralos antes de quitarla.' });
        }
        await run('DELETE FROM participantes WHERE id = ? AND viaje_codigo = ?', [payload.id, codigo]);
        return res.status(200).json({ ok: true });
      }

      if (accion === 'add_gasto') {
        const id = generarId('g');
        const statements = [
          {
            sql: 'INSERT INTO gastos (id, viaje_codigo, descripcion, importe, pagador_id) VALUES (?, ?, ?, ?, ?)',
            args: [id, codigo, payload.descripcion, payload.importe, payload.pagadorId],
          },
          ...payload.participantesIds.map((pid) => ({
            sql: 'INSERT INTO gasto_participantes (gasto_id, participante_id) VALUES (?, ?)',
            args: [id, pid],
          })),
        ];
        await runMany(statements);
        return res.status(200).json({ id });
      }

      if (accion === 'remove_gasto') {
        await runMany([
          { sql: 'DELETE FROM gasto_participantes WHERE gasto_id = ?', args: [payload.id] },
          { sql: 'DELETE FROM gastos WHERE id = ? AND viaje_codigo = ?', args: [payload.id, codigo] },
        ]);
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: 'Acción no reconocida' });
    }

    return res.status(405).json({ error: 'Método no soportado' });
  } catch (e) {
    console.error('Error en /api/viaje:', e);
    return res.status(500).json({ error: e.message || 'Error interno del servidor' });
  }
};
