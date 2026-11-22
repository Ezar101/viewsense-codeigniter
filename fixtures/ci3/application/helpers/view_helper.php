<?php

declare(strict_types=1);

defined('BASEPATH') or exit('No direct script access allowed');

if (!function_exists('include_view')) {
    /**
     * Includes a partial view from inside another view.
     *
     * @param array<string, mixed> $data
     */
    function include_view(string $view, array $data = []): void
    {
        get_instance()->load->view($view, $data);
    }
}
