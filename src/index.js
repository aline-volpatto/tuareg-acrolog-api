import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'dotenv/config';
import flightsRouter from './routes/flights.js';
import studentsRouter from './routes/students.js';
import maneuversRouter from './routes/maneuvers.js';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/flights', flightsRouter);
app.use('/students', studentsRouter);
app.use('/maneuvers', maneuversRouter);

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

  res.status(500).json({ error: 'Erro interno' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API rodando em http://localhost:${PORT}`);
});