<?= $this->extend('layouts/main') ?>

<?= $this->section('content') ?>
    <h1><?= esc($title) ?></h1>

    <?php foreach ($products as $product): ?>
        <?= view('partials/product_card', ['product' => $product]) ?>
    <?php endforeach; ?>
<?= $this->endSection() ?>
