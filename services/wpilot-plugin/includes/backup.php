<?php
/**
 * WPilot Backup — Backup และ Restore
 */
defined('ABSPATH') || exit;

/**
 * สร้าง Backup ไฟล์และ database
 */
function wpilot_create_backup() {
    $backup_dir = WP_CONTENT_DIR . '/wpilot-backups/';
    if (!file_exists($backup_dir)) {
        wp_mkdir_p($backup_dir);
    }
    
    $timestamp = current_time('Ymd_His');
    $filename = "wpilot_backup_{$timestamp}.zip";
    $filepath = $backup_dir . $filename;
    
    // DB backup
    $db_file = $backup_dir . "db_{$timestamp}.sql";
    $db_result = wpilot_export_db($db_file);
    
    if (!$db_result) {
        return [
            'success' => false,
            'error' => 'Database backup failed',
        ];
    }
    
    // Files backup (uploads, plugins, themes)
    $zip = new ZipArchive();
    if ($zip->open($filepath, ZipArchive::CREATE) !== TRUE) {
        return [
            'success' => false,
            'error' => 'Cannot create zip file',
        ];
    }
    
    // Add DB dump
    $zip->addFile($db_file, 'database.sql');
    
    // Add wp-content (excluding backups dir itself)
    wpilot_add_folder_to_zip(WP_CONTENT_DIR, $zip, 'wp-content/', ['wpilot-backups', 'cache', 'upgrade']);
    
    $zip->close();
    unlink($db_file); // Clean up SQL file
    
    $filesize = filesize($filepath);
    
    // Keep only last 5 backups
    wpilot_rotate_backups($backup_dir, 5);
    
    return [
        'success' => true,
        'id' => $timestamp,
        'filename' => $filename,
        'path' => $filepath,
        'size' => $filesize,
        'created_at' => current_time('mysql'),
    ];
}

/**
 * Export database
 */
function wpilot_export_db($output_file) {
    global $wpdb;
    
    $tables = $wpdb->get_col('SHOW TABLES');
    $output = '';
    
    foreach ($tables as $table) {
        $create = $wpdb->get_row("SHOW CREATE TABLE `$table`", ARRAY_N);
        $output .= "\n\n-- Table: $table\n\n";
        $output .= $create[1] . ";\n\n";
        
        $rows = $wpdb->get_results("SELECT * FROM `$table`", ARRAY_A);
        foreach ($rows as $row) {
            $cols = array_map(function($val) use ($wpdb) {
                return "'" . esc_sql($val) . "'";
            }, array_values($row));
            $output .= "INSERT INTO `$table` VALUES (" . implode(', ', $cols) . ");\n";
        }
    }
    
    return file_put_contents($output_file, $output) !== false;
}

/**
 * Restore from backup
 */
function wpilot_restore_backup($backup_id) {
    $backup_dir = WP_CONTENT_DIR . '/wpilot-backups/';
    $filename = "wpilot_backup_{$backup_id}.zip";
    $filepath = $backup_dir . $filename;
    
    if (!file_exists($filepath)) {
        return [
            'success' => false,
            'error' => 'Backup file not found',
        ];
    }
    
    $zip = new ZipArchive();
    if ($zip->open($filepath) !== TRUE) {
        return [
            'success' => false,
            'error' => 'Cannot open backup file',
        ];
    }
    
    // Extract
    $extract_dir = $backup_dir . 'restore_' . $backup_id . '/';
    if (!file_exists($extract_dir)) {
        wp_mkdir_p($extract_dir);
    }
    $zip->extractTo($extract_dir);
    $zip->close();
    
    // Restore DB
    $db_file = $extract_dir . 'database.sql';
    if (file_exists($db_file)) {
        wpilot_import_db($db_file);
    }
    
    // Clean up
    wpilot_remove_directory($extract_dir);
    
    return [
        'success' => true,
        'restored_from' => $backup_id,
    ];
}

// ── Helpers ──

function wpilot_add_folder_to_zip($folder, $zip, $relative_path, $exclude = []) {
    $handle = opendir($folder);
    while (($file = readdir($handle)) !== false) {
        if ($file == '.' || $file == '..') continue;
        if (in_array($file, $exclude)) continue;
        
        $full_path = $folder . '/' . $file;
        $local_path = $relative_path . $file;
        
        if (is_dir($full_path)) {
            $zip->addEmptyDir($local_path);
            wpilot_add_folder_to_zip($full_path, $zip, $local_path . '/', $exclude);
        } else {
            $zip->addFile($full_path, $local_path);
        }
    }
    closedir($handle);
}

function wpilot_rotate_backups($dir, $keep) {
    $files = glob($dir . 'wpilot_backup_*.zip');
    usort($files, function($a, $b) {
        return filemtime($a) - filemtime($b);
    });
    while (count($files) > $keep) {
        $file = array_shift($files);
        unlink($file);
    }
}

function wpilot_import_db($sql_file) {
    global $wpdb;
    $sql = file_get_contents($sql_file);
    $queries = explode(";\n", $sql);
    foreach ($queries as $query) {
        $query = trim($query);
        if (!empty($query)) {
            $wpdb->query($query);
        }
    }
}

function wpilot_remove_directory($dir) {
    if (!file_exists($dir)) return;
    $files = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($files as $file) {
        $file->isDir() ? rmdir($file->getRealPath()) : unlink($file->getRealPath());
    }
    rmdir($dir);
}
