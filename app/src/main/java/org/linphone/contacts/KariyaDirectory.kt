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

import android.util.Base64
import androidx.annotation.WorkerThread
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject
import org.linphone.LinphoneApplication.Companion.coreContext
import org.linphone.LinphoneApplication.Companion.corePreferences
import org.linphone.core.Friend
import org.linphone.core.FriendList
import org.linphone.core.tools.Log

object KariyaDirectory {
    private const val TAG = "[Kariya Directory]"

    private const val BASE_URL = "https://new.kariyahesab.com"
    private const val TIMEOUT_MS = 15_000

    /** مهلت کوتاه‌تر برای استعلام نام: روی مسیر نمایش تماس است و نباید معطل کند. */
    private const val LOOKUP_TIMEOUT_MS = 6_000

    /** نام فهرست، تا هر بار همان را به‌روز کنیم و فهرست تکراری نسازیم. */
    private const val LIST_NAME = "kariya-colleagues"

    /**
     * فهرست را از پنل می‌گیرد و مخاطب‌ها را می‌سازد.
     *
     * ⚠️ اگر شبکه نبود یا پاسخ خراب بود، فهرستِ قبلی دست‌نخورده می‌ماند. پاک‌کردنِ
     * مخاطب‌ها به‌خاطر یک قطعیِ موقت، بدترین کاری است که می‌شود کرد.
     */
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

        val list = core.getFriendListByName(LIST_NAME) ?: core.createFriendList()
        if (list.displayName.isNullOrEmpty()) {
            list.isDatabaseStorageEnabled = true
            list.type = FriendList.Type.Default
            list.displayName = LIST_NAME
            core.addFriendList(list)
            for (friend in friends) {
                list.addLocalFriend(friend)
            }
            Log.i("$TAG Created colleagues list with [${friends.size}] entries")
        } else {
            // همگام‌سازی به‌جای پاک‌کردن و ساختن: داخلی حذف‌شده می‌رود، تازه
            // می‌آید، و بقیه دست‌نخورده می‌مانند.
            list.synchronizeFriendsWith(friends.toTypedArray())
            Log.i("$TAG Synchronised colleagues list to [${friends.size}] entries")
        }

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
        val digits = number.filter { it.isDigit() }
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
            file.absolutePath
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
