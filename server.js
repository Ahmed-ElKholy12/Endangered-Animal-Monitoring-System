require('dotenv').config();
const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Database Configuration ───────────────────────────────────────────────────
let pool;

async function connectDB() {
  const server = process.env.DB_SERVER || 'localhost\\SQLEXPRESS';
  const database = process.env.DB_NAME || 'SpeciesMigrationDB';
  const useTrusted = process.env.DB_TRUST_CONNECTION === 'true';

  // Strategy 1: Windows Auth via msnodesqlv8 with ODBC connection string
  if (useTrusted) {
    for (const driverVer of ['17', '18']) {
      try {
        const sqlv8 = require('mssql/msnodesqlv8');
        const connStr = `Driver={ODBC Driver ${driverVer} for SQL Server};Server=${server};Database=${database};Trusted_Connection=yes;TrustServerCertificate=yes;`;
        pool = await new sqlv8.ConnectionPool({ connectionString: connStr }).connect();
        console.log(`✅ Connected to SQL Server (Windows Auth / ODBC Driver ${driverVer})`);
        return;
      } catch (e) {
        console.warn(`⚠️  ODBC ${driverVer} attempt failed:`, e.message);
      }
    }
  }

  // Strategy 2: SQL Server Authentication (tedious)
  try {
    pool = await sql.connect({
      server,
      database,
      user: process.env.DB_USER || 'sa',
      password: process.env.DB_PASSWORD || '',
      port: parseInt(process.env.DB_PORT) || 1433,
      options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
    });
    console.log('✅ Connected to SQL Server (SQL Auth)');
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    console.log('📋 Server will start without DB. Fix .env and restart.');
  }
}




