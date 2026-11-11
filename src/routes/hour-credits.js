import { Router } from 'express';
import { z } from 'zod';
import pool from '../db.js';

const router = Router();

const idSchema = z.coerce.number().int().positive();

const creditSchema = z.object({
  student_id: z.number().int().positive(),
  hours: z.number().positive().max(1000),
  credit_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD'),
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
    `SELECT * FROM hour_credits
     WHERE ($1::int IS NULL OR student_id = $1)
     ORDER BY credit_date DESC, id DESC`,
    [studentId]
  );
  res.json(result.rows);
});

router.post('/', async (req, res) => {
  const parsed = creditSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Dados inválidos', detalhes: errosDeValidacao(parsed.error) });
  }

  const d = parsed.data;
  const result = await pool.query(
    `INSERT INTO hour_credits (student_id, hours, credit_date, notes)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [d.student_id, d.hours, d.credit_date, d.notes ?? null]
  );
  res.status(201).json(result.rows[0]);
});

router.delete('/:id', async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'ID inválido' });

  const result = await pool.query('DELETE FROM hour_credits WHERE id = $1 RETURNING id', [id.data]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Crédito não encontrado' });
  res.status(204).end();
});

export default router;