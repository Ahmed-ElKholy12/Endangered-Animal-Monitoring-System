require('dotenv').config();
async function check() {
  const sql = require('mssql/msnodesqlv8');
  const server = process.env.DB_SERVER || 'localhost\\SQLEXPRESS';
  const database = process.env.DB_NAME || 'SpeciesMigrationDB';
  const connStr = `Driver={ODBC Driver 17 for SQL Server};Server=${server};Database=${database};Trusted_Connection=yes;TrustServerCertificate=yes;`;
  const pool = await new sql.ConnectionPool({ connectionString: connStr }).connect();

  // Get the check constraint definition
  const r = await pool.request().query(`
    SELECT cc.name, cc.definition
    FROM sys.check_constraints cc
    JOIN sys.tables t ON cc.parent_object_id = t.object_id
    WHERE t.name = 'SPECIES'
  `);
  console.log('SPECIES constraints:');
  r.recordset.forEach(c => console.log(' ', c.name, ':', c.definition));

  // Also check ANIMAL and RANGER constraints
  const r2 = await pool.request().query(`
    SELECT t.name AS tbl, cc.name, cc.definition
    FROM sys.check_constraints cc
    JOIN sys.tables t ON cc.parent_object_id = t.object_id
    WHERE t.name IN ('ANIMAL','RANGER','CORRIDOR','OBSERVATION_LOG')
  `);
  console.log('\nOther constraints:');
  r2.recordset.forEach(c => console.log(' ', c.tbl, '-', c.name, ':', c.definition));

  // Show existing species
  const s = await pool.request().query('SELECT * FROM SPECIES ORDER BY Spec_ID');
  console.log('\nExisting SPECIES:', JSON.stringify(s.recordset, null, 2));

  await pool.close();
}
check().catch(e => console.error(e.message));
