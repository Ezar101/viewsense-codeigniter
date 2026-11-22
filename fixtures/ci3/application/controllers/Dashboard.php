<?php

declare(strict_types=1);

defined('BASEPATH') or exit('No direct script access allowed');

/**
 * Loads the same view as Products::index() with different values,
 * so ViewSense must merge the variable types.
 *
 * @property Product_model $product_model
 */
class Dashboard extends MY_Controller
{
    public function index(): void
    {
        $this->load->model('Product_model');

        $this->load->view('products/list', [
            'title' => null,
            'products' => $this->product_model->get_latest(5),
            'page' => '1',
        ]);
    }
}
