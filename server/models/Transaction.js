const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  teamId:      { type: String, required: true },
  batteryId:   { type: String },          // battery reference for aggregation
  teamName:    { type: String },
  batteryName: { type: String },
  ammoId:      { type: String, required: true },
  ammoLabel:   { type: String },
  type: {
    type: String,
    required: true,
    enum: ['ADD', 'SUB'],
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  before:    { type: Number },
  after:     { type: Number },
  note:      { type: String },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
}, { timestamps: true });

TransactionSchema.index({ teamId: 1, timestamp: -1 });
TransactionSchema.index({ batteryId: 1, timestamp: -1 });

module.exports = mongoose.model('Transaction', TransactionSchema);
