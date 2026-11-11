import pg from 'pg';
import 'dotenv/config';


pg.types.setTypeParser(1082, (valor) => valor);


pg.types.setTypeParser(1083, (valor) => valor.slice(0, 5));


pg.types.setTypeParser(1700, (valor) => parseFloat(valor));

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export default pool;