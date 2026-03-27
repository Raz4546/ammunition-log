const express = require('express');
const router = express.Router();
const Team       = require('../models/Team');
const Battery    = require('../models/Battery');
const AmmoType   = require('../models/AmmoType');
const Ammunition = require('../models/Ammunition');

function slugify(str) {
  return str.toUpperCase().replace(/[^A-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

// List all teams
router.get('/', async (req, res) => {
  try {
    const teams = await Team.find().sort({ batteryId: 1, createdAt: 1 });
    res.json(teams);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a team under a battery
router.post('/', async (req, res) => {
  try {
    const { name, batteryId } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    if (!batteryId) return res.status(400).json({ error: 'batteryId is required' });

    const battery = await Battery.findOne({ id: batteryId });
    if (!battery) return res.status(404).json({ error: 'Battery not found' });

    // id = batteryId + slug of name
    const id = `${batteryId}_${slugify(name.trim())}`;
    const exists = await Team.findOne({ id });
    if (exists) return res.status(409).json({ error: 'A team with this name already exists in this battery' });

    // callsign: battery prefix + team name
    const btyPrefix = battery.callsign.split('-')[0];
    const callsign = `${btyPrefix}-${slugify(name.trim()).replace(/_/g, '')}`;

    const team = await Team.create({ id, name: name.trim(), batteryId, callsign });

    // Init zero-stock entries for every existing ammo type
    const ammoTypes = await AmmoType.find();
    for (const ammoType of ammoTypes) {
      await Ammunition.findOneAndUpdate(
        { teamId: id, ammoId: ammoType.id },
        { $setOnInsert: { teamId: id, ammoId: ammoType.id, quantity: 0 } },
        { upsert: true, new: true }
      );
    }

    res.status(201).json(team);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a team (removes ammo records too)
router.delete('/:id', async (req, res) => {
  try {
    const team = await Team.findOneAndDelete({ id: req.params.id });
    if (!team) return res.status(404).json({ error: 'Team not found' });
    await Ammunition.deleteMany({ teamId: req.params.id });
    res.json({ message: 'Team deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
