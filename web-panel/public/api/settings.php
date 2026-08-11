<?php
require __DIR__ . '/_lib.php';

global $CFG;
out([
  'ami' => [
    'host'   => $CFG['ami']['host'],
    'port'   => $CFG['ami']['port'],
    'user'   => $CFG['ami']['user'],
    'permit' => '127.0.0.1/32',
    'write'  => 'originate,call,reporting',
  ],
  'click2call' => [
    'agentExt'      => $CFG['click2call']['agentExt'],
    'context'       => $CFG['click2call']['context'],
    'confirm'       => true,
    'maxConcurrent' => 4,
  ],
  'recording' => [
    'enabled'  => true,
    'path'     => '/var/spool/asterisk/monitor',
    'keepDays' => 90,
  ],
]);
