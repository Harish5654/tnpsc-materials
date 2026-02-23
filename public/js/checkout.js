// TNPSC Materials - Checkout JavaScript

const API_URL = '/api';

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
  document.getElementById('order-total').textContent = `₹${total}`;
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
    
    // Initialize Razorpay
    const razorpayKeyId = 'YOUR_RAZORPAY_KEY_ID'; // Replace with actual key
    
    const razorpayOptions = {
      key: razorpayKeyId,
      amount: orderData.amount,
      currency: 'INR',
      name: 'TNPSC Materials',
      description: `Purchase: ${productNames}`,
      order_id: orderData.id,
      handler: async function(response) {
        // Payment successful - verify and send email
        await verifyPayment(response, cart, customerEmail, customerName);
      },
      prefill: {
        name: customerName,
        email: customerEmail,
        contact: customerPhone
      },
      theme: {
        color: '#667eea'
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

// Verify payment and send email
async function verifyPayment(paymentResponse, cart, customerEmail, customerName) {
  try {
    // For demo purposes, simulate successful payment
    // In production, verify the razorpay_signature on server side
    
    const productIds = cart.map(item => item.id);
    let allSuccessful = true;
    
    for (const productId of productIds) {
      const response = await fetch(`${API_URL}/verify-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razorpayOrderId: paymentResponse.razorpay_order_id,
          razorpayPaymentId: paymentResponse.razorpay_payment_id,
          razorpaySignature: paymentResponse.razorpay_signature || 'demo',
          productId,
          customerEmail,
          customerName
        })
      });
      
      const result = await response.json();
      if (!result.success && !result.order) {
        console.error('Payment verification failed for product:', productId);
        allSuccessful = false;
      }
    }
    
    if (allSuccessful) {
      // Clear cart
      localStorage.removeItem('tnpsc_cart');
      
      // Redirect to success page
      window.location.href = `/success?name=${encodeURIComponent(customerName)}&email=${encodeURIComponent(customerEmail)}`;
    } else {
      alert('Payment verification failed. Please contact support.');
    }
  } catch (error) {
    console.error('Payment verification error:', error);
    alert('Payment was successful but email delivery failed. Please contact support.');
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
