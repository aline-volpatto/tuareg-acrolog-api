import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth.js';
import { exigirLogin } from './middleware/exigirLogin.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'dotenv/config';
import flightsRouter from './routes/flights.js';
import studentsRouter from './routes/students.js';
import maneuversRouter from './routes/maneuvers.js';
import figuresRouter from './routes/figures.js';
import hourCreditsRouter from './routes/hour-credits.js';

const app = express();

const origensPermitidas = (process.env.TRUSTED_ORIGINS || '')
  .split(',')
  .map((origem) => origem.trim())
  .filter(Boolean);

app.use(helmet());
app.use(cors());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.all('/api/auth/*splat', toNodeHandler(auth));

app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/flights', exigirLogin, flightsRouter);
app.use('/api/students', exigirLogin, studentsRouter);
app.use('/api/maneuvers', exigirLogin, maneuversRouter);
app.use('/api/figures', exigirLogin, figuresRouter);
app.use('/api/hour-credits', exigirLogin, hourCreditsRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

app.use((err, req, res, next) => {
  console.error(err);

  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Dados grandes demais' });
  if (err.code === '23503') return res.status(400).json({ error: 'Registro relacionado não encontrado' });
  if (err.code === '22007' || err.code === '22008') return res.status(400).json({ error: 'Data inválida' });
  if (err.code === '22001') return res.status(400).json({ error: 'Texto longo demais para o campo' });
  if (err.code === '23505') return res.status(409).json({ error: 'Registro duplicado' });

  res.status(500).json({ error: 'Erro interno' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API rodando em http://localhost:${PORT}`);
});