<?php
/**
 * WPilot REST API Endpoints
 */
defined('ABSPATH') || exit;

add_action('rest_api_init', function () {
    $ns = WPILOT_API_NAMESPACE;
    
    // ── Status ──
    register_rest_route($ns, '/status', [
        'methods' => 'GET',
        'callback' => 'wpilot_api_status',
        'permission_callback' => 'wpilot_verify_key',
    ]);
    
    // ── Core Version ──
    register_rest_route($ns, '/core-version', [
        'methods' => 'GET',
        'callback' => 'wpilot_api_core_version',
        'permission_callback' => 'wpilot_verify_key',
    ]);
    
    // ── Plugin List ──
    register_rest_route($ns, '/plugins', [
        'methods' => 'GET',
        'callback' => 'wpilot_api_plugins',
        'permission_callback' => 'wpilot_verify_key',
    ]);
    
    // ── Execute Command ──
    register_rest_route($ns, '/command', [
        'methods' => 'POST',
        'callback' => 'wpilot_api_command',
        'permission_callback' => 'wpilot_verify_key',
    ]);
    
    // ── Backup ──
    register_rest_route($ns, '/backup', [
        'methods' => 'POST',
        'callback' => 'wpilot_api_backup',
        'permission_callback' => 'wpilot_verify_key',
    ]);
    
    // ── Restore ──
    register_rest_route($ns, '/restore', [
        'methods' => 'POST',
        'callback' => 'wpilot_api_restore',
        'permission_callback' => 'wpilot_verify_key',
    ]);
    
    // ── PHP Info ──
    register_rest_route($ns, '/phpinfo', [
        'methods' => 'GET',
        'callback' => 'wpilot_api_phpinfo',
        'permission_callback' => 'wpilot_verify_key',
    ]);
});

function wpilot_api_status() {
    global $wpdb;
    
    $active_plugins = get_option('active_plugins', []);
    $all_plugins = get_plugins();
    $plugin_list = [];
    foreach ($active_plugins as $p) {
        if (isset($all_plugins[$p])) {
            $plugin_list[] = [
                'name' => $all_plugins[$p]['Name'],
                'version' => $all_plugins[$p]['Version'],
                'slug' => dirname($p),
            ];
        }
    }
    
    return [
        'site' => get_bloginfo('name'),
        'wp_version' => get_bloginfo('version'),
        'php_version' => PHP_VERSION,
        'db_version' => $wpdb->db_version(),
        'plugins_active' => count($active_plugins),
        'plugin_list' => $plugin_list,
        'wpilot_version' => WPILOT_VERSION,
        'wpilot_api_key' => substr(get_option('wpilot_api_key'), 0, 12) . '...',
        'debug' => WP_DEBUG,
        'memory_limit' => ini_get('memory_limit'),
        'time' => current_time('mysql'),
    ];
}

function wpilot_api_core_version() {
    global $wp_version;
    $updates = get_site_transient('update_core');
    $new_version = $updates && !empty($updates->updates) ? $updates->updates[0]->current : $wp_version;
    
    return [
        'version' => $wp_version,
        'latest' => $new_version,
        'needs_update' => version_compare($wp_version, $new_version, '<'),
    ];
}

function wpilot_api_plugins() {
    $all_plugins = get_plugins();
    $active = get_option('active_plugins', []);
    $result = [];
    
    foreach ($all_plugins as $path => $data) {
        $result[] = [
            'name' => $data['Name'],
            'version' => $data['Version'],
            'active' => in_array($path, $active),
            'slug' => dirname($path),
        ];
    }
    
    return ['plugins' => $result, 'total' => count($result), 'active' => count($active)];
}

function wpilot_api_command($request) {
    $command = $request->get_param('command');
    if (!$command) {
        return new WP_Error('no_command', 'Command is required', ['status' => 400]);
    }
    
    $result = wpilot_execute_command($command);
    return $result;
}

function wpilot_api_backup() {
    return wpilot_create_backup();
}

function wpilot_api_restore($request) {
    $backup_id = $request->get_param('backupId');
    if (!$backup_id) {
        return new WP_Error('no_backup', 'backupId is required', ['status' => 400]);
    }
    return wpilot_restore_backup($backup_id);
}

function wpilot_api_phpinfo() {
    return [
        'php' => PHP_VERSION,
        'sapi' => PHP_SAPI,
        'extensions' => get_loaded_extensions(),
        'max_execution_time' => ini_get('max_execution_time'),
        'upload_max_filesize' => ini_get('upload_max_filesize'),
        'post_max_size' => ini_get('post_max_size'),
        'server' => $_SERVER['SERVER_SOFTWARE'] ?? 'unknown',
    ];
}
