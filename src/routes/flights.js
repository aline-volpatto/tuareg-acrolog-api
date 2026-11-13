import { Router } from 'express';
import { z } from 'zod';
import pool from '../db.js';

const router = Router();

const FUSO_HORARIO = 'America/Sao_Paulo';

const idSchema = z.coerce.number().int().positive();
const horario = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use o formato HH:MM');

const flightSchema = z.object({
  student_id: z.number().int().positive(),
  flight_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD'),
  aircraft: z.string().trim().max(50).nullable().optional(),
  engine_start: horario,
  engine_stop: horario,
  notes: z.string().max(2000).nullable().optional(),
}).strict();

function errosDeValidacao(error) {
  return error.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message }));
}

function agoraNoBrasil() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_HORARIO,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const p = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));
  return { data: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}

function paraMinutos(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function calcularVoo({ flight_date, engine_start, engine_stop }) {
  const minutos = paraMinutos(engine_stop) - paraMinutos(engine_start);
  if (minutos <= 0) {
    return { erro: { campo: 'engine_stop', mensagem: 'Hora de corte deve ser maior que hora de acionamento!' } };
  }

  const agora = agoraNoBrasil();
  if (flight_date > agora.data) {
    return { erro: { campo: 'flight_date', mensagem: 'A data do voo não pode ser no futuro.' } };
  }
  if (flight_date === agora.data && engine_stop > agora.hora) {
    return { erro: { campo: 'engine_stop', mensagem: 'O voo não pode terminar depois do horário atual.' } };
  }

  return { flight_hours: Math.round(minutos / 6) / 10 };
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
  const calculo = calcularVoo(d);
  if (calculo.erro) return res.status(400).json({ error: 'Dados inválidos', detalhes: [calculo.erro] });

  const result = await pool.query(
    `INSERT INTO flights (student_id, flight_date, aircraft, engine_start, engine_stop, flight_hours, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [d.student_id, d.flight_date, d.aircraft ?? null, d.engine_start,
     d.engine_stop, calculo.flight_hours, d.notes ?? null]
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
  const calculo = calcularVoo(d);
  if (calculo.erro) return res.status(400).json({ error: 'Dados inválidos', detalhes: [calculo.erro] });

  const result = await pool.query(
    `UPDATE flights
     SET student_id = $1, flight_date = $2, aircraft = $3, engine_start = $4,
         engine_stop = $5, flight_hours = $6, notes = $7
     WHERE id = $8
     RETURNING *`,
    [d.student_id, d.flight_date, d.aircraft ?? null, d.engine_start,
     d.engine_stop, calculo.flight_hours, d.notes ?? null, id.data]
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