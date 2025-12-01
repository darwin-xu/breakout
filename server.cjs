const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 4000;
const MAX_SNAPSHOTS = parseInt(process.env.MAX_SNAPSHOTS || '500', 10);
const DATA_DIR = path.join(__dirname, 'data');
const SNAPSHOT_FILE = path.join(DATA_DIR, 'snapshots.json');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(SNAPSHOT_FILE)) {
    fs.writeFileSync(SNAPSHOT_FILE, '[]', 'utf8');
  }
}

function loadSnapshots() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(SNAPSHOT_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to read snapshots file', err);
    return [];
  }
}

function saveSnapshots(snapshots) {
  ensureDataFile();
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshots, null, 2), 'utf8');
}

function validatePayload(body) {
  if (!body || typeof body !== 'object') {
    return 'Missing JSON body';
  }

  const { episode, stats, snapshot } = body;

  if (typeof episode !== 'number' || Number.isNaN(episode)) {
    return 'episode must be a number';
  }

  if (!stats || typeof stats !== 'object') {
    return 'stats object is required';
  }

  if (!snapshot || typeof snapshot !== 'object') {
    return 'snapshot object is required';
  }

  return null;
}

app.get('/api/training-snapshots/latest', (req, res) => {
  const snapshots = loadSnapshots();
  if (!snapshots.length) {
    return res.status(404).json({ message: 'No snapshots stored yet' });
  }
  return res.json(snapshots[snapshots.length - 1]);
});

app.get('/api/training-snapshots', (req, res) => {
  const limit = Math.max(1, Math.min(parseInt(req.query.limit || '20', 10), 200));
  const snapshots = loadSnapshots();
  const start = Math.max(0, snapshots.length - limit);
  const slice = snapshots.slice(start).map((entry) => ({
    id: entry.id,
    timestamp: entry.timestamp,
    episode: entry.episode,
    stats: entry.stats,
  }));
  return res.json(slice);
});

app.post('/api/training-snapshots', (req, res) => {
  const error = validatePayload(req.body);
  if (error) {
    return res.status(400).json({ message: error });
  }

  const snapshots = loadSnapshots();
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    episode: req.body.episode,
    stats: req.body.stats,
    snapshot: req.body.snapshot,
  };

  snapshots.push(entry);
  if (snapshots.length > MAX_SNAPSHOTS) {
    snapshots.splice(0, snapshots.length - MAX_SNAPSHOTS);
  }
  saveSnapshots(snapshots);

  return res.status(201).json({ id: entry.id, timestamp: entry.timestamp });
});

app.listen(PORT, () => {
  console.log(`Snapshot server listening on http://localhost:${PORT}`);
});
