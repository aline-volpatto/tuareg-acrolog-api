import { z } from 'zod';
import pool from '../db.js';

export const manobraDoVooSchema = z.object({
  name: z.string().trim().min(1, 'Nome é obrigatório').max(100),
  rating: z.string().trim().max(50).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  repeat: z.boolean().default(false),
  rolls: z
    .array(z.string().trim().min(1).max(30))
    .max(3, 'Máximo de 3 rolls por manobra')
    .default([]),
}).strict();

export async function comTransacao(tarefa) {
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

export async function salvarManobras(client, flightId, manobras) {
  for (const manobra of manobras) {
    const result = await client.query(
      `INSERT INTO maneuvers (flight_id, name, rating, notes, repeat)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [flightId, manobra.name, manobra.rating ?? null, manobra.notes ?? null, manobra.repeat]
    );
    const maneuverId = result.rows[0].id;

    for (let i = 0; i < manobra.rolls.length; i++) {
      await client.query(
        'INSERT INTO maneuver_rolls (maneuver_id, position, roll) VALUES ($1, $2, $3)',
        [maneuverId, i + 1, manobra.rolls[i]]
      );
    }
  }
}