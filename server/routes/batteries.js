const express = require('express');
const router = express.Router();
const Battery = require('../models/Battery');
const Team    = require('../models/Team');
const Ammunition = require('../models/Ammunition');
const Transaction = require('../models/Transaction');

const PALETTE = Battery.PALETTE;

function slugify(str) {
  return str.toUpperCase().replace(/[^A-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

// List all batteries
router.get('/', async (req, res) => {
  try {
    const batteries = await Battery.find().sort({ createdAt: 1 });
    res.json(batteries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a battery
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });

    const id = slugify(name.trim());
    const exists = await Battery.findOne({ id });
    if (exists) return res.status(409).json({ error: 'A battery with this name already exists' });

    // Auto callsign: last word of name + "-6"
    const words = name.trim().split(/\s+/);
    const callsign = words[words.length - 1].toUpperCase() + '-6';

    // Auto color from palette
    const count = await Battery.countDocuments();
    const color = PALETTE[count % PALETTE.length];

    const battery = await Battery.create({ id, name: name.trim(), callsign, color });
    res.status(201).json(battery);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update battery red line
router.put('/:id/redline', async (req, res) => {
  try {
    const { ammoIds, threshold } = req.body;
    const battery = await Battery.findOneAndUpdate(
      { id: req.params.id },
      { redLine: { ammoIds: ammoIds || [], threshold: threshold || 0 } },
      { new: true }
    );
    if (!battery) return res.status(404).json({ error: 'Battery not found' });
    res.json(battery);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a battery (cascades to teams + ammo)
router.delete('/:id', async (req, res) => {
  try {
    const battery = await Battery.findOneAndDelete({ id: req.params.id });
    if (!battery) return res.status(404).json({ error: 'Battery not found' });

    // Find all teams in this battery and remove their ammo
    const teams = await Team.find({ batteryId: req.params.id });
    for (const team of teams) {
      await Ammunition.deleteMany({ teamId: team.id });
    }
    await Team.deleteMany({ batteryId: req.params.id });

    res.json({ message: 'Battery and all its teams deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
