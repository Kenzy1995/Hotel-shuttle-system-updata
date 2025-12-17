import { Geolocation } from '@capacitor/geolocation';
import { Preferences } from '@capacitor/preferences';
import axios from 'axios';
import { HyperTrack, getCurrentLocation as getHyperTrackLocation } from '../plugins/hypertrack';

const API_BASE = "https://driver-api2-995728097341.asia-east1.run.app";

// 追蹤最後一次發送時間，用於間隔發送
let lastSentTime = 0;
let lastSentLocation: { lat: number; lng: number; timestamp: number } | null = null;

// 獲取當前選擇的定位方式（優先級：HyperTrack > Google）
export const getLocationProvider = async (): Promise<'google' | 'hypertrack' | null> => {
  try {
    const [googleEnabled, hypertrackEnabled] = await Promise.all([
      Preferences.get({ key: 'location_provider_google' }),
      Preferences.get({ key: 'location_provider_hypertrack' })
    ]);
    
    // 優先級：HyperTrack > Google
    if (hypertrackEnabled.value === 'true') return 'hypertrack';
    if (googleEnabled.value === 'true') return 'google';
    return null;
  } catch (e) {
    console.error('Error reading location provider preferences:', e);
    return null;
  }
};

// 支持 Google Maps 和 HyperTrack 雙定位系統
export const sendCurrentLocation = async (tripId: string | null = null, forceSend: boolean = false, minIntervalMs: number = 3 * 60 * 1000) => {
  try {
    const now = Date.now();
    
    // 如果不是強制發送，檢查間隔時間
    if (!forceSend && lastSentTime > 0 && (now - lastSentTime) < minIntervalMs) {
      // 如果間隔時間未到，返回上次的位置（如果有的話）
      return lastSentLocation;
    }
    
    // 獲取當前選擇的定位方式
    let provider = await getLocationProvider();
    
    let location: { lat: number; lng: number; timestamp: number } | null = null;
    let deviceId: string | null = null;
    
    if (provider === 'hypertrack') {
      // 使用 HyperTrack 獲取位置
      try {
        location = await getHyperTrackLocation();
        if (location) {
          deviceId = await HyperTrack.getDeviceId();
        } else {
          console.warn('HyperTrack location not available, falling back to Google Geolocation');
          // 回退到 Google Geolocation
          const coordinates = await Geolocation.getCurrentPosition();
          location = {
            lat: coordinates.coords.latitude,
            lng: coordinates.coords.longitude,
            timestamp: coordinates.timestamp
          };
          provider = 'google'; // 更新 provider 為 google
          deviceId = null; // 清除 device_id
        }
      } catch (htError) {
        console.error('HyperTrack location error, falling back to Google Geolocation:', htError);
        // 回退到 Google Geolocation
        const coordinates = await Geolocation.getCurrentPosition();
        location = {
          lat: coordinates.coords.latitude,
          lng: coordinates.coords.longitude,
          timestamp: coordinates.timestamp
        };
        provider = 'google'; // 更新 provider 為 google
        deviceId = null; // 清除 device_id
      }
    } else {
      // 使用 Google Geolocation
      const coordinates = await Geolocation.getCurrentPosition();
      location = {
        lat: coordinates.coords.latitude,
        lng: coordinates.coords.longitude,
        timestamp: coordinates.timestamp
      };
      provider = provider || 'google'; // 確保有預設值
    }
    
    if (!location) {
      console.error('Failed to get location from any provider');
      return null;
    }
    
    // Upload to server
    const payload: any = {
      lat: location.lat,
      lng: location.lng,
      timestamp: location.timestamp,
      trip_id: tripId,
      location_provider: provider || 'google'
    };
    
    // 如果是 HyperTrack，添加 device_id
    if (provider === 'hypertrack' && deviceId) {
      payload.device_id = deviceId;
    }
    
    await axios.post(`${API_BASE}/api/driver/location`, payload);
    console.log(`Location sent (${provider || 'google'}):`, location.lat, location.lng, 'Trip ID:', tripId, provider === 'hypertrack' ? `Device ID: ${deviceId}` : '');
    
    lastSentTime = now;
    lastSentLocation = location;
    
    return location;
  } catch (e) {
    console.error('Error sending location:', e);
    return null;
  }
};

// Auto-shutdown logic: if movement < 500m over 30 minutes, stop uploader (to be controlled by caller)
let history: Array<{ ts: number; lat: number; lng: number }> = [];
const MAX_WINDOW_MS = 30 * 60 * 1000;
const MIN_DISTANCE_M = 500;

export const shouldAutoShutdown = (lat: number, lng: number, ts: number, windowMs: number = MAX_WINDOW_MS, minDistanceM: number = MIN_DISTANCE_M): boolean => {
  // append
  history.push({ ts, lat, lng });
  // keep last 30 min
  const cutoff = ts - windowMs;
  history = history.filter(h => h.ts >= cutoff);
  // need at least 2 points
  if (history.length < 2) return false;
  const first = history[0];
  const last = history[history.length - 1];
  const dist = haversine(first.lat, first.lng, last.lat, last.lng);
  return dist < minDistanceM;
};

const haversine = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const toRad = (v: number) => v * Math.PI / 180;
  const R = 6371000; // meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};
