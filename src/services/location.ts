import { Geolocation } from '@capacitor/geolocation';
import axios from 'axios';

const API_BASE = "https://driver-api2-995728097341.asia-east1.run.app";

// 追蹤最後一次發送時間，用於間隔發送
let lastSentTime = 0;
let lastSentLocation: { lat: number; lng: number; timestamp: number } | null = null;

export const sendCurrentLocation = async (force: boolean = false, minIntervalMs: number = 3 * 60 * 1000) => {
  try {
    const now = Date.now();
    
    // 如果不是強制發送，檢查間隔時間
    if (!force && lastSentTime > 0 && (now - lastSentTime) < minIntervalMs) {
      // 如果間隔時間未到，返回上次的位置（如果有的話）
      return lastSentLocation;
    }
    
    const coordinates = await Geolocation.getCurrentPosition();
    // Upload to server
    await axios.post(`${API_BASE}/api/driver/location`, {
      lat: coordinates.coords.latitude,
      lng: coordinates.coords.longitude,
      timestamp: coordinates.timestamp
    });
    console.log('Location sent:', coordinates.coords.latitude, coordinates.coords.longitude);
    
    const location = {
      lat: coordinates.coords.latitude,
      lng: coordinates.coords.longitude,
      timestamp: coordinates.timestamp
    };
    
    lastSentTime = now;
    lastSentLocation = location;
    
    return location;
  } catch (e) {
    console.error('Error sending location', e);
    return null;
  }
};

// Auto-shutdown logic: if movement < 500m over 30 minutes, stop uploader (to be controlled by caller)
let history: Array<{ ts: number; lat: number; lng: number }> = [];
const MAX_WINDOW_MS = 30 * 60 * 1000;
const MIN_DISTANCE_M = 500;

export const shouldAutoShutdown = (lat: number, lng: number, ts: number, windowMs = MAX_WINDOW_MS, minDistanceM = MIN_DISTANCE_M): boolean => {
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
