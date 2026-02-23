require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const Razorpay = require('razorpay');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files (except PDFs - they are in private folder)
app.use(express.static('public'));

// Test email endpoint
app.get('/api/test-email', async (req, res) => {
  try {
    const testMailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: 'TNPSC Materials - Email Test',
      html: '<h1>Email Test Successful!</h1><p>If you receive this email, the email system is working correctly.</p>'
    };
    
    await transporter.sendMail(testMailOptions);
    res.json({ success: true, message: 'Test email sent successfully!' });
  } catch (error) {
    console.error('Email error:', error);
    res.json({ success: false, error: error.message });
  }
});

// Initialize Razorpay (Replace with your actual keys)
const razorpay = new Razorpay({
  key_id: 'YOUR_RAZORPAY_KEY_ID',
  key_secret: 'YOUR_RAZORPAY_KEY_SECRET'
});

// Email transporter - USE ENVIRONMENT VARIABLES IN PRODUCTION
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'your-email@gmail.com',
    pass: process.env.EMAIL_PASS || 'your-app-password'
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Data file paths
const PRODUCTS_FILE = path.join(__dirname, 'data', 'products.json');
const ORDERS_FILE = path.join(__dirname, 'data', 'orders.json');

// PDF Storage folder (PRIVATE - not accessible via public URL)
const PDF_STORAGE = path.join(__dirname, 'pdf-storage');

// Helper functions
function readJSONFile(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

function writeJSONFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// API Routes

// Get all products (without PDF paths)
app.get('/api/products', (req, res) => {
  const products = readJSONFile(PRODUCTS_FILE);
  // Remove sensitive info
  const safeProducts = products.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price,
    originalPrice: p.originalPrice,
    image: p.image,
    category: p.category,
    featured: p.featured,
    inStock: p.inStock,
    paymentLink: p.paymentLink
  }));
  res.json(safeProducts);
});

// Get single product
app.get('/api/product/:id', (req, res) => {
  const products = readJSONFile(PRODUCTS_FILE);
  const product = products.find(p => p.id === req.params.id);
  if (product) {
    // Remove sensitive info
    const safeProduct = { ...product };
    delete safeProduct.pdfFile;
    delete safeProduct.pdfFolder;
    res.json(safeProduct);
  } else {
    res.status(404).json({ error: 'Product not found' });
  }
});

// Create Razorpay order
app.post('/api/create-order', async (req, res) => {
  try {
    const { amount, currency = 'INR', productId, productName, customerEmail, customerName } = req.body;

    // Verify product exists and amount matches
    const products = readJSONFile(PRODUCTS_FILE);
    const product = products.find(p => p.id === productId);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Verify amount matches product price (security check)
    if (product.price !== parseInt(amount)) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const orderOptions = {
      amount: amount * 100, // Convert to paise
      currency,
      receipt: `receipt_${uuidv4().slice(0, 8)}`,
      notes: {
        productId,
        productName,
        customerEmail,
        customerName
      }
    };

    const order = await razorpay.orders.create(orderOptions);
    res.json(order);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Verify payment and send email
app.post('/api/verify-payment', async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, productId, customerEmail, customerName, amount } = req.body;

    // Get product details
    const products = readJSONFile(PRODUCTS_FILE);
    const product = products.find(p => p.id === productId);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Verify amount matches
    if (product.price !== parseInt(amount)) {
      return res.status(400).json({ error: 'Payment amount mismatch' });
    }

    // Create order record
    const orders = readJSONFile(ORDERS_FILE);
    const newOrder = {
      id: `order_${uuidv4().slice(0, 8)}`,
      razorpayOrderId,
      razorpayPaymentId,
      productId,
      productName: product.name,
      customerEmail,
      customerName,
      amount: product.price,
      status: 'completed',
      createdAt: new Date().toISOString()
    };
    orders.push(newOrder);
    writeJSONFile(ORDERS_FILE, orders);

    // Get PDF files to attach
    const pdfFolder = path.join(PDF_STORAGE, product.pdfFile);
    let attachments = [];
    
    if (product.pdfFolder && fs.existsSync(pdfFolder)) {
      // Attach all PDFs from folder
      const files = fs.readdirSync(pdfFolder).filter(f => f.toLowerCase().endsWith('.pdf'));
      attachments = files.map(file => ({
        filename: file,
        path: path.join(pdfFolder, file)
      }));
    } else if (!product.pdfFolder) {
      // Single PDF file
      const pdfPath = path.join(PDF_STORAGE, product.pdfFile);
      if (fs.existsSync(pdfPath)) {
        attachments = [{
          filename: product.pdfFile,
          path: pdfPath
        }];
      }
    }

    // Send confirmation email with PDF
    let mailOptions = {
      from: process.env.EMAIL_USER || 'TNPSC Materials <your-email@gmail.com>',
      to: customerEmail,
      subject: `Order Confirmed - ${product.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">TNPSC Materials</h1>
          </div>
          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #333;">Order Confirmed! 🎉</h2>
            <p>Dear <strong>${customerName}</strong>,</p>
            <p>Thank you for your purchase! Your order has been successfully processed.</p>
            
            <div style="background: white; padding: 20px; border-radius: 10px; margin: 20px 0;">
              <h3 style="color: #667eea; margin-top: 0;">Order Details</h3>
              <p><strong>Order ID:</strong> ${newOrder.id}</p>
              <p><strong>Product:</strong> ${product.name}</p>
              <p><strong>Amount Paid:</strong> ₹${product.price}</p>
              <p><strong>Date:</strong> ${new Date().toLocaleDateString('en-IN')}</p>
            </div>
            
            <p>Your PDF notes are attached to this email. Please download and save them for your TNPSC exam preparation.</p>
            
            <div style="background: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0; color: #2e7d32;"><strong>📚 Happy Studying!</strong></p>
              <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">Best of luck for your TNPSC exam!</p>
            </div>
          </div>
          <div style="background: #333; color: white; padding: 15px; text-align: center;">
            <p style="margin: 0; font-size: 12px;">© 2024 TNPSC Materials. All rights reserved.</p>
          </div>
        </div>
      `,
      attachments: attachments
    };

    await transporter.sendMail(mailOptions);

    res.json({ success: true, order: newOrder });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ error: 'Failed to process payment' });
  }
});

// Get all orders (Admin)
app.get('/api/orders', (req, res) => {
  const orders = readJSONFile(ORDERS_FILE);
  res.json(orders.reverse());
});

// Add new product (Admin)
app.post('/api/products', (req, res) => {
  try {
    const products = readJSONFile(PRODUCTS_FILE);
    const newProduct = {
      id: `prod_${uuidv4().slice(0, 8)}`,
      ...req.body,
      featured: req.body.featured || false,
      inStock: req.body.inStock !== false
    };
    products.push(newProduct);
    writeJSONFile(PRODUCTS_FILE, products);
    res.json(newProduct);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add product' });
  }
});

// Update product (Admin)
app.put('/api/products/:id', (req, res) => {
  try {
    const products = readJSONFile(PRODUCTS_FILE);
    const index = products.findIndex(p => p.id === req.params.id);
    if (index !== -1) {
      products[index] = { ...products[index], ...req.body };
      writeJSONFile(PRODUCTS_FILE, products);
      res.json(products[index]);
    } else {
      res.status(404).json({ error: 'Product not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete product (Admin)
app.delete('/api/products/:id', (req, res) => {
  try {
    const products = readJSONFile(PRODUCTS_FILE);
    const filtered = products.filter(p => p.id !== req.params.id);
    writeJSONFile(PRODUCTS_FILE, filtered);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Admin Login API
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  
  // Admin credentials from environment variables
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASS || 'admin123';
  
  if (username === adminUser && password === adminPass) {
    const token = uuidv4();
    res.json({ success: true, token });
  } else {
    res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
});

// Admin authentication middleware
function requireAuth(req, res, next) {
  const token = req.headers.authorization;
  if (token) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/products', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'products.html'));
});

app.get('/cart', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cart.html'));
});

app.get('/checkout', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'checkout.html'));
});

app.get('/success', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'success.html'));
});

app.get('/payment', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'payment.html'));
});

app.get('/admin/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.get('/admin/products', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'products.html'));
});

app.get('/admin/orders', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'orders.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
  console.log(`PDF Storage: ${PDF_STORAGE}`);
});
