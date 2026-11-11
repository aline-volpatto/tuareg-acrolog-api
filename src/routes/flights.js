import { Router } from 'express';
import { z } from 'zod';
import pool from '../db.js';

const router = Router();

const idSchema = z.coerce.number().int().positive();
const horario = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use o formato HH:MM');

const flightSchema = z.object({
  student_id: z.number().int().positive(),
  flight_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD'),
  aircraft: z.string().trim().max(50).nullable().optional(),
  engine_start: horario.nullable().optional(),
  engine_stop: horario.nullable().optional(),
  flight_hours: z.number().positive().max(24).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
}).strict();

function errosDeValidacao(error) {
  return error.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message }));
}

router.get('/', async (req, res) => {
  let studentId = null;
  if (req.query.student_id !== undefined) {
    const parsed = idSchema.safeParse(req.query.student_id);
    if (!parsed.success) return res.status(400).json({ error: 'student_id inválido' });
    studentId = parsed.data;
  }

  const result = await pool.query(
    `SELECT * FROM flights
     WHERE ($1::int IS NULL OR student_id = $1)
     ORDER BY flight_date DESC, engine_start DESC NULLS LAST, id DESC`,
    [studentId]
  );
  res.json(result.rows);
});


router.get('/:id', async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'ID inválido' });

  const result = await pool.query('SELECT * FROM flights WHERE id = $1', [id.data]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Voo não encontrado' });
  res.json(result.rows[0]);
});


router.post('/', async (req, res) => {
  const parsed = flightSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Dados inválidos', detalhes: errosDeValidacao(parsed.error) });
  }

  const d = parsed.data;
  const result = await pool.query(
    `INSERT INTO flights (student_id, flight_date, aircraft, engine_start, engine_stop, flight_hours, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [d.student_id, d.flight_date, d.aircraft ?? null, d.engine_start ?? null,
     d.engine_stop ?? null, d.flight_hours ?? null, d.notes ?? null]
  );
  res.status(201).json(result.rows[0]);
});


router.put('/:id', async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'ID inválido' });

  const parsed = flightSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Dados inválidos', detalhes: errosDeValidacao(parsed.error) });
  }

  const d = parsed.data;
  const result = await pool.query(
    `UPDATE flights
     SET student_id = $1, flight_date = $2, aircraft = $3, engine_start = $4,
         engine_stop = $5, flight_hours = $6, notes = $7
     WHERE id = $8
     RETURNING *`,
    [d.student_id, d.flight_date, d.aircraft ?? null, d.engine_start ?? null,
     d.engine_stop ?? null, d.flight_hours ?? null, d.notes ?? null, id.data]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Voo não encontrado' });
  res.json(result.rows[0]);
});


router.delete('/:id', async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'ID inválido' });

  const result = await pool.query('DELETE FROM flights WHERE id = $1 RETURNING id', [id.data]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Voo não encontrado' });
  res.status(204).end();
});

export default router;