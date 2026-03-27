const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Ammunition  = require('../models/Ammunition');

// Get transactions (optionally filtered by teamId or batteryId)
router.get('/', async (req, res) => {
  try {
    const { teamId, batteryId, limit = 200 } = req.query;
    const query = {};
    if (teamId)    query.teamId    = teamId;
    if (batteryId) query.batteryId = batteryId;

    const transactions = await Transaction.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a transaction
router.post('/', async (req, res) => {
  try {
    const { teamId, batteryId, ammoId, type, quantity, note, teamName, batteryName, ammoLabel } = req.body;

    if (!teamId || !ammoId || !type || !quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Invalid transaction data' });
    }

    let ammo = await Ammunition.findOne({ teamId, ammoId });
    if (!ammo) {
      // Auto-create stock record at 0 if missing (handles edge cases)
      ammo = await Ammunition.create({ teamId, ammoId, quantity: 0 });
    }

    const before = ammo.quantity;
    let after;

    if (type === 'ADD') {
      after = before + quantity;
    } else if (type === 'SUB') {
      if (before < quantity) {
        return res.status(400).json({ error: 'Insufficient ammunition' });
      }
      after = before - quantity;
    } else {
      return res.status(400).json({ error: 'Invalid transaction type' });
    }

    ammo.quantity = after;
    ammo.lastUpdated = Date.now();
    await ammo.save();

    const transaction = await Transaction.create({
      teamId, batteryId, ammoId, type, quantity, note,
      teamName, batteryName, ammoLabel, before, after,
    });

    res.status(201).json(transaction);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
