<?php if ($product === null): ?>
    <p>Product not found.</p>
<?php else: ?>
    <?= $this->include('partials/product_card') ?>
<?php endif; ?>
