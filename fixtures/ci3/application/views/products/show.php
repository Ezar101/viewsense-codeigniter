<?php if ($product === null): ?>
    <p>Product not found.</p>
<?php else: ?>
    <h1><?= html_escape($product->name) ?></h1>
    <p><?= $in_cart ? 'Already in your cart' : 'Not in your cart' ?></p>
<?php endif; ?>
