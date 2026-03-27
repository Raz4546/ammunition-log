const express = require('express');
const router = express.Router();
const AmmoType = require('../models/AmmoType');
const Ammunition = require('../models/Ammunition');

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

    // Generate id from label: uppercase, spaces/specials → underscore
    const id = label.trim().toUpperCase()
      .replace(/[^A-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    const exists = await AmmoType.findOne({ id });
    if (exists) return res.status(409).json({ error: 'An ammo type with this name already exists' });

    const ammoType = await AmmoType.create({ id, label: label.trim(), category });

    // Initialize zero stock for all batteries
    const batteries = ['A', 'B', 'C', 'D'];
    for (const batteryId of batteries) {
      const existing = await Ammunition.findOne({ batteryId, ammoId: id });
      if (!existing) {
        await Ammunition.create({ batteryId, ammoId: id, quantity: 0 });
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

    // Remove all stock records for this ammo type
    await Ammunition.deleteMany({ ammoId: req.params.id });

    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
