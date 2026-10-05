require('dotenv').config();

async function run() {
  const server = process.env.DB_SERVER || 'localhost\\SQLEXPRESS';
  const database = process.env.DB_NAME || 'SpeciesMigrationDB';

  const sql = require('mssql/msnodesqlv8');
  const connStr = `Driver={ODBC Driver 17 for SQL Server};Server=${server};Database=${database};Trusted_Connection=yes;TrustServerCertificate=yes;`;
  const pool = await new sql.ConnectionPool({ connectionString: connStr }).connect();

  // Add Ani_Name column if not exists
  const r1 = await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'ANIMAL' AND COLUMN_NAME = 'Ani_Name'
    )
    BEGIN
      ALTER TABLE ANIMAL ADD Ani_Name NVARCHAR(100) NULL;
      SELECT 'Column Ani_Name ADDED' AS result;
    END
    ELSE
      SELECT 'Column Ani_Name already EXISTS' AS result;
  `);
  console.log(r1.recordset[0].result);

  await pool.close();
  console.log('Done.');
}

run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
