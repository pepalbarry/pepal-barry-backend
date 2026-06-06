const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
      name: { type: String, required: true },
      description: String,
      price: { type: Number, required: true },
      discountPercent: { type: Number, min: 0, max: 100, default: 0 },
      discountPrice: { type: Number, min: 0 },
      stock: { type: Number, required: true },
      images: [{ type: String }],
      category: { type: String, default: "General" },

}, { timestamps: true })

module.exports = mongoose.model("product", productSchema);