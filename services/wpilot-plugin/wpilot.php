<?php
/**
 * Plugin Name: WPilot Connector
 * Plugin URI: https://wpilot.ai
 * Description: เชื่อมต่อ WordPress กับ WPilot AI Auto-Pilot System — Remote updates, backups, content generation
 * Version: 1.0.0
 * Author: WPilot
 * License: GPL v2 or later
 * Text Domain: wpilot
 */

defined('ABSPATH') || exit;

define('WPILOT_VERSION', '1.0.0');
define('WPILOT_API_NAMESPACE', 'wpilot/v1');

// ── Include ──
require_once plugin_dir_path(__FILE__) . 'includes/auth.php';
require_once plugin_dir_path(__FILE__) . 'includes/commands.php';
require_once plugin_dir_path(__FILE__) . 'includes/api.php';
require_once plugin_dir_path(__FILE__) . 'includes/backup.php';

// ── Activation ──
register_activation_hook(__FILE__, function () {
    // Generate API key on activation
    if (!get_option('wpilot_api_key')) {
        update_option('wpilot_api_key', 'wpi_' . wp_generate_password(30, false));
    }
});

// ── Admin notice (แสดง API Key) ──
add_action('admin_notices', function () {
    if (get_current_screen() && get_current_screen()->id !== 'plugins') return;
    $key = get_option('wpilot_api_key');
    if ($key) {
        echo '<div class="notice notice-info"><p>';
        echo '🔌 <strong>WPilot Connector</strong> — API Key ของคุณ: <code>' . esc_html($key) . '</code>';
        echo '<br><small>ใส่คีย์นี้ใน WPilot Dashboard เพื่อเชื่อมต่อ</small></p></div>';
    }
});

// ── Settings link ──
add_filter('plugin_action_links_' . plugin_basename(__FILE__), function ($links) {
    $links[] = '<a href="' . admin_url('options-general.php?page=wpilot-settings') . '">Settings</a>';
    return $links;
});

// ── Admin page ──
add_action('admin_menu', function () {
    add_options_page('WPilot Settings', 'WPilot', 'manage_options', 'wpilot-settings', function () {
        $key = get_option('wpilot_api_key');
        ?>
        <div class="wrap">
            <h1>🔌 WPilot Connector</h1>
            <p>ใช้คีย์นี้ใน WPilot Dashboard เพื่อเชื่อมต่อระบบ AI Auto-Pilot</p>
            <table class="form-table">
                <tr><th>API Key</th><td><code style="font-size:16px;padding:8px 12px;"><?php echo esc_html($key); ?></code>
                <button class="button" onclick="navigator.clipboard.writeText('<?php echo esc_js($key); ?>')">📋 Copy</button></td></tr>
                <tr><th>WPilot Server</th><td><code><?php echo home_url(); ?></code></td></tr>
                <tr><th>WordPress</th><td><?php echo get_bloginfo('version'); ?></td></tr>
            </table>
            <hr>
            <h2>Regenerate Key</h2>
            <p>ถ้าคุณคิดว่าคีย์รั่วไหล ให้กดสร้างใหม่ (จะ切断 connection เดิม)</p>
            <form method="post">
                <?php wp_nonce_field('wpilot_regenerate_key'); ?>
                <input type="hidden" name="wpilot_action" value="regenerate_key">
                <input type="submit" class="button button-warning" value="🔄 Regenerate Key" onclick="return confirm('แน่ใจ?')">
            </form>
        </div>
        <?php
    });
});

// Handle key regeneration
add_action('admin_init', function () {
    if (isset($_POST['wpilot_action']) && $_POST['wpilot_action'] === 'regenerate_key') {
        check_admin_referer('wpilot_regenerate_key');
        if (current_user_can('manage_options')) {
            update_option('wpilot_api_key', 'wpi_' . wp_generate_password(30, false));
            wp_redirect(admin_url('options-general.php?page=wpilot-settings&regenerated=1'));
            exit;
        }
    }
});
