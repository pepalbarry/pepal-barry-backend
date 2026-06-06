const crypto = require("crypto");
const Order = require("../models/order.model");
const User = require("../models/user.model");
const Product = require("../models/product.model");
const razorpay = require("../config/razorpay");

const MAX_QUANTITY_PER_ITEM = 10;

const getEffectivePrice = (product) => {
  if (product.discountPrice && product.discountPrice > 0) {
    return product.discountPrice;
  }
  if (product.discountPercent && product.discountPercent > 0) {
    return product.price - (product.price * product.discountPercent) / 100;
  }
  return product.price;
};

const createCODOrder = async (req, res) => {
  try {
    const { products, address } = req.body;
    if (!products?.length || !address) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid order payload" });
    }

    let calculatedTotalAmount = 0;
    const finalProducts = [];
    for (const item of products) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res
          .status(400)
          .json({ success: false, message: "One or more products not found" });
      }
      const qty = Math.min(
        MAX_QUANTITY_PER_ITEM,
        Math.max(1, Number(item.quantity) || 1)
      );
      if (product.stock < qty) {
        return res.status(400).json({
          success: false,
          message:
            product.stock <= 0
              ? `"${product.name}" is currently out of stock`
              : `"${product.name}" has only ${product.stock} item(s) in stock`,
        });
      }
      const effectivePrice = getEffectivePrice(product);
      calculatedTotalAmount += effectivePrice * qty;
      finalProducts.push({
        productId: item.productId,
        quantity: qty,
        priceAtPurchase: effectivePrice,
      });
    }

    if (calculatedTotalAmount === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid products in order" });
    }

    if (
      req.body.totalAmount !== undefined &&
      calculatedTotalAmount !== Number(req.body.totalAmount)
    ) {
      return res.status(400).json({
        success: false,
        message: "Total amount mismatch. Order rejected.",
      });
    }

    // Decrement stock for each product
    for (const item of finalProducts) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { stock: -item.quantity },
      });
    }

    let order = await Order.create({
      user: req.user.userId,
      products: finalProducts,
      totalAmount: calculatedTotalAmount,
      shippingAddress: address,
      mode: "Cash On Delivery",
    });

    order = await order.populate("products.productId");


    res.status(201).json({ success: true, order });
  } catch (error) {
    console.error("COD order creation failed", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const createRazorpayOrder = async (req, res) => {
  try {
    const { products, address } = req.body;
    if (!products?.length || !address) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid order payload" });
    }

    let calculatedTotalAmount = 0;
    const finalProducts = [];
    for (const item of products) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res
          .status(400)
          .json({ success: false, message: "One or more products not found" });
      }
      const qty = Math.min(
        MAX_QUANTITY_PER_ITEM,
        Math.max(1, Number(item.quantity) || 1)
      );
      if (product.stock < qty) {
        return res.status(400).json({
          success: false,
          message:
            product.stock <= 0
              ? `"${product.name}" is currently out of stock`
              : `"${product.name}" has only ${product.stock} item(s) in stock`,
        });
      }
      const effectivePrice = getEffectivePrice(product);
      calculatedTotalAmount += effectivePrice * qty;
      finalProducts.push({
        productId: item.productId,
        quantity: qty,
        priceAtPurchase: effectivePrice,
      });
    }

    if (calculatedTotalAmount === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid products in order" });
    }

    if (
      req.body.totalAmount !== undefined &&
      calculatedTotalAmount !== Number(req.body.totalAmount)
    ) {
      return res.status(400).json({
        success: false,
        message: "Total amount mismatch. Order rejected.",
      });
    }

    // Decrement stock for each product
    for (const item of finalProducts) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { stock: -item.quantity },
      });
    }

    const amountInPaise = Math.round(calculatedTotalAmount * 100);
    const isDemoMode =
      !process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET;

    let razorpayOrder = {
      id: `demo_${Date.now()}`,
      amount: amountInPaise,
      currency: "INR",
    };

    if (!isDemoMode) {
      razorpayOrder = await razorpay.orders.create({
        amount: amountInPaise,
        currency: "INR",
        receipt: `pepalbarry_${Date.now()}`,
      });
    } else {
      console.warn(
        "WARNING: Razorpay keys missing. Running payment in demo mode."
      );
    }

    const order = await Order.create({
      user: req.user.userId,
      products: finalProducts,
      totalAmount: calculatedTotalAmount,
      shippingAddress: address,
      razorpayOrderId: razorpayOrder.id,
      paymentStatus: "pending",
      mode: "Razorpay",
    });


    res.status(201).json({
      success: true,
      orderId: order._id,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key: process.env.RAZORPAY_KEY_ID || "rzp_test_demoKey",
      demo: isDemoMode,
    });
  } catch (error) {
    console.error("Razorpay order creation failed", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const verifyRazorpayPayment = async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, orderId } =
      req.body;

    const isDemoMode =
      !process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET;

    if (!isDemoMode) {
      const generatedSignature = crypto
        .createHmac(
          "sha256",
          process.env.RAZORPAY_KEY_SECRET || "demoSecret"
        )
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");

      if (generatedSignature !== razorpay_signature) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid payment signature" });
      }
    }

    const query = { _id: orderId, razorpayOrderId: razorpay_order_id };
    if (req.user.role !== "admin") {
      query.user = req.user.userId;
    }

    const order = await Order.findOneAndUpdate(
      query,
      {
        paymentStatus: "paid",
        razorpayPaymentId: razorpay_payment_id,
      },
      { new: true }
    ).populate("products.productId");

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    res.status(200).json({ success: true, order });
  } catch (error) {
    console.error("Payment verification failed", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const getUserOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      user: req.user.userId,
      $or: [
        { mode: "Cash On Delivery" },
        { mode: "Razorpay", paymentStatus: "paid" },
      ],
    })
      .populate("products.productId")
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, orders });
  } catch (error) {
    console.error("Fetching orders failed", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const getAllOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = {
      $or: [
        { mode: "Cash On Delivery" },
        { mode: "Razorpay", paymentStatus: "paid" },
      ],
    };

    if (req.query.status) query.deliveryStatus = req.query.status;
    if (req.query.paymentStatus) query.paymentStatus = req.query.paymentStatus;
    if (req.query.q && req.query.q.length === 24) {
      query._id = req.query.q;
    }

    const total = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .populate("products.productId")
      .populate("user", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({ success: true, orders, page, totalPages: Math.ceil(total/limit), total });
  } catch (error) {
    console.error("Fetching all orders failed", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { status, paymentStatus } = req.body;
    const updateData = {};

    if (status) updateData.deliveryStatus = status;
    if (paymentStatus) updateData.paymentStatus = paymentStatus;

    // If cancelling, restore stock before updating
    if (status === "Cancelled") {
      const existingOrder = await Order.findById(req.params.id);
      if (existingOrder && existingOrder.deliveryStatus !== "Cancelled") {
        for (const item of existingOrder.products) {
          await Product.findByIdAndUpdate(item.productId, {
            $inc: { stock: item.quantity },
          });
        }
      }
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    res.status(200).json({ success: true, order });
  } catch (error) {
    console.error("Updating order status failed", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const handleRazorpayWebhook = async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      console.error("RAZORPAY_WEBHOOK_SECRET is not configured");
      return res
        .status(500)
        .json({ success: false, message: "Webhook not configured" });
    }

    const signature = req.headers["x-razorpay-signature"];
    if (!signature) {
      return res
        .status(400)
        .json({ success: false, message: "Missing signature" });
    }

    // req.body is a raw Buffer from express.raw() — use it directly for HMAC
    const generatedSignature = crypto
      .createHmac("sha256", secret)
      .update(req.body)
      .digest("hex");

    if (generatedSignature !== signature) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid signature" });
    }

    // Parse the raw Buffer into a JSON object
    const event = JSON.parse(req.body.toString());

    if (event.event === "payment.captured") {
      const { order_id, id: payment_id } = event.payload.payment.entity;

      const order = await Order.findOneAndUpdate(
        { razorpayOrderId: order_id },
        {
          paymentStatus: "paid",
          razorpayPaymentId: payment_id,
        },
        { new: true }
      );

      if (order) {
        console.log(`Order ${order._id} marked as paid via webhook`);
      } else {
        console.warn(`Order not found for Razorpay Order ID: ${order_id}`);
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Webhook processing failed", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  createCODOrder,
  createRazorpayOrder,
  verifyRazorpayPayment,
  getUserOrders,
  getAllOrders,
  updateOrderStatus,
  handleRazorpayWebhook,
};
