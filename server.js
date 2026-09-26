const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { Client } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'pelaajaringi.db');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const realtimeClients = new Set();
const DATABASE_URL = process.env.DATABASE_URL || '';

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function isPostgres() {
  return Boolean(DATABASE_URL);
}

let db = null;

if (isPostgres()) {
  db = new Client({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
} else {
  db = new sqlite3.Database(DB_PATH);
}

function normalizeSql(sql, params) {
  if (!isPostgres()) {
    return { sql, params };
  }

  let index = 1;
  const normalized = sql.replace(/\?/g, () => `$${index++}`);
  return { sql: normalized, params };
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = `brand-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

function run(sql, params = []) {
  if (isPostgres()) {
    const normalized = normalizeSql(sql, params);
    return db.query(normalized.sql, normalized.params)
      .then((result) => ({
        id: result.rows?.[0]?.id ?? null,
        changes: result.rowCount || 0
      }))
      .catch((err) => {
        throw err;
      });
  }

  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  if (isPostgres()) {
    const normalized = normalizeSql(sql, params);
    return db.query(normalized.sql, normalized.params)
      .then((result) => result.rows[0] || null)
      .catch((err) => {
        throw err;
      });
  }

  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function all(sql, params = []) {
  if (isPostgres()) {
    const normalized = normalizeSql(sql, params);
    return db.query(normalized.sql, normalized.params)
      .then((result) => result.rows || [])
      .catch((err) => {
        throw err;
      });
  }

  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

function toJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function serializeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    password: row.password,
    role: row.role,
    level: row.level || '',
    company: row.company || '',
    goals: toJsonArray(row.goals)
  };
}

function serializeSession(row, participants = []) {
  return {
    id: row.id,
    date: row.date,
    time: row.time,
    end: row.end_time,
    sport: row.sport,
    location: row.location,
    host: row.host,
    max: Number(row.max_players),
    description: row.description,
    agenda: row.agenda || '',
    pause: Number(row.pause) === 1,
    participants: participants.map((p) => {
      if (typeof p === 'string') {
        return { username: p, type: 'play' };
      }
      return {
        username: p.username || p.name || '',
        type: p.participant_type || p.type || 'play'
      };
    })
  };
}

function getNextThursday(date = new Date()) {
  const copy = new Date(date);
  const day = copy.getDay();
  const offset = (4 - day + 7) % 7 || 7;
  copy.setDate(copy.getDate() + offset);
  return new Date(copy.getFullYear(), copy.getMonth(), copy.getDate());
}

function isoDate(value) {
  const d = new Date(value);
  return d.toISOString().slice(0, 10);
}

function addDays(value, days) {
  const d = new Date(value);
  d.setDate(d.getDate() + days);
  return d;
}

function broadcastUpdate(type = 'data-change') {
  const payload = JSON.stringify({ type, at: Date.now() });
  for (const client of realtimeClients) {
    if (client.writableEnded) {
      realtimeClients.delete(client);
      continue;
    }
    client.write(`data: ${payload}\n\n`);
  }
}

async function seedDefaultData() {
  const userRows = await all('SELECT COUNT(*) AS count FROM users');
  if (Number(userRows[0].count) > 0) return;

  await run(
    `INSERT INTO users (username, password, role, level, company, goals) VALUES (?, ?, ?, ?, ?, ?)`,
    ['admin', 'admin', 'admin', '', '', JSON.stringify([])]
  );

  await run(
    `INSERT INTO users (username, password, role, level, company, goals) VALUES (?, ?, ?, ?, ?, ?)`,
    ['Host', 'host123', 'user', 'Kilpapelaaja', 'PelaajaRinki', JSON.stringify(['Yhteistyö'])]
  );

  let firstThursday = getNextThursday();
  for (let i = 0; i < 9; i += 1) {
    const sport = i % 2 === 0 ? 'Tennis' : 'Padel';
    const date = isoDate(addDays(firstThursday, i * 7));
    await run(
      `INSERT INTO sessions (date, time, end_time, sport, location, host, max_players, description, pause)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [date, '18:00', '19:00', sport, 'Rosegarden, Espoo', 'Host', 8, 'PelaajaRingin viikoittainen pelivuoro.', 0]
    );
  }
}

async function addMissingColumns() {
  if (isPostgres()) {
    const sessionInfo = await all("SELECT column_name FROM information_schema.columns WHERE table_name = 'sessions'");
    if (!sessionInfo.some((column) => column.column_name === 'agenda')) {
      await run('ALTER TABLE sessions ADD COLUMN IF NOT EXISTS agenda TEXT DEFAULT \"\"');
    }

    const participantInfo = await all("SELECT column_name FROM information_schema.columns WHERE table_name = 'participants'");
    if (!participantInfo.some((column) => column.column_name === 'participant_type')) {
      await run('ALTER TABLE participants ADD COLUMN IF NOT EXISTS participant_type TEXT NOT NULL DEFAULT \'play\'');
    }
    return;
  }

  const sessionInfo = await all('PRAGMA table_info(sessions)');
  if (!sessionInfo.some((column) => column.name === 'agenda')) {
    await run('ALTER TABLE sessions ADD COLUMN agenda TEXT DEFAULT ""');
  }

  const participantInfo = await all('PRAGMA table_info(participants)');
  if (!participantInfo.some((column) => column.name === 'participant_type')) {
    await run('ALTER TABLE participants ADD COLUMN participant_type TEXT NOT NULL DEFAULT "play"');
  }
}

async function initDb() {
  if (isPostgres()) {
    await run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        level TEXT,
        company TEXT,
        goals TEXT DEFAULT '[]'
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        sport TEXT NOT NULL,
        location TEXT NOT NULL,
        host TEXT NOT NULL,
        max_players INTEGER NOT NULL,
        description TEXT,
        agenda TEXT DEFAULT '',
        pause INTEGER NOT NULL DEFAULT 0
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS participants (
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        session_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        participant_type TEXT NOT NULL DEFAULT 'play',
        UNIQUE(session_id, user_id),
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS assets (
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        image_path TEXT NOT NULL,
        alt TEXT,
        link TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        display_order INTEGER NOT NULL DEFAULT 0
      )
    `);
  } else {
    await run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        level TEXT,
        company TEXT,
        goals TEXT DEFAULT '[]'
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        sport TEXT NOT NULL,
        location TEXT NOT NULL,
        host TEXT NOT NULL,
        max_players INTEGER NOT NULL,
        description TEXT,
        agenda TEXT DEFAULT '',
        pause INTEGER NOT NULL DEFAULT 0
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        participant_type TEXT NOT NULL DEFAULT 'play',
        UNIQUE(session_id, user_id),
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        image_path TEXT NOT NULL,
        alt TEXT,
        link TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        display_order INTEGER NOT NULL DEFAULT 0
      )
    `);
  }

  await addMissingColumns();
  await seedDefaultData();
}

async function getSessionParticipants(sessionId) {
  const rows = await all(
    `SELECT u.username, p.participant_type
     FROM participants p
     JOIN users u ON u.id = p.user_id
     WHERE p.session_id = ?
     ORDER BY u.username ASC`,
    [sessionId]
  );
  return rows.map((row) => ({
    username: row.username,
    participant_type: row.participant_type || 'play'
  }));
}

async function getSessionList() {
  const rows = await all(`SELECT * FROM sessions ORDER BY date ASC, time ASC`);
  const sessions = [];
  for (const row of rows) {
    const participants = await getSessionParticipants(row.id);
    sessions.push(serializeSession(row, participants));
  }
  return sessions;
}

async function getPublicData() {
  const [users, sessions, assets] = await Promise.all([
    all('SELECT * FROM users ORDER BY username ASC'),
    getSessionList(),
    all('SELECT * FROM assets WHERE active = 1 ORDER BY display_order ASC, id ASC')
  ]);

  return {
    users: users.map((row) => serializeUser(row)),
    sessions,
    assets: assets.map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      name: asset.name,
      alt: asset.alt || asset.name,
      link: asset.link || '',
      imageUrl: `/uploads/${path.basename(asset.image_path)}`,
      active: Number(asset.active) === 1,
      displayOrder: asset.display_order
    }))
  };
}

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(__dirname));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, status: 'ready' });
});

