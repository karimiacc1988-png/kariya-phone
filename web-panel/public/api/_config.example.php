<?php
// تنظیمات اتصال — روی خود ایزابل اجرا می‌شود، همه‌چیز لوکال است.
// این فایل نمونه است؛ آن را به `_config.php` کپی کن و مقدارها را پر کن.
// `_config.php` واقعی در .gitignore است و هرگز نباید به گیت برود — رمز دارد.
//
// بیرون از docroot عمومی هم می‌شد گذاشت، ولی چون کل اپ روی همین سرور و پشت
// شبکه داخلی است، همین‌جا کافی است.
return [
  'ami' => [
    'host'   => '127.0.0.1',
    'port'   => 5038,
    'user'   => 'kariya',            // کاربر AMI در /etc/asterisk/manager_custom.conf
    'secret' => 'CHANGE_ME_AMI',     // رمز همان کاربر
  ],
  'db' => [
    'host' => 'localhost',
    'user' => 'asteriskuser',
    'pass' => 'CHANGE_ME_DB',        // رمز MySQL ایزابل
    'cdr'  => 'asteriskcdrdb',
    'pbx'  => 'asterisk',
  ],
  // داخلی پشتیبان برای click-to-call (اول این زنگ می‌خورد، بعد مشتری)
  'click2call' => [
    'agentExt' => '700',
    'context'  => 'from-internal',
  ],
];
