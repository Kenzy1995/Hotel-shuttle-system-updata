# Forte Hotel Shuttle Booking System - Driver App

飯店接駁車預約系統的司機端應用程式，使用 Ionic React + Capacitor 開發，支援 Android 平台。

## 📋 專案完整性

✅ **所有必要檔案已包含在專案中**

專案已包含所有打包 APK 所需的檔案：
- ✅ `android/app/forte.keystore` - Android 簽名金鑰檔案
- ✅ `android/app/keystore.properties` - 簽名配置檔案
- ✅ `android/app/google-services.json` - Firebase 配置檔案

**注意**: `android/local.properties` 會在首次構建時自動生成，包含 Android SDK 路徑。

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

3. **構建 Web 資源**
```bash
npm run build
```

4. **同步到 Android**
```bash
npx cap sync android
```

5. **構建 APK**
```bash
cd android
./gradlew assembleRelease
```

生成的 APK 位於：`android/app/build/outputs/apk/release/ForteDriver-{version}.apk`

## ⚠️ 重要注意事項

1. **簽名金鑰**: 專案已包含簽名金鑰檔案，可直接用於打包和更新應用程式。

2. **Firebase 配置**: `google-services.json` 已包含在專案中，與 Firebase 專案配置一致。

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
│       ├── forte.keystore  # ✅ 已包含
│       ├── keystore.properties  # ✅ 已包含
│       └── google-services.json  # ✅ 已包含
├── public/                 # 靜態資源
├── package.json           # 專案依賴
└── capacitor.config.ts    # Capacitor 配置
```

## 🔐 安全建議

⚠️ **重要**: 此專案包含簽名金鑰和 Firebase 配置檔案。
- 如果這是公開倉庫，建議將這些敏感檔案移至私有倉庫或使用環境變數管理
- 對於私有倉庫，這些檔案已包含以便完整恢復專案

## 📞 問題排查

如果遇到打包問題：

1. **檢查必要檔案是否存在**（應該都已存在）
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

