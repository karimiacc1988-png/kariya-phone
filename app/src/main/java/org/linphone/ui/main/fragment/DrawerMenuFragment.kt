/*
 * Copyright (c) 2010-2023 Belledonne Communications SARL.
 *
 * This file is part of linphone-android
 * (see https://www.linphone.org).
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */
package org.linphone.ui.main.fragment

import android.content.ActivityNotFoundException
import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.annotation.UiThread
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import org.linphone.LinphoneApplication.Companion.coreContext
import org.linphone.LinphoneApplication.Companion.corePreferences
import org.linphone.R
import org.linphone.core.tools.Log
import org.linphone.databinding.DrawerMenuBinding
import org.linphone.ui.assistant.AssistantActivity
import org.linphone.ui.main.MainActivity
import org.linphone.ui.main.settings.fragment.AccountProfileFragmentDirections
import org.linphone.ui.main.viewmodel.DrawerMenuViewModel
import androidx.core.net.toUri

@UiThread
class DrawerMenuFragment : GenericMainFragment() {
    companion object {
        private const val TAG = "[Drawer Menu Fragment]"
    }

    private lateinit var binding: DrawerMenuBinding

    private lateinit var viewModel: DrawerMenuViewModel

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        binding = DrawerMenuBinding.inflate(layoutInflater)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        viewModel = requireActivity().run {
            ViewModelProvider(this)[DrawerMenuViewModel::class.java]
        }

        binding.lifecycleOwner = viewLifecycleOwner
        binding.viewModel = viewModel

        // نسخه، زیر نام اپ. کاربری که وارد شده صفحه‌ی ورود را دیگر نمی‌بیند،
        // پس این تنها جای همیشگی است که می‌شود دید روی گوشی کدام بیلد نشسته.
        binding.brandVersion.text = org.linphone.BuildConfig.VERSION_NAME
        observeToastEvents(viewModel)

        showOutboundLine()
        binding.setOutboundLineClickedListener {
            pickOutboundLine()
        }

        binding.setSettingsClickedListener {
            val navController = (requireActivity() as MainActivity).findNavController()
            navController.navigate(R.id.action_global_settingsFragment)
            (requireActivity() as MainActivity).closeDrawerMenu()
        }

        binding.setRecordingsClickListener {
            val navController = (requireActivity() as MainActivity).findNavController()
            navController.navigate(R.id.action_global_recordingsListFragment)
            (requireActivity() as MainActivity).closeDrawerMenu()
        }

        binding.setHelpClickedListener {
            val navController = (requireActivity() as MainActivity).findNavController()
            navController.navigate(R.id.action_global_helpFragment)
            (requireActivity() as MainActivity).closeDrawerMenu()
        }

        binding.setQuitClickedListener {
            coreContext.stopKeepAliveService()

            coreContext.postOnCoreThread {
                Log.i("$TAG Stopping Core Context")
                coreContext.quitSafely()
            }

            Log.i("$TAG Quitting app")
            requireActivity().finishAndRemoveTask()
        }

        viewModel.startAssistantEvent.observe(viewLifecycleOwner) {
            it.consume {
                startActivity(Intent(requireActivity(), AssistantActivity::class.java))
                (requireActivity() as MainActivity).closeDrawerMenu()
            }
        }

        viewModel.closeDrawerEvent.observe(viewLifecycleOwner) {
            it.consume {
                (requireActivity() as MainActivity).closeDrawerMenu()
            }
        }

        viewModel.openAccountProfileEvent.observe(viewLifecycleOwner) {
            it.consume { model ->
                val navController = (requireActivity() as MainActivity).findNavController()
                val action = AccountProfileFragmentDirections.actionGlobalAccountProfileFragment(
                    model.identity
                )
                Log.i("$TAG Going to account [${model.identity}] profile")
                navController.navigate(action)
                (requireActivity() as MainActivity).closeDrawerMenu()
            }
        }

        viewModel.defaultAccountChangedEvent.observe(viewLifecycleOwner) {
            it.consume { identity ->
                Log.w(
                    "$TAG Default account has changed, now is [$identity], closing side menu in 500ms"
                )

                lifecycleScope.launch {
                    withContext(Dispatchers.IO) {
                        delay(500)
                        withContext(Dispatchers.Main) {
                            (requireActivity() as MainActivity).closeDrawerMenu()
                        }
                    }
                }
            }
        }

        viewModel.openLinkInBrowserEvent.observe(viewLifecycleOwner) {
            it.consume { link ->
                try {
                    val browserIntent = Intent(Intent.ACTION_VIEW, link.toUri())
                    startActivity(browserIntent)
                } catch (ise: IllegalStateException) {
                    Log.e(
                        "$TAG Can't start ACTION_VIEW intent for URL [$link], IllegalStateException: $ise"
                    )
                } catch (anfe: ActivityNotFoundException) {
                    Log.e(
                        "$TAG Can't start ACTION_VIEW intent for URL [$link], ActivityNotFoundException: $anfe"
                    )
                } catch (e: Exception) {
                    Log.e(
                        "$TAG Can't start ACTION_VIEW intent for URL [$link]: $e"
                    )
                }
            }
        }

        sharedViewModel.refreshDrawerMenuAccountsListEvent.observe(viewLifecycleOwner) {
            it.consume { recreate ->
                if (recreate) {
                    viewModel.updateAccountsList()
                } else {
                    viewModel.refreshAccountsNotificationsCount()
                }
            }
        }

        sharedViewModel.refreshDrawerMenuQuitButtonEvent.observe(viewLifecycleOwner) {
            it.consume {
                coreContext.postOnCoreThread {
                    viewModel.checkIfKeepAliveServiceIsEnabled()
                }
            }
        }
    }

    // ---------------------------------------------- خط تماس بیرونی کاریا

    /**
     * خط‌های شرکت. پیش‌شماره چیزی است که مرکز تلفن با آن می‌فهمد کدام شماره
     * روی گوشیِ مشتری بیفتد؛ کاربر هرگز نمی‌بیندش.
     */
    private val kariyaLines by lazy {
        listOf(
            "81" to getString(R.string.kariya_line_services),
            "82" to getString(R.string.kariya_line_software),
            "83" to getString(R.string.kariya_line_third),
            "ask" to getString(R.string.kariya_line_ask)
        )
    }

    private fun outboundLineLabel(value: String): String {
        return kariyaLines.firstOrNull { it.first == value }?.second
            ?: kariyaLines.first().second
    }

    private fun showOutboundLine() {
        coreContext.postOnCoreThread {
            val current = corePreferences.outboundLine.ifEmpty { kariyaLines.first().first }
            val label = outboundLineLabel(current)
            coreContext.postOnMainThread {
                if (::binding.isInitialized) {
                    binding.outboundLine.text = getString(R.string.kariya_outbound_line, label)
                }
            }
        }
    }

    /**
     * فهرست خط‌ها را باز می‌کند و انتخاب را ذخیره می‌کند.
     *
     * ⚠️ انتخاب در تنظیمات هسته می‌نشیند، نه در حافظه‌ی صفحه: تماس ممکن است از
     * تاریخچه یا مخاطبین شروع شود که این صفحه اصلا باز نیست.
     */
    private fun pickOutboundLine() {
        coreContext.postOnCoreThread {
            val current = corePreferences.outboundLine.ifEmpty { kariyaLines.first().first }
            val selected = kariyaLines.indexOfFirst { it.first == current }.coerceAtLeast(0)
            val labels = kariyaLines.map { it.second }.toTypedArray()

            coreContext.postOnMainThread {
                MaterialAlertDialogBuilder(requireContext())
                    .setTitle(R.string.kariya_outbound_line_title)
                    .setSingleChoiceItems(labels, selected) { dialog, which ->
                        val value = kariyaLines[which].first
                        coreContext.postOnCoreThread {
                            corePreferences.outboundLine = value
                            Log.i("$TAG Outbound line set to [$value]")
                        }
                        showOutboundLine()
                        dialog.dismiss()
                    }
                    .show()
            }
        }
    }
}
