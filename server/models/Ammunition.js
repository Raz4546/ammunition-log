const mongoose = require('mongoose');

const AmmunitionSchema = new mongoose.Schema({
  teamId: {
    type: String,
    required: true,
  },
  ammoId: {
    type: String,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

AmmunitionSchema.index({ teamId: 1, ammoId: 1 }, { unique: true });

module.exports = mongoose.model('Ammunition', AmmunitionSchema);
