<?php
/**
 * WPilot Commands — คำสั่ง WP-CLI ที่อนุญาตให้ remote execute ได้
 * Whitelist-based security
 */
defined('ABSPATH') || exit;

/**
 * รายการคำสั่งที่อนุญาต (Whitelist)
 */
function wpilot_allowed_commands() {
    return [
        // Core
        'core version' => ['desc' => 'ดูเวอร์ชั่น WordPress ปัจจุบัน'],
        'core check_update' => ['desc' => 'เช็คอัปเดต core'],
        'core update' => ['desc' => 'อัปเดต WordPress core'],
        'core update-db' => ['desc' => 'อัปเดต database'],
        
        // Plugin
        'plugin list' => ['desc' => 'รายการ plugins ทั้งหมด'],
        'plugin status' => ['desc' => 'สถานะ plugins'],
        'plugin update --all' => ['desc' => 'อัปเดต plugins ทั้งหมด'],
        'plugin update' => ['desc' => 'อัปเดต plugin ที่ระบุ'],
        
        // Theme
        'theme list' => ['desc' => 'รายการ themes ทั้งหมด'],
        'theme update --all' => ['desc' => 'อัปเดต themes ทั้งหมด'],
        
        // Post
        'post list' => ['desc' => 'รายการโพสต์ล่าสุด'],
        'post create' => ['desc' => 'สร้างโพสต์ใหม่'],
        
        // Media
        'media regenerate' => ['desc' => 'สร้าง thumbnails ใหม่'],
        
        // Cache
        'cache flush' => ['desc' => 'ล้าง cache'],
        'rewrite flush' => ['desc' => 'ล้าง rewrite rules'],
        
        // WPilot
        'wpilot status' => ['desc' => 'สถานะ WPilot system'],
    ];
}

/**
 * Execute command ที่ได้รับอนุญาต
 */
function wpilot_execute_command($raw_command) {
    $allowed = wpilot_allowed_commands();
    $command = trim(sanitize_text_field($raw_command));
    
    // Check if command or prefix is allowed
    $matched = false;
    foreach (array_keys($allowed) as $allowed_cmd) {
        if ($command === $allowed_cmd || strpos($command, $allowed_cmd . ' ') === 0) {
            $matched = true;
            break;
        }
    }
    
    if (!$matched) {
        return [
            'success' => false,
            'error' => 'Command not allowed: ' . $command,
            'allowed' => array_keys($allowed),
        ];
    }
    
    // Execute via WP-CLI
    $output = [];
    $return_code = 0;
    
    // Use WP-CLI if available
    $wp_cli = defined('WP_CLI') && WP_CLI;
    
    if ($wp_cli) {
        // Running in WP-CLI context
        WP_CLI::run_command(explode(' ', $command));
        $output = ['message' => 'Command executed via WP-CLI'];
    } else {
        // Fallback: try shell exec (for REST API context)
        $wp_path = ABSPATH;
        $cmd = sprintf('cd %s && wp %s 2>&1', escapeshellarg($wp_path), $command);
        exec($cmd, $output, $return_code);
    }
    
    return [
        'success' => $return_code === 0,
        'command' => $command,
        'output' => is_array($output) ? implode("\n", $output) : $output,
        'return_code' => $return_code,
    ];
}
