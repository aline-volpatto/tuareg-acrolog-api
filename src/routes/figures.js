import { Router } from 'express';
import { z } from 'zod';
import pool from '../db.js';

const router = Router();

const idSchema = z.coerce.number().int().positive();

const figureSchema = z.object({
  name: z.string().trim().min(1, 'Nome é obrigatório').max(100),
}).strict();

function errosDeValidacao(error) {
  return error.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message }));
}

router.get('/', async (req, res) => {
  const result = await pool.query('SELECT * FROM figures ORDER BY name');
  res.json(result.rows);
});

router.post('/', async (req, res) => {
  const parsed = figureSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Dados inválidos', detalhes: errosDeValidacao(parsed.error) });
  }

  const result = await pool.query(
    'INSERT INTO figures (name) VALUES ($1) RETURNING *',
    [parsed.data.name]
  );
  res.status(201).json(result.rows[0]);
});

router.delete('/:id', async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'ID inválido' });

  const result = await pool.query('DELETE FROM figures WHERE id = $1 RETURNING id', [id.data]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Figura não encontrada' });
  res.status(204).end();
});

export default router;