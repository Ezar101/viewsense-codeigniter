<form method="post">
    <?php foreach ($errors as $error): ?>
        <p class="form-error"><?= html_escape($error) ?></p>
    <?php endforeach; ?>
    <input name="name" value="<?= html_escape($product->name) ?>">
</form>
