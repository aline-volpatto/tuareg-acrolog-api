import { Router } from 'express';
import { z } from 'zod';
import pool from '../db.js';

const router = Router();

const idSchema = z.coerce.number().int().positive();

const maneuverSchema = z.object({
  flight_id: z.number().int().positive(),
  name: z.string().trim().min(1, 'Nome é obrigatório').max(100),
  rating: z.string().trim().max(50).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  repeat: z.boolean().default(false),
  rolls: z
    .array(z.string().trim().min(1).max(30))
    .max(3, 'Máximo de 3 rolls por manobra')
    .default([]),
}).strict();

function errosDeValidacao(error) {
  return error.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message }));
}

const SELECT_COM_ROLLS = `
  SELECT m.*,
    COALESCE(
      json_agg(r.roll ORDER BY r.position) FILTER (WHERE r.id IS NOT NULL),
      '[]'
    ) AS rolls
  FROM maneuvers m
  LEFT JOIN maneuver_rolls r ON r.maneuver_id = m.id`;

async function buscarManobra(id) {
  const result = await pool.query(`${SELECT_COM_ROLLS} WHERE m.id = $1 GROUP BY m.id`, [id]);
  return result.rows[0];
}

async function comTransacao(tarefa) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await tarefa(client);
    await client.query('COMMIT');
    return resultado;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function salvarRolls(client, maneuverId, rolls) {
  for (let i = 0; i < rolls.length; i++) {
    await client.query(
      'INSERT INTO maneuver_rolls (maneuver_id, position, roll) VALUES ($1, $2, $3)',
      [maneuverId, i + 1, rolls[i]]
    );
  }
}

router.get('/', async (req, res) => {
  let flightId = null;
  if (req.query.flight_id !== undefined) {
    const parsed = idSchema.safeParse(req.query.flight_id);
    if (!parsed.success) return res.status(400).json({ error: 'flight_id inválido' });
    flightId = parsed.data;
  }

  const result = await pool.query(
    `${SELECT_COM_ROLLS}
     WHERE ($1::int IS NULL OR m.flight_id = $1)
     GROUP BY m.id
     ORDER BY m.id`,
    [flightId]
  );
  res.json(result.rows);
});


router.get('/next-flight', async (req, res) => {
  const studentId = idSchema.safeParse(req.query.student_id);
  if (!studentId.success) return res.status(400).json({ error: 'student_id inválido' });

  const result = await pool.query(
    `${SELECT_COM_ROLLS}
     WHERE m.repeat = true
       AND m.flight_id = (
         SELECT id FROM flights
         WHERE student_id = $1
         ORDER BY flight_date DESC, engine_start DESC NULLS LAST, id DESC
         LIMIT 1
       )
     GROUP BY m.id
     ORDER BY m.id`,
    [studentId.data]
  );
  res.json(result.rows);
});

router.get('/:id', async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'ID inválido' });

  const manobra = await buscarManobra(id.data);
  if (!manobra) return res.status(404).json({ error: 'Manobra não encontrada' });
  res.json(manobra);
});

router.post('/', async (req, res) => {
  const parsed = maneuverSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Dados inválidos', detalhes: errosDeValidacao(parsed.error) });
  }

  const { flight_id, name, rating, notes, repeat, rolls } = parsed.data;

  const novoId = await comTransacao(async (client) => {
    const result = await client.query(
      `INSERT INTO maneuvers (flight_id, name, rating, notes, repeat)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [flight_id, name, rating ?? null, notes ?? null, repeat]
    );
    const maneuverId = result.rows[0].id;
    await salvarRolls(client, maneuverId, rolls);
    return maneuverId;
  });

  res.status(201).json(await buscarManobra(novoId));
});

router.put('/:id', async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'ID inválido' });

  const parsed = maneuverSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Dados inválidos', detalhes: errosDeValidacao(parsed.error) });
  }

  const { flight_id, name, rating, notes, repeat, rolls } = parsed.data;

  const encontrou = await comTransacao(async (client) => {
    const result = await client.query(
      `UPDATE maneuvers
       SET flight_id = $1, name = $2, rating = $3, notes = $4, repeat = $5
       WHERE id = $6
       RETURNING id`,
      [flight_id, name, rating ?? null, notes ?? null, repeat, id.data]
    );
    if (result.rows.length === 0) return false;

    await client.query('DELETE FROM maneuver_rolls WHERE maneuver_id = $1', [id.data]);
    await salvarRolls(client, id.data, rolls);
    return true;
  });

  if (!encontrou) return res.status(404).json({ error: 'Manobra não encontrada' });
  res.json(await buscarManobra(id.data));
});

router.delete('/:id', async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'ID inválido' });

  const result = await pool.query('DELETE FROM maneuvers WHERE id = $1 RETURNING id', [id.data]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Manobra não encontrada' });
  res.status(204).end();
});

export default router;