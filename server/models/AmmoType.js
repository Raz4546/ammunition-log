const mongoose = require('mongoose');

const AmmoTypeSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
  },
  label: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    required: true,
    enum: ['shell', 'propellant', 'fuze'],
  },
}, { timestamps: true });

module.exports = mongoose.model('AmmoType', AmmoTypeSchema);
