const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  batteryId: {
    type: String,
    required: true,
    enum: ['A', 'B', 'C', 'D']
  },
  batteryName: String,
  ammoId: {
    type: String,
    required: true,
  },
  ammoLabel: String,
  type: {
    type: String,
    required: true,
    enum: ['ADD', 'SUB']
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  before: Number,
  after: Number,
  note: String,
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, { timestamps: true });

// Index for quick filtering by battery and time
TransactionSchema.index({ batteryId: 1, timestamp: -1 });

module.exports = mongoose.model('Transaction', TransactionSchema);
