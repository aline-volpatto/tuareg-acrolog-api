import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import pool from './db.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/flights', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM flights ORDER BY flight_date DESC');
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar voos' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API rodando em http://localhost:${PORT}`);
});