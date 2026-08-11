<?php
require __DIR__ . '/_lib.php';

$db = db('pbx');

// وضعیت لحظه‌ای داخلی‌ها از AMI (SIP peers / PJSIP)
$status = [];
$ami = new Ami();
$peers = $ami->action(['Action' => 'SIPpeers'], 'PeerlistComplete');
foreach ($peers as $p) {
  if (($p['Event'] ?? '') !== 'PeerEntry') continue;
  $ext = $p['ObjectName'] ?? '';
  $st = strtolower($p['Status'] ?? '');
  if (strpos($st, 'ok') !== false) $status[$ext] = 'online';
  elseif (strpos($st, 'unreachable') !== false || strpos($st, 'unknown') !== false) $status[$ext] = 'offline';
  else $status[$ext] = 'offline';
}

// شماره‌ی انتقال (Follow-Me) از جدول
$fm = [];
if ($res = @$db->query("SELECT grpnum, grplist FROM findmefollow")) {
  while ($r = $res->fetch_assoc()) $fm[$r['grpnum']] = trim(str_replace('#', '', explode('&', $r['grplist'])[0] ?? ''));
}

$rows = [];
$res = $db->query("SELECT u.extension, u.name, u.voicemail, u.outboundcid, d.tech, d.description
                   FROM users u LEFT JOIN devices d ON d.id = u.extension
                   ORDER BY u.extension");
while ($r = $res->fetch_assoc()) {
  $ext = $r['extension'];
  $rows[] = [
    'id'        => $ext,
    'ext'       => $ext,
    'name'      => $r['name'] ?: $ext,
    'dept'      => '',
    'status'    => $status[$ext] ?? 'offline',
    'tech'      => strtoupper($r['tech'] ?: 'SIP'),
    'followme'  => $fm[$ext] ?? '',
    'voicemail' => ($r['voicemail'] && $r['voicemail'] !== 'novm'),
    'cid'       => $r['outboundcid'] ?: '',
    'note'      => $r['description'] ?: '',
  ];
}

out(['rows' => $rows]);
