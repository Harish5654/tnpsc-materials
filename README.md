# TNPSC Materials – E-commerce Website for PDF Notes

A modern, professional e-commerce website for selling handwritten PDF notes for TNPSC exam preparation.

## 📁 Project Structure

```
tnpsc-materials/
├── server.js           # Express.js backend
├── package.json        # Node.js dependencies
├── config.env.example  # Configuration template
├── data/
│   ├── products.json   # Products with payment links
│   └── orders.json    # Orders storage
├── public/
│   ├── css/style.css  # Responsive Amazon-style design
│   ├── js/
│   │   ├── main.js    # Cart & product management
│   │   └── checkout.js
│   ├── index.html     # Homepage
│   ├── products.html  # Product listing
│   ├── cart.html      # Shopping cart
│   ├── payment.html   # Payment redirect page
│   ├── success.html  # Order confirmation
│   └── admin/
│       ├── index.html    # Dashboard
│       ├── products.html # Manage products
│       └── orders.html   # View orders
```

## 📦 Products

| Product | Price | Payment Link |
|---------|-------|--------------|
| General Tamil Notes | ₹250 | https://rzp.io/rzp/h5ZM9pL |
| General Knowledge Notes | ₹250 | https://rzp.io/rzp/deer2rk |
| Combo Pack (Tamil + GK) | ₹450 | https://rzp.io/rzp/6ZKo4vs3 |

## 🚀 Installation

1. **Install dependencies:**
   ```bash
   cd tnpsc-materials
   npm install
   ```

2. **Configure email (for auto-delivery):**
   - Copy `config.env.example` to `.env`
   - Add your Gmail credentials for sending PDFs

3. **Start the server:**
   ```bash
   npm start
   ```

4. **Open:** http://localhost:3000

## 🎯 How It Works

1. **Browse Products:** Visit homepage or products page
2. **Buy Now:** Click "Buy Now" button on any product
3. **Payment:** Redirects to Razorpay payment page
4. **Delivery:** After payment, PDF is sent to customer's email

## 💳 Payment Links

Each product has its own Razorpay payment link:
- Update in `data/products.json` or via Admin Panel
- The website will redirect customers to the correct payment page

## 📧 Email Delivery System

After successful payment, the system sends an email with:
- Order confirmation
- PDF attachment (upload to `public/pdfs/` folder)

## 🎨 Design Features

- Amazon-inspired responsive design
- Mobile-friendly
- Trust badges & SEO optimized
- Admin panel for managing products & orders

## 🔐 Admin Panel

Access: http://localhost:3000/admin

Features:
- Dashboard with sales stats
- Add/Edit/Delete products
- View customer orders
- Update payment links

## 📝 SEO Keywords

Optimized for:
- TNPSC notes
- Tamil exam materials
- GK handwritten notes
- TNPSC preparation PDF
