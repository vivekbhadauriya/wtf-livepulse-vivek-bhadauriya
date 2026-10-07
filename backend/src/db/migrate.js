const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

async function migrate() {
  const client = await pool.connect();
  try {
    const migrationDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationDir).sort();
    
    for (const file of files) {
      if (!file.endsWith('.sql')) continue;
      console.log(`Running migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationDir, file), 'utf8');
      await client.query(sql);
      console.log(`  ✓ ${file} complete`);
    }
    
    console.log('All migrations complete.');
  } catch (err) {
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { migrate };
