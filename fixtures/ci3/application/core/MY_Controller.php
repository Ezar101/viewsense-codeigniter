<?php

declare(strict_types=1);

defined('BASEPATH') or exit('No direct script access allowed');

/**
 * Base controller with a custom render method.
 *
 * @property Cart $cart
 */
class MY_Controller extends CI_Controller
{
    public function __construct()
    {
        parent::__construct();
        $this->load->library('cart');

        // Shared with every view loaded during this request.
        $this->load->vars(['site_name' => 'Demo Shop']);
    }

    /**
     * Renders $view inside the main layout.
     *
     * @param array<string, mixed> $data
     */
    protected function render(string $view, array $data = []): void
    {
        $data['content'] = $this->load->view($view, $data, true);
        $this->load->view('layouts/main', $data);
    }
}
