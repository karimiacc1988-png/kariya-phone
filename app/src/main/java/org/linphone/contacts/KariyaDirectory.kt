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

import androidx.annotation.WorkerThread
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
        val mobile = corePreferences.kariyaMobile
        if (mobile.isEmpty()) {
            Log.i("$TAG No stored mobile yet, skipping colleague sync")
            return
        }

        val payload = fetch(mobile) ?: return
        val colleagues = payload.optJSONArray("colleagues") ?: return
        val domain = payload.optString("domain")
        if (domain.isEmpty()) {
            Log.e("$TAG Directory has no domain, cannot build addresses")
            return
        }

        val core = coreContext.core
        val myExtension = corePreferences.kariyaExtension

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
            friends.add(friend)
        }

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

    @WorkerThread
    private fun fetch(mobile: String): JSONObject? {
        return try {
            val connection = URL("$BASE_URL/api/tool/phone/directory").openConnection()
                as HttpURLConnection
            connection.requestMethod = "POST"
            connection.connectTimeout = TIMEOUT_MS
            connection.readTimeout = TIMEOUT_MS
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.outputStream.use {
                it.write(JSONObject().put("mobile", mobile).toString().toByteArray())
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
