const express = require("express");
const router = express.Router();
const {
    getAllProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct,
} = require("../controllers/product.controller");
const auth = require("../middleware/auth");
const admin = require("../middleware/admin");
const upload = require("../middleware/upload");
const { body } = require("express-validator");
const validate = require("../middleware/validate");

const productValidation = [
    body("name").notEmpty().withMessage("Name is required"),
    body("price").isFloat({ gt: 0 }).withMessage("Price must be greater than 0"),
    body("stock").isInt({ min: 0 }).withMessage("Stock must be an integer >= 0"),
];

router.get("/", getAllProducts);
router.get("/:id", getProductById);

router.post("/", auth, admin, upload.array("images", 5), productValidation, validate, createProduct);
router.put("/:id", auth, admin, upload.array("images", 5), productValidation, validate, updateProduct);
router.delete("/:id", auth, admin, deleteProduct);

module.exports = router;