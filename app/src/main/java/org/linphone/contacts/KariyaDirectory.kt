/*
 * دفترچه‌ی همکاران کاریا.
 *
 * فهرست داخلی‌های دفتر را از پنل می‌گیرد و هر کدام را به شکل یک مخاطب داخل اپ
 * می‌نشاند. نتیجه‌اش این است که کارمند:
 *   • همکارانش را در فهرست مخاطبین می‌بیند و با یک لمس زنگ می‌زند
 *   • لازم نیست شماره‌ی داخلی را حفظ باشد یا بگیرد
 *   • وقتی همکاری زنگ می‌زند، به‌جای «۱۲۹» اسمش را می‌بیند
 *
 * 🔺 عمداً از سازوکار خودِ لینفون («فهرست دوستان») استفاده می‌کند و صفحه‌ی تازه‌ای
 * نمی‌سازد. این‌طور جستجو، علاقه‌مندی‌ها، تاریخچه و شناساییِ تماس همگی بدون یک
 * خط کد اضافه کار می‌کنند — چیزی که با یک فهرست دست‌ساز باید همه را از نو نوشت.
 */
package org.linphone.contacts

import android.net.Uri
import android.util.Base64
import androidx.annotation.WorkerThread
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject
import org.linphone.LinphoneApplication.Companion.coreContext
import org.linphone.LinphoneApplication.Companion.corePreferences
import org.linphone.core.Factory
import org.linphone.core.Friend
import org.linphone.core.FriendList
import org.linphone.core.tools.Log

object KariyaDirectory {
    private const val TAG = "[Kariya Directory]"

    private const val BASE_URL = "https://new.kariyahesab.com"
    private const val TIMEOUT_MS = 15_000

    /** مهلت کوتاه‌تر برای استعلام نام: روی مسیر نمایش تماس است و نباید معطل کند. */
    private const val LOOKUP_TIMEOUT_MS = 6_000

    /**
     * کیفیت شبکه به درصد سنجیده می‌شود، نه میلی‌ثانیه — چون تصمیمِ «الان تماس
     * اینترنتی بگیرم یا آفلاین» با یک عدد ساده روشن‌تر است.
     *
     * ۱۵۰ میلی‌ثانیه یا کمتر → ۱۰۰٪ (عالی)
     * ۱۰۰۰ میلی‌ثانیه یا بیشتر → ۰٪ (غیرقابل استفاده)
     * بینشان خطی.
     */
    private const val PING_BEST_MS = 150
    private const val PING_WORST_MS = 1_000

    /** زیر این درصد، تماس اینترنتی می‌بُرد و بهتر است آفلاین گرفته شود. */
    private const val MIN_QUALITY_PERCENT = 30

    /** نتیجه‌ی سنجش این‌قدر معتبر می‌ماند، تا هر نگاه به صفحه یک درخواست نزند. */
    private const val NETWORK_CHECK_TTL_MS = 30_000L

    /** نام فهرست، تا هر بار همان را به‌روز کنیم و فهرست تکراری نسازیم. */
    private const val LIST_NAME = "kariya-colleagues"

    /**
     * فهرست را از پنل می‌گیرد و مخاطب‌ها را می‌سازد.
     *
     * ⚠️ اگر شبکه نبود یا پاسخ خراب بود، فهرستِ قبلی دست‌نخورده می‌ماند. پاک‌کردنِ
     * مخاطب‌ها به‌خاطر یک قطعیِ موقت، بدترین کاری است که می‌شود کرد.
     */
    /**
     * همگام‌سازی، ولی فقط اگر امروز انجام نشده باشد.
     *
     * دفترچه‌ی همکاران روزی یک بار تازه می‌شود — نه هر بار که اپ بالا می‌آید.
     * فهرست داخلی‌ها هفته‌ها ثابت می‌ماند؛ گرفتنش در هر اجرا فقط به سرور و به
     * اینترنتِ گوشی فشار می‌آورد.
     *
     * ⚠️ «ساعت سه صبح» به‌معنای بیدارکردنِ گوشی نیست: اپ در آن ساعت ممکن است
     * اصلا اجرا نباشد. قاعده این است که هر بار اپ بالا آمد، اگر از آخرین
     * همگام‌سازی یک «مرز سه صبح» گذشته باشد، دوباره می‌گیرد. نتیجه همان است —
     * فهرست هر روز تازه می‌شود — بدون سرویسِ پس‌زمینه و مصرف باتری.
     */
    @WorkerThread
    fun syncIfDue() {
        val now = System.currentTimeMillis()
        val last = corePreferences.kariyaDirectorySyncedAt

        val calendar = java.util.Calendar.getInstance().apply {
            timeInMillis = now
            set(java.util.Calendar.HOUR_OF_DAY, 3)
            set(java.util.Calendar.MINUTE, 0)
            set(java.util.Calendar.SECOND, 0)
            set(java.util.Calendar.MILLISECOND, 0)
        }
        // آخرین مرز سه صبحی که گذشته است
        var boundary = calendar.timeInMillis
        if (boundary > now) boundary -= 24L * 60 * 60 * 1000

        // اگر فهرست همکاران خالی است، بی‌توجه به زمان همگام کن — وگرنه کاربری
        // که همگام‌سازی‌اش یک بار (به هر دلیل) ناموفق بود، تا فردا صبح بی‌مخاطب
        // می‌ماند.
        val listEmpty = (coreContext.core.getFriendListByName(LIST_NAME)?.friends?.size ?: 0) == 0

        if (!listEmpty && last in (boundary + 1)..now) {
            Log.i("$TAG Colleagues already synced after the 03:00 mark, skipping")
            return
        }
        sync()
        corePreferences.kariyaDirectorySyncedAt = System.currentTimeMillis()
    }

    @WorkerThread
    fun sync() {
        /*
         * ⚠️ داخلی از خودِ حسابِ ثبت‌شده خوانده می‌شود، نه از تنظیماتِ ذخیره‌شده.
         * نسخه‌ی اول به شماره‌ی موبایل تکیه می‌کرد که فقط هنگام ورود نوشته می‌شد،
         * و نتیجه‌اش این بود که هرکس از قبل وارد شده بود دفترچه‌اش هرگز نمی‌آمد.
         */
        val account = coreContext.core.defaultAccount
        val myExtension = account?.params?.identityAddress?.username.orEmpty()
        val mobile = corePreferences.kariyaMobile
        if (myExtension.isEmpty() && mobile.isEmpty()) {
            Log.i("$TAG No account yet, skipping colleague sync")
            return
        }

        val payload = fetch(mobile, myExtension) ?: return
        val colleagues = payload.optJSONArray("colleagues") ?: return
        val domain = payload.optString("domain")
        if (domain.isEmpty()) {
            Log.e("$TAG Directory has no domain, cannot build addresses")
            return
        }

        val core = coreContext.core

        val friends = arrayListOf<Friend>()
        for (index in 0 until colleagues.length()) {
            val item = colleagues.optJSONObject(index) ?: continue
            val ext = item.optString("ext")
            val name = item.optString("name").ifEmpty { ext }
            if (ext.isEmpty() || ext == myExtension) continue   // خودش را در فهرست خودش نمی‌خواهد

            val address = core.interpretUrl("sip:$ext@$domain", false) ?: continue
            val friend = core.createFriend()
            friend.name = name
            friend.addAddress(address)

            /*
             * ⚠️ شماره‌ی داخلی جدا از نشانی SIP هم اضافه می‌شود. نسخه‌ی اول فقط
             * نشانی داشت و نتیجه‌اش این بود که همکاران در فهرست دیده می‌شدند ولی
             * دکمه‌ی تماس نداشتند — چون صفحه‌ی مخاطب برای زنگ‌زدن دنبال «شماره»
             * می‌گردد، نه نشانی.
             */
            Factory.instance().createFriendPhoneNumber(ext, "داخلی")?.let {
                friend.addPhoneNumberWithLabel(it)
            }

            friend.isSubscribesEnabled = false                 // حضور و غیاب لازم نداریم
            savePhoto(item.optString("avatar"), ext)?.let { friend.photo = it }
            friends.add(friend)
        }

        // عکس و نامِ خودِ کاربر روی حسابش می‌نشیند تا بالای کشو دیده شود.
        // در حلقه‌ی بالا عمداً کنار گذاشته شد (کسی خودش را در فهرست نمی‌خواهد)،
        // ولی این‌جا لازم است.
        applyOwnProfile(colleagues, myExtension, account)

        if (friends.isEmpty()) {
            Log.w("$TAG Directory came back empty, leaving existing contacts alone")
            return
        }

        /*
         * ⚠️ فهرست هر بار از نو ساخته می‌شود. نسخه‌ی اول با `synchronizeFriendsWith`
         * به‌روزرسانی می‌کرد، ولی آن تابع مخاطبِ موجود را عوض نمی‌کرد — و چون
         * نسخه‌های قبلی این اپ فهرست را بدون عکس ساخته بودند، عکس‌ها هرگز
         * نمی‌نشستند. فقط ۱۲ نفرند؛ ساختنِ دوباره ارزان است و خیالمان راحت.
         */
        core.getFriendListByName(LIST_NAME)?.let { old ->
            core.removeFriendList(old)
        }
        val list = core.createFriendList()
        list.isDatabaseStorageEnabled = true
        list.type = FriendList.Type.Default
        list.displayName = LIST_NAME
        core.addFriendList(list)
        for (friend in friends) {
            list.addLocalFriend(friend)
        }
        Log.i("$TAG Rebuilt colleagues list with [${friends.size}] entries")

        coreContext.contactsManager.notifyContactsListChanged()
    }

    /**
     * نام و عکسِ خودِ کاربر را روی حسابش می‌نشاند تا بالای کشو دیده شود.
     *
     * ⚠️ حساب با پارامترهای تازه به‌روز می‌شود («clone، تغییر، برگرداندن»)، چون
     * پارامترهای یک حساب ثبت‌شده مستقیم قابل تغییر نیستند.
     */
    @WorkerThread
    private fun applyOwnProfile(
        colleagues: org.json.JSONArray,
        myExtension: String,
        account: org.linphone.core.Account?
    ) {
        if (account == null || myExtension.isEmpty()) return
        for (index in 0 until colleagues.length()) {
            val item = colleagues.optJSONObject(index) ?: continue
            if (item.optString("ext") != myExtension) continue

            val photo = savePhoto(item.optString("avatar"), myExtension)
            val name = item.optString("name")

            val params = account.params
            val copy = params.clone()
            var changed = false

            if (name.isNotEmpty() && params.identityAddress?.displayName != name) {
                val address = params.identityAddress?.clone()
                if (address != null) {
                    address.displayName = name
                    copy.identityAddress = address
                    changed = true
                }
            }
            if (photo != null && params.pictureUri != photo) {
                copy.pictureUri = photo
                changed = true
            }
            if (changed) {
                account.params = copy
                Log.i("$TAG Own name and photo applied to the account")
            }
            return
        }
    }

    /** آخرین سنجشِ کیفیت شبکه: زمانِ سنجش و اینکه خوب بود یا نه. */
    private var lastNetworkCheckAt = 0L
    private var lastQualityPercent = 100

    /**
     * آیا اینترنت برای تماسِ صوتی به‌درد می‌خورد؟
     *
     * یک درخواستِ کوچک به سرور می‌زند و رفت‌وبرگشتش را می‌سنجد. اگر بیشتر از
     * [MAX_PING_MS] طول بکشد یا اصلا نرسد، «ضعیف» است.
     *
     * ⚠️ نتیجه ۳۰ ثانیه معتبر می‌ماند. بدون آن، هر بار که کاربر به صفحه‌ی
     * شماره‌گیری نگاه می‌کرد یک درخواست می‌رفت.
     *
     * ⚠️ عمداً سخت‌گیر نیست: تماسِ اینترنتی را قطع نمی‌کند، فقط به کاربر
     * می‌گوید «الان آفلاین بهتر است». تصمیمِ آخر با خودِ اوست — چیزی که خودکار
     * جلوی تماس را بگیرد، روزی که تشخیص اشتباه بزند کار را می‌خواباند.
     */
    @WorkerThread
    fun networkQualityPercent(): Int {
        val now = System.currentTimeMillis()
        if (now - lastNetworkCheckAt < NETWORK_CHECK_TTL_MS) return lastQualityPercent

        lastNetworkCheckAt = now
        lastQualityPercent = try {
            val started = System.currentTimeMillis()
            val connection = URL("$BASE_URL/api/health").openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.connectTimeout = PING_WORST_MS
            connection.readTimeout = PING_WORST_MS
            connection.responseCode
            connection.disconnect()

            val elapsed = (System.currentTimeMillis() - started).toInt()
            val percent = when {
                elapsed <= PING_BEST_MS -> 100
                elapsed >= PING_WORST_MS -> 0
                else -> 100 - ((elapsed - PING_BEST_MS) * 100) / (PING_WORST_MS - PING_BEST_MS)
            }
            Log.i("$TAG Network probe [$elapsed] ms → quality [$percent]%")
            percent
        } catch (error: Exception) {
            Log.w("$TAG Network probe failed: $error")
            0
        }
        return lastQualityPercent
    }

