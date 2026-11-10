import { Router } from 'express';
import { z } from 'zod';
import pool from '../db.js';

const router = Router();

const idSchema = z.coerce.number().int().positive();

const studentSchema = z.object({
  name: z.string().trim().min(1, 'Nome é obrigatório').max(100),
  contact: z.string().trim().max(100).nullable().optional(),
  level: z.string().trim().max(50).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
}).strict();

function errosDeValidacao(error) {
  return error.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message }));
}


router.get('/', async (req, res) => {
  const result = await pool.query('SELECT * FROM students ORDER BY name');
  res.json(result.rows);
});


router.get('/:id', async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'ID inválido' });

  const result = await pool.query('SELECT * FROM students WHERE id = $1', [id.data]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Aluno não encontrado' });
  res.json(result.rows[0]);
});


router.post('/', async (req, res) => {
  const parsed = studentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Dados inválidos', detalhes: errosDeValidacao(parsed.error) });
  }

  const { name, contact, level, notes } = parsed.data;
  const result = await pool.query(
    `INSERT INTO students (name, contact, level, notes)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [name, contact ?? null, level ?? null, notes ?? null]
  );
  res.status(201).json(result.rows[0]);
});


router.put('/:id', async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'ID inválido' });

  const parsed = studentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Dados inválidos', detalhes: errosDeValidacao(parsed.error) });
  }

  const { name, contact, level, notes } = parsed.data;
  const result = await pool.query(
    `UPDATE students
     SET name = $1, contact = $2, level = $3, notes = $4
     WHERE id = $5
     RETURNING *`,
    [name, contact ?? null, level ?? null, notes ?? null, id.data]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Aluno não encontrado' });
  res.json(result.rows[0]);
});


router.delete('/:id', async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'ID inválido' });

  try {
    const result = await pool.query('DELETE FROM students WHERE id = $1 RETURNING id', [id.data]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Aluno não encontrado' });
    res.status(204).end();
  } catch (error) {
    if (error.code === '23503') {
      return res.status(409).json({ error: 'Este aluno tem voos registrados e não pode ser apagado' });
    }
    throw error;
  }
});

export default router;