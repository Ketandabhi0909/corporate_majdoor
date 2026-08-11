<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

$dir = __DIR__ . DIRECTORY_SEPARATOR . 'data';
$allowed = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'];
$images = [];

if (is_dir($dir)) {
  foreach (scandir($dir) as $file) {
    if ($file === '.' || $file === '..') {
      continue;
    }
    $full = $dir . DIRECTORY_SEPARATOR . $file;
    if (!is_file($full)) {
      continue;
    }
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    if (!in_array($ext, $allowed, true)) {
      continue;
    }
    $images[] = $file;
  }
}

natcasesort($images);

$urls = [];
foreach ($images as $file) {
  $urls[] = 'data/' . rawurlencode($file);
}

echo json_encode(array_values($urls));
