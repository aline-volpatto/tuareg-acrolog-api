// Importa o backup JSON do app antigo (TuaregLog) para o banco.
//
// Uso (na pasta do backend):
//   node scripts/importar-legado.js caminho/do/backup.json
//       -> só mostra a prévia, não grava nada
//   node scripts/importar-legado.js caminho/do/backup.json --executar
//       -> grava tudo numa transação (ou tudo, ou nada)
//
// Opções:
//   --aeronave="RV-7 - Tuareg"   aeronave dos voos importados (padrão: vazio)
//
// Banco: usa a DATABASE_URL do .env (branch dev).
// Para a produção: node --env-file=.env.producao scripts/importar-legado.js ...

import { readFile } from 'node:fs/promises';
import pool from '../src/db.js';

// ---------------------------------------------------------------- regras ---

const FUSO_HORARIO = 'America/Sao_Paulo';
const NOTA_CREDITO = 'Saldo migrado do app antigo';

const LIMITES = { nome: 100, aeronave: 50, notas: 2000, figura: 100, avaliacao: 50, roll: 30 };

const ROLLS_VALIDOS = [
  '1/4', '1/2', '3/4', '1', '1 1/4', '1 1/2', '1 3/4', '2',
  '2x2', '3x2', '4x2', '2x4', '3x4', '4x4', '5x4', '6x4', '7x4', '8x4',
  '2x8', '4x8', '6x8', '8x8', '10x8', '12x8', '14x8', '16x8',
  '1/2 pos flick', '3/4 pos flick', '1 pos flick', '1 1/4 pos flick', '1 1/2 pos flick',
  '1 3/4 pos flick', '2 pos flick',
  '1/2 neg flick', '3/4 neg flick', '1 neg flick', '1 1/4 neg flick', '1 1/2 neg flick',
  '1 3/4 neg flick', '2 neg flick',
];

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

// --------------------------------------------------------------- argumentos ---

const args = process.argv.slice(2);
const caminho = args.find((a) => !a.startsWith('--'));
const executar = args.includes('--executar');
const argAeronave = args.find((a) => a.startsWith('--aeronave='));
const aeronave = argAeronave ? argAeronave.slice('--aeronave='.length).trim() || null : null;

if (!caminho) {
  console.error('Informe o arquivo de backup: node scripts/importar-legado.js caminho/backup.json');
  process.exit(1);
}
if (aeronave && aeronave.length > LIMITES.aeronave) {
  console.error(`A aeronave pode ter no máximo ${LIMITES.aeronave} caracteres.`);
  process.exit(1);
}

// ---------------------------------------------------------------- funções ---

// O backup do app antigo guarda tudo como texto: listas e objetos precisam de
// um segundo JSON.parse. Textos simples (ex.: nome do aluno ativo) ficam como estão.
function lerValor(valor) {
  if (typeof valor !== 'string') return valor;
  try {
    return JSON.parse(valor);
  } catch {
    return valor;
  }
}

function hojeNoBrasil() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_HORARIO, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const p = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

function paraMinutos(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function textoOuNulo(valor) {
  if (valor === undefined || valor === null) return null;
  const texto = String(valor).trim();
  return texto === '' ? null : texto;
}

// Erros de digitação encontrados no backup real, corrigidos na importação
// para não criar figuras "diferentes" no histórico.
const CORRECOES_FIGURAS = {
  'Hammer head': 'Hammerhead',
  'Isosls SPORT': 'Isols SPORT',
};
const figurasCorrigidas = new Map(); // "de -> para" => quantidade

// "Looping — 1/2 / 2x4"  ->  { name: "Looping", rolls: ["1/2", "2x4"] }
// Nome e rolls separados por " — " (travessão) ou " - " (hífen, usado nas
// versões mais antigas do app), sempre com espaços. Rolls separados por " / "
// (barra COM espaços, porque "1/2" também tem barra). "none" = sem roll.
function separarFigura(texto) {
  const original = String(texto || '');
  const separador = original.match(/ [—-] /);
  const nomeBruto = separador ? original.slice(0, separador.index) : original;
  const parteRolls = separador ? original.slice(separador.index + 3) : '';
  const rolls = parteRolls
    ? parteRolls.split(' / ').map((r) => r.trim()).filter((r) => r && r !== 'none')
    : [];

  let name = nomeBruto.trim();
  if (CORRECOES_FIGURAS[name]) {
    const chave = `"${name}" → "${CORRECOES_FIGURAS[name]}"`;
    figurasCorrigidas.set(chave, (figurasCorrigidas.get(chave) || 0) + 1);
    name = CORRECOES_FIGURAS[name];
  }
  return { name, rolls };
}

// Soma em décimos inteiros, para evitar erro de ponto flutuante (0.1 + 0.2).
function somarHoras(lista) {
  return lista.reduce((soma, h) => soma + Math.round(h * 10), 0) / 10;
}

// ------------------------------------------------------- leitura e prévia ---

const bruto = JSON.parse(await readFile(caminho, 'utf8'));
const dados = Object.fromEntries(Object.entries(bruto).map(([chave, valor]) => [chave, lerValor(valor)]));

const hoje = hojeNoBrasil();
const erros = [];          // impedem a importação
const naoImportados = [];  // voos que ficam de fora (o resto é importado)
const avisos = [];         // para conferir, não impedem

const nomesAlunos = [];
for (const nome of Array.isArray(dados.alunos) ? dados.alunos : []) {
  const limpo = textoOuNulo(nome);
  if (!limpo) continue;
  if (limpo.length > LIMITES.nome) erros.push(`Aluno "${limpo}": nome com mais de ${LIMITES.nome} caracteres.`);
  if (nomesAlunos.some((n) => n.toLowerCase() === limpo.toLowerCase())) {
    avisos.push(`Aluno "${limpo}" aparece repetido na lista do app antigo: importado uma vez só.`);
    continue;
  }
  nomesAlunos.push(limpo);
}

// Voos de nomes que não estão na lista de alunos (ex.: aluno apagado no app antigo)
for (const chave of Object.keys(dados)) {
  if (chave.startsWith('voos-') && !nomesAlunos.includes(chave.slice(5))) {
    avisos.push(`Há voos de "${chave.slice(5)}", que não está na lista de alunos: serão ignorados.`);
  }
}

const figurasCatalogo = [];
for (const nome of Array.isArray(dados.figuras) ? dados.figuras : []) {
  const limpo = textoOuNulo(nome);
  if (!limpo) continue;
  if (limpo.length > LIMITES.figura) {
    avisos.push(`Figura do catálogo "${limpo}" com mais de ${LIMITES.figura} caracteres: ignorada.`);
    continue;
  }
  figurasCatalogo.push(limpo);
}

const plano = nomesAlunos.map((nome) => {
  const voos = [];
  const voosBrutos = Array.isArray(dados[`voos-${nome}`]) ? dados[`voos-${nome}`] : [];

  voosBrutos.forEach((v, i) => {
    const ref = `${nome}, voo ${i + 1} (${v?.data || 'sem data'})`;

    if (!DATA.test(v?.data || '')) return naoImportados.push(`${ref}: data inválida.`);
    if (v.data > hoje) return naoImportados.push(`${ref}: data no futuro.`);
    if (!HORA.test(v.horaAcionamento || '') || !HORA.test(v.horaCorte || '')) {
      return naoImportados.push(`${ref}: sem horário de acionamento ou de corte.`);
    }

    const minutos = paraMinutos(v.horaCorte) - paraMinutos(v.horaAcionamento);
    if (minutos <= 0) return naoImportados.push(`${ref}: corte antes ou igual ao acionamento.`);

    const horas = Math.round(minutos / 6) / 10; // mesma regra da API
    if (horas === 0) return naoImportados.push(`${ref}: tempo menor que 3 minutos.`);

    const antigo = parseFloat(String(v.tempoVoo ?? '').replace(',', '.'));
    if (!Number.isNaN(antigo) && Math.abs(antigo - horas) > 0.001) {
      avisos.push(`${ref}: tempo no app antigo ${antigo} h, recalculado ${horas} h.`);
    }

    const notas = textoOuNulo(v.observacoes);
    if (notas && notas.length > LIMITES.notas) {
      erros.push(`${ref}: observações com mais de ${LIMITES.notas} caracteres.`);
    }

    const manobras = (Array.isArray(v.manobras) ? v.manobras : []).map((m, j) => {
      const refFigura = `${ref}, figura ${j + 1}`;
      const { name, rolls } = separarFigura(m?.figura);
      const rating = textoOuNulo(m?.nota);

      if (!name) erros.push(`${refFigura}: sem nome.`);
      if (name.length > LIMITES.figura) erros.push(`${refFigura}: nome com mais de ${LIMITES.figura} caracteres.`);
      if (rolls.length > 3) erros.push(`${refFigura} ("${name}"): mais de 3 rolls.`);
      for (const roll of rolls) {
        if (roll.length > LIMITES.roll) erros.push(`${refFigura}: roll "${roll}" longo demais.`);
        else if (!ROLLS_VALIDOS.includes(roll)) avisos.push(`${refFigura}: roll "${roll}" não está na lista fixa.`);
      }
      if (rating && rating.length > LIMITES.avaliacao) erros.push(`${refFigura}: avaliação longa demais.`);

      return { name, rolls, rating, repeat: m?.refazer === true || m?.refazer === 'true' };
    });

    voos.push({
      flight_date: v.data,
      engine_start: v.horaAcionamento,
      engine_stop: v.horaCorte,
      flight_hours: horas,
      notes: notas,
      manobras,
    });
  });

  const horasLegado = dados[`horas-${nome}`] || {};
  const disponiveis = Number(horasLegado.disponiveis) || 0;
  const voadas = Number(horasLegado.voadas) || 0;
  const somaVoos = somarHoras(voos.map((v) => v.flight_hours));
  const credito = Math.round((disponiveis + somaVoos) * 100) / 100;

  if (disponiveis === 0 && voosBrutos.length > 0) {
    avisos.push(`${nome}: saldo 0 no app antigo. O app antigo zerava saldo negativo: confira se havia horas devidas.`);
  }
  if (Math.abs(voadas - somaVoos) > 0.05) {
    avisos.push(`${nome}: o app antigo dizia ${voadas} h voadas, os voos importados somam ${somaVoos} h.`);
  }

  return { nome, voos, disponiveis, somaVoos, credito };
});

// ------------------------------------------------------------------ prévia ---

const host = (() => {
  try { return new URL(process.env.DATABASE_URL).host; } catch { return '(DATABASE_URL inválida)'; }
})();

console.log('\n================ PRÉVIA DA IMPORTAÇÃO ================');
console.log(`Banco de destino: ${host}`);
console.log(`Aeronave dos voos importados: ${aeronave ?? '(vazia — "Não informada")'}`);
console.log(`Data dos créditos migrados: ${hoje}\n`);

for (const a of plano) {
  const figuras = a.voos.reduce((s, v) => s + v.manobras.length, 0);
  console.log(`• ${a.nome}`);
  console.log(`    voos: ${a.voos.length} | figuras: ${figuras} | horas voadas: ${a.somaVoos.toFixed(1)} h`);
  console.log(`    crédito migrado: ${a.credito.toFixed(2)} h | saldo final: ${a.disponiveis.toFixed(1)} h (igual ao app antigo)`);
}

const totalVoos = plano.reduce((s, a) => s + a.voos.length, 0);
console.log(`\nTotal: ${plano.length} alunos, ${totalVoos} voos, ${figurasCatalogo.length} figuras no catálogo.`);

if (figurasCorrigidas.size) {
  console.log('\n✏️  Nomes de figura corrigidos:');
  figurasCorrigidas.forEach((qtd, chave) => console.log(`   - ${chave} (${qtd}x)`));
}
if (naoImportados.length) {
  console.log(`\n⚠️  ${naoImportados.length} voo(s) NÃO serão importados:`);
  naoImportados.forEach((t) => console.log(`   - ${t}`));
}
if (avisos.length) {
  console.log(`\nℹ️  ${avisos.length} aviso(s) para conferir:`);
  avisos.forEach((t) => console.log(`   - ${t}`));
}
if (erros.length) {
  console.log(`\n❌ ${erros.length} erro(s). Nada será gravado até corrigir:`);
  erros.forEach((t) => console.log(`   - ${t}`));
}

// ---------------------------------------------------------------- gravação ---

async function gravar() {
  const existentes = await pool.query('SELECT name FROM students');
  const nomesNoBanco = existentes.rows.map((r) => r.name.toLowerCase());
  const repetidos = nomesAlunos.filter((n) => nomesNoBanco.includes(n.toLowerCase()));
  if (repetidos.length) {
    console.log(`\n❌ Estes alunos já existem no banco: ${repetidos.join(', ')}.`);
    console.log('   Para não duplicar dados, nada foi gravado. Apague-os antes ou confira se a importação já foi feita.');
    return false;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const nome of figurasCatalogo) {
      await client.query('INSERT INTO figures (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [nome]);
    }

    for (const a of plano) {
      const aluno = await client.query('INSERT INTO students (name) VALUES ($1) RETURNING id', [a.nome]);
      const studentId = aluno.rows[0].id;

      for (const v of a.voos) {
        const voo = await client.query(
          `INSERT INTO flights (student_id, flight_date, aircraft, engine_start, engine_stop, flight_hours, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [studentId, v.flight_date, aeronave, v.engine_start, v.engine_stop, v.flight_hours, v.notes]
        );
        const flightId = voo.rows[0].id;

        for (const m of v.manobras) {
          const manobra = await client.query(
            `INSERT INTO maneuvers (flight_id, name, rating, notes, repeat)
             VALUES ($1, $2, $3, NULL, $4)
             RETURNING id`,
            [flightId, m.name, m.rating, m.repeat]
          );
          for (let i = 0; i < m.rolls.length; i++) {
            await client.query(
              'INSERT INTO maneuver_rolls (maneuver_id, position, roll) VALUES ($1, $2, $3)',
              [manobra.rows[0].id, i + 1, m.rolls[i]]
            );
          }
        }
      }

      if (a.credito > 0) {
        await client.query(
          'INSERT INTO hour_credits (student_id, hours, credit_date, notes) VALUES ($1, $2, $3, $4)',
          [studentId, a.credito, hoje, NOTA_CREDITO]
        );
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.log('\n❌ Erro durante a gravação. NADA foi gravado (a transação foi desfeita).');
    console.log(`   ${error.message}`);
    return false;
  } finally {
    client.release();
  }

  // Conferência: o saldo de cada aluno no banco tem que bater com o do app antigo
  console.log('\n✅ Importação concluída. Conferindo saldos:');
  for (const a of plano) {
    const r = await pool.query(
      `SELECT COALESCE((SELECT SUM(hours) FROM hour_credits WHERE student_id = s.id), 0)
            - COALESCE((SELECT SUM(flight_hours) FROM flights WHERE student_id = s.id), 0) AS available
       FROM students s WHERE s.name = $1`,
      [a.nome]
    );
    const saldo = Number(r.rows[0].available);
    const ok = Math.abs(saldo - a.disponiveis) < 0.001;
    console.log(`   ${ok ? '✅' : '❌'} ${a.nome}: ${saldo.toFixed(1)} h (app antigo: ${a.disponiveis.toFixed(1)} h)`);
  }
  return true;
}

if (!executar) {
  console.log('\nPrévia apenas. Para gravar, rode de novo com --executar.\n');
} else if (erros.length) {
  console.log('\nCorrija os erros acima antes de gravar.\n');
} else {
  await gravar();
  console.log('');
}

await pool.end();
