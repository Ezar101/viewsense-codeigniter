<h1><?= esc($title) ?></h1>

<form method="post">
    <?php foreach ($errors as $error): ?>
        <p class="form-error"><?= esc($error) ?></p>
    <?php endforeach; ?>
    <input name="name" value="<?= esc($product->name) ?>">
</form>
