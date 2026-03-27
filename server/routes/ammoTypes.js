const express = require('express');
const router = express.Router();
const AmmoType   = require('../models/AmmoType');
const Ammunition = require('../models/Ammunition');
const Team       = require('../models/Team');

function slugify(str) {
  return str.trim().toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

// Get all ammo types
router.get('/', async (req, res) => {
  try {
    const types = await AmmoType.find().sort({ category: 1, label: 1 });
    res.json(types);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create ammo type
router.post('/', async (req, res) => {
  try {
    const { label, category } = req.body;
    if (!label || !label.trim()) return res.status(400).json({ error: 'Label is required' });
    if (!['shell', 'propellant', 'fuze'].includes(category)) {
      return res.status(400).json({ error: 'Category must be shell, propellant, or fuze' });
    }

    const id = slugify(label);
    const exists = await AmmoType.findOne({ id });
    if (exists) return res.status(409).json({ error: 'An ammo type with this name already exists' });

    const ammoType = await AmmoType.create({ id, label: label.trim(), category });

    // Initialize zero stock for every existing team
    const teams = await Team.find();
    for (const team of teams) {
      const existing = await Ammunition.findOne({ teamId: team.id, ammoId: id });
      if (!existing) {
        await Ammunition.create({ teamId: team.id, ammoId: id, quantity: 0 });
      }
    }

    res.status(201).json(ammoType);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete ammo type
router.delete('/:id', async (req, res) => {
  try {
    const ammoType = await AmmoType.findOneAndDelete({ id: req.params.id });
    if (!ammoType) return res.status(404).json({ error: 'Ammo type not found' });
    await Ammunition.deleteMany({ ammoId: req.params.id });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
