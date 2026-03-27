const mongoose = require('mongoose');

const TeamSchema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true },
  name:      { type: String, required: true },
  batteryId: { type: String, required: true },
  callsign:  { type: String, required: true },
}, { timestamps: true });

TeamSchema.index({ batteryId: 1 });

module.exports = mongoose.model('Team', TeamSchema);
