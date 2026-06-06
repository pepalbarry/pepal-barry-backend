const express = require("express");
const { body } = require("express-validator");
const validate = require("../middleware/validate");
const {
  createCODOrder,
  createRazorpayOrder,
  verifyRazorpayPayment,
  getUserOrders,
  getAllOrders,
  updateOrderStatus,
  handleRazorpayWebhook,
} = require("../controllers/order.controller");
const auth = require("../middleware/auth");
const admin = require("../middleware/admin");

const router = express.Router();

const orderCreationValidation = [
  body("products").isArray({ min: 1 }).withMessage("Products array is required"),
  body("products.*.productId").isMongoId().withMessage("Invalid product ID"),
  body("products.*.quantity").isInt({ min: 1 }).withMessage("Quantity must be at least 1"),
];

const statusUpdateValidation = [
  body("status").optional().isIn(["Processing", "Shipped", "Delivered", "Cancelled"]).withMessage("Invalid delivery status"),
  body("paymentStatus").optional().isIn(["pending", "paid"]).withMessage("Invalid payment status"),
];

router.get("/", auth, getUserOrders);
router.post("/cod", auth, orderCreationValidation, validate, createCODOrder);
router.post("/create-payment", auth, orderCreationValidation, validate, createRazorpayOrder);
router.post("/verify-payment", auth, verifyRazorpayPayment);
router.post("/webhook", handleRazorpayWebhook);

// Admin Routes
router.get("/all", auth, admin, getAllOrders);
router.put("/:id/status", auth, admin, statusUpdateValidation, validate, updateOrderStatus);

module.exports = router;

