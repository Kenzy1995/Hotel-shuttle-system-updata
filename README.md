# 接駁車預約系統 APP

## 版本資訊
- 當前版本：1.1.107
- 更新日期：2025-12-15

## 專案結構
```
接駁車預約系統APP/
├── android/          # Android 專案文件
├── public/           # 公開資源文件
├── resources/        # 資源文件
├── src/              # 源代碼
└── ...               # 其他配置檔案
```

## 功能說明
- GPS 即時定位追蹤
- 乘客 QR Code 掃描上車
- 班次管理與通知
- 開發選項設定

## 開發環境
- React + TypeScript
- Capacitor
- Ionic

## 建置說明
```bash
npm install
npm run build
npx cap sync android
cd android
./gradlew assembleRelease
```

