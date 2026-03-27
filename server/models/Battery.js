const mongoose = require('mongoose');

const PALETTE = [
  "#e85d04","#38bdf8","#a3e635","#f472b6",
  "#facc15","#818cf8","#34d399","#fb923c",
  "#e879f9","#22d3ee",
];

const BatterySchema = new mongoose.Schema({
  id:       { type: String, required: true, unique: true },
  name:     { type: String, required: true },
  callsign: { type: String, required: true },
  color:    { type: String, required: true },
  active:   { type: Boolean, default: true },
  redLines: { type: [{
    id:        { type: String, required: true },
    label:     { type: String, default: "" },
    ammoIds:   { type: [String], default: [] },
    threshold: { type: Number,  default: 0  },
  }], default: [] },
}, { timestamps: true });

BatterySchema.statics.PALETTE = PALETTE;

module.exports = mongoose.model('Battery', BatterySchema);
