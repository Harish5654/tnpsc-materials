// TNPSC Materials - Checkout JavaScript

const API_URL = '/api';

let razorpayKeyId = 'YOUR_RAZORPAY_KEY_ID';

// Fetch Razorpay key from server on load
async function loadRazorpayKey() {
  try {
    const response = await fetch(`${API_URL}/config/razorpay-key`);
    const data = await response.json();
    razorpayKeyId = data.keyId;
  } catch (error) {
    console.error('Error loading Razorpay key:', error);
  }
}

loadRazorpayKey();

// Load cart items for checkout
function loadCheckoutItems() {
  const container = document.getElementById('order-items');
  if (!container) return;
  
  const cart = JSON.parse(localStorage.getItem('tnpsc_cart') || '[]');
  
  if (cart.length === 0) {
    window.location.href = '/cart';
    return;
  }
  
  container.innerHTML = cart.map(item => `
    <div class="order-item">
      <span>${item.name}</span>
      <span>₹${item.price}</span>
    </div>
  `).join('');
  
  const total = cart.reduce((sum, item) => sum + item.price, 0);
  document.getElementById('total').textContent = `₹${total}`;
  document.getElementById('total-amount').value = total;
}

// Process checkout and initiate payment
async function processCheckout(event) {
  event.preventDefault();
  
  const customerName = document.getElementById('customerName').value.trim();
  const customerEmail = document.getElementById('customerEmail').value.trim();
  const customerPhone = document.getElementById('customerPhone').value.trim();
  
  if (!customerName || !customerEmail || !customerPhone) {
    alert('Please fill in all required fields');
    return;
  }
  
  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(customerEmail)) {
    alert('Please enter a valid email address');
    return;
  }
  
  // Phone validation (Indian format)
  const phoneRegex = /^[6-9]\d{9}$/;
  if (!phoneRegex.test(customerPhone)) {
    alert('Please enter a valid 10-digit phone number');
    return;
  }
  
  const cart = JSON.parse(localStorage.getItem('tnpsc_cart') || '[]');
  if (cart.length === 0) {
    alert('Your cart is empty');
    return;
  }
  
  const totalAmount = cart.reduce((sum, item) => sum + item.price, 0);
  const productNames = cart.map(item => item.name).join(', ');
  
  const btn = document.getElementById('checkout-btn');
  btn.disabled = true;
  btn.textContent = 'Processing...';
  
  try {
    // Create order on server
    const orderResponse = await fetch(`${API_URL}/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: totalAmount,
        productId: cart[0].id,
        productName: productNames,
        customerEmail,
        customerName
      })
    });
    
    const orderData = await orderResponse.json();
    
    if (orderData.error) {
      throw new Error(orderData.error);
    }
    
    // Store order info in localStorage for verification after redirect
    const orderInfo = {
      razorpayOrderId: orderData.id,
      productId: cart[0].id,
      customerEmail,
      customerName,
      cart: cart
    };
    localStorage.setItem('pending_order', JSON.stringify(orderInfo));
    
    // Get the base URL for callback
    const baseUrl = window.location.origin;
    
    // Initialize Razorpay with redirect - this will redirect to our success page after payment
    const razorpayOptions = {
      key: razorpayKeyId,
      amount: orderData.amount,
      currency: 'INR',
      name: 'TNPSC Materials',
      description: `Purchase: ${productNames}`,
      order_id: orderData.id,
      // Use redirect to skip Razorpay's success page
      redirect: true,
      callback_url: baseUrl + '/success',
      // Also handle via handler as backup
      handler: function(response) {
        // Store payment response 
        localStorage.setItem('payment_response', JSON.stringify(response));
        localStorage.setItem('payment_cart', JSON.stringify(cart));
        localStorage.setItem('payment_customer_email', customerEmail);
        localStorage.setItem('payment_customer_name', customerName);
        // The redirect will happen automatically due to redirect: true
      },
      prefill: {
        name: customerName,
        email: customerEmail,
        contact: customerPhone
      },
      theme: {
        color: '#667eea'
      },
      modal: {
        confirm_close: true,
        ondismiss: function() {
          console.log('Payment modal dismissed');
          btn.disabled = false;
          btn.textContent = 'Proceed to Payment';
        }
      }
    };
    
    const razorpay = new Razorpay(razorpayOptions);
    razorpay.open();
    
  } catch (error) {
    console.error('Checkout error:', error);
    alert('Failed to process checkout. Please try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Proceed to Payment';
  }
}

// Initialize checkout page
document.addEventListener('DOMContentLoaded', () => {
  loadCheckoutItems();
  
  const checkoutForm = document.getElementById('checkout-form');
  if (checkoutForm) {
    checkoutForm.addEventListener('submit', processCheckout);
  }
});
