<?php
require __DIR__ . '/_lib.php';

$in = input();
$id = (string)($in['id'] ?? '');
if ($id === '') fail('شناسه تماس لازم است');

$ami = new Ami();
// همه‌ی کانال‌های این Linkedid را پیدا و قطع کن
$packets = $ami->action(['Action' => 'CoreShowChannels'], 'CoreShowChannelsComplete');
$hung = 0;
foreach ($packets as $p) {
  if (($p['Event'] ?? '') !== 'CoreShowChannel') continue;
  $link = $p['Linkedid'] ?? $p['Uniqueid'] ?? '';
  if ($link === $id || ($p['Channel'] ?? '') === $id) {
    $ami->action(['Action' => 'Hangup', 'Channel' => $p['Channel']]);
    $hung++;
  }
}

out(['ok' => true, 'hung' => $hung]);
