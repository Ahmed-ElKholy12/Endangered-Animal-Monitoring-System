require('dotenv').config();

async function seed() {
  const server   = process.env.DB_SERVER || 'localhost\\SQLEXPRESS';
  const database = process.env.DB_NAME   || 'SpeciesMigrationDB';
  const sql = require('mssql/msnodesqlv8');
  const connStr = `Driver={ODBC Driver 17 for SQL Server};Server=${server};Database=${database};Trusted_Connection=yes;TrustServerCertificate=yes;`;
  const pool = await new sql.ConnectionPool({ connectionString: connStr }).connect();

  console.log('\n🌱 Starting seed...\n');

  // ══════════════════════════════════════════════════════════════════════════
  // 1. UPDATE existing animals — fill in Ani_Name & missing Age
  //    Existing IDs: 401–405
  //    Allowed Health: Healthy | Injured | Critical
  // ══════════════════════════════════════════════════════════════════════════
  const animalUpdates = [
    { id: 401, name: 'Raja',   age: 5  },
    { id: 402, name: 'Tembo',  age: 12 },
    { id: 403, name: 'Shiro',  age: 3  },
    { id: 404, name: 'Bakari', age: 7  },
    { id: 405, name: 'Talon',  age: 2  },
  ];
  for (const a of animalUpdates) {
    await pool.request()
      .input('id',   sql.Int,           a.id)
      .input('name', sql.NVarChar(100), a.name)
      .input('age',  sql.Int,           a.age)
      .query(`UPDATE ANIMAL
              SET Ani_Name = @name,
                  ANI_Age  = CASE WHEN ANI_Age IS NULL THEN @age ELSE ANI_Age END
              WHERE Ani_ID = @id`);
  }
  console.log('✅ Existing animal names & ages filled in');

  // ══════════════════════════════════════════════════════════════════════════
  // 2. NEW SPECIES
  //    Danger_Level: Low | Medium | High
  //    Diet_Type:    Carnivore | Herbivore | Omnivore
  // ══════════════════════════════════════════════════════════════════════════
  const newSpecies = [
    { id: 106, name: 'Green Sea Turtle',       danger: 'High',   diet: 'Herbivore'  },
    { id: 107, name: 'Mountain Gorilla',        danger: 'High',   diet: 'Herbivore'  },
    { id: 108, name: 'Amur Leopard',            danger: 'High',   diet: 'Carnivore'  },
    { id: 109, name: 'Blue Whale',              danger: 'Medium', diet: 'Carnivore'  },
    { id: 110, name: 'Sumatran Orangutan',      danger: 'High',   diet: 'Omnivore'   },
    { id: 111, name: 'Cheetah',                 danger: 'Medium', diet: 'Carnivore'  },
    { id: 112, name: 'African Wild Dog',        danger: 'High',   diet: 'Carnivore'  },
    { id: 113, name: 'Giant Panda',             danger: 'Medium', diet: 'Herbivore'  },
    { id: 114, name: 'Polar Bear',              danger: 'Medium', diet: 'Carnivore'  },
    { id: 115, name: 'Leatherback Sea Turtle',  danger: 'High',   diet: 'Carnivore'  },
    { id: 116, name: 'Hawksbill Sea Turtle',    danger: 'High',   diet: 'Carnivore'  },
    { id: 117, name: 'Siberian Tiger',          danger: 'High',   diet: 'Carnivore'  },
    { id: 118, name: 'Red Panda',               danger: 'Medium', diet: 'Omnivore'   },
    { id: 119, name: 'Vaquita Porpoise',        danger: 'High',   diet: 'Carnivore'  },
    { id: 120, name: 'African Lion',            danger: 'Medium', diet: 'Carnivore'  },
  ];
  for (const s of newSpecies) {
    const exists = await pool.request().input('id', sql.Int, s.id).query('SELECT 1 FROM SPECIES WHERE Spec_ID=@id');
    if (!exists.recordset.length) {
      await pool.request()
        .input('id',     sql.Int,          s.id)
        .input('name',   sql.NVarChar(100), s.name)
        .input('danger', sql.NVarChar(50),  s.danger)
        .input('diet',   sql.NVarChar(50),  s.diet)
        .query('INSERT INTO SPECIES (Spec_ID,Spec_Name,Danger_Level,Diet_Type) VALUES (@id,@name,@danger,@diet)');
    }
  }
  console.log('✅ Extra species inserted');

  // ══════════════════════════════════════════════════════════════════════════
  // 3. NEW CORRIDORS
  // ══════════════════════════════════════════════════════════════════════════
  // First find existing corridor IDs
  const existCorr = await pool.request().query('SELECT Corr_ID FROM CORRIDOR');
  const existCorrIds = new Set(existCorr.recordset.map(r => r.Corr_ID));

  const newCorridors = [
    { id: 201, name: 'Coastal Mangrove Trail',    climate: 'Tropical'     },
    { id: 202, name: 'Alpine Summit Route',        climate: 'Cold'         },
    { id: 203, name: 'Desert Dunes Path',          climate: 'Arid'         },
    { id: 204, name: 'Rainforest Heart Corridor',  climate: 'Tropical'     },
    { id: 205, name: 'Mediterranean Olive Belt',   climate: 'Temperate'    },
    { id: 206, name: 'Boreal Forest Link',         climate: 'Cold'         },
    { id: 207, name: 'Wetland Delta Pass',         climate: 'Subtropical'  },
    { id: 208, name: 'Savannah Grassland Stretch', climate: 'Arid'         },
    { id: 209, name: 'Himalayan Ridge Trail',      climate: 'Cold'         },
    { id: 210, name: 'Amazon River Basin',         climate: 'Tropical'     },
  ];
  for (const c of newCorridors) {
    if (!existCorrIds.has(c.id)) {
      await pool.request()
        .input('id',      sql.Int,          c.id)
        .input('name',    sql.NVarChar(100), c.name)
        .input('climate', sql.NVarChar(50),  c.climate)
        .query('INSERT INTO CORRIDOR (Corr_ID,Corr_Name,climate) VALUES (@id,@name,@climate)');
    }
  }
  console.log('✅ Extra corridors inserted');

  // ══════════════════════════════════════════════════════════════════════════
  // 4. NEW RANGERS
  // ══════════════════════════════════════════════════════════════════════════
  const existRang = await pool.request().query('SELECT Rang_ID FROM RANGER');
  const existRangIds = new Set(existRang.recordset.map(r => r.Rang_ID));

  const newRangers = [
    { id: 301, name: 'Amara Diallo',   phone: '+1-555-0301', salary: 58000 },
    { id: 302, name: 'Kai Nakamura',   phone: '+1-555-0402', salary: 61000 },
    { id: 303, name: 'Sofia Mendes',   phone: '+1-555-0503', salary: 55000 },
    { id: 304, name: 'Ethan Brooks',   phone: '+1-555-0604', salary: 67000 },
    { id: 305, name: 'Nia Okonkwo',    phone: '+1-555-0705', salary: 59500 },
    { id: 306, name: 'Lena Petrov',    phone: '+1-555-0806', salary: 63000 },
    { id: 307, name: 'Carlos Vega',    phone: '+1-555-0907', salary: 57000 },
    { id: 308, name: 'Yuki Tanaka',    phone: '+1-555-1001', salary: 64000 },
    { id: 309, name: 'Fatima Hassan',  phone: '+1-555-1102', salary: 60000 },
    { id: 310, name: 'James Osei',     phone: '+1-555-1203', salary: 62500 },
  ];
  for (const r of newRangers) {
    if (!existRangIds.has(r.id)) {
      await pool.request()
        .input('id',     sql.Int,          r.id)
        .input('name',   sql.NVarChar(100), r.name)
        .input('phone',  sql.NVarChar(20),  r.phone)
        .input('salary', sql.Decimal(10,2), r.salary)
        .query('INSERT INTO RANGER (Rang_ID,Rang_Name,Phone,Salary) VALUES (@id,@name,@phone,@salary)');
    }
  }
  console.log('✅ Extra rangers inserted');

  // ══════════════════════════════════════════════════════════════════════════
  // 5. NEW ANIMALS
  //    Using real Spec_IDs (101-120) and real Corr_IDs from above
  //    Health: Healthy | Injured | Critical
  // ══════════════════════════════════════════════════════════════════════════
  const existAni = await pool.request().query('SELECT Ani_ID FROM ANIMAL');
  const existAniIds = new Set(existAni.recordset.map(r => r.Ani_ID));

  const newAnimals = [
    { id: 406, name: 'Koda',    age: 6,  health: 'Healthy',  specId: 106, corrId: 201 },
    { id: 407, name: 'Harambe', age: 14, health: 'Healthy',  specId: 107, corrId: 204 },
    { id: 408, name: 'Sasha',   age: 4,  health: 'Injured',  specId: 108, corrId: 202 },
    { id: 409, name: 'Mira',    age: 9,  health: 'Healthy',  specId: 109, corrId: 201 },
    { id: 410, name: 'Budi',    age: 18, health: 'Critical', specId: 110, corrId: 204 },
    { id: 411, name: 'Dash',    age: 3,  health: 'Healthy',  specId: 111, corrId: 203 },
    { id: 412, name: 'Zara',    age: 5,  health: 'Healthy',  specId: 112, corrId: 205 },
    { id: 413, name: 'Mei',     age: 11, health: 'Healthy',  specId: 113, corrId: 204 },
    { id: 414, name: 'Arctic',  age: 7,  health: 'Critical', specId: 114, corrId: 206 },
    { id: 415, name: 'Luna',    age: 25, health: 'Healthy',  specId: 115, corrId: 201 },
    { id: 416, name: 'Storm',   age: 8,  health: 'Healthy',  specId: 103, corrId: 202 },
    { id: 417, name: 'Blaze',   age: 4,  health: 'Injured',  specId: 101, corrId: 207 },
    { id: 418, name: 'Titan',   age: 20, health: 'Healthy',  specId: 102, corrId: 207 },
    { id: 419, name: 'Pearl',   age: 2,  health: 'Healthy',  specId: 105, corrId: 208 },
    { id: 420, name: 'Orion',   age: 6,  health: 'Injured',  specId: 104, corrId: 209 },
    { id: 421, name: 'Kira',    age: 9,  health: 'Healthy',  specId: 116, corrId: 201 },
    { id: 422, name: 'Boris',   age: 5,  health: 'Healthy',  specId: 117, corrId: 202 },
    { id: 423, name: 'Rusty',   age: 3,  health: 'Healthy',  specId: 118, corrId: 204 },
    { id: 424, name: 'Ghost',   age: 1,  health: 'Critical', specId: 119, corrId: 201 },
    { id: 425, name: 'Simba',   age: 7,  health: 'Healthy',  specId: 120, corrId: 208 },
  ];
  for (const a of newAnimals) {
    if (!existAniIds.has(a.id)) {
      await pool.request()
        .input('id',     sql.Int,          a.id)
        .input('name',   sql.NVarChar(100), a.name)
        .input('age',    sql.Int,           a.age)
        .input('health', sql.NVarChar(50),  a.health)
        .input('specId', sql.Int,           a.specId)
        .input('corrId', sql.Int,           a.corrId)
        .query('INSERT INTO ANIMAL (Ani_ID,Ani_Name,ANI_Age,Health_Status,Spec_ID,Corr_ID) VALUES (@id,@name,@age,@health,@specId,@corrId)');
    }
  }
  console.log('✅ Extra animals inserted');

  // ══════════════════════════════════════════════════════════════════════════
  // 6. OBSERVATION_LOG
  // ══════════════════════════════════════════════════════════════════════════
  const maxRes = await pool.request().query('SELECT ISNULL(MAX(Log_ID), 0) AS mx FROM OBSERVATION_LOG');
  let nextLogId = maxRes.recordset[0].mx + 1;

  // Rang_IDs that actually exist now
  const allRang = await pool.request().query('SELECT Rang_ID FROM RANGER');
  const rangIds = allRang.recordset.map(r => r.Rang_ID);

  // Corr_IDs that actually exist now
  const allCorr = await pool.request().query('SELECT Corr_ID FROM CORRIDOR');
  const corrIds = new Set(allCorr.recordset.map(r => r.Corr_ID));

  // Ani_IDs that actually exist now
  const allAni = await pool.request().query('SELECT Ani_ID FROM ANIMAL');
  const aniIds = allAni.recordset.map(r => r.Ani_ID);

  const observations = [
    { aniId: 401, rangIdx: 0, corrId: 201, date: '2026-01-10' },
    { aniId: 402, rangIdx: 1, corrId: 204, date: '2026-01-15' },
    { aniId: 403, rangIdx: 2, corrId: 202, date: '2026-01-20' },
    { aniId: 404, rangIdx: 3, corrId: 207, date: '2026-02-05' },
    { aniId: 405, rangIdx: 4, corrId: 208, date: '2026-02-12' },
    { aniId: 406, rangIdx: 5, corrId: 201, date: '2026-02-18' },
    { aniId: 407, rangIdx: 6, corrId: 204, date: '2026-02-25' },
    { aniId: 408, rangIdx: 7, corrId: 202, date: '2026-03-03' },
    { aniId: 409, rangIdx: 0, corrId: 201, date: '2026-03-10' },
    { aniId: 410, rangIdx: 1, corrId: 204, date: '2026-03-17' },
    { aniId: 411, rangIdx: 2, corrId: 203, date: '2026-03-24' },
    { aniId: 412, rangIdx: 3, corrId: 205, date: '2026-04-01' },
    { aniId: 413, rangIdx: 4, corrId: 204, date: '2026-04-08' },
    { aniId: 414, rangIdx: 5, corrId: 206, date: '2026-04-15' },
    { aniId: 415, rangIdx: 6, corrId: 201, date: '2026-04-22' },
    { aniId: 416, rangIdx: 7, corrId: 202, date: '2026-05-01' },
    { aniId: 417, rangIdx: 8, corrId: 207, date: '2026-05-08' },
    { aniId: 418, rangIdx: 9, corrId: 207, date: '2026-05-15' },
    { aniId: 419, rangIdx: 0, corrId: 208, date: '2026-05-22' },
    { aniId: 420, rangIdx: 1, corrId: 209, date: '2026-06-01' },
    { aniId: 401, rangIdx: 2, corrId: 201, date: '2026-06-10' },
    { aniId: 421, rangIdx: 3, corrId: 201, date: '2026-06-18' },
    { aniId: 422, rangIdx: 4, corrId: 202, date: '2026-07-05' },
    { aniId: 423, rangIdx: 5, corrId: 204, date: '2026-07-20' },
    { aniId: 424, rangIdx: 6, corrId: 201, date: '2026-08-03' },
    { aniId: 425, rangIdx: 7, corrId: 208, date: '2026-08-15' },
    { aniId: 402, rangIdx: 8, corrId: 204, date: '2026-08-22' },
    { aniId: 403, rangIdx: 9, corrId: 202, date: '2026-09-01' },
    { aniId: 413, rangIdx: 0, corrId: 204, date: '2026-09-10' },
    { aniId: 414, rangIdx: 1, corrId: 206, date: '2026-09-20' },
  ];

  let obsInserted = 0;
  for (const o of observations) {
    const rangId = rangIds[o.rangIdx % rangIds.length];
    if (!corrIds.has(o.corrId)) continue;

    await pool.request()
      .input('id',     sql.Int,  nextLogId++)
      .input('date',   sql.Date, o.date)
      .input('aniId',  sql.Int,  o.aniId)
      .input('rangId', sql.Int,  rangId)
      .input('corrId', sql.Int,  o.corrId)
      .query('INSERT INTO OBSERVATION_LOG (Log_ID,Log_Date,Ani_ID,Rang_ID,Corr_ID) VALUES (@id,@date,@aniId,@rangId,@corrId)');
    obsInserted++;
  }
  console.log(`✅ ${obsInserted} observation logs inserted`);

  await pool.close();
  console.log('\n🎉 Seed complete! All tables fully populated.\n');
}

seed().catch(e => { console.error('❌ Seed failed:', e.message); process.exit(1); });
