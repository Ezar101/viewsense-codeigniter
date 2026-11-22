<?php

declare(strict_types=1);

defined('BASEPATH') or exit('No direct script access allowed');

/**
 * @method Product[] get_latest(int $limit) Built by __call() in a real project.
 */
class Product_model extends CI_Model
{
    /**
     * @return Product[]
     */
    public function get_all(): array
    {
        return $this->db->get('products')->result('Product');
    }

    public function find(int $id): ?Product
    {
        return $this->db->get_where('products', ['id' => $id])->row(0, 'Product');
    }
}
