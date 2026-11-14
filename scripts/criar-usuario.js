import { randomBytes } from 'node:crypto';
import { betterAuth } from 'better-auth';
import pool from '../src/db.js';

const args = process.argv.slice(2);
const executar = args.includes('--executar');
const [nome, emailBruto] = args.filter((a) => !a.startsWith('--'));
const email = (emailBruto || '').trim().toLowerCase();

if (!nome || !nome.trim() || nome.trim().length > 100) {
  console.error('Informe o nome (até 100 caracteres) entre aspas: "Nome Completo"');
  process.exit(1);
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Informe um e-mail válido.');
  process.exit(1);
}

const host = (() => {
  try { return new URL(process.env.DATABASE_URL).host; } catch { return '(DATABASE_URL inválida)'; }
})();

console.log('\n================ CRIAR USUÁRIO ================');
console.log(`Banco de destino: ${host}`);
console.log(`Nome:  ${nome.trim()}`);
console.log(`E-mail: ${email}`);

const existe = await pool.query('SELECT 1 FROM "user" WHERE lower(email) = $1', [email]);
if (existe.rows.length > 0) {
  console.log('\n❌ Já existe um usuário com esse e-mail. Nada foi criado.\n');
  await pool.end();
  process.exit(1);
}

if (!executar) {
  console.log('\nConferência apenas. Para criar, rode de novo com --executar.\n');
  await pool.end();
  process.exit(0);
}


const auth = betterAuth({
  database: pool,
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
  secret: process.env.BETTER_AUTH_SECRET || randomBytes(32).toString('hex'),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    autoSignIn: false,
  },
});


const senhaProvisoria = randomBytes(18).toString('base64url');

try {
  await auth.api.signUpEmail({
    body: { name: nome.trim(), email, password: senhaProvisoria },
  });
} catch (error) {
  console.log('\n❌ Não foi possível criar o usuário. Nada foi criado.');
  console.log(`   ${error?.body?.message || error.message}\n`);
  await pool.end();
  process.exit(1);
}

console.log('\n✅ Usuário criado.');
console.log('\n   E-mail:            ' + email);
console.log('   Senha provisória:  ' + senhaProvisoria);
console.log('\n   Passe esses dados pessoalmente (não por mensagem).');
console.log('   No primeiro acesso, a pessoa deve trocar a senha em Menu → Alterar senha.');
console.log('   Depois de anotar, limpe o terminal com Cmd + K.\n');

await pool.end();
