
import 'dotenv/config';
import crypto from 'node:crypto';
import { betterAuth } from 'better-auth';
import readline from 'node:readline';
import pool from '../src/db.js';


function perguntarEscondido(pergunta) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(pergunta, (resposta) => {
      rl.close();
      process.stdout.write('\n');
      resolve(resposta.trim());
    });
    rl._writeToOutput = (texto) => {
      if (texto.includes(pergunta)) process.stdout.write(texto);
    };
  });
}

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

if (!args.email) {
  console.error('Informe o e-mail: --email=fulano@exemplo.com');
  process.exit(1);
}

const auth = betterAuth({
  database: pool,
  emailAndPassword: { enabled: true, minPasswordLength: 12 },
});

try {
  console.log(`Banco:   ${new URL(process.env.DATABASE_URL).host}`);
  const { rows } = await pool.query(
    'SELECT id, name, email FROM "user" WHERE lower(email) = $1',
    [String(args.email).toLowerCase().trim()],
  );
  if (rows.length === 0) {
    console.error('Nenhum usuário com esse e-mail.');
    process.exit(1);
  }
  const usuario = rows[0];
  console.log(`Usuário: ${usuario.name} <${usuario.email}>`);

  if (!args.executar) {
    console.log('\nPrévia: nada foi alterado. Rode de novo com --executar.');
    process.exit(0);
  }

  const digitada = await perguntarEscondido(
    '\nNova senha (mínimo 12 caracteres; Enter vazio = gerar uma aleatória): ',
  );
  let novaSenha = digitada;
  if (!novaSenha) {
    novaSenha = crypto.randomBytes(18).toString('base64url'); // 24 caracteres
  } else {
    if (novaSenha.length < 12) throw new Error('A senha precisa ter pelo menos 12 caracteres.');
    const conferir = await perguntarEscondido('Repita a senha: ');
    if (conferir !== novaSenha) throw new Error('As senhas não conferem. Nada foi alterado.');
  }

  const ctx = await auth.$context;
  const hash = await ctx.password.hash(novaSenha);
    const atualizada = await pool.query(
    `UPDATE account SET password = $1, "updatedAt" = now()
     WHERE "userId" = $2 AND "providerId" = 'credential'`,
    [hash, usuario.id],
  );
  if (atualizada.rowCount !== 1) throw new Error('Conta de senha não encontrada. Nada foi alterado.');
  await pool.query('DELETE FROM session WHERE "userId" = $1', [usuario.id]);

  console.log('\nSenha redefinida e sessões encerradas.');
  if (!digitada) console.log(`Senha provisória: ${novaSenha}`);
  console.log('Passe a senha por um canal privado e peça para ele trocar em "Alterar senha".');
} catch (erro) {
  console.error('Erro:', erro.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}