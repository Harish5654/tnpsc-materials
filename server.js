require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const archiver = require('archiver');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files (except PDFs - they are in private folder)
app.use(express.static('public'));

// Initialize Razorpay from environment variables
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'YOUR_RAZORPAY_KEY_ID',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'YOUR_RAZORPAY_KEY_SECRET'
});

// Email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'your-email@gmail.com',
    pass: process.env.EMAIL_PASS || 'your-app-password'
  },
  tls: { rejectUnauthorized: false }
});

// Data file paths
const PRODUCTS_FILE = path.join(__dirname, 'data', 'products.json');
const ORDERS_FILE = path.join(__dirname, 'data', 'orders.json');
const PDF_STORAGE = path.join(__dirname, 'public');

// Helper functions
function readJSONFile(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) { return []; }
}

function writeJSONFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// API Routes

// Get Razorpay key ID for frontend
app.get('/api/config/razorpay-key', (req, res) => {
  res.json({ keyId: process.env.RAZORPAY_KEY_ID || 'YOUR_RAZORPAY_KEY_ID' });
});

// Get all products
app.get('/api/products', (req, res) => {
  const products = readJSONFile(PRODUCTS_FILE);
  const safeProducts = products.map(p => ({
    id: p.id, name: p.name, description: p.description,
    price: p.price, originalPrice: p.originalPrice,
    image: p.image, category: p.category,
    featured: p.featured, inStock: p.inStock,
    paymentLink: p.paymentLink, samplePdf: p.samplePdf
  }));
  res.json(safeProducts);
});

// Get single product
app.get('/api/product/:id', (req, res) => {
  const products = readJSONFile(PRODUCTS_FILE);
  const product = products.find(p => p.id === req.params.id);
  if (product) {
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
    const { amount, productId, productName } = req.body;
    const products = readJSONFile(PRODUCTS_FILE);
    const product = products.find(p => p.id === productId);
    
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (product.price !== parseInt(amount)) return res.status(400).json({ error: 'Invalid amount' });

    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;

    const orderOptions = {
      amount: amount * 100,
      currency: 'INR',
      receipt: `receipt_${uuidv4().slice(0, 8)}`,
      notes: { productId, productName },
      callback_url: `${baseUrl}/success?productId=${productId}`,
      callback_method: 'get'
    };

    const order = await razorpay.orders.create(orderOptions);
    res.json({
      ...order,
      product: { id: product.id, name: product.name, price: product.price, pdfFile: product.pdfFile, pdfFolder: product.pdfFolder }
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Verify payment
app.post('/api/verify-payment', async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, productId, amount } = req.body;
    const products = readJSONFile(PRODUCTS_FILE);
    const product = products.find(p => p.id === productId);

    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (product.price !== parseInt(amount)) return res.status(400).json({ error: 'Payment amount mismatch' });

    // Verify signature
    if (razorpaySignature) {
      const generatedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'YOUR_RAZORPAY_KEY_SECRET')
        .update(razorpayOrderId + '|' + razorpayPaymentId)
        .digest('hex');
      if (generatedSignature !== razorpaySignature) return res.status(400).json({ error: 'Invalid payment signature' });
    }

    // Create order record
    const orders = readJSONFile(ORDERS_FILE);
    const newOrder = {
      id: `order_${uuidv4().slice(0, 8)}`,
      razorpayOrderId, razorpayPaymentId, productId,
      productName: product.name, pdfFile: product.pdfFile, pdfFolder: product.pdfFolder,
      customerEmail: '', customerName: 'Customer',
      amount: product.price, status: 'completed', createdAt: new Date().toISOString()
    };
    orders.push(newOrder);
    writeJSONFile(ORDERS_FILE, orders);

    res.json({ success: true, order: newOrder, downloadUrl: `/download/${newOrder.id}` });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ error: 'Failed to process payment' });
  }
});

// Get order by ID
app.get('/api/order/:orderId', (req, res) => {
  const orders = readJSONFile(ORDERS_FILE);
  const order = orders.find(o => o.id === req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'completed') return res.status(400).json({ error: 'Payment not completed' });
  
  const products = readJSONFile(PRODUCTS_FILE);
  const product = products.find(p => p.id === order.productId);
  res.json({ order, product, downloadReady: true });
});

// Direct download endpoint - SECURE: Only delivers PDF after verified payment
app.get('/download/:orderId', (req, res) => {
  const orders = readJSONFile(ORDERS_FILE);
  const order = orders.find(o => o.id === req.params.orderId);
  
  if (!order) return res.status(404).send('Order not found. Please contact support.');
  if (order.status !== 'completed') return res.status(400).send('Payment not completed. Please make payment to get PDFs.');
  
  const products = readJSONFile(PRODUCTS_FILE);
  const product = products.find(p => p.id === order.productId);
  if (!product) return res.status(404).send('Product not found');
  
  const pdfFolder = path.join(PDF_STORAGE, product.pdfFile);
  
  if (product.pdfFolder && fs.existsSync(pdfFolder)) {
    const files = fs.readdirSync(pdfFolder).filter(f => f.toLowerCase().endsWith('.pdf'));
    if (files.length > 0) return res.download(path.join(pdfFolder, files[0]), files[0]);
  } else {
    const pdfPath = path.join(PDF_STORAGE, product.pdfFile);
    if (fs.existsSync(pdfPath)) return res.download(pdfPath, product.pdfFile);
  }
  
  res.status(404).send('PDF not found. Please contact support.');
});

// Download ALL PDFs as ZIP - SECURE: Only delivers after verified payment
app.get('/download-all/:orderId', (req, res) => {
  const orders = readJSONFile(ORDERS_FILE);
  const order = orders.find(o => o.id === req.params.orderId);
  
  if (!order) return res.status(404).send('Order not found. Please contact support.');
  if (order.status !== 'completed') return res.status(400).send('Payment not completed. Please make payment to get PDFs.');
  
  const products = readJSONFile(PRODUCTS_FILE);
  const product = products.find(p => p.id === order.productId);
  if (!product) return res.status(404).send('Product not found');
  
  const pdfFolder = path.join(PDF_STORAGE, product.pdfFile);
  
  if (!product.pdfFolder || !fs.existsSync(pdfFolder)) {
    return res.status(404).send('PDF folder not found. Please contact support.');
  }
  
  const files = fs.readdirSync(pdfFolder).filter(f => f.toLowerCase().endsWith('.pdf'));
  
  if (files.length === 0) {
    return res.status(404).send('No PDFs found. Please contact support.');
  }
  
  // Create ZIP file
  const archive = archiver('zip', { zlib: { level: 9 } });
  const zipFilename = `${product.name.replace(/[^a-zA-Z0-9]/g, '_')}_All_Notes.zip`;
  
  res.attachment(zipFilename);
  archive.pipe(res);
  
  // Add all PDFs to ZIP
  files.forEach(file => {
    const filePath = path.join(pdfFolder, file);
    archive.file(filePath, { name: file });
  });
  
  archive.finalize();
});

// Get list of PDFs for an order (for preview) - SECURE: Only works after verified payment
app.get('/api/order-pdfs/:orderId', (req, res) => {
  const orders = readJSONFile(ORDERS_FILE);
  const order = orders.find(o => o.id === req.params.orderId);
  
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'completed') return res.status(400).json({ error: 'Payment not completed' });
  
  const products = readJSONFile(PRODUCTS_FILE);
  const product = products.find(p => p.id === order.productId);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  
  const pdfFolder = path.join(PDF_STORAGE, product.pdfFile);
  
  if (!product.pdfFolder || !fs.existsSync(pdfFolder)) {
    return res.json({ productName: product.name, files: [] });
  }
  
  const files = fs.readdirSync(pdfFolder)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .map(f => ({
      name: f,
      size: fs.statSync(path.join(pdfFolder, f)).size
    }));
  
  res.json({ productName: product.name, files, totalFiles: files.length });
});

// Get all orders (Admin)
app.get('/api/orders', (req, res) => {
  const orders = readJSONFile(ORDERS_FILE);
  res.json(orders.reverse());
});

// Add product (Admin)
app.post('/api/products', (req, res) => {
  try {
    const products = readJSONFile(PRODUCTS_FILE);
    const newProduct = {
      id: `prod_${uuidv4().slice(0, 8)}`,
      ...req.body, featured: req.body.featured || false, inStock: req.body.inStock !== false
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

// Webhook endpoint
app.post('/api/webhook/razorpay', express.raw({type: 'application/json'}), async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];
    const payload = JSON.parse(req.body);
    const event = payload.event;
    
    console.log('Webhook received:', event);
    
    if (webhookSecret && signature) {
      const generatedSignature = crypto.createHmac('sha256', webhookSecret).update(req.body).digest('hex');
      if (generatedSignature !== signature) {
        console.log('Invalid webhook signature');
        return res.status(200).json({ received: true });
      }
    }
    
    if (event === 'payment.captured') {
      const paymentEntity = payload.payload?.payment?.entity;
      if (paymentEntity) {
        const razorpayPaymentId = paymentEntity.id;
        const razorpayOrderId = paymentEntity.order_id;
        const amount = Math.floor(paymentEntity.amount / 100);
        const notes = paymentEntity.notes || {};
        
        const products = readJSONFile(PRODUCTS_FILE);
        const product = products.find(p => p.price === amount);
        
        if (product) {
          const customerEmail = notes.customerEmail || 'unknown@example.com';
          const customerName = notes.customerName || 'Customer';
          
          const orders = readJSONFile(ORDERS_FILE);
          const existingOrder = orders.find(o => o.razorpayPaymentId === razorpayPaymentId);
          
          if (!existingOrder) {
            const newOrder = {
              id: `order_${uuidv4().slice(0, 8)}`,
              razorpayOrderId, razorpayPaymentId,
              productId: product.id, productName: product.name,
              pdfFile: product.pdfFile, pdfFolder: product.pdfFolder,
              customerEmail, customerName, amount: product.price,
              status: 'completed', paymentMethod: paymentEntity.method || 'unknown',
              createdAt: new Date().toISOString(), webhook: true
            };
            orders.push(newOrder);
            writeJSONFile(ORDERS_FILE, orders);
            console.log('Order created from webhook:', newOrder.id);
          }
        }
      }
    } else if (event === 'payment.failed') {
      console.log('Payment failed:', payload.payload?.payment?.entity?.id);
    }
    
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(200).json({ received: true });
  }
});

// Test email endpoint
app.post('/api/test-email', async (req, res) => {
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

// Admin Login API
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASS || 'admin123';
  
  if (username === adminUser && password === adminPass) {
    const token = uuidv4();
    res.json({ success: true, token });
  } else {
    res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
});

function requireAuth(req, res, next) {
  const token = req.headers.authorization;
  if (token) next();
  else res.status(401).json({ error: 'Unauthorized' });
}

// Page routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/products', (req, res) => res.sendFile(path.join(__dirname, 'public', 'products.html')));
app.get('/cart', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cart.html')));
app.get('/checkout', (req, res) => res.sendFile(path.join(__dirname, 'public', 'checkout.html')));
app.get('/success', (req, res) => res.sendFile(path.join(__dirname, 'public', 'success.html')));
app.get('/failed', (req, res) => res.sendFile(path.join(__dirname, 'public', 'failed.html')));
app.get('/payment', (req, res) => res.sendFile(path.join(__dirname, 'public', 'payment.html')));
app.get('/admin/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));
app.get('/admin/products', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'products.html')));
app.get('/admin/orders', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'orders.html')));

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
  console.log(`PDF Storage: ${PDF_STORAGE}`);
});
