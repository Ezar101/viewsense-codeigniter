<?php

declare(strict_types=1);

defined('BASEPATH') or exit('No direct script access allowed');

/**
 * @property Product_model $products
 */
class Products extends MY_Controller
{
    public function __construct()
    {
        parent::__construct();
        $this->load->model('Product_model', 'products');
    }

    public function index(): void
    {
        $data['title'] = 'All products';
        $data['products'] = $this->products->get_all();
        $data['page'] = 1;
        $this->load->view('products/list', $data);
    }

    public function show(string $id): void
    {
        $product = $this->products->find((int) $id);

        $this->load->view('products/show', [
            'product' => $product,
            'in_cart' => $this->cart->contains((int) $id),
        ]);
    }

    public function create(): void
    {
        $this->render('products/form', [
            'title' => 'New product',
            'errors' => [],
            'product' => new Product(),
        ]);
    }
}
