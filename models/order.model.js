const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema(
  {
    fullName: String,
    phoneNumber: String,
    houseNo: String,
    address: String,
    landmark: String,
    city: String,
    state: String,
    pincode: String,
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    products: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "product" },
        quantity: { type: Number, required: true },
        priceAtPurchase: { type: Number },
      },
    ],
    totalAmount: { type: Number, required: true },
    mode: {
      type: String,
      enum: ["Cash On Delivery", "Razorpay"],
      default: "Razorpay",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid"],
      default: "pending",
    },
    deliveryStatus: {
      type: String,
      enum: ["Processing", "Shipped", "Delivered", "Cancelled"],
      default: "Processing",
    },
    shippingAddress: addressSchema,
    razorpayOrderId: String,
    razorpayPaymentId: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("order", orderSchema);
