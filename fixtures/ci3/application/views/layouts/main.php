<!DOCTYPE html>
<html lang="en">
<head>
    <title><?= html_escape($title) ?> - <?= html_escape($site_name) ?></title>
</head>
<body>
    <p>Items in cart: <?= $this->cart->count() ?></p>
    <?= $content ?>
</body>
</html>
