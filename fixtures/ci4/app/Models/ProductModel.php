<?php

declare(strict_types=1);

namespace App\Models;

use App\Entities\Product;
use CodeIgniter\Model;

final class ProductModel extends Model
{
    protected $table = 'products';

    protected $returnType = Product::class;

    protected $allowedFields = ['name', 'price'];
}