    /** آیا اینترنت برای تماس صوتی به‌درد می‌خورد؟ */
    @WorkerThread
    fun isNetworkGoodForVoice(): Boolean = networkQualityPercent() >= MIN_QUALITY_PERCENT

    /**
     * «تماس آفلاین» — از مرکز تلفن می‌خواهد تماس را برقرار کند.
     *
     * سرور اول به موبایلِ خودِ کارمند زنگ می‌زند و بعد او را به مشتری وصل
     * می‌کند. هیچ‌کدام از دو طرف روی اینترنت نیستند، پس کیفیت صدا به اینترنتِ
     * گوشی ربطی ندارد — تنها چیزی که اینترنت می‌خواهد همین درخواست است که چند
     * بایت بیشتر نیست و روی ۲G هم می‌رود.
     *
     * ⚠️ فقط درخواست را می‌فرستد و برمی‌گردد؛ خودِ تماس چند لحظه بعد از راه
     * شبکه‌ی تلفن می‌رسد، نه از اپ.
     */
    @WorkerThread
    fun requestOfflineCall(rawNumber: String): Boolean {
        val number = normalise(rawNumber)
        if (number.length < 4) return false

        val myExtension = coreContext.core.defaultAccount
            ?.params?.identityAddress?.username.orEmpty()
        if (myExtension.isEmpty()) {
            Log.e("$TAG No account, cannot request an office-bridged call")
            return false
        }

        return try {
            val connection = URL("$BASE_URL/api/tool/phone/offline-call").openConnection()
                as HttpURLConnection
            connection.requestMethod = "POST"
            connection.connectTimeout = TIMEOUT_MS
            connection.readTimeout = TIMEOUT_MS
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.outputStream.use {
                val body = JSONObject()
                    .put("ext", myExtension)
                    .put("number", number)
                    .put("line", corePreferences.outboundLine.takeIf { l -> l != "ask" } ?: "")
                    .put("name", nameCache[number].orEmpty())
                it.write(body.toString().toByteArray())
            }
            val code = connection.responseCode
            val text = (if (code in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader()?.use { it.readText() }.orEmpty()
            connection.disconnect()
            if (code !in 200..299) {
                Log.e("$TAG Office-bridged call refused [$code]: $text")
                false
            } else {
                Log.i("$TAG Office-bridged call to [$number] requested")
                true
            }
        } catch (error: Exception) {
            Log.e("$TAG Office-bridged call failed: $error")
            false
        }
    }

    /**
     * شماره را به شکلی می‌آورد که پنل با آن کلید می‌زند: `۰۹۱۲…`.
     * `+98`، `0098` و `98` همگی یک نفرند.
     */
    private fun normalise(raw: String): String {
        val digits = raw.filter { it.isDigit() }
        return when {
            digits.startsWith("98") && digits.length >= 12 -> "0" + digits.substring(2)
            digits.startsWith("0") -> digits
            digits.length >= 10 -> "0$digits"
            else -> digits
        }
    }

    /** شماره‌هایی که قبلا پرسیده‌ایم — تا برای هر تماس دوباره به سرور نزنیم. */
    private val nameCache = mutableMapOf<String, String>()

    /**
     * نام صاحبِ یک شماره را از پنل می‌پرسد، برای وقتی که در دفترچه نیست.
     *
     * ⚠️ نتیجه — چه نام پیدا شود چه نه — در حافظه می‌ماند. بدون آن، هر بار که
     * صفحه‌ی تماس تازه می‌شد یک درخواست شبکه می‌رفت و شماره‌ی ناشناس، بارها.
     *
     * ⚠️ روی نخِ هسته صدا زده می‌شود و شبکه را همان‌جا می‌زند؛ برای همین مهلتش
     * کوتاه است. اگر سرور دیر کند، همان شماره نشان داده می‌شود که رفتار قبلی بود.
     */
    @WorkerThread
    fun lookupName(number: String): String? {
        /*
         * ⚠️ همان شکلی که سرور کلید می‌زند: `۰۹۱۲…`. نسخه‌ی اول رقم‌های خام را
         * می‌فرستاد (`۹۸۹۱۲…` وقتی شماره با `+98` آمده بود) و بعد در پاسخ دنبال
         * همان کلید می‌گشت — ولی سرور با شکل استاندارد کلید می‌زند، پس نام پیدا
         * می‌شد و اپ نمی‌دیدش.
         */
        val digits = normalise(number)
        if (digits.length < 10) return null                 // داخلی‌ها را نمی‌پرسیم
        nameCache[digits]?.let { return it.ifEmpty { null } }

        val myExtension = coreContext.core.defaultAccount
            ?.params?.identityAddress?.username.orEmpty()
        if (myExtension.isEmpty()) return null

        val name = try {
            val connection = URL("$BASE_URL/api/tool/phone/lookup").openConnection()
                as HttpURLConnection
            connection.requestMethod = "POST"
            connection.connectTimeout = LOOKUP_TIMEOUT_MS
            connection.readTimeout = LOOKUP_TIMEOUT_MS
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.outputStream.use {
                val body = JSONObject()
                    .put("ext", myExtension)
                    .put("numbers", org.json.JSONArray().put(digits))
                it.write(body.toString().toByteArray())
            }
            val code = connection.responseCode
            val text = (if (code in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader()?.use { it.readText() }.orEmpty()
            connection.disconnect()
            if (code !in 200..299) "" else {
                JSONObject(text).optJSONObject("names")?.optString(digits).orEmpty()
            }
        } catch (error: Exception) {
            Log.w("$TAG Name lookup failed for [$digits]: $error")
            ""
        }

        nameCache[digits] = name
        return name.ifEmpty { null }
    }

    /**
     * عکس همکار را از پاسخِ سرور روی دیسک می‌نویسد و نشانی فایل را برمی‌گرداند.
     *
     * ⚠️ عکس به‌صورت `data:image/…;base64,…` همراه فهرست می‌آید و نه با نشانی،
     * چون مسیر تصویرهای پنل نشستِ کاربر می‌خواهد و اپ نشست ندارد.
     */
    @WorkerThread
    private fun savePhoto(dataUrl: String, ext: String): String? {
        if (dataUrl.isEmpty() || !dataUrl.startsWith("data:")) return null
        return try {
            val comma = dataUrl.indexOf(',')
            if (comma < 0) return null
            val bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT)
            if (bytes.isEmpty()) return null

            val folder = File(coreContext.context.filesDir, "kariya-avatars")
            if (!folder.exists()) folder.mkdirs()
            val file = File(folder, "$ext.jpg")
            FileOutputStream(file).use { it.write(bytes) }
            /*
             * ⚠️ نشانی فایل، نه مسیر خام. نسخه‌ی اول `absolutePath` می‌داد و
             * عکس‌ها اصلا نشان داده نمی‌شدند — لینفون این مقدار را به‌عنوان URI
             * می‌خواند و یک مسیر بدون `file://` برایش بی‌معناست.
             */
            Uri.fromFile(file).toString()
        } catch (error: Exception) {
            Log.e("$TAG Could not store photo for [$ext]: $error")
            null
        }
    }

    @WorkerThread
    private fun fetch(mobile: String, ext: String): JSONObject? {
        return try {
            val connection = URL("$BASE_URL/api/tool/phone/directory").openConnection()
                as HttpURLConnection
            connection.requestMethod = "POST"
            connection.connectTimeout = TIMEOUT_MS
            connection.readTimeout = TIMEOUT_MS
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.outputStream.use {
                val body = JSONObject().put("mobile", mobile).put("ext", ext)
                it.write(body.toString().toByteArray())
            }
            val code = connection.responseCode
            val body = (if (code in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader()?.use { it.readText() }.orEmpty()
            connection.disconnect()

            if (code !in 200..299) {
                Log.e("$TAG Directory request failed [$code]: $body")
                return null
            }
            JSONObject(body)
        } catch (error: Exception) {
            Log.e("$TAG Could not fetch colleagues: $error")
            null
        }
    }
}
