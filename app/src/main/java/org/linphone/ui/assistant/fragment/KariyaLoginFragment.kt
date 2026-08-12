/*
 * صفحه ورود «کاریا تلفن» — نوشته‌شده برای کاریا حساب.
 *
 * جایگزین کل مسیر ورودِ لینفون شده است. کارمند شماره موبایلش را می‌زند، کدی که
 * از بله یا پیامک می‌آید را وارد می‌کند، و تمام. داخلی و رمز SIP را نمی‌بیند:
 * سرور بعد از تأیید کد آن‌ها را می‌دهد و همین‌جا حساب ساخته می‌شود.
 *
 * 🔺 ساخت حساب عمداً بازنویسی نشده و به `ThirdPartySipAccountLoginViewModel`
 * سپرده شده — همان کدی که خود لینفون سال‌هاست با آن حساب می‌سازد و ثبت را
 * دنبال می‌کند. اینجا فقط سه مقدارش پر می‌شود و `login()` صدا زده می‌شود.
 */
package org.linphone.ui.assistant.fragment

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.annotation.UiThread
import androidx.lifecycle.lifecycleScope
import androidx.navigation.navGraphViewModels
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.linphone.LinphoneApplication.Companion.coreContext
import org.linphone.LinphoneApplication.Companion.corePreferences
import org.linphone.R
import org.linphone.core.tools.Log
import org.linphone.databinding.AssistantKariyaLoginFragmentBinding
import org.linphone.ui.GenericFragment
import org.linphone.ui.assistant.viewmodel.ThirdPartySipAccountLoginViewModel

@UiThread
class KariyaLoginFragment : GenericFragment() {
    companion object {
        private const val TAG = "[Kariya Login]"

        /** سرویس ورود روی پنل کاریا. */
        private const val BASE_URL = "https://new.kariyahesab.com"

        private const val TIMEOUT_MS = 20_000
    }

    private lateinit var binding: AssistantKariyaLoginFragmentBinding

    private val viewModel: ThirdPartySipAccountLoginViewModel by navGraphViewModels(
        R.id.assistant_nav_graph
    )

    /** شماره‌ای که کد برایش رفته — پله دوم به همین می‌چسبد. */
    private var pendingMobile = ""

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        binding = AssistantKariyaLoginFragmentBinding.inflate(layoutInflater)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.lifecycleOwner = viewLifecycleOwner

        // نسخه عمداً با ارقام لاتین می‌ماند تا دقیقاً همان چیزی باشد که در
        // نام فایل و در گیت‌هاب نوشته شده و بشود مو‌به‌مو تطبیقش داد.
        binding.version.text = org.linphone.BuildConfig.VERSION_NAME

        binding.sendCode.setOnClickListener { requestCode("bale") }
        binding.sendCodeSms.setOnClickListener { requestCode("sms") }
        binding.verifyCode.setOnClickListener { verifyCode() }
        binding.changeMobile.setOnClickListener { backToMobileStep() }

        // وقتی حساب واقعاً ثبت شد، از صفحه ورود بیرون می‌رویم.
        viewModel.accountLoggedInEvent.observe(viewLifecycleOwner) {
            it.consume {
                Log.i("$TAG Account registered, leaving assistant")
                requireActivity().finish()
            }
        }

        // ثبت‌نشدن یعنی رمزی که سرور داد کار نکرد یا شبکه نیست.
        viewModel.accountLoginErrorEvent.observe(viewLifecycleOwner) {
            it.consume { message ->
                busy(false)
                showError(getString(R.string.kariya_login_register_failed) + "\n" + message)
            }
        }
    }

    // ---------------------------------------------------------------- پله یک

    /** [channel] همان چیزی است که کاربر با دکمه انتخاب کرده: `bale` یا `sms`. */
    private fun requestCode(channel: String) {
        val mobile = digits(binding.mobile.text?.toString().orEmpty())
        if (mobile.length < 10) {
            showError(getString(R.string.kariya_login_bad_mobile))
            return
        }

        busy(true)
        viewLifecycleOwner.lifecycleScope.launch {
            val result = post(
                "/api/tool/phone/code",
                JSONObject().put("mobile", mobile).put("channel", channel)
            )
            busy(false)
            if (result.error != null) {
                showError(result.error)
                return@launch
            }
            pendingMobile = mobile
            // سرور می‌گوید کد واقعاً از کدام راه رفت — بله یا پیامک — و همان را
            // می‌نویسیم، وگرنه کاربر در بله دنبال کدی می‌گردد که پیامک شده.
            val viaBale = result.body?.optString("channel") == "bale"
            binding.codeSentTo.text = getString(
                if (viaBale) R.string.kariya_login_code_sent_bale else R.string.kariya_login_code_sent_sms,
                mobile
            )
            binding.stepMobile.visibility = View.GONE
            binding.stepCode.visibility = View.VISIBLE
            binding.code.requestFocus()
        }
    }

    // ---------------------------------------------------------------- پله دو

    private fun verifyCode() {
        val code = digits(binding.code.text?.toString().orEmpty())
        if (code.isEmpty()) {
            showError(getString(R.string.kariya_login_bad_code))
            return
        }

        busy(true)
        viewLifecycleOwner.lifecycleScope.launch {
            val result = post(
                "/api/tool/phone/login",
                JSONObject().put("mobile", pendingMobile).put("code", code)
            )
            if (result.error != null) {
                busy(false)
                showError(result.error)
                return@launch
            }

            val body = result.body ?: return@launch
            val username = body.optString("username")
            val password = body.optString("password")
            val domain = body.optString("domain")
            if (username.isEmpty() || domain.isEmpty()) {
                busy(false)
                showError(getString(R.string.kariya_login_no_extension))
                return@launch
            }

            Log.i("$TAG Server gave extension [$username] on [$domain], registering")

            // برای دفترچه‌ی همکاران لازم است: پنل فهرست را فقط به کسی می‌دهد که
            // خودش داخلی دارد، و خودِ کاربر نباید در فهرست خودش بیفتد.
            coreContext.postOnCoreThread {
                corePreferences.kariyaMobile = pendingMobile
                corePreferences.kariyaExtension = username
            }
            viewModel.username.value = username
            viewModel.password.value = password
            viewModel.domain.value = domain
            viewModel.displayName.value = body.optString("displayName")
            viewModel.transport.value = "UDP"

            /*
             * 🔴 بدون این خط، تماس‌ها هرگز به مرکز تلفن نمی‌رسند.
             *
             * دامنه پورت غیراستاندارد دارد (`…:55060`) چون روی روتر عمداً همان
             * باز شده و `5060` بسته است. لینفون پورت را از «هویت» SIP برمی‌دارد
             * — که درست است — ولی آن‌وقت درخواست تماس به پورت پیش‌فرض `5060`
             * می‌رود و در روتر دور ریخته می‌شود. ثبت‌نام کار می‌کند و تماس نه،
             * که گمراه‌کننده‌ترین حالت ممکن است.
             *
             * با تعیین «پروکسی خروجی»، همه‌ی درخواست‌ها از همان دروازه‌ای
             * می‌روند که ثبت‌نام از آن رفت.
             */
            viewModel.outboundProxy.value = domain

            viewModel.login()
            // نوار انتظار روشن می‌ماند تا ثبت جواب بدهد؛ رویدادهای بالا خاموشش می‌کنند.
        }
    }

    private fun backToMobileStep() {
        binding.stepCode.visibility = View.GONE
        binding.stepMobile.visibility = View.VISIBLE
        binding.code.setText("")
        hideError()
    }

    // ------------------------------------------------------------------ ابزار

    private class Result(val body: JSONObject?, val error: String?)

    /**
     * درخواست ساده به سرور.
     *
     * ⚠️ پیام خطا از خود سرور خوانده می‌شود چون فارسی و برای کاربر نوشته شده
     * («کد اشتباه است»، «برای این شماره داخلی تعریف نشده»). ساختن پیام از روی
     * شماره وضعیت، همان پیام‌های دقیق را دور می‌ریزد.
     */
    private suspend fun post(path: String, payload: JSONObject): Result =
        withContext(Dispatchers.IO) {
            try {
                val connection = (URL(BASE_URL + path).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = TIMEOUT_MS
                    readTimeout = TIMEOUT_MS
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("Accept", "application/json")
                }
                connection.outputStream.use { it.write(payload.toString().toByteArray()) }

                val code = connection.responseCode
                val text = (
                    if (code in 200..299) connection.inputStream else connection.errorStream
                    )?.bufferedReader()?.use { it.readText() }.orEmpty()
                connection.disconnect()

                val json = runCatching { JSONObject(text) }.getOrNull()
                if (code in 200..299) {
                    Result(json, null)
                } else {
                    Result(null, json?.optString("error").takeUnless { it.isNullOrEmpty() }
                        ?: getString(R.string.kariya_login_server_error))
                }
            } catch (e: Exception) {
                Log.e("$TAG Request to [$path] failed: $e")
                Result(null, getString(R.string.kariya_login_no_network))
            }
        }

    /** ارقام فارسی و عربی هم شماره‌اند. */
    private fun digits(raw: String): String {
        val out = StringBuilder()
        for (ch in raw) {
            when (ch) {
                in '0'..'9' -> out.append(ch)
                in '۰'..'۹' -> out.append(ch - '۰')
                in '٠'..'٩' -> out.append(ch - '٠')
            }
        }
        return out.toString()
    }

    private fun busy(on: Boolean) {
        binding.progress.visibility = if (on) View.VISIBLE else View.GONE
        binding.sendCode.isEnabled = !on
        binding.sendCodeSms.isEnabled = !on
        binding.verifyCode.isEnabled = !on
        if (on) hideError()
    }

    private fun showError(message: String) {
        binding.error.text = message
        binding.error.visibility = View.VISIBLE
    }

    private fun hideError() {
        binding.error.visibility = View.GONE
    }
}