app.get('/api/app-data', async (_req, res) => {
  try {
    const data = await getPublicData();
    res.json(data);
  } catch (error) {
    console.error('app-data failed:', error);
    res.status(500).json({ error: 'Kantaan pääsy epäonnistui.' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  const row = await get(
    'SELECT * FROM users WHERE username = ? AND password = ?',
    [String(username || '').trim(), String(password || '')]
  );

  if (!row) {
    return res.status(401).json({ error: 'Käyttäjänimi tai salasana ei täsmää.' });
  }

  return res.json({ user: serializeUser(row) });
});

app.post('/api/register', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');

  if (!username || !password) {
    return res.status(400).json({ error: 'Anna käyttäjänimi ja salasana.' });
  }

  if (username.length < 2) {
    return res.status(400).json({ error: 'Käyttäjänimi pitää olla vähintään 2 merkkiä.' });
  }

  const exists = await get('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', [username]);
  if (exists) {
    return res.status(409).json({ error: 'Käyttäjänimi on jo käytössä.' });
  }

  const result = await run(
    `INSERT INTO users (username, password, role, level, company, goals) VALUES (?, ?, ?, ?, ?, ?)`,
    [username, password, 'user', '', '', JSON.stringify([])]
  );

  const user = await get('SELECT * FROM users WHERE id = ?', [result.id]);
  return res.status(201).json({ user: serializeUser(user) });
});

app.post('/api/reset', async (_req, res) => {
  try {
    const files = fs.readdirSync(UPLOAD_DIR);
    for (const file of files) {
      if (file !== '.gitkeep') {
        fs.unlinkSync(path.join(UPLOAD_DIR, file));
      }
    }

    await run('DELETE FROM participants');
    await run('DELETE FROM assets');
    await run('DELETE FROM sessions');
    await run('DELETE FROM users');
    await seedDefaultData();
    res.json({ ok: true });
  } catch (error) {
    console.error('reset failed:', error);
    res.status(500).json({ error: 'Resetointi epäonnistui.' });
  }
});

app.post('/api/profile', async (req, res) => {
  const { username, level, company, goals } = req.body || {};
  if (!username) {
    return res.status(400).json({ error: 'Käyttäjänimi puuttuu.' });
  }

  const user = await get('SELECT * FROM users WHERE username = ?', [username]);
  if (!user) {
    return res.status(404).json({ error: 'Käyttäjää ei löytynyt.' });
  }

  await run(
    `UPDATE users SET level = ?, company = ?, goals = ? WHERE id = ?`,
    [String(level || ''), String(company || ''), JSON.stringify(Array.isArray(goals) ? goals : []), user.id]
  );

  const updated = await get('SELECT * FROM users WHERE id = ?', [user.id]);
  return res.json({ user: serializeUser(updated) });
});

app.post('/api/users', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const role = String(req.body?.role || 'user');

  if (!username || !password) {
    return res.status(400).json({ error: 'Anna käyttäjänimi ja salasana.' });
  }

  if (username.length < 2) {
    return res.status(400).json({ error: 'Käyttäjänimi pitää olla vähintään 2 merkkiä.' });
  }

  const exists = await get('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', [username]);
  if (exists) {
    return res.status(409).json({ error: 'Käyttäjänimi on jo käytössä.' });
  }

  const validRole = role === 'admin' ? 'admin' : 'user';
  const result = await run(
    `INSERT INTO users (username, password, role, level, company, goals) VALUES (?, ?, ?, ?, ?, ?)`,
    [username, password, validRole, '', '', JSON.stringify([])]
  );

  const user = await get('SELECT * FROM users WHERE id = ?', [result.id]);
  return res.status(201).json({ user: serializeUser(user) });
});

app.get('/api/users', async (_req, res) => {
  const users = await all('SELECT * FROM users ORDER BY username ASC');
  res.json(users.map((row) => serializeUser(row)));
});

app.delete('/api/users/:id', async (req, res) => {
  const userId = Number(req.params.id);
  if (!userId) return res.status(400).json({ error: 'Virheellinen käyttäjän tunnus.' });

  const user = await get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) return res.status(404).json({ error: 'Käyttäjää ei löytynyt.' });

  await run('DELETE FROM participants WHERE user_id = ?', [userId]);
  await run('DELETE FROM users WHERE id = ?', [userId]);
  res.json({ ok: true });
});

