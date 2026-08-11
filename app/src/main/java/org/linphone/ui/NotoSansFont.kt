/*
 * Copyright (c) 2010-2024 Belledonne Communications SARL.
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
package org.linphone.ui

import androidx.annotation.FontRes
import org.linphone.R

// این enum نامش تاریخی است؛ همه‌ی وزن‌ها حالا فونت کاریا (Yekan Bakh) را می‌دهند.
// کاریا سه وزن دارد: عادی (۴۰۰)، متوسط (۶۰۰)، ضخیم (۷۰۰).
enum class NotoSansFont(@FontRes val fontRes: Int) {
    NotoSansRegular(R.font.kariya), // 400
    NotoSansMedium(R.font.kariya_medium), // 500/600
    NotoSansBold(R.font.kariya_bold), // 700
    NotoSansExtraBold(R.font.kariya_bold) // 800
}
