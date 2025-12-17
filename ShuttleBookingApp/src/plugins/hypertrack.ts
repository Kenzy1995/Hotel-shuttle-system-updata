// HyperTrack SDK 整合
// 使用官方 hypertrack-sdk-ionic-capacitor 套件

import HyperTrackSDK from 'hypertrack-sdk-ionic-capacitor';

// Publishable Key 需要在 AndroidManifest.xml 或 Info.plist 中配置
// Android: <meta-data android:name="HyperTrackPublishableKey" android:value="YOUR_KEY" />
// iOS: 在 Info.plist 中設置 HyperTrackPublishableKey
const HYPERTRACK_PUBLISHABLE_KEY = "ERfVdBvVlLjJCHM2jfFF9Zek_aOssABBrxCYeWXfaJo_6Cm_0f-Ja46Phefj_3LvLpWrp1Hmo1cjB73RWUvzAA";

let isInitialized = false;
let deviceId: string | null = null;
let isTracking = false;

// 初始化 HyperTrack
// 根據官方文檔，Ionic Capacitor SDK 需要：
// 1. 在 AndroidManifest.xml 或 Info.plist 中設置 Publishable Key（已配置）
// 2. 在代碼中調用 setPublishableKey（如果 SDK 支持）
// 3. 獲取 device ID 來確認 SDK 是否可用
export const initializeHyperTrack = async (): Promise<boolean> => {
  try {
    if (isInitialized) {
      return true;
    }
    
            // Publishable Key 在原生配置文件中設置（AndroidManifest.xml/Info.plist）
            // 不需要在 JavaScript 中設置
            console.log('[HyperTrack] Publishable Key configured in AndroidManifest.xml/Info.plist');
    
    // 嘗試獲取 device ID 來確認 SDK 是否可用
    try {
      const id = await HyperTrackSDK.getDeviceId();
      if (id) {
        deviceId = id;
        console.log('[HyperTrack] Device ID obtained:', id);
        // 保存到本地存儲
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('hypertrack_device_id', id);
        }
      } else {
        console.warn('[HyperTrack] Device ID is null or empty');
      }
    } catch (e) {
      console.warn('[HyperTrack] getDeviceId not available yet:', e);
      // 如果獲取失敗，可能是 SDK 尚未完全初始化，稍後再試
    }
    
    isInitialized = true;
    return true;
  } catch (e) {
    console.error('[HyperTrack] Initialization error:', e);
    return false;
  }
};

// 獲取裝置 ID
export const getDeviceId = async (): Promise<string | null> => {
  try {
    if (!isInitialized) {
      await initializeHyperTrack();
    }
    
    // 如果已經有 device ID，直接返回
    if (deviceId) {
      return deviceId;
    }
    
    // 從 SDK 獲取 device ID
    const id = await HyperTrackSDK.getDeviceId();
    if (id) {
      deviceId = id;
      // 保存到本地存儲
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('hypertrack_device_id', id);
      }
      return id;
    }
    
    // 如果 SDK 返回空，嘗試從本地存儲讀取
    if (typeof localStorage !== 'undefined') {
      const storedId = localStorage.getItem('hypertrack_device_id');
      if (storedId) {
        deviceId = storedId;
        return storedId;
      }
    }
    
    return null;
  } catch (e) {
    console.error('HyperTrack getDeviceId error:', e);
    // 如果 SDK 調用失敗，嘗試從本地存儲讀取
    if (typeof localStorage !== 'undefined') {
      const storedId = localStorage.getItem('hypertrack_device_id');
      if (storedId) {
        deviceId = storedId;
        return storedId;
      }
    }
    return null;
  }
};

// 設置 Worker Handle（可選，用於將 Worker 與裝置關聯）
export const setWorkerHandle = async (workerHandle: string): Promise<{ ok: boolean; error?: string }> => {
  try {
    if (!isInitialized) {
      await initializeHyperTrack();
    }
    
    // 調用官方 SDK 的 setWorkerHandle 方法（同步方法）
    HyperTrackSDK.setWorkerHandle(workerHandle);
    return { ok: true };
  } catch (e) {
    console.error('HyperTrack setWorkerHandle error:', e);
    return { ok: false, error: String(e) };
  }
};

// 開始追蹤
export const startTracking = async (): Promise<{ ok: boolean; error?: string }> => {
  try {
    if (!isInitialized) {
      const initResult = await initializeHyperTrack();
      if (!initResult) {
        return { ok: false, error: 'HyperTrack not initialized' };
      }
    }
    
    // 調用官方 SDK 的 setIsTracking 方法
    await HyperTrackSDK.setIsTracking(true);
    
    // 更新本地狀態
    isTracking = true;
    
    // 驗證追蹤狀態
    const trackingStatus = await HyperTrackSDK.getIsTracking();
    isTracking = trackingStatus;
    
    return { ok: true };
  } catch (e) {
    console.error('HyperTrack startTracking error:', e);
    return { ok: false, error: String(e) };
  }
};

// 停止追蹤
export const stopTracking = async (): Promise<{ ok: boolean; error?: string }> => {
  try {
    if (!isInitialized) {
      return { ok: false, error: 'HyperTrack not initialized' };
    }
    
    // 調用官方 SDK 的 setIsTracking 方法
    await HyperTrackSDK.setIsTracking(false);
    
    // 更新本地狀態
    isTracking = false;
    
    return { ok: true };
  } catch (e) {
    console.error('HyperTrack stopTracking error:', e);
    return { ok: false, error: String(e) };
  }
};

// 獲取當前位置（從 HyperTrack）
export const getCurrentLocation = async (): Promise<{ lat: number; lng: number; timestamp: number } | null> => {
  try {
    if (!isInitialized) {
      await initializeHyperTrack();
    }
    
    // 使用官方 SDK 的 getLocation 方法
    const result = await HyperTrackSDK.getLocation();
    
    // result 是 Result<Location, LocationError> 類型
    if (result && 'value' in result && result.value) {
      const location = result.value as any; // 類型斷言，因為 SDK 類型定義可能不完整
      // 檢查 location 是否有必要的屬性
      if (location && typeof location.latitude === 'number' && typeof location.longitude === 'number') {
        return {
          lat: location.latitude,
          lng: location.longitude,
          timestamp: location.timestamp || Date.now()
        };
      }
    } else if (result && 'error' in result) {
      console.error('HyperTrack getLocation error:', result.error);
      return null;
    }
    
    return null;
  } catch (e) {
    console.error('HyperTrack getCurrentLocation error:', e);
    return null;
  }
};

// 導出 HyperTrack 物件（向後兼容）
export const HyperTrack = {
  getDeviceId,
  startTracking,
  stopTracking,
  getCurrentLocation,
  setWorkerHandle,
  initialize: initializeHyperTrack,
  isInitialized: () => isInitialized,
  isTracking: () => isTracking,
  debugInfo: async () => {
    const id = await getDeviceId();
    return {
      keyLen: HYPERTRACK_PUBLISHABLE_KEY.length,
      deviceId: id || '',
      isInitialized,
      isTracking,
      error: id ? '' : 'Device ID not available'
    };
  },
  ping: async () => ({ ok: isInitialized })
};
