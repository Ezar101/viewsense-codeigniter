<h1><?= html_escape($title ?? $site_name) ?></h1>

<?php foreach ($products as $product): ?>
    <?php $this->load->view('partials/product_card', ['product' => $product]); ?>
<?php endforeach; ?>

<?php include_view('partials/pagination', ['page' => $page]); ?>