app.get('/api/sessions', async (_req, res) => {
  res.json(await getSessionList());
});

app.post('/api/sessions', async (req, res) => {
  const { date, time, end, sport, location, host, description, agenda, maxPlayers, pause } = req.body || {};

  const payload = {
    date: String(date || '').trim(),
    time: String(time || '18:00'),
    end: String(end || '19:00'),
    sport: String(sport || 'Tennis'),
    location: String(location || 'Rosegarden, Espoo'),
    host: String(host || 'Host'),
    description: String(description || 'PelaajaRingin viikoittainen pelivuoro.'),
    agenda: String(agenda || ''),
    maxPlayers: Number(maxPlayers || 8),
    pause: Number(pause) === 1 ? 1 : 0
  };

  if (!payload.date) {
    return res.status(400).json({ error: 'Päivämäärä puuttuu.' });
  }

  const result = await run(
    `INSERT INTO sessions (date, time, end_time, sport, location, host, max_players, description, agenda, pause)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [payload.date, payload.time, payload.end, payload.sport, payload.location, payload.host, payload.maxPlayers, payload.description, payload.agenda, payload.pause]
  );

  broadcastUpdate('session-created');

  const row = await get('SELECT * FROM sessions WHERE id = ?', [result.id]);
  const participants = await getSessionParticipants(row.id);
  return res.status(201).json(serializeSession(row, participants));
});

app.put('/api/sessions/:id', async (req, res) => {
  const sessionId = Number(req.params.id);
  const { date, time, end, sport, location, host, description, agenda, maxPlayers, pause } = req.body || {};

  if (!sessionId) {
    return res.status(400).json({ error: 'Virheellinen vuoron tunnus.' });
  }

  const current = await get('SELECT * FROM sessions WHERE id = ?', [sessionId]);
  if (!current) {
    return res.status(404).json({ error: 'Vuoroa ei löytynyt.' });
  }

  const payload = {
    date: String(date || current.date).trim(),
    time: String(time || current.time || '18:00'),
    end: String(end || current.end_time || '19:00'),
    sport: String(sport || current.sport || 'Tennis'),
    location: String(location || current.location || 'Rosegarden, Espoo'),
    host: String(host || current.host || 'Host'),
    description: String(description || current.description || 'PelaajaRingin viikoittainen pelivuoro.'),
    agenda: String(agenda || current.agenda || ''),
    maxPlayers: Number(maxPlayers || current.max_players || 8),
    pause: Number(pause) === 1 ? 1 : 0
  };

  await run(
    `UPDATE sessions SET date = ?, time = ?, end_time = ?, sport = ?, location = ?, host = ?, max_players = ?, description = ?, agenda = ?, pause = ? WHERE id = ?`,
    [payload.date, payload.time, payload.end, payload.sport, payload.location, payload.host, payload.maxPlayers, payload.description, payload.agenda, payload.pause, sessionId]
  );

  broadcastUpdate('session-updated');

  const row = await get('SELECT * FROM sessions WHERE id = ?', [sessionId]);
  const participants = await getSessionParticipants(sessionId);
  return res.json(serializeSession(row, participants));
});

app.post('/api/sessions/:id/toggle-participant', async (req, res) => {
  const { username, participantType, action } = req.body || {};
  const sessionId = Number(req.params.id);

  if (!username) {
    return res.status(400).json({ error: 'Käyttäjänimi puuttuu.' });
  }

  const normalizedType = participantType === 'network' ? 'network' : 'play';
  const mode = action === 'leave' ? 'leave' : action === 'join' ? 'join' : 'toggle';

  const user = await get('SELECT * FROM users WHERE username = ?', [username]);
  if (!user) {
    return res.status(404).json({ error: 'Käyttäjää ei löytynyt.' });
  }

  const session = await get('SELECT * FROM sessions WHERE id = ?', [sessionId]);
  if (!session) {
    return res.status(404).json({ error: 'Vuoroa ei löytynyt.' });
  }

  const current = await get('SELECT id, participant_type FROM participants WHERE session_id = ? AND user_id = ?', [sessionId, user.id]);
  const onCourtCount = await get('SELECT COUNT(*) AS total FROM participants WHERE session_id = ? AND participant_type != ?', [sessionId, 'network']);

  if (mode === 'leave') {
    if (current) {
      await run('DELETE FROM participants WHERE id = ?', [current.id]);
    }
  } else if (current) {
    if (normalizedType === 'play' && current.participant_type === 'network' && Number(onCourtCount.total) >= Number(session.max_players)) {
      return res.status(409).json({ error: 'Kentällä olevat paikat ovat täynnä.' });
    }
    await run('UPDATE participants SET participant_type = ? WHERE id = ?', [normalizedType, current.id]);
  } else {
    if (normalizedType === 'play' && Number(onCourtCount.total) >= Number(session.max_players)) {
      return res.status(409).json({ error: 'Vuoro on täynnä pelaajille.' });
    }
    await run('INSERT INTO participants (session_id, user_id, participant_type) VALUES (?, ?, ?)', [sessionId, user.id, normalizedType]);
  }

  broadcastUpdate('session-participant-changed');

  const updated = await get('SELECT * FROM sessions WHERE id = ?', [sessionId]);
  const participants = await getSessionParticipants(sessionId);
  return res.json(serializeSession(updated, participants));
});

app.delete('/api/sessions/:id', async (req, res) => {
  const sessionId = Number(req.params.id);
  if (!sessionId) {
    return res.status(400).json({ error: 'Virheellinen vuoron tunnus.' });
  }

  await run('DELETE FROM participants WHERE session_id = ?', [sessionId]);
  await run('DELETE FROM sessions WHERE id = ?', [sessionId]);
  broadcastUpdate('session-deleted');
  res.json({ ok: true });
});

app.get('/api/assets', async (_req, res) => {
  const rows = await all('SELECT * FROM assets WHERE active = 1 ORDER BY display_order ASC, id ASC');
  res.json(rows.map((asset) => ({
    id: asset.id,
    kind: asset.kind,
    name: asset.name,
    alt: asset.alt || asset.name,
    link: asset.link || '',
    imageUrl: `/uploads/${path.basename(asset.image_path)}`,
    active: Number(asset.active) === 1,
    displayOrder: asset.display_order
  })));
});

app.get('/api/events', (_req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
  realtimeClients.add(res);

  _req.on('close', () => {
    realtimeClients.delete(res);
  });
});

app.post('/api/assets', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Valitse kuva ennen lähettämistä.' });
    }

    const { kind, name, alt, link, displayOrder } = req.body || {};
    const validKind = kind === 'logo' || kind === 'ad' ? kind : 'logo';
    const imagePath = path.join('uploads', req.file.filename);

    const result = await run(
      `INSERT INTO assets (kind, name, image_path, alt, link, active, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [validKind, String(name || req.file.originalname || 'Brand'), imagePath, String(alt || ''), String(link || ''), 1, Number(displayOrder || 0)]
    );

    broadcastUpdate('asset-updated');

    const asset = await get('SELECT * FROM assets WHERE id = ?', [result.id]);
    return res.status(201).json({
      id: asset.id,
      kind: asset.kind,
      name: asset.name,
      alt: asset.alt || asset.name,
      link: asset.link || '',
      imageUrl: `/uploads/${path.basename(asset.image_path)}`,
      active: Number(asset.active) === 1,
      displayOrder: asset.display_order
    });
  } catch (error) {
    console.error('asset upload failed:', error);
    return res.status(500).json({ error: 'Kuvan tallennus epäonnistui.' });
  }
});

app.delete('/api/assets/:id', async (req, res) => {
  const assetId = Number(req.params.id);
  const asset = await get('SELECT * FROM assets WHERE id = ?', [assetId]);
  if (!asset) return res.status(404).json({ error: 'Mainosta tai logoa ei löytynyt.' });

  const imagePath = path.join(__dirname, asset.image_path);
  if (fs.existsSync(imagePath)) {
    fs.unlinkSync(imagePath);
  }

  await run('DELETE FROM assets WHERE id = ?', [assetId]);
  broadcastUpdate('asset-updated');
  return res.json({ ok: true });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

async function startServer() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`PelaajaRinki server running at http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
