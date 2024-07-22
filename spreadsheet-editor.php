<?php
/**
 * Plugin Name: Tables - Post Spreadsheet Editor
 * Description: A plugin to manage post types and their fields, including custom fields, in a spreadsheet-like interface.
 * Version: 1.0
 * Author: Luke Heyburn
 * Author URI: https://digitallytailored.com/
 */

if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly
}

// Load necessary scripts and styles
function ctm_enqueue_admin_scripts($hook) {
    if (strpos($hook, 'dt-tables') === false) {
        return;
    }
    wp_enqueue_script('dtt-admin-js', plugins_url('/js/admin.js', __FILE__), array('jquery'), '1.0', true);
    wp_localize_script('dtt-admin-js', 'wpApiSettings', array(
        'nonce' => wp_create_nonce('wp_rest')
    ));
    wp_enqueue_style('dtt-admin-css', plugins_url('/css/admin.css', __FILE__), array(), '1.0');
}
add_action('admin_enqueue_scripts', 'ctm_enqueue_admin_scripts');

// Add admin menu
function ctm_add_admin_menu() {
    add_menu_page('DT Tables', 'DT Tables', 'manage_options', 'dt-tables', 'ctm_admin_page', '/wp-content/plugins/spreadsheet-editor/icon.svg', 6);
    add_submenu_page('dt-tables', 'All Content Types', 'All Content Types', 'manage_options', 'dt-tables', 'ctm_admin_page');

    $post_types = get_post_types(array('public' => true), 'objects');
    foreach ($post_types as $post_type) {
        add_submenu_page('dt-tables', $post_type->labels->name, $post_type->labels->name, 'manage_options', 'dt-tables-' . $post_type->name, 'ctm_admin_page');
    }
}
add_action('admin_menu', 'ctm_add_admin_menu');

// Admin page callback
function ctm_admin_page() {
    $current_page = isset($_GET['page']) ? sanitize_text_field($_GET['page']) : 'dt-tables';
    $post_type = str_replace('dt-tables-', '', $current_page);
    ?>
    <div class="wrap">
        <h1>DT Tables - Content Editor</h1>
        <div id="dtt-app" data-post-type="<?php echo esc_attr($post_type); ?>">
            <!-- React App will mount here -->
        </div>
    </div>
    <?php
}

// Register REST routes
add_action('rest_api_init', function () {
    register_rest_route('dtt/v1', '/content-types', array(
        'methods' => 'GET',
        'callback' => 'ctm_get_content_types',
        'permission_callback' => '__return_true'
    ));

    register_rest_route('dtt/v1', '/posts', array(
        'methods' => 'GET',
        'callback' => 'ctm_get_posts',
        'permission_callback' => '__return_true'
    ));

    register_rest_route('dtt/v1', '/save-post', array(
        'methods' => 'POST',
        'callback' => 'ctm_save_post',
        'permission_callback' => function() {
            return current_user_can('edit_posts');
        }
    ));
});

function ctm_get_content_types() {
    $post_types = get_post_types(array('public' => true), 'objects');
    return new WP_REST_Response(array_values($post_types), 200);
}

function ctm_get_posts(WP_REST_Request $request) {
    $post_type = $request->get_param('post_type') ? sanitize_text_field($request->get_param('post_type')) : 'post';
    $posts = get_posts(array('post_type' => $post_type, 'posts_per_page' => -1));
    $response = array();

    foreach ($posts as $post) {
        $custom_fields = get_post_meta($post->ID);
        $response[] = array(
            'ID' => $post->ID,
            'title' => $post->post_title,
            'slug' => $post->post_name,
            'content' => $post->post_content,
            'fields' => $custom_fields,
        );
    }

    return new WP_REST_Response($response, 200);
}

function ctm_save_post(WP_REST_Request $request) {
    $input = $request->get_json_params();

    if (!isset($input['_wpnonce']) || !wp_verify_nonce($input['_wpnonce'], 'wp_rest')) {
        return new WP_REST_Response(array('status' => 'error', 'message' => 'Invalid nonce'), 403);
    }

    $post_id = isset($input['post_id']) ? intval($input['post_id']) : 0;
    $title = isset($input['title']) ? sanitize_text_field($input['title']) : '';
    $slug = isset($input['slug']) ? sanitize_title($input['slug']) : '';
    $content = isset($input['content']) ? wp_kses_post($input['content']) : '';
    $custom_fields = isset($input['custom_fields']) ? $input['custom_fields'] : array();

    // Update post title, slug, and content
    $post_data = array(
        'ID' => $post_id,
        'post_title' => $title,
        'post_name' => $slug,
        'post_content' => $content,
    );
    wp_update_post($post_data);

    // Update custom fields
    foreach ($custom_fields as $key => $value) {
        if ($key === '_wp_old_slug') {
            // Ensure that _wp_old_slug is updated correctly
            delete_post_meta($post_id, $key);
            $value = sanitize_text_field($value);
        } elseif (is_array($value)) {
            $value = array_map('sanitize_text_field', $value);
        } else {
            $value = sanitize_text_field($value);
        }
        update_post_meta($post_id, $key, $value);
    }

    return new WP_REST_Response(array('status' => 'success'), 200);
}
