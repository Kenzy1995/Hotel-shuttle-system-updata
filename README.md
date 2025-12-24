# 飯店接駁車預約系統 - 司機端應用程式

飯店接駁車預約系統的司機端 Android 應用程式，使用 Ionic React + Capacitor 開發。

## 📋 專案說明

此專案包含完整的 Android 應用程式原始碼和所有必要的配置檔案，可以直接下載並重新打包 APK。

### ✅ 專案完整性

專案已包含所有打包 APK 所需的檔案：
- ✅ `Driver-app/android/app/forte.keystore` - Android 簽名金鑰檔案
- ✅ `Driver-app/android/app/keystore.properties` - 簽名配置檔案
- ✅ `Driver-app/android/app/google-services.json` - Firebase 配置檔案

**注意**: `android/local.properties` 會在首次構建時自動生成，包含 Android SDK 路徑。

## 🚀 快速開始

### 前置需求

- Node.js 16+
- npm 或 yarn
- Android Studio（用於 Android 開發）
- Java JDK 11+
- Android SDK（透過 Android Studio 安裝）

### 打包 APK 步驟

1. **克隆專案**
```bash
git clone https://github.com/Kenzy1995/Hotel-shuttle-system-updata.git
cd Hotel-shuttle-system-updata
```

2. **進入應用程式目錄**
```bash
cd Driver-app
```

3. **安裝依賴**
```bash
npm install
```

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

生成的 APK 位於：`Driver-app/android/app/build/outputs/apk/release/ForteDriver-{version}.apk`

## 📁 專案結構

```
.
├── README.md              # 本檔案
└── Driver-app/            # 應用程式主目錄
    ├── src/               # React 源碼
    ├── android/           # Android 原生專案
    │   └── app/
    │       ├── forte.keystore          # ✅ 已包含
    │       ├── keystore.properties     # ✅ 已包含
    │       └── google-services.json    # ✅ 已包含
    ├── public/            # 靜態資源
    ├── package.json       # 專案依賴
    └── capacitor.config.ts # Capacitor 配置
```

## ⚠️ 重要注意事項

### 版本號管理

更新版本號需要同步修改以下三個檔案：
- `Driver-app/src/version.ts` - 應用程式顯示版本號
- `Driver-app/package.json` - npm 版本號
- `Driver-app/android/app/build.gradle` - Android versionCode 和 versionName

**當前版本**: 1.1.186

### 簽名金鑰

專案已包含簽名金鑰檔案，可直接用於打包和更新應用程式。請妥善保管這些檔案。

### Firebase 配置

`google-services.json` 已包含在專案中，與 Firebase 專案配置一致。

## 🔐 安全建議

⚠️ **重要**: 此專案包含簽名金鑰和 Firebase 配置檔案。
- 如果這是公開倉庫，建議將這些敏感檔案移至私有倉庫或使用環境變數管理
- 對於私有倉庫，這些檔案已包含以便完整恢復專案

## 📞 問題排查

如果遇到打包問題：

1. **檢查必要檔案是否存在**（應該都已存在）
   ```bash
   ls Driver-app/android/app/forte.keystore
   ls Driver-app/android/app/keystore.properties
   ls Driver-app/android/app/google-services.json
   ```

2. **檢查 Android SDK 路徑**
   - 確認 `Driver-app/android/local.properties` 中的 `sdk.dir` 路徑正確
   - 如果檔案不存在，Android Studio 會自動生成

3. **清理並重新構建**
   ```bash
   cd Driver-app/android
   ./gradlew clean
   ./gradlew assembleRelease
   ```

4. **檢查版本號一致性**
   - 確保 `package.json`、`build.gradle` 和 `version.ts` 中的版本號相同

## 📝 更新日誌

- **v1.1.186** - 當前版本
- 專案結構重新組織，所有檔案統一放在 Driver-app 目錄

---

**最後更新**: 2025-12-23