// ─── Middleware: check DB connection ──────────────────────────────────────────
function requireDB(req, res, next) {
  if (!pool || !pool.connected) {
    return res.status(503).json({ error: 'Database not connected. Check server logs.' });
  }
  next();
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
app.get('/api/dashboard', requireDB, async (req, res) => {
  try {
    const result = await pool.request().query(`
      SELECT
        (SELECT COUNT(*) FROM SPECIES) AS speciesCount,
        (SELECT COUNT(*) FROM ANIMAL) AS animalCount,
        (SELECT COUNT(*) FROM CORRIDOR) AS corridorCount,
        (SELECT COUNT(*) FROM RANGER) AS rangerCount,
        (SELECT COUNT(*) FROM OBSERVATION_LOG) AS observationCount
    `);
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SPECIES CRUD
// ═══════════════════════════════════════════════════════════════════════════════
app.get('/api/species', requireDB, async (req, res) => {
  try {
    const result = await pool.request().query('SELECT * FROM SPECIES ORDER BY Spec_ID');
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/species/:id', requireDB, async (req, res) => {
  try {
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT * FROM SPECIES WHERE Spec_ID = @id');
    if (result.recordset.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/species', requireDB, async (req, res) => {
  try {
    const { Spec_ID, Spec_Name, Danger_Level, Diet_Type } = req.body;
    await pool.request()
      .input('id', sql.Int, Spec_ID)
      .input('name', sql.NVarChar(100), Spec_Name)
      .input('danger', sql.NVarChar(50), Danger_Level)
      .input('diet', sql.NVarChar(50), Diet_Type)
      .query('INSERT INTO SPECIES (Spec_ID, Spec_Name, Danger_Level, Diet_Type) VALUES (@id, @name, @danger, @diet)');
    res.status(201).json({ message: 'Species created successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/species/:id', requireDB, async (req, res) => {
  try {
    const { Spec_Name, Danger_Level, Diet_Type } = req.body;
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('name', sql.NVarChar(100), Spec_Name)
      .input('danger', sql.NVarChar(50), Danger_Level)
      .input('diet', sql.NVarChar(50), Diet_Type)
      .query('UPDATE SPECIES SET Spec_Name=@name, Danger_Level=@danger, Diet_Type=@diet WHERE Spec_ID=@id');
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Species updated successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/species/:id', requireDB, async (req, res) => {
  try {
    const cascade = req.query.cascade === 'true';
    if (cascade) {
      // Delete animals referencing this species, and their observation logs
      const animals = await pool.request()
        .input('specId', sql.Int, req.params.id)
        .query('SELECT Ani_ID FROM ANIMAL WHERE Spec_ID = @specId');
      for (const a of animals.recordset) {
        await pool.request()
          .input('aniId', sql.Int, a.Ani_ID)
          .query('DELETE FROM OBSERVATION_LOG WHERE Ani_ID = @aniId');
      }
      await pool.request()
        .input('specId', sql.Int, req.params.id)
        .query('DELETE FROM ANIMAL WHERE Spec_ID = @specId');
    }
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM SPECIES WHERE Spec_ID = @id');
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Species deleted successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CORRIDOR CRUD
// ═══════════════════════════════════════════════════════════════════════════════
app.get('/api/corridors', requireDB, async (req, res) => {
  try {
    const result = await pool.request().query('SELECT * FROM CORRIDOR ORDER BY Corr_ID');
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/corridors/:id', requireDB, async (req, res) => {
  try {
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT * FROM CORRIDOR WHERE Corr_ID = @id');
    if (result.recordset.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/corridors', requireDB, async (req, res) => {
  try {
    const { Corr_ID, Corr_Name, climate } = req.body;
    await pool.request()
      .input('id', sql.Int, Corr_ID)
      .input('name', sql.NVarChar(100), Corr_Name)
      .input('climate', sql.NVarChar(50), climate)
      .query('INSERT INTO CORRIDOR (Corr_ID, Corr_Name, climate) VALUES (@id, @name, @climate)');
    res.status(201).json({ message: 'Corridor created successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/corridors/:id', requireDB, async (req, res) => {
  try {
    const { Corr_Name, climate } = req.body;
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('name', sql.NVarChar(100), Corr_Name)
      .input('climate', sql.NVarChar(50), climate)
      .query('UPDATE CORRIDOR SET Corr_Name=@name, climate=@climate WHERE Corr_ID=@id');
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Corridor updated successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/corridors/:id', requireDB, async (req, res) => {
  try {
    const cascade = req.query.cascade === 'true';
    if (cascade) {
      // Delete observation logs referencing animals in this corridor
      const animals = await pool.request()
        .input('corrId', sql.Int, req.params.id)
        .query('SELECT Ani_ID FROM ANIMAL WHERE Corr_ID = @corrId');
      for (const a of animals.recordset) {
        await pool.request()
          .input('aniId', sql.Int, a.Ani_ID)
          .query('DELETE FROM OBSERVATION_LOG WHERE Ani_ID = @aniId');
      }
      await pool.request()
        .input('corrId', sql.Int, req.params.id)
        .query('DELETE FROM OBSERVATION_LOG WHERE Corr_ID = @corrId');
      await pool.request()
        .input('corrId', sql.Int, req.params.id)
        .query('DELETE FROM ANIMAL WHERE Corr_ID = @corrId');
    }
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM CORRIDOR WHERE Corr_ID = @id');
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Corridor deleted successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// RANGER CRUD
// ═══════════════════════════════════════════════════════════════════════════════
app.get('/api/rangers', requireDB, async (req, res) => {
  try {
    const result = await pool.request().query('SELECT * FROM RANGER ORDER BY Rang_ID');
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/rangers/:id', requireDB, async (req, res) => {
  try {
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT * FROM RANGER WHERE Rang_ID = @id');
    if (result.recordset.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/rangers', requireDB, async (req, res) => {
  try {
    const { Rang_ID, Rang_Name, Phone, Salary } = req.body;
    await pool.request()
      .input('id', sql.Int, Rang_ID)
      .input('name', sql.NVarChar(100), Rang_Name)
      .input('phone', sql.NVarChar(20), Phone)
      .input('salary', sql.Decimal(10, 2), Salary)
      .query('INSERT INTO RANGER (Rang_ID, Rang_Name, Phone, Salary) VALUES (@id, @name, @phone, @salary)');
    res.status(201).json({ message: 'Ranger created successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/rangers/:id', requireDB, async (req, res) => {
  try {
    const { Rang_Name, Phone, Salary } = req.body;
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('name', sql.NVarChar(100), Rang_Name)
      .input('phone', sql.NVarChar(20), Phone)
      .input('salary', sql.Decimal(10, 2), Salary)
      .query('UPDATE RANGER SET Rang_Name=@name, Phone=@phone, Salary=@salary WHERE Rang_ID=@id');
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Ranger updated successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/rangers/:id', requireDB, async (req, res) => {
  try {
    const cascade = req.query.cascade === 'true';
    if (cascade) {
      await pool.request()
        .input('rangId', sql.Int, req.params.id)
        .query('DELETE FROM OBSERVATION_LOG WHERE Rang_ID = @rangId');
    }
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM RANGER WHERE Rang_ID = @id');
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Ranger deleted successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ANIMAL CRUD
// ═══════════════════════════════════════════════════════════════════════════════
app.get('/api/animals', requireDB, async (req, res) => {
  try {
    const result = await pool.request().query(`
      SELECT a.*, s.Spec_Name, c.Corr_Name
      FROM ANIMAL a
      LEFT JOIN SPECIES s ON a.Spec_ID = s.Spec_ID
      LEFT JOIN CORRIDOR c ON a.Corr_ID = c.Corr_ID
      ORDER BY a.Ani_ID
    `);
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/animals/:id', requireDB, async (req, res) => {
  try {
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT a.*, s.Spec_Name, c.Corr_Name
        FROM ANIMAL a
        LEFT JOIN SPECIES s ON a.Spec_ID = s.Spec_ID
        LEFT JOIN CORRIDOR c ON a.Corr_ID = c.Corr_ID
        WHERE a.Ani_ID = @id
      `);
    if (result.recordset.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/animals', requireDB, async (req, res) => {
  try {
    const { Ani_ID, ANI_Age, Health_Status, Spec_ID, Corr_ID } = req.body;
    await pool.request()
      .input('id', sql.Int, Ani_ID)
      .input('age', sql.Int, ANI_Age)
      .input('health', sql.NVarChar(50), Health_Status)
      .input('specId', sql.Int, Spec_ID)
      .input('corrId', sql.Int, Corr_ID)
      .query('INSERT INTO ANIMAL (Ani_ID, ANI_Age, Health_Status, Spec_ID, Corr_ID) VALUES (@id, @age, @health, @specId, @corrId)');
    res.status(201).json({ message: 'Animal created successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/animals/:id', requireDB, async (req, res) => {
  try {
    const { ANI_Age, Health_Status, Spec_ID, Corr_ID } = req.body;
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('age', sql.Int, ANI_Age)
      .input('health', sql.NVarChar(50), Health_Status)
      .input('specId', sql.Int, Spec_ID)
      .input('corrId', sql.Int, Corr_ID)
      .query('UPDATE ANIMAL SET ANI_Age=@age, Health_Status=@health, Spec_ID=@specId, Corr_ID=@corrId WHERE Ani_ID=@id');
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Animal updated successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/animals/:id', requireDB, async (req, res) => {
  try {
    const cascade = req.query.cascade === 'true';
    if (cascade) {
      await pool.request()
        .input('aniId', sql.Int, req.params.id)
        .query('DELETE FROM OBSERVATION_LOG WHERE Ani_ID = @aniId');
    }
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM ANIMAL WHERE Ani_ID = @id');
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Animal deleted successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// OBSERVATION_LOG CRUD
// ═══════════════════════════════════════════════════════════════════════════════
app.get('/api/observations', requireDB, async (req, res) => {
  try {
    const result = await pool.request().query(`
      SELECT o.*, a.ANI_Age, a.Health_Status, s.Spec_Name,
             r.Rang_Name, c.Corr_Name
      FROM OBSERVATION_LOG o
      LEFT JOIN ANIMAL a ON o.Ani_ID = a.Ani_ID
      LEFT JOIN SPECIES s ON a.Spec_ID = s.Spec_ID
      LEFT JOIN RANGER r ON o.Rang_ID = r.Rang_ID
      LEFT JOIN CORRIDOR c ON o.Corr_ID = c.Corr_ID
      ORDER BY o.Log_ID
    `);
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/observations', requireDB, async (req, res) => {
  try {
    const { Log_ID, Log_Date, Ani_ID, Rang_ID, Corr_ID } = req.body;
    await pool.request()
      .input('id', sql.Int, Log_ID)
      .input('date', sql.Date, Log_Date)
      .input('aniId', sql.Int, Ani_ID)
      .input('rangId', sql.Int, Rang_ID)
      .input('corrId', sql.Int, Corr_ID)
      .query('INSERT INTO OBSERVATION_LOG (Log_ID, Log_Date, Ani_ID, Rang_ID, Corr_ID) VALUES (@id, @date, @aniId, @rangId, @corrId)');
    res.status(201).json({ message: 'Observation created successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/observations/:id', requireDB, async (req, res) => {
  try {
    const { Log_Date, Ani_ID, Rang_ID, Corr_ID } = req.body;
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('date', sql.Date, Log_Date)
      .input('aniId', sql.Int, Ani_ID)
      .input('rangId', sql.Int, Rang_ID)
      .input('corrId', sql.Int, Corr_ID)
      .query('UPDATE OBSERVATION_LOG SET Log_Date=@date, Ani_ID=@aniId, Rang_ID=@rangId, Corr_ID=@corrId WHERE Log_ID=@id');
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Observation updated successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/observations/:id', requireDB, async (req, res) => {
  try {
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM OBSERVATION_LOG WHERE Log_ID = @id');
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Observation deleted successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    dbConnected: !!(pool && pool.connected),
    timestamp: new Date().toISOString(),
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🌿 Species Migration DB Server running at http://localhost:${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`❤️  Health: http://localhost:${PORT}/api/health\n`);
  });
});
