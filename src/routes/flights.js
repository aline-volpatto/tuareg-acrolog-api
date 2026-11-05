import { Router } from 'express';
import { z } from 'zod';
import pool from '../db.js';

const router = Router();


const idSchema = z.coerce.number().int().positive();

const flightSchema = z.object({
  student_id: z.number().int().positive(),
  flight_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD'),
  aircraft: z.string().trim().max(50).nullable().optional(),
  duration_minutes: z.number().int().positive().max(600).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
}).strict();

function errosDeValidacao(error) {
  return error.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message }));
}


router.get('/', async (req, res) => {
  const result = await pool.query('SELECT * FROM flights ORDER BY flight_date DESC');
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

  const { student_id, flight_date, aircraft, duration_minutes, notes } = parsed.data;
  const result = await pool.query(
    `INSERT INTO flights (student_id, flight_date, aircraft, duration_minutes, notes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [student_id, flight_date, aircraft ?? null, duration_minutes ?? null, notes ?? null]
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

  const { student_id, flight_date, aircraft, duration_minutes, notes } = parsed.data;
  const result = await pool.query(
    `UPDATE flights
     SET student_id = $1, flight_date = $2, aircraft = $3, duration_minutes = $4, notes = $5
     WHERE id = $6
     RETURNING *`,
    [student_id, flight_date, aircraft ?? null, duration_minutes ?? null, notes ?? null, id.data]
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