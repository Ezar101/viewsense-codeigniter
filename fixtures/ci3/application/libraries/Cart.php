<?php

declare(strict_types=1);

defined('BASEPATH') or exit('No direct script access allowed');

class Cart
{
    /** @var int[] */
    private array $product_ids = [];

    public function contains(int $product_id): bool
    {
        return in_array($product_id, $this->product_ids, true);
    }

    public function count(): int
    {
        return count($this->product_ids);
    }
}
