<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

date_default_timezone_set('Asia/Kolkata');

$onlineFile = __DIR__ . '/data/online.json';
$statsFile = __DIR__ . '/data/stats.json';
$timeout = 40;

if (!is_dir(__DIR__ . '/data')) {
  mkdir(__DIR__ . '/data', 0777, true);
}

$raw = file_get_contents('php://input');
$body = json_decode($raw, true);
if (!is_array($body)) {
  $body = $_POST ?: $_GET;
}

$id = isset($body['id']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', (string) $body['id']) : '';
$leave = !empty($body['leave']);
$hit = !empty($body['hit']);

if ($id === '' || strlen($id) > 64) {
  echo json_encode(['online' => 0, 'error' => 'invalid id']);
  exit;
}

function read_locked($path) {
  $fp = fopen($path, 'c+');
  if (!$fp) {
    return [null, null];
  }
  flock($fp, LOCK_EX);
  rewind($fp);
  $data = json_decode(stream_get_contents($fp), true);
  if (!is_array($data)) {
    $data = [];
  }
  return [$fp, $data];
}

function write_locked($fp, $data) {
  ftruncate($fp, 0);
  rewind($fp);
  fwrite($fp, json_encode($data));
  fflush($fp);
  flock($fp, LOCK_UN);
  fclose($fp);
}

function empty_stats() {
  return [
    'total_views' => 0,
    'all_users' => [],
    'days' => [],
  ];
}

function day_in_range($day, $from, $to) {
  return $day >= $from && $day <= $to;
}

function summarize($stats, $from, $to) {
  $views = 0;
  $users = [];
  foreach ($stats['days'] as $day => $row) {
    if (!day_in_range($day, $from, $to)) {
      continue;
    }
    $views += (int) ($row['views'] ?? 0);
    foreach (($row['users'] ?? []) as $uid => $flag) {
      if ($flag) {
        $users[$uid] = true;
      }
    }
  }
  return [
    'views' => $views,
    'users' => count($users),
  ];
}

[$onlineFp, $online] = read_locked($onlineFile);
if (!$onlineFp) {
  http_response_code(500);
  echo json_encode(['online' => 0, 'error' => 'cannot open store']);
  exit;
}

$now = time();
foreach ($online as $uid => $last) {
  if (!is_numeric($last) || ($now - (int) $last) > $timeout) {
    unset($online[$uid]);
  }
}

if ($leave) {
  unset($online[$id]);
} else {
  $online[$id] = $now;
}

write_locked($onlineFp, $online);

[$statsFp, $stats] = read_locked($statsFile);
if (!$statsFp) {
  echo json_encode(['online' => count($online), 'id' => $id]);
  exit;
}

if (!isset($stats['total_views'], $stats['days'])) {
  $stats = empty_stats();
}
if (!isset($stats['all_users']) || !is_array($stats['all_users'])) {
  $stats['all_users'] = [];
}
if (!isset($stats['days']) || !is_array($stats['days'])) {
  $stats['days'] = [];
}

$today = date('Y-m-d');
if ($hit && !$leave) {
  $stats['total_views'] = (int) $stats['total_views'] + 1;
  $stats['all_users'][$id] = true;
  if (!isset($stats['days'][$today]) || !is_array($stats['days'][$today])) {
    $stats['days'][$today] = ['views' => 0, 'users' => []];
  }
  $stats['days'][$today]['views'] = (int) ($stats['days'][$today]['views'] ?? 0) + 1;
  $stats['days'][$today]['users'][$id] = true;
}

$dow = (int) date('N');
$weekStart = date('Y-m-d', strtotime('-' . ($dow - 1) . ' days'));
$monthStart = date('Y-m-01');
$yearStart = date('Y-01-01');

$todayStats = summarize($stats, $today, $today);
$weekStats = summarize($stats, $weekStart, $today);
$monthStats = summarize($stats, $monthStart, $today);
$yearStats = summarize($stats, $yearStart, $today);

write_locked($statsFp, $stats);

echo json_encode([
  'online' => count($online),
  'id' => $id,
  'today' => $todayStats,
  'week' => $weekStats,
  'month' => $monthStats,
  'year' => $yearStats,
  'total' => [
    'views' => (int) $stats['total_views'],
    'users' => count($stats['all_users']),
  ],
]);
