const express = require('express');
const router  = express.Router();
const Battery     = require('../models/Battery');
const Team        = require('../models/Team');
const AmmoType    = require('../models/AmmoType');
const Ammunition  = require('../models/Ammunition');
const Transaction = require('../models/Transaction');

const RESET_PASSWORD = '8157E';

const MODEL_MAP = {
  batteries:    Battery,
  teams:        Team,
  ammoTypes:    AmmoType,
  ammunition:   Ammunition,
  transactions: Transaction,
};

// POST /api/reset/partial  { password, collections: ["batteries","teams",...] }
router.post('/partial', async (req, res) => {
  const { password, collections } = req.body;
  if (password !== RESET_PASSWORD) return res.status(403).json({ error: 'Invalid password' });
  if (!Array.isArray(collections) || collections.length === 0)
    return res.status(400).json({ error: 'No collections specified' });

  const invalid = collections.filter(c => !MODEL_MAP[c]);
  if (invalid.length) return res.status(400).json({ error: `Unknown collections: ${invalid.join(', ')}` });

  const result = {};
  for (const col of collections) {
    const r = await MODEL_MAP[col].deleteMany({});
    result[col] = r.deletedCount;
  }
  res.json({ ok: true, deleted: result });
});

// POST /api/reset/full  { password }
router.post('/full', async (req, res) => {
  const { password } = req.body;
  if (password !== RESET_PASSWORD) return res.status(403).json({ error: 'Invalid password' });

  const result = {};
  for (const [col, Model] of Object.entries(MODEL_MAP)) {
    const r = await Model.deleteMany({});
    result[col] = r.deletedCount;
  }
  res.json({ ok: true, deleted: result });
});

module.exports = router;
