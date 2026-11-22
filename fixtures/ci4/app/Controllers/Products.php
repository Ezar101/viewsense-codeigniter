<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Entities\Product;
use App\Models\ProductModel;

final class Products extends BaseController
{
    private readonly ProductModel $products;

    public function __construct()
    {
        $this->products = model(ProductModel::class);
    }

    public function index(): string
    {
        return view('products/index', [
            'title' => 'All products',
            'products' => $this->products->findAll(),
        ]);
    }

    public function show(int $id): string
    {
        $data = [];
        $data['product'] = $this->products->find($id);

        return view('products/show', $data);
    }

    public function create(): string
    {
        $renderer = service('renderer');
        $renderer->setVar('title', 'New product');
        $renderer->setData(['product' => new Product(), 'errors' => []]);

        return $renderer->render('products/form');
    }
}
