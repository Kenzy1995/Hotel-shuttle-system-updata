# Forte Hotel Shuttle Booking System - Driver App

飯店接駁車預約系統的司機端應用程式，使用 Ionic React + Capacitor 開發，支援 Android 平台。

## 📱 專案簡介

這是福泰大飯店接駁車預約系統的司機端應用程式，提供以下功能：

- **班次管理**: 查看當日班次、乘客資訊
- **QR Code 掃描**: 快速確認乘客上車
- **即時定位**: 支援 Google Maps 和 HyperTrack 雙定位系統
- **路線導航**: 自動規劃最佳路線，包含必經站點和可選站點
- **通知提醒**: 班次提醒、乘客上下車通知

## 🏗️ 技術架構

### 前端框架
- **Ionic React** (v7.0.0) - 跨平台 UI 框架
- **React** (v18.2.0) - 前端框架
- **TypeScript** - 類型安全
- **Vite** - 快速構建工具

### 原生功能
- **Capacitor** (v5.0.0) - 原生功能橋接
- **@capacitor/geolocation** - GPS 定位
- **@capacitor/local-notifications** - 本地通知
- **@capacitor/preferences** - 本地儲存
- **hypertrack-sdk-ionic-capacitor** - HyperTrack 定位 SDK

### 後端服務
- **Google Cloud Run** - API 服務部署
- **Firebase Realtime Database** - 即時數據同步
- **Google Sheets API** - 班次和預約資料管理
- **HyperTrack API** - 專業定位追蹤服務

## 📋 功能特色

### 1. 雙定位系統
- **Google Maps**: 傳統 GPS 定位，可自訂更新頻率
- **HyperTrack**: 專業定位服務，自動優化電池使用
- 可透過開發選項切換定位系統
- 兩個系統完全獨立運作

### 2. 智能路線規劃
- 自動判斷必經站點（飯店起點和終點）
- 根據乘客上下車情況動態調整中間站點
- 支援 5 個站點：飯店、捷運站、火車站、LaLaport、飯店

### 3. 即時數據同步
- Firebase 即時同步班次狀態
- 自動更新乘客名單
- 即時位置追蹤和分享

### 4. 開發者選項
- GPS 總開關控制
- 定位系統切換（Google/HyperTrack）
- 更新頻率調整（僅 Google Maps）
- 自動關閉功能設定

## 🚀 快速開始

### 環境需求
- Node.js 16+ 
- npm 或 yarn
- Android Studio（用於 Android 開發）
- Java JDK 11+

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

3. **配置環境**
- 複製 `android/app/google-services.json`（如果使用 Firebase）
- 配置 `android/app/keystore.properties`（用於簽名）

4. **開發模式**
```bash
npm run dev
```

5. **構建 Web 版本**
```bash
npm run build
```

6. **同步到 Android**
```bash
npx cap sync android
```

7. **構建 APK**
```bash
cd android
./gradlew assembleRelease
```

## 📁 專案結構

```
ShuttleBookingApp/
├── src/
│   ├── components/          # React 組件
│   │   ├── Header.tsx      # 頂部導航
│   │   ├── Scanner.tsx     # QR Code 掃描器
│   │   ├── MapView.tsx     # 地圖視圖
│   │   └── ErrorBoundary.tsx
│   ├── pages/              # 頁面組件
│   │   ├── Home.tsx        # 主頁（班次管理）
│   │   └── Login.tsx        # 登入頁面
│   ├── services/           # 服務層
│   │   ├── api.ts          # API 調用
│   │   ├── location.ts    # 定位服務
│   │   └── notification.ts # 通知服務
│   ├── plugins/            # Capacitor 插件
│   │   └── hypertrack.ts   # HyperTrack 插件封裝
│   └── theme/              # 主題樣式
├── android/                # Android 原生專案
│   └── app/
│       ├── build.gradle    # 構建配置
│       └── src/main/       # 原生代碼和資源
├── public/                 # 靜態資源
├── package.json           # 專案依賴
├── vite.config.ts         # Vite 配置
└── capacitor.config.ts    # Capacitor 配置
```

## ⚙️ 配置說明

### Capacitor 配置
```typescript
// capacitor.config.ts
{
  appId: 'com.forte.driver',
  appName: 'Forte Driver',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
}
```

### Android 配置
- **應用 ID**: `com.forte.driver`
- **最低 SDK**: 22 (Android 5.1)
- **目標 SDK**: 33 (Android 13)

## 🔧 開發指南

### 添加新功能
1. 在 `src/` 目錄下創建對應的組件或服務
2. 如需原生功能，創建或使用 Capacitor 插件
3. 更新 `android/app/src/main/AndroidManifest.xml`（如需要新權限）

### 調試
- **Web 調試**: `npm run dev` 後在瀏覽器打開
- **Android 調試**: 使用 Android Studio 連接設備或模擬器
- **日誌查看**: 使用 `adb logcat` 或 Android Studio Logcat

### 版本更新
更新版本號需要同步修改以下檔案：
- `src/version.ts`
- `package.json`
- `android/app/build.gradle` (versionCode 和 versionName)

## 📦 構建和發布

### 構建 Release APK
```bash
# 1. 構建 Web 資源
npm run build

# 2. 同步到 Android
npx cap sync android

# 3. 構建 APK
cd android
./gradlew assembleRelease
```

生成的 APK 位於：`android/app/build/outputs/apk/release/ForteDriver-{version}.apk`

### 簽名配置
確保 `android/app/keystore.properties` 已正確配置：
```properties
storeFile=forte.keystore
storePassword=your_password
keyAlias=forte
keyPassword=your_password
```

## 🔐 權限說明

應用需要以下權限：
- **位置權限**: 用於 GPS 定位和路線導航
- **相機權限**: 用於 QR Code 掃描
- **通知權限**: 用於班次和乘客提醒
- **網路權限**: 用於 API 調用和數據同步

## 📊 API 使用量

根據預估使用量（每天 200 人，15 個班次）：
- **總 API 調用**: 約 201,000 次/月
- **流量消耗**: 約 546 MB/月
- **詳細分析**: 請參考 [API_USAGE_ANALYSIS.md](../API_USAGE_ANALYSIS.md)

## 🤝 貢獻

歡迎提交 Issue 和 Pull Request！

## 📄 授權

本專案為私有專案，版權所有。

## 📞 聯絡資訊

如有問題或建議，請透過 GitHub Issues 聯繫。

---

**版本**: 1.1.157  
**最後更新**: 2025-12-17

