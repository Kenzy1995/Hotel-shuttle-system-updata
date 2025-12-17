# HyperTrack 官方範例對比

## 根據官方文檔的改進

根據 [HyperTrack Build Your App 文檔](https://hypertrack.com/docs/build-your-app) 和 [Ionic Capacitor Quickstart](https://github.com/hypertrack/quickstart-ionic-capacitor)，我們已經按照官方範例改進了實現。

## 已完成的改進

### 1. ✅ 添加 Worker Handle 設置

根據官方文檔，**設置 Worker Handle 是必需的**，用於將 Worker（司機）與裝置關聯。

**改進前**：
```typescript
await HyperTrack.initialize();
const deviceId = await HyperTrack.getDeviceId();
await HyperTrack.startTracking();
```

**改進後**（符合官方範例）：
```typescript
// 1. 初始化 HyperTrack SDK
await HyperTrack.initialize();

// 2. 獲取 Device ID
const deviceId = await HyperTrack.getDeviceId();

// 3. 設置 Worker Handle（根據官方文檔，這是必需的）
const workerHandle = userRole || deviceId || 'driver';
await HyperTrack.setWorkerHandle(workerHandle);

// 4. 開始追蹤
await HyperTrack.startTracking();
```

### 2. ✅ 改進初始化流程

- 添加了 `setPublishableKey` 調用（如果 SDK 支持）
- 添加了詳細的日誌記錄
- 改進了錯誤處理

### 3. ✅ 正確的執行順序

根據官方文檔，正確的順序應該是：
1. 初始化 SDK
2. 獲取 Device ID
3. **設置 Worker Handle**（新增）
4. 創建 Trip/Order（後端 API）
5. 開始追蹤

## 官方範例要點

根據 [HyperTrack Build Your App 文檔](https://hypertrack.com/docs/build-your-app)：

1. **Worker Handle**: 必須設置，用於識別 Worker
2. **初始化**: SDK 會在應用啟動時自動初始化（如果 Publishable Key 在原生配置中）
3. **追蹤**: 使用 `setIsTracking(true)` 開始追蹤

## 當前實現狀態

✅ **已符合官方範例**：
- SDK 初始化
- Worker Handle 設置
- 追蹤啟動/停止
- Device ID 獲取
- 位置獲取

## 下一步

請測試改進後的實現，確認：
1. Worker Handle 是否正確設置
2. 追蹤是否正常啟動
3. 後端 API 是否能成功創建 Trip/Order

