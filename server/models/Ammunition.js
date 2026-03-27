const mongoose = require('mongoose');

const AmmunitionSchema = new mongoose.Schema({
  batteryId: {
    type: String,
    required: true,
    enum: ['A', 'B', 'C', 'D']
  },
  ammoId: {
    type: String,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Compound index for battery + ammo combination
AmmunitionSchema.index({ batteryId: 1, ammoId: 1 }, { unique: true });

module.exports = mongoose.model('Ammunition', AmmunitionSchema);
