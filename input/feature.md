# Feature: Shopping Cart

## Description
Registered users can add products to a shopping cart, update quantities,
remove items, and proceed to checkout. Guest users can browse the cart
but must log in before checkout. Cart persists across sessions for
logged-in users.

## Business Rules
- Maximum 10 unique items allowed in the cart at once
- Maximum quantity per item is 99
- Minimum quantity is 1 — removing sets quantity to 0 and removes the item
- Out-of-stock items cannot be added to cart
- Cart is saved to the user's account and persists across login sessions
- Guest cart is stored in localStorage and merged on login
- Prices shown in cart reflect the price at time of adding (not live price)
- Discount codes can be applied — only one code active at a time
- Free shipping applied automatically when cart total exceeds ₹999

## UI Elements (data-testid selectors)
- Add to cart button:         data-testid="add-to-cart-btn"
- Cart icon with count:       data-testid="cart-icon"
- Cart item count badge:      data-testid="cart-count-badge"
- Cart drawer/sidebar:        data-testid="cart-drawer"
- Cart item row:              data-testid="cart-item-{productId}"
- Item quantity input:        data-testid="quantity-input-{productId}"
- Increase quantity button:   data-testid="qty-increase-{productId}"
- Decrease quantity button:   data-testid="qty-decrease-{productId}"
- Remove item button:         data-testid="remove-item-{productId}"
- Cart subtotal:              data-testid="cart-subtotal"
- Discount code input:        data-testid="discount-code-input"
- Apply discount button:      data-testid="apply-discount-btn"
- Discount success message:   data-testid="discount-success"
- Discount error message:     data-testid="discount-error"
- Free shipping banner:       data-testid="free-shipping-banner"
- Proceed to checkout button: data-testid="checkout-btn"
- Empty cart message:         data-testid="empty-cart-msg"
- Out of stock badge:         data-testid="out-of-stock-badge"

## Acceptance Criteria
- Clicking Add to Cart increments cart-count-badge by 1
- Adding same product again increases quantity, does not add duplicate row
- Quantity input accepts only numbers between 1 and 99
- Removing the last item shows empty-cart-msg
- Checkout button is disabled for guest users — shows login prompt
- Valid discount code reduces subtotal and shows discount-success message
- Invalid discount code shows discount-error without changing subtotal
- Free shipping banner appears when subtotal exceeds ₹999
- Cart state is preserved after page refresh for logged-in users