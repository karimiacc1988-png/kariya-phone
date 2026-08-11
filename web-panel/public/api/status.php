<?php
require __DIR__ . '/_lib.php';

$host = trim(@shell_exec('hostname') ?: 'issabel');
$uptime = 0;
if (is_readable('/proc/uptime')) { $uptime = (int)floatval(explode(' ', file_get_contents('/proc/uptime'))[0]); }

$pbxVer = 'Asterisk';
$ami = new Ami();
$ver = $ami->action(['Action' => 'CoreSettings']);
foreach ($ver as $p) if (!empty($p['AsteriskVersion'])) $pbxVer = 'Asterisk ' . $p['AsteriskVersion'];

// شمارش کانال‌های فعال
$ch = $ami->action(['Action' => 'CoreShowChannels'], 'CoreShowChannelsComplete');
$channels = 0;
foreach ($ch as $p) if (($p['Event'] ?? '') === 'CoreShowChannel') $channels++;
$calls = (int)ceil($channels / 2); // هر تماس دو کانال

// ظرفیت ترانک از دیتابیس
$used = $channels; // تقریب: کانال‌های درگیر
$total = 0;
$db = db('pbx');
if ($res = @$db->query("SELECT COUNT(*) c FROM trunks WHERE disabled='off'")) {
  $row = $res->fetch_assoc();
  $total = max(1, (int)$row['c']) * 10; // فرض ظرفیت هر ترانک؛ در تنظیمات قابل تغییر
}

out([
  'connected' => true,
  'pbx' => $pbxVer . ' · Issabel',
  'host' => $host,
  'uptime' => $uptime,
  'channels' => $calls,
  'trunkChannels' => ['used' => $used, 'total' => $total],
  'me' => ['ext' => '', 'name' => 'کاربر', 'role' => 'اپراتور'],
]);
