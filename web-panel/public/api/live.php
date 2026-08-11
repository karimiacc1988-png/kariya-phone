<?php
require __DIR__ . '/_lib.php';

// تماس‌های زنده از CoreShowChannels — دو کانالِ هر تماس را با Linkedid یکی می‌کنیم
$ami = new Ami();
$packets = $ami->action(['Action' => 'CoreShowChannels'], 'CoreShowChannelsComplete');

// نام داخلی‌ها برای نمایش
$names = [];
$db = db('pbx');
if ($res = $db->query("SELECT extension, name FROM users")) {
  while ($r = $res->fetch_assoc()) $names[$r['extension']] = $r['name'];
}

$groups = [];
foreach ($packets as $p) {
  if (($p['Event'] ?? '') !== 'CoreShowChannel') continue;
  $link = $p['Linkedid'] ?? $p['Uniqueid'] ?? $p['Channel'];
  $groups[$link][] = $p;
}

$rows = [];
foreach ($groups as $link => $legs) {
  // کانال داخلی (SIP/NNN که NNN جزو داخلی‌هاست) و طرف مقابل
  $ext = ''; $peer = ''; $ctx = ''; $state = 'talking'; $since = time(); $chName = '';
  foreach ($legs as $leg) {
    $e = extFromChannel($leg['Channel'] ?? '');
    $ctx = $leg['Context'] ?? $ctx;
    $dur = (int)($leg['Duration'] ? array_sum(array_map('intval', array_reverse(explode(':', $leg['Duration'])))) : 0);
    // Duration به شکل HH:MM:SS است
    if (!empty($leg['Duration']) && preg_match('/(\d+):(\d+):(\d+)/', $leg['Duration'], $m)) {
      $dur = $m[1] * 3600 + $m[2] * 60 + $m[3];
    }
    $since = min($since, time() - $dur);
    $desc = $leg['ChannelStateDesc'] ?? '';
    if (stripos($desc, 'ring') !== false) $state = 'ringing';
    elseif (stripos($desc, 'up') !== false && $state !== 'ringing') $state = 'talking';
    if ($e && isset($names[$e])) { $ext = $e; $chName = $leg['Channel']; }
    // شماره طرف مقابل: CallerIDNum یا ConnectedLineNum که داخلی نباشد
    foreach (['CallerIDNum', 'ConnectedLineNum'] as $f) {
      $v = $leg[$f] ?? '';
      if ($v && !isset($names[$v]) && strlen($v) >= 3) $peer = $v;
    }
  }
  if (!$ext) { $ext = extFromChannel($legs[0]['Channel'] ?? ''); }
  if (!$peer) { $peer = $legs[0]['CallerIDNum'] ?? ''; }

  $rows[] = [
    'id'        => (string)$link,
    'dir'       => dirFromContext($ctx),
    'peer'      => $peer,
    'name'      => '',
    'ext'       => $ext,
    'state'     => $state,
    'since'     => $since,
    'trunk'     => '',
    'recording' => false,
  ];
}

out(['rows' => array_values($rows)]);
