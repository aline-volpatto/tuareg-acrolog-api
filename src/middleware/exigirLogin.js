import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth.js';

// Só deixa passar quem tem uma sessão de login válida
export async function exigirLogin(req, res, next) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  if (!session) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  req.user = session.user;
  next();
}