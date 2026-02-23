// TNPSC Materials - Main JavaScript

// API Base URL
const API_URL = '/api';

// Cart Management
const Cart = {
  items: [],
  
  init() {
    const saved = localStorage.getItem('tnpsc_cart');
    if (saved) {
      this.items = JSON.parse(saved);
    }
    this.updateCartCount();
  },
  
  save() {
    localStorage.setItem('tnpsc_cart', JSON.stringify(this.items));
    this.updateCartCount();
  },
  
  add(product) {
    const existing = this.items.find(item => item.id === product.id);
    if (existing) {
      alert('Product already in cart!');
      return;
    }
    this.items.push({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      pdfFile: product.pdfFile
    });
    this.save();
    alert('Added to cart!');
  },
  
  remove(productId) {
    this.items = this.items.filter(item => item.id !== productId);
    this.save();
    if (window.location.pathname.includes('cart.html')) {
      this.renderCart();
    }
  },
  
  clear() {
    this.items = [];
    this.save();
  },
  
  getTotal() {
    return this.items.reduce((sum, item) => sum + item.price, 0);
  },
  
  updateCartCount() {
    const countEl = document.getElementById('cart-count');
    if (countEl) {
      countEl.textContent = this.items.length;
    }
  },
  
  renderCart() {
    const container = document.getElementById('cart-items');
    if (!container) return;
    
    if (this.items.length === 0) {
      container.innerHTML = `
        <div class="empty-cart">
          <h2>🛒 Your Cart is Empty</h2>
          <p>Add some TNPSC notes to get started!</p>
          <a href="/products" class="btn btn-primary">Browse Products</a>
        </div>
      `;
      document.querySelector('.cart-summary').style.display = 'none';
      return;
    }
    
    document.querySelector('.cart-summary').style.display = 'block';
    
    container.innerHTML = this.items.map(item => `
      <div class="cart-item">
        <div class="cart-item-image">
          <img src="${item.image}" alt="${item.name}">
        </div>
        <div class="cart-item-details">
          <h4 class="cart-item-title">${item.name}</h4>
          <p class="cart-item-price">₹${item.price}</p>
          <button class="remove-btn" onclick="Cart.remove('${item.id}')">
            Remove
          </button>
        </div>
      </div>
    `).join('');
    
    // Update summary
    document.getElementById('subtotal').textContent = `₹${this.getTotal()}`;
    document.getElementById('total').textContent = `₹${this.getTotal()}`;
  }
};

// Product Management
async function loadProducts() {
  const container = document.getElementById('product-grid');
  if (!container) return;
  
  try {
    const response = await fetch(`${API_URL}/products`);
    const products = await response.json();
    
    container.innerHTML = products.map(product => `
      <div class="product-card">
        <div class="product-image">
          <img src="${product.image}" alt="${product.name}">
          ${product.category === 'combo' ? '<span class="badge badge-combo">Best Value</span>' : ''}
        </div>
        <div class="product-info">
          <h3 class="product-title">${product.name}</h3>
          <p class="product-description">${product.description.substring(0, 100)}...</p>
          <div class="product-price">
            <span class="current-price">₹${product.price}</span>
            <span class="original-price">₹${product.originalPrice}</span>
            <span class="discount">${Math.round((1 - product.price/product.originalPrice)*100)}% OFF</span>
          </div>
          <button class="btn btn-primary" onclick="buyNow('${product.id}')">
            Buy Now
          </button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading products:', error);
    container.innerHTML = '<p class="message message-error">Failed to load products. Please try again.</p>';
  }
}

async function addToCart(productId) {
  try {
    const response = await fetch(`${API_URL}/product/${productId}`);
    const product = await response.json();
    Cart.add(product);
  } catch (error) {
    console.error('Error adding to cart:', error);
    alert('Failed to add to cart. Please try again.');
  }
}

// Featured Products (Homepage)
async function loadFeaturedProducts() {
  const container = document.getElementById('featured-products');
  if (!container) return;
  
  try {
    const response = await fetch(`${API_URL}/products`);
    const products = await response.json();
    const featured = products.filter(p => p.featured);
    
    container.innerHTML = featured.map(product => `
      <div class="product-card">
        <div class="product-image">
          <img src="${product.image}" alt="${product.name}">
          ${product.category === 'combo' ? '<span class="badge badge-combo">Best Value</span>' : ''}
        </div>
        <div class="product-info">
          <h3 class="product-title">${product.name}</h3>
          <p class="product-description">${product.description.substring(0, 80)}...</p>
          <div class="product-price">
            <span class="current-price">₹${product.price}</span>
            <span class="original-price">₹${product.originalPrice}</span>
          </div>
          <button class="btn btn-primary" onclick="buyNow('${product.id}')">
            Buy Now
          </button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading featured products:', error);
  }
}

// Buy Now - Direct payment link redirect
function buyNow(productId) {
  window.location.href = `/payment.html?id=${productId}`;
}

// Load payment page
async function loadPaymentPage() {
  const params = new URLSearchParams(window.location.search);
  const productId = params.get('id');
  
  if (!productId) {
    window.location.href = '/products';
    return;
  }
  
  const container = document.getElementById('payment-product');
  if (!container) return;
  
  try {
    const response = await fetch(`${API_URL}/product/${productId}`);
    const product = await response.json();
    
    if (!product || !product.paymentLink) {
      window.location.href = '/products';
      return;
    }
    
    const productDetails = document.getElementById('product-details');
    if (productDetails) {
      productDetails.innerHTML = `
        <h2>${product.name}</h2>
        <p class="price">₹${product.price}</p>
        <p style="color: #666; margin-top: 10px;">${product.description.substring(0, 100)}...</p>
      `;
    }
    
    // Auto-redirect after 2 seconds
    setTimeout(() => {
      window.location.href = product.paymentLink;
    }, 2000);
    
  } catch (error) {
    console.error('Error loading product:', error);
    window.location.href = '/products';
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  Cart.init();
  
  // Load products if on products page
  if (document.getElementById('product-grid')) {
    loadProducts();
  }
  
  // Load featured products if on homepage
  if (document.getElementById('featured-products')) {
    loadFeaturedProducts();
  }
  
  // Render cart if on cart page
  if (document.getElementById('cart-items')) {
    Cart.renderCart();
  }
  
  // Load payment page if on payment.html
  if (document.getElementById('payment-product')) {
    loadPaymentPage();
  }
});

// Format currency
function formatCurrency(amount) {
  return `₹${amount.toLocaleString('en-IN')}`;
}

// Get URL parameters
function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return Object.fromEntries(params.entries());
}
