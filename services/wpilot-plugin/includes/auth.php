<?php
/**
 * WPilot Authentication
 */
defined('ABSPATH') || exit;

/**
 * ตรวจสอบ API Key จาก header
 */
function wpilot_verify_key(WP_REST_Request $request) {
    $key = $request->get_header('x-wpilot-key');
    if (!$key) {
        $key = $request->get_param('api_key');
    }
    
    $stored = get_option('wpilot_api_key');
    
    if (!$stored || !$key || $key !== $stored) {
        return new WP_Error('wpilot_auth_failed', 'Invalid API Key', ['status' => 401]);
    }
    
    return true;
}
