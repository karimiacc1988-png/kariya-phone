<?php
require __DIR__ . '/_lib.php';

$db = db('pbx');

// وضعیت رجیستری ترانک‌ها از AMI
$reg = [];
$ami = new Ami();
$rs = $ami->action(['Action' => 'SIPshowregistry'], 'RegistrationsComplete');
foreach ($rs as $p) {
  if (($p['Event'] ?? '') !== 'RegistryEntry') continue;
  $host = $p['Host'] ?? '';
  $st = strtolower($p['State'] ?? $p['Status'] ?? '');
  $reg[$host] = (strpos($st, 'registered') !== false) ? 'online' : 'offline';
}

$rows = [];
$res = $db->query("SELECT trunkid, name, tech, outcid, channelid, disabled FROM trunks");
while ($r = $res->fetch_assoc()) {
  $online = $r['disabled'] === 'off';
  $rows[] = [
    'id'       => $r['name'],
    'name'     => $r['name'],
    'tech'     => strtoupper($r['tech']),
    'host'     => $r['channelid'] ?: '—',
    'channels' => 10,               // ظرفیت پیش‌فرض؛ بعداً از تنظیمات
    'inuse'    => 0,
    'status'   => $online ? 'online' : 'offline',
    'cid'      => $r['outcid'] ?: '',
    'note'     => '',
  ];
}

// شمارش کانال‌های در حال استفاده‌ی هر ترانک از کانال‌های فعال
$ch = $ami->action(['Action' => 'CoreShowChannels'], 'CoreShowChannelsComplete');
$trunkUse = 0;
foreach ($ch as $p) {
  if (($p['Event'] ?? '') !== 'CoreShowChannel') continue;
  $c = $p['Channel'] ?? '';
  foreach ($rows as &$row) {
    if ($row['name'] !== '' && stripos($c, $row['name']) !== false) $row['inuse']++;
  }
  unset($row);
}

out(['rows' => $rows]);
