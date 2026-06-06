const Product = require('../models/product.model');
const { uploadToCloudinary, deleteFromCloudinary } = require("../utils/uploadUtils");


const getAllProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.category) query.category = req.query.category;
    if (req.query.q) {
      const escaped = req.query.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.name = { $regex: escaped, $options: "i" };
    }

    const total = await Product.countDocuments(query);
    const products = await Product.find(query).skip(skip).limit(limit);

    res.status(200).json({ success: true, products, page, totalPages: Math.ceil(total/limit), total });
  } catch (error) {
    console.log("Error in fetching products: ", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found!" })
    }
    res.status(200).json({ success: true, product })
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

const createProduct = async (req, res) => {
  try {
    const { name, description, price, stock, category, discountPercent, discountPrice } = req.body;

    let dPercent = discountPercent ? Number(discountPercent) : 0;
    let dPrice = discountPrice ? Number(discountPrice) : 0;
    
    if (dPrice > 0 && dPrice >= Number(price)) {
      return res.status(400).json({ success: false, message: "Discount price must be less than the original price" });
    }

    let images = [];
    if (req.files && req.files.length > 0) {
      const uploadPromises = req.files.map((file) => uploadToCloudinary(file.buffer));
      images = await Promise.all(uploadPromises);
    }

    const product = await Product.create({
      name,
      description,
      price,
      discountPercent: dPercent,
      discountPrice: dPrice,
      stock,
      category,
      images,
    });

    res.status(201).json({ success: true, product });
  } catch (error) {
    console.error("Error creating product:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { name, description, price, stock, category, discountPercent, discountPrice } = req.body;
    
    let dPercent = discountPercent ? Number(discountPercent) : 0;
    let dPrice = discountPrice ? Number(discountPrice) : 0;

    if (dPrice > 0 && dPrice >= Number(price)) {
      return res.status(400).json({ success: false, message: "Discount price must be less than the original price" });
    }

    const updateData = { name, description, price, stock, category, discountPercent: dPercent, discountPrice: dPrice };

    if (req.files && req.files.length > 0) {
      const uploadPromises = req.files.map((file) => uploadToCloudinary(file.buffer));
      updateData.images = await Promise.all(uploadPromises);

      // Clean up old images
      const oldProduct = await Product.findById(req.params.id);
      if (oldProduct && oldProduct.images) {
        oldProduct.images.forEach((img) => deleteFromCloudinary(img));
      }
    }

    const product = await Product.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
    });

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    res.status(200).json({ success: true, product });
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    
    // Delete images from Cloudinary
    if (product.images && product.images.length > 0) {
      product.images.forEach((img) => deleteFromCloudinary(img));
    }

    res.status(200).json({ success: true, message: "Product deleted" });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
};