# Forte Hotel Shuttle Booking System - Driver App

飯店接駁車預約系統的司機端應用程式，使用 Ionic React + Capacitor 開發，支援 Android 平台。

## 📋 必要檔案清單

從 GitHub 下載專案後，需要準備以下檔案才能成功打包 APK：

### 1. Android 簽名檔案（必要）

**位置**: `android/app/`

需要以下檔案：
- `forte.keystore` - Android 簽名金鑰檔案
- `keystore.properties` - 簽名配置檔案

**keystore.properties 範例格式**:
```properties
storeFile=forte.keystore
storePassword=your_keystore_password
keyAlias=forte
keyPassword=your_key_password
```

**注意**: 如果沒有這些檔案，可以：
- 使用現有的 keystore 檔案（如果有備份）
- 或創建新的 keystore（會導致無法更新已安裝的舊版本）

### 2. Firebase 配置檔案（必要）

**位置**: `android/app/google-services.json`

這是 Firebase 專案的配置檔案，包含：
- Firebase 專案 ID
- API 金鑰
- 應用程式 ID

**取得方式**:
1. 登入 [Firebase Console](https://console.firebase.google.com/)
2. 選擇專案：`forte-xizhi-shuttle-system`
3. 進入「專案設定」>「您的應用程式」
4. 下載 `google-services.json` 並放置到 `android/app/` 目錄

### 3. Android SDK 配置（自動生成）

**位置**: `android/local.properties`

此檔案會在首次構建時自動生成，包含 Android SDK 路徑。

## 🚀 打包 APK 步驟

### 前置需求

- Node.js 16+
- npm 或 yarn
- Android Studio（用於 Android 開發）
- Java JDK 11+
- Android SDK（透過 Android Studio 安裝）

### 安裝步驟

1. **克隆專案**
```bash
git clone https://github.com/Kenzy1995/Hotel-shuttle-system-updata.git
cd Hotel-shuttle-system-updata/ShuttleBookingApp
```

2. **安裝依賴**
```bash
npm install
```

3. **準備必要檔案**
   - 將 `forte.keystore` 放置到 `android/app/`
   - 將 `keystore.properties` 放置到 `android/app/`
   - 將 `google-services.json` 放置到 `android/app/`

4. **構建 Web 資源**
```bash
npm run build
```

5. **同步到 Android**
```bash
npx cap sync android
```

6. **構建 APK**
```bash
cd android
./gradlew assembleRelease
```

生成的 APK 位於：`android/app/build/outputs/apk/release/ForteDriver-{version}.apk`

## ⚠️ 重要注意事項

1. **簽名金鑰**: 如果使用新的 keystore，將無法更新已安裝的舊版本應用程式。建議保留原始的 `forte.keystore` 檔案。

2. **Firebase 配置**: `google-services.json` 必須與 Firebase 專案中的應用程式配置一致。

3. **版本號**: 更新版本號需要同步修改：
   - `src/version.ts`
   - `package.json`
   - `android/app/build.gradle` (versionCode 和 versionName)

## 📁 專案結構

```
ShuttleBookingApp/
├── src/                    # React 源碼
├── android/                # Android 原生專案
│   └── app/
│       ├── forte.keystore  # ⚠️ 需要手動添加
│       ├── keystore.properties  # ⚠️ 需要手動添加
│       └── google-services.json  # ⚠️ 需要手動添加
├── public/                 # 靜態資源
├── package.json           # 專案依賴
└── capacitor.config.ts    # Capacitor 配置
```

## 🔐 安全建議

- **不要**將 `forte.keystore` 和 `keystore.properties` 提交到公開的 Git 倉庫
- 這些檔案應保存在安全的地方，並僅在需要打包時使用
- 建議使用環境變數或 CI/CD 系統來管理簽名憑證

## 📞 問題排查

如果遇到打包問題：

1. **檢查必要檔案是否存在**
   ```bash
   ls android/app/forte.keystore
   ls android/app/keystore.properties
   ls android/app/google-services.json
   ```

2. **檢查 Android SDK 路徑**
   - 確認 `android/local.properties` 中的 `sdk.dir` 路徑正確

3. **清理並重新構建**
   ```bash
   cd android
   ./gradlew clean
   ./gradlew assembleRelease
   ```

---

**版本**: 1.1.171  
**最後更新**: 2025-12-22

