const express = require('express');
const router = express.Router();
const Ammunition = require('../models/Ammunition');

// Get all ammunition stocks
router.get('/', async (req, res) => {
  try {
    const ammunition = await Ammunition.find();
    res.json(ammunition);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get ammunition for a specific team
router.get('/team/:teamId', async (req, res) => {
  try {
    const ammunition = await Ammunition.find({ teamId: req.params.teamId });
    res.json(ammunition);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
