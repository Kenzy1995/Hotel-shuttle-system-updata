import React, { useState, useEffect, useRef } from 'react';
import { IonContent, IonPage, IonToast, IonRefresher, IonRefresherContent, RefresherEventDetail, IonIcon, IonAlert, IonToggle, IonSelect, IonSelectOption } from '@ionic/react';
import { call, chevronDownOutline, chevronForwardOutline, constructOutline, locationOutline, notificationsOutline, textOutline, cloudDownloadOutline } from 'ionicons/icons';
import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { APP_VERSION } from '../version';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import Header from '../components/Header';
import MapView from '../components/MapView';
import Scanner from '../components/Scanner';
import { fetchAllData, confirmBoarding, Trip, Passenger, findNearestTripFromNow, startGoogleTripStart, completeGoogleTrip } from '../services/api';
import { sendCurrentLocation, shouldAutoShutdown } from '../services/location';
import { scheduleDepartureNotification, ensureNotificationChannel } from '../services/notification';
import { HyperTrack } from '../plugins/hypertrack';

const STATION_ORDER = [
  "1. 福泰大飯店 (去)",
  "2. 南港捷運站",
  "3. 南港火車站",
  "4. LaLaport 購物中心",
  "5. 福泰大飯店 (回)"
];

// Helpers
const truncateName = (name: string, limit = 5) => {
  const arr = Array.from(name || '');
  if (arr.length <= limit) return name || '';
  return arr.slice(0, limit).join('') + '…';
};

const measureText = (text: string) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return 100;
  ctx.font = '600 19px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  return ctx.measureText(text || '').width;
};
const normalizeStationName = (p: Passenger): string => {
  const raw = (p.station || "").trim();
  const hotel = "福泰大飯店";
  const hotelEn = "Forte Hotel";
  const mrt = "南港展覽館捷運站"; 
  const mrtEn = "Nangang Exhibition Center";
  const train = "南港火車站";
  const trainEn = "Nangang Train Station";
  const mall = "LaLaport";

  const has = (s: string) => raw.includes(s);

  if (has(hotel) || has(hotelEn)) {
    if ((p.direction || "") === "回程" && (p.updown || "") === "下車") {
      return "5. 福泰大飯店 (回)";
    }
    return "1. 福泰大飯店 (去)";
  }
  if (has(mrt) || has(mrtEn) || has("南港捷運站") || has("捷運南港展覽館站")) {
    return "2. 南港捷運站";
  }
  if (has(train) || has(trainEn)) {
    return "3. 南港火車站";
  }
  if (has(mall)) {
    return "4. LaLaport 購物中心";
  }
  return raw || "其他站點";
};

const stationSortKey = (name: string): number => {
  const idx = STATION_ORDER.indexOf(name);
  return idx === -1 ? 999 : idx;
};

const formatDateTimeLabel = (dtStr?: string): string => {
  if (!dtStr) return "";
  const [datePart, timePartRaw] = dtStr.split(" ");
  if (!datePart) return dtStr;
  const d = datePart.replace(/-/g, "/").split("/");
  if (d.length !== 3) return dtStr;
  const y = d[0], m = d[1], day = d[2];
  let timePart = timePartRaw || "";
  if (timePart) {
    const [h, mm = "00"] = timePart.split(":");
    timePart = `${String(h || "00").padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }
  return `${y}/${m.padStart(2, "0")}/${day.padStart(2, "0")} ${timePart}`;
};

const parseDateTime = (dtStr: string): number => {
  if (!dtStr) return 0;
  const [datePart, timePartRaw] = dtStr.trim().split(" ");
  const d = datePart.replace(/-/g, "/").split("/");
  const y = d[0] || "0000";
  const m = String(d[1] || "01").padStart(2, "0");
  const day = String(d[2] || "01").padStart(2, "0");
  let h = "00", mm = "00";
  if (timePartRaw) {
    const [hh, mmm] = timePartRaw.split(":");
    h = String(hh || "00").padStart(2, "0");
    mm = String(mmm || "00").padStart(2, "0");
  }
  return new Date(`${y}/${m}/${day} ${h}:${mm}`).getTime();
};

const safeInt = (v: any, def = 0): number => {
  if (v === null || v === undefined) return def;
  const n = parseInt(String(v).trim() || "0", 10);
  return isNaN(n) ? def : n;
};

const isWithinActionWindowTs = (ts: number, windowMinutes = 60): boolean => {
  const now = Date.now();
  return Math.abs(ts - now) <= windowMinutes * 60 * 1000;
};

const isTripWithinActionWindow = (t?: Trip | null, windowMinutes = 60): boolean => {
  if (!t) return false;
  const ts = new Date(`${t.date.replace(/-/g,'/')} ${t.time}`).getTime();
  return isWithinActionWindowTs(ts, windowMinutes);
};

const isPassengerTripWithinWindow = (p?: Passenger | null, windowMinutes = 60): boolean => {
  if (!p) return false;
  const dtStr = (p.main_datetime || '').replace(/-/g,'/');
  if (!dtStr) return false;
  const ts = new Date(dtStr).getTime();
  return isWithinActionWindowTs(ts, windowMinutes);
};

const computeUpDownStations = (p: Passenger) => {
  const upList: string[] = [];
  const downList: string[] = [];

  const isUp = (v?: string) => v && (v === "上" || v.includes("上"));
  const isDown = (v?: string) => v && (v === "下" || v.includes("下"));

  if (isUp(p.hotel_go)) upList.push("福泰大飯店 (去)");
  if (isUp(p.mrt)) upList.push("南港捷運站");
  if (isUp(p.train)) upList.push("南港火車站");
  if (isUp(p.mall)) upList.push("LaLaport 購物中心");
  if (isUp(p.hotel_back)) upList.push("福泰大飯店 (回)");

  if (isDown(p.hotel_go)) downList.push("福泰大飯店 (去)");
  if (isDown(p.mrt)) downList.push("南港捷運站");
  if (isDown(p.train)) downList.push("南港火車站");
  if (isDown(p.mall)) downList.push("LaLaport 購物中心");
  if (isDown(p.hotel_back)) downList.push("福泰大飯店 (回)");

  return {
    up: upList.join("、"),
    down: downList.join("、")
  };
};

const Home: React.FC = () => {
const [activeTab, setActiveTab] = useState<'trips' | 'passengers' | 'flow'>('trips');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [currentTrip, setCurrentTrip] = useState<Trip | null>(null);
  const currentTripRef = useRef<string | null>(null);
  const mainLoopRef = useRef<any>(null);

  // Sidebar State
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [gpsEnabled, setGpsEnabled] = useState(() => {
    const saved = localStorage.getItem('gps_enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [gpsInterval, setGpsInterval] = useState(() => {
    const saved = localStorage.getItem('gps_update_interval');
    return saved ? Math.max(3, parseInt(saved, 10)) : 3;
  });
  const [dataInterval, setDataInterval] = useState(() => {
    const saved = localStorage.getItem('data_update_interval');
    return saved ? parseInt(saved, 10) : 15;
  });
  const [showRecent, setShowRecent] = useState(() => {
    const v = localStorage.getItem('show_recent');
    return v === null ? false : v === 'true';
  });
  const [showTripsList, setShowTripsList] = useState(() => {
    const v = localStorage.getItem('show_trips');
    return v === null ? true : v === 'true';
  });
  const [showPassengersList, setShowPassengersList] = useState(() => {
    const v = localStorage.getItem('show_passengers');
    return v === null ? true : v === 'true';
  });
  const [showFlowList, setShowFlowList] = useState(() => {
    const v = localStorage.getItem('show_flow');
    return v === null ? true : v === 'true';
  });
  const [changeTripOpen, setChangeTripOpen] = useState(false);
  const [userRole, setUserRole] = useState<'desk' | 'driverA' | 'driverB' | 'driverC'>(() => {
    const saved = localStorage.getItem('user_role');
    if (saved === 'desk') return 'desk';
    if (saved === 'driverD') { localStorage.setItem('user_role','driverC'); return 'driverC'; }
    if (saved === 'driverA' || saved === 'driverB' || saved === 'driverC') return saved as any;
    return 'driverA';
  });
  const [showRoleModal, setShowRoleModal] = useState(() => {
    const saved = localStorage.getItem('user_role');
    return !saved;
  });
  const [roleCountdown, setRoleCountdown] = useState(2);
  const [notificationMinutes, setNotificationMinutes] = useState(() => {
    const saved = localStorage.getItem('notification_minutes');
    return saved ? parseInt(saved, 10) : 30;
  });
  const [gpsSystemEnabled, setGpsSystemEnabled] = useState(() => {
    const saved = localStorage.getItem('gps_system_enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [devAuthorized, setDevAuthorized] = useState(() => localStorage.getItem('dev_auth_ok') === '1');
  const [devPasswordOpen, setDevPasswordOpen] = useState(false);
  const [devPasswordInput, setDevPasswordInput] = useState('');
  const [devPasswordError, setDevPasswordError] = useState<string | null>(null);
  // Auto shutdown settings
  const [autoShutdownEnabled, setAutoShutdownEnabled] = useState(() => {
    const v = localStorage.getItem('auto_shutdown_enabled');
    return v !== null ? v === 'true' : true;
  });
  const [autoShutdownMinutes, setAutoShutdownMinutes] = useState(() => {
    const v = localStorage.getItem('auto_shutdown_minutes');
    return v ? parseInt(v, 10) : 30;
  });
  const [autoShutdownDistance, setAutoShutdownDistance] = useState(() => {
    const v = localStorage.getItem('auto_shutdown_distance');
    return v ? parseInt(v, 10) : 500;
  });

  // Notification Sound State
  const [notificationSoundEnabled, setNotificationSoundEnabled] = useState(() => {
     const saved = localStorage.getItem('notif_sound_enabled');
     return saved !== null ? saved === 'true' : true; 
  });
  const [selectedSound, setSelectedSound] = useState(() => {
     return localStorage.getItem('notif_sound_file') || 'notify_sound_1';
  });

  // Sidebar Expanded Sections
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [deviceIdState, setDeviceIdState] = useState<string>('');
  const [hyperDebug, setHyperDebug] = useState<{ keyLen?: number; deviceId?: string; error?: string }>({});
  const [pluginAvail, setPluginAvail] = useState<boolean>(false);
  const [nativePlatform, setNativePlatform] = useState<boolean>(false);

  const toggleSection = (section: string | null) => {
    setExpandedSection(prev => prev === section ? null : section);
  };
  useEffect(() => {
    setNativePlatform(true);
    setPluginAvail(false);
    setDeviceIdState('');
    setHyperDebug({ keyLen: 0, deviceId: '', error: undefined });
  }, []);

  

  const ensureAtLeastOneList = (nextRecent: boolean, nextTrips: boolean, nextPassengers: boolean, nextFlow: boolean) => {
    const count = [nextRecent, nextTrips, nextPassengers, nextFlow].filter(Boolean).length;
    return count >= 1;
  };

  const applyListSelection = (nextRecent: boolean, nextTrips: boolean, nextPassengers: boolean, nextFlow?: boolean) => {
    const flowVal = nextFlow === undefined ? showFlowList : nextFlow;
    if (!ensureAtLeastOneList(nextRecent, nextTrips, nextPassengers, flowVal)) return;
    setShowRecent(nextRecent);
    setShowTripsList(nextTrips);
    setShowPassengersList(nextPassengers);
    setShowFlowList(flowVal);
    localStorage.setItem('show_recent', String(nextRecent));
    localStorage.setItem('show_trips', String(nextTrips));
    localStorage.setItem('show_passengers', String(nextPassengers));
    localStorage.setItem('show_flow', String(flowVal));
    const anyEnabled = nextRecent || nextTrips || nextPassengers || flowVal;
    if (anyEnabled) {
      // Switch away from disabled current tab if needed
      if (!nextTrips && activeTab === 'trips' && !isRecentTripMode) {
        setActiveTab(nextPassengers ? 'passengers' : (flowVal ? 'flow' : 'trips'));
      }
      if (!nextPassengers && activeTab === 'passengers') {
        setActiveTab(nextTrips ? 'trips' : (flowVal ? 'flow' : 'passengers'));
      }
      if (!flowVal && activeTab === 'flow') {
        setActiveTab(nextRecent ? 'trips' : (nextTrips ? 'trips' : 'passengers'));
      }
    }
  };

  // Permission State
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);

  // Request Permissions on Mount
  useEffect(() => {
    checkPermissions();
    ensureNotificationChannel(selectedSound);
  }, []);

  const checkPermissions = async () => {
      try {
        const geo = await Geolocation.checkPermissions();
        const notif = await LocalNotifications.checkPermissions();
        // Camera check is a bit different, usually done via navigator or plugin
        // We will assume if others are granted, we are good or will ask later.
        
        if (geo.location === 'granted' && notif.display === 'granted') {
            setPermissionsGranted(true);
        } else {
            setShowPermissionModal(true);
        }
      } catch (e) {
          console.error("Check perm error", e);
      }
  };

  const requestAllPermissions = async () => {
      try {
        // Geolocation
        const geo = await Geolocation.checkPermissions();
        if (geo.location !== 'granted') {
             await Geolocation.requestPermissions();
        }

        // Notifications
        const notif = await LocalNotifications.checkPermissions();
        if (notif.display !== 'granted') {
             await LocalNotifications.requestPermissions();
        }
        // Haptics doesn't need explicit runtime permission usually; vibrate to test
        try { await Haptics.vibrate(); } catch (e) {}

        // Camera - usually requested when Scanner opens, but user wants it upfront.
        // We can try to request it by accessing stream momentarily
        try {
             const stream = await navigator.mediaDevices.getUserMedia({ video: true });
             stream.getTracks().forEach(track => track.stop());
        } catch (e) {
             console.log("Camera permission flow initiated/checked");
        }

        setPermissionsGranted(true);
        setShowPermissionModal(false);
      } catch (e) {
        alert("授權過程中發生錯誤，請至手機設定手動開啟權限。");
      }
  };

  useEffect(() => {
    localStorage.setItem('notification_minutes', String(notificationMinutes));
  }, [notificationMinutes]);

  useEffect(() => {
    localStorage.setItem('notif_sound_enabled', String(notificationSoundEnabled));
    localStorage.setItem('notif_sound_file', selectedSound);
    ensureNotificationChannel(selectedSound);
  }, [notificationSoundEnabled, selectedSound]);

  useEffect(() => {
    currentTripRef.current = currentTrip?.id || null;
  }, [currentTrip]);

  useEffect(() => {
    if (showRoleModal) {
      setRoleCountdown(5);
      const timer = setInterval(() => {
        setRoleCountdown(prev => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [showRoleModal]);

  useEffect(() => {
    localStorage.setItem('gps_system_enabled', String(gpsSystemEnabled));
    if (!gpsSystemEnabled) {
      setShowRoleModal(false);
      setGpsEnabled(false);
      localStorage.setItem('gps_enabled', 'false');
    }
  }, [gpsSystemEnabled]);

  useEffect(() => { /* backButton handler defined below */ }, []);

  const applyFactoryDefaults = () => {
    try {
      localStorage.setItem('font_scale', '100');
      localStorage.setItem('show_recent', 'false');
      localStorage.setItem('show_trips', 'true');
      localStorage.setItem('show_passengers', 'true');
      localStorage.setItem('show_flow', 'true');
      localStorage.setItem('col_scale', '1');
      localStorage.setItem('row_scale', '1');
      localStorage.setItem('data_update_interval', '15');
      localStorage.setItem('gps_update_interval', '3');
      localStorage.setItem('notification_minutes', '30');
      localStorage.setItem('notif_sound_enabled', 'true');
      localStorage.setItem('gps_enabled', 'false');
      localStorage.setItem('gps_system_enabled', 'true');
    } catch {}
    setFontScale(100);
    setShowRecent(false);
    setShowTripsList(true);
    setShowPassengersList(true);
    setShowFlowList(true);
    setColScale(1);
    setRowScale(1);
    setDataInterval(15);
    setGpsInterval(3);
    setGpsEnabled(false);
    setGpsSystemEnabled(true);
    setNotificationMinutes(30);
    setNotificationSoundEnabled(true);
    setToastContext('default');
    setToastSuccess(true);
    setToastMessage('已恢復原廠設定');
  };

  // Enforce GPS disabled for desk role
  useEffect(() => {
    if (userRole === 'desk') {
      setGpsEnabled(false);
      localStorage.setItem('gps_enabled', 'false');
    }
  }, [userRole]);

  const [passengers, setPassengers] = useState<Passenger[]>([]); // For current trip
  const [allPassengers, setAllPassengers] = useState<Passenger[]>([]); // For 'passengers' tab
  const [allTripPassengers, setAllTripPassengers] = useState<Passenger[]>([]); // All trip passengers cache
  
  const [isScanning, setIsScanning] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastContext, setToastContext] = useState<'default'|'scan'>('default');
  const [toastSuccess, setToastSuccess] = useState<boolean>(false);
  const [colScale, setColScale] = useState<number>(() => parseFloat(localStorage.getItem('col_scale') || '1'));
  const [rowScale, setRowScale] = useState<number>(() => parseFloat(localStorage.getItem('row_scale') || '1'));
  const [showFactoryModal, setShowFactoryModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Overlays state
  const [showDetailPassenger, setShowDetailPassenger] = useState<Passenger | null>(null);
  const [detailContextStation, setDetailContextStation] = useState<string | null>(null);
  const [pendingCheckin, setPendingCheckin] = useState<{ qrcode: string, bookingId: string, passenger: Passenger | null } | null>(null);
  const [loadingTrip, setLoadingTrip] = useState(false);
  const [isRecentTripMode, setIsRecentTripMode] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [splashPhase, setSplashPhase] = useState<'show'|'fade'>('show');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [appActive, setAppActive] = useState(true);
  const [updateRequired, setUpdateRequired] = useState(false);
  const [updateUrl, setUpdateUrl] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(() => localStorage.getItem('auth_ok') === '1');
  const [loginUser, setLoginUser] = useState('Admin');
  const [loginPass, setLoginPass] = useState('');
  const [appVersion, setAppVersion] = useState(APP_VERSION);

  useEffect(() => {
    App.getInfo().then(info => {
        setAppVersion(info.version);
    }).catch(err => console.error("Get App Info Failed", err));
  }, []);

  useEffect(() => {
    try {
      const sub = App.addListener('appStateChange', ({ isActive }: any) => {
        setAppActive(!!isActive);
      });
      const onVis = () => setAppActive(document.visibilityState === 'visible');
      document.addEventListener('visibilitychange', onVis);
      return () => { try { sub.remove(); } catch {}; document.removeEventListener('visibilitychange', onVis); };
    } catch {}
  }, []);

  

  // Detail action modals
  const [noShowModal, setNoShowModal] = useState<{open: boolean, countdown: number, target: Passenger | null}>({open: false, countdown: 2, target: null});
  const [manualModal, setManualModal] = useState<{open: boolean, countdown: number, target: Passenger | null}>({open: false, countdown: 2, target: null});
  const [startConfirm, setStartConfirm] = useState(false);
  const [endConfirm, setEndConfirm] = useState(false);
  const [flowStarted, setFlowStarted] = useState(false);
  const [flowStep, setFlowStep] = useState(0);
  const [firstStationIdx, setFirstStationIdx] = useState(0);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  // Auto skip empty stations in flow
  useEffect(() => {
    if (!flowStarted) return;
    const hasPassengers = filterList(passengers).some(p => normalizeStationName(p)===STATION_ORDER[flowStep]);
    if (!hasPassengers) {
      let next = flowStep;
      for (let i=flowStep+1;i<STATION_ORDER.length;i++) {
        if (filterList(passengers).some(p => normalizeStationName(p)===STATION_ORDER[i])) { next = i; break; }
      }
      if (next!==flowStep) setFlowStep(next);
    }
  }, [flowStarted, flowStep, passengers]);

  const computeTripTotalPax = () => {
    const base = (passengers && passengers.length > 0 && filterList(passengers).length > 0)
      ? filterList(passengers)
      : (currentTrip ? allTripPassengers.filter(p => p.tripId === currentTrip.id) : []);
    const m = new Map<string, number>();
    base.forEach(p => {
      const key = p.bookingCode;
      const val = safeInt(p.pax, 1);
      const preferUp = (p.updown === '上車');
      if (!m.has(key)) m.set(key, val);
      if (preferUp) m.set(key, val);
    });
    let total = 0; m.forEach(v => total += v);
    return total;
  };

  const getFirstTrip = (): Trip | null => {
    if (!trips || trips.length === 0) return null;
    const sorted = [...trips].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.time.localeCompare(b.time);
    });
    return sorted[0] || null;
  };
  const isCurrentTripFirst = (): boolean => {
    const first = getFirstTrip();
    return !!(first && currentTrip && first.id === currentTrip.id);
  };
  const isDetailPassengerInFirstTrip = (): boolean => {
    const first = getFirstTrip();
    if (!first || !showDetailPassenger) return false;
    const tp = allTripPassengers.find(x => x.bookingCode === showDetailPassenger!.bookingCode);
    return !!(tp && tp.tripId === first.id);
  };
  const [exitConfirm, setExitConfirm] = useState(false);
  const [exitPrompt, setExitPrompt] = useState(false);
  const exitPromptAtRef = useRef<number>(0);

  useEffect(() => {
    const remove = App.addListener('backButton', () => {
      // 1. Modals & Overlays
      if (isMenuOpen) { setIsMenuOpen(false); return; }
      if (isScanning) { setIsScanning(false); return; }
      if (showDetailPassenger) { setShowDetailPassenger(null); return; }
      if (pendingCheckin) { setPendingCheckin(null); return; }
      if (noShowModal.open) { setNoShowModal({open:false, countdown:3, target:null}); return; }
      if (manualModal.open) { setManualModal({open:false, countdown:3, target:null}); return; }
      if (startConfirm) { setStartConfirm(false); return; }
      if (endConfirm) { setEndConfirm(false); return; }
      if (showFactoryModal) { setShowFactoryModal(false); return; }
      if (updateRequired) { setUpdateRequired(false); return; }
      if (showPermissionModal) { setShowPermissionModal(false); return; }

      // 2. Navigation (Sub-pages)
      if (currentTrip) { 
        setCurrentTrip(null); 
        setIsRecentTripMode(false); 
        return; 
      }

      if (activeTab !== 'trips') {
        setActiveTab('trips');
        return;
      }

      // 3. Exit Prompt
      const now = Date.now();
      if (!exitPrompt) {
        setExitPrompt(true);
        exitPromptAtRef.current = now;
        setTimeout(() => setExitPrompt(false), 3000);
      } else {
        if (now - exitPromptAtRef.current < 3000) {
          App.exitApp();
        }
      }
    });
    return () => { try { remove.remove(); } catch {} };
  }, [isMenuOpen, isScanning, showDetailPassenger, pendingCheckin, noShowModal.open, manualModal.open, startConfirm, endConfirm, showFactoryModal, updateRequired, showPermissionModal, currentTrip, exitPrompt, activeTab]);

  useEffect(() => {
    let timer: any = null;
    if (noShowModal.open) {
      timer = setInterval(() => {
        setNoShowModal(prev => ({...prev, countdown: Math.max(0, prev.countdown - 1)}));
      }, 1000);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [noShowModal.open]);

  useEffect(() => {
    let timer: any = null;
    if (manualModal.open) {
      timer = setInterval(() => {
        setManualModal(prev => ({...prev, countdown: Math.max(0, prev.countdown - 1)}));
      }, 1000);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [manualModal.open]);
  
  // Font Size State (Managed via localStorage directly in component for simplicity or separate state)
  const [fontScale, setFontScale] = useState(() => {
     return parseInt(localStorage.getItem('font_scale') || '100', 10);
  });
  const [editingFontScale, setEditingFontScale] = useState(fontScale);

  // Apply Font Size Class to Body
  useEffect(() => {
    // Initial application
    const z = Math.min(200, Math.max(50, fontScale));
    (document.body as any).style.zoom = String(z/100);
    setEditingFontScale(z);
  }, [fontScale]);



  // Initial Data Load & Polling
  useEffect(() => {
    // Initial Load
    (async () => {
      const start = Date.now();
      await loadData();
      scheduleTodayNotifications();
      const elapsed = Date.now() - start;
      const remaining = 2000 - elapsed;
      if (remaining > 0) {
        await new Promise(resolve => setTimeout(resolve, remaining));
      }
      setSplashPhase('fade');
      await new Promise(resolve => setTimeout(resolve, 450));
      setIsInitialLoading(false);
      checkForMandatoryUpdate();
    })();
    
    // Removed old polling interval
    return () => {};
  }, []);

  // Split loops: data update & GPS sending
  const dataLoopRef = useRef<any>(null);
  const gpsLoopRef = useRef<any>(null);

  useEffect(() => {
    if (dataLoopRef.current) clearInterval(dataLoopRef.current);
    const runDataSync = async () => {
      const now = new Date();
      const minutes = now.getHours() * 60 + now.getMinutes();
      const start = 7 * 60;
      const end = 22 * 60;
      if (minutes >= start && minutes <= end) {
        await loadData();
        scheduleTodayNotifications();
      }
    };
    runDataSync();
    const intervalMs = (appActive ? dataInterval : 30) * 60 * 1000;
    dataLoopRef.current = setInterval(runDataSync, intervalMs);
    return () => { if (dataLoopRef.current) clearInterval(dataLoopRef.current); };
  }, [updateRequired, dataInterval, appActive]);

  // GPS定位邏輯：如果沒有API調用，則按間隔發送（預設3分鐘，可在開發選項調整）
  // 自動關閉定位邏輯：只會關閉，不會阻擋開啟
  useEffect(() => {
    if (gpsLoopRef.current) clearInterval(gpsLoopRef.current);
    const runGps = async () => {
      if (!gpsSystemEnabled || !gpsEnabled) return;
      // 按間隔發送（非強制，會檢查間隔時間），包含 tripId
      const tripId = currentTrip?.id || null;
      const res = await sendCurrentLocation(tripId, false, Math.max(3, gpsInterval) * 60 * 1000);
      // 自動關閉定位：只在GPS已經開啟且自動關閉功能啟用時才檢查
      // 這個檢查不會阻擋手動開啟或出車開始時的開啟
      if (res && autoShutdownEnabled && gpsEnabled) {
        const windowMs = Math.max(1, autoShutdownMinutes) * 60 * 1000;
        const minDist = Math.max(1, autoShutdownDistance);
        const stop = shouldAutoShutdown(res.lat, res.lng, res.timestamp, windowMs, minDist);
        if (stop) {
          // 只關閉GPS，不會阻止後續的開啟操作
          setGpsEnabled(false);
          localStorage.setItem('gps_enabled', 'false');
          // 如果是在出車中，自動結束出車
          if (currentTrip) {
            try {
              await completeGoogleTrip(currentTrip.id);
              setToastContext('default');
              setToastSuccess(true);
              setToastMessage(`已自動結束出車（${autoShutdownMinutes} 分鐘位移 < ${autoShutdownDistance} 公尺）`);
            } catch (e) {
              console.error('Auto complete trip error:', e);
            }
          } else {
            setToastContext('default');
            setToastSuccess(true);
            setToastMessage(`已自動關閉定位（${autoShutdownMinutes} 分鐘位移 < ${autoShutdownDistance} 公尺）`);
          }
        }
      }
    };
    // 如果GPS已啟用，立即發送一次
    if (gpsSystemEnabled && gpsEnabled) {
      runGps();
    }
    const intervalMs = Math.max(3, gpsInterval) * 60 * 1000;
    gpsLoopRef.current = setInterval(runGps, intervalMs);
    return () => { if (gpsLoopRef.current) clearInterval(gpsLoopRef.current); };
  }, [gpsSystemEnabled, gpsEnabled, gpsInterval, autoShutdownEnabled, autoShutdownMinutes, autoShutdownDistance, currentTrip]);
  useEffect(() => {
    localStorage.setItem('auto_shutdown_enabled', String(autoShutdownEnabled));
  }, [autoShutdownEnabled]);
  useEffect(() => {
    localStorage.setItem('auto_shutdown_minutes', String(autoShutdownMinutes));
  }, [autoShutdownMinutes]);
  useEffect(() => {
    localStorage.setItem('auto_shutdown_distance', String(autoShutdownDistance));
  }, [autoShutdownDistance]);

  // Persist Settings (GPS & Data)
  useEffect(() => {
    localStorage.setItem('gps_enabled', String(gpsEnabled));
  }, [gpsEnabled]);
  useEffect(() => {
    localStorage.setItem('gps_update_interval', String(gpsInterval));
  }, [gpsInterval]);
  useEffect(() => {
    localStorage.setItem('data_update_interval', String(dataInterval));
  }, [dataInterval]);

  const loadData = async () => {
    try {
      // 如果有API調用且GPS已啟用，一次性發送GPS位置（包含 tripId）
      if (gpsSystemEnabled && gpsEnabled) {
        try {
          const tripId = currentTrip?.id || null;
          await sendCurrentLocation(tripId, true); // 強制發送
        } catch (e) {
          console.error("GPS send error during data load", e);
        }
      }
      
      const { trips: t, tripPassengers: tp, allPassengers: ap } = await fetchAllData();
      setTrips(t);
      setAllPassengers(ap);
      setAllTripPassengers(tp);
      
      // If we are viewing a specific trip, reload its passengers locally
      const currentTripId = currentTripRef.current;
      if (currentTripId) {
        setPassengers(tp.filter(p => p.tripId === currentTripId));
      }
    } catch (e) {
      console.error("Load Data Error", e);
    }
  };

  // Recent Trip Logic (Ready Tab Replacement)
  const handleRecentTripClick = () => {
    // Sort trips by date then time
    const sortedTrips = [...trips].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.time.localeCompare(b.time);
    });
    
    // Pick the very first one
    const firstTrip = sortedTrips[0];

    if (firstTrip) {
      handleTripClick(firstTrip, true);
      if (notificationSoundEnabled) {
        scheduleDepartureNotification(
          new Date(`${firstTrip.date} ${firstTrip.time}`.replace(/-/g, '/')),
          notificationMinutes,
          true,
          selectedSound
        );
      }
    } else {
      setToastMessage("目前沒有最近的發車班次");
    }
  };

  const triggerTestNotification = async () => {
    const sorted = [...trips].sort((a, b) => {
      const ta = new Date(`${a.date} ${a.time}`.replace(/-/g,'/')).getTime();
      const tb = new Date(`${b.date} ${b.time}`.replace(/-/g,'/')).getTime();
      return ta - tb;
    });
    const now = Date.now();
    const nearest = sorted.find(t => new Date(`${t.date} ${t.time}`.replace(/-/g,'/')).getTime() >= now) || sorted[0];
    if (!nearest) { setToastMessage('找不到最近的班次'); return; }
    // 強制立即觸發：在 3 秒後排程
    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') await LocalNotifications.requestPermissions();
      await ensureNotificationChannel(selectedSound);
      scheduleDepartureNotification(
        new Date(Date.now() + 3000),
        0,
        notificationSoundEnabled,
        selectedSound
      );
    } catch (e) {}
    setToastMessage('已觸發通知測試');
  };

  const scheduleTodayNotifications = () => {
    if (!notificationSoundEnabled) return; // 全局關閉通知
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const todayStrDash = `${y}-${m}-${d}`;
    const key = `scheduled_ids_${y}${m}${d}`;
    const stored = localStorage.getItem(key);
    const setIds = new Set<string>(stored ? stored.split(',').filter(Boolean) : []);
    const addId = (id: string) => { setIds.add(id); localStorage.setItem(key, Array.from(setIds).join(',')); };
    for (const t of trips) {
      if (t.date !== todayStrDash) continue;
      const tripDate = new Date(`${t.date} ${t.time}`.replace(/-/g, '/'));
      const notifyId = String(Math.floor((tripDate.getTime() - notificationMinutes * 60000) / 1000));
      if (setIds.has(notifyId)) continue;
      scheduleDepartureNotification(tripDate, notificationMinutes, true, selectedSound);
      addId(notifyId);
    }
  };

  const compareVersions = (v1: string, v2: string) => {
    const p1 = v1.split('.').map(Number);
    const p2 = v2.split('.').map(Number);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      const n1 = p1[i] || 0;
      const n2 = p2[i] || 0;
      if (n1 > n2) return 1;
      if (n1 < n2) return -1;
    }
    return 0;
  };

  const checkForMandatoryUpdate = async () => {
    try {
      // Get current app version dynamically
      const info = await App.getInfo();
      const currentVersion = info.version;

      const api = 'https://api.github.com/repos/Kenzy1995/Hotel-shuttle-system-updata/releases/latest';
      const response = await fetch(api);
      if (!response.ok) throw new Error('GitHub API 取得失敗');
      const rel = await response.json();
      const latestVersion = (rel.tag_name || rel.name || '').replace(/^v/i, '') || '';
      
      if (latestVersion && compareVersions(latestVersion, currentVersion) > 0) {
        const apk = Array.isArray(rel.assets) ? rel.assets.find((a: any) => String(a.name).toLowerCase().endsWith('.apk')) : null;
        setUpdateUrl(apk?.browser_download_url || rel.html_url || 'https://github.com/Kenzy1995/Hotel-shuttle-system-updata/releases');
        setUpdateRequired(true);
      }
    } catch (e) {
      // 檢查失敗時不強制
    }
  };

  const handleTripClick = (trip: Trip, isRecent = false) => {
    setCurrentTrip(trip);
    setActiveTab('trips'); // Ensure we are on trips tab
    setSearchQuery(''); // Clear search when entering trip
    setIsRecentTripMode(isRecent);
    
    // Filter from local cache
    setPassengers(allTripPassengers.filter(p => p.tripId === trip.id));
  };
  
  const handleBackToTrips = () => {
    setCurrentTrip(null);
    setSearchQuery('');
    setIsRecentTripMode(false);
  };

  const handleRefresh = async (event: CustomEvent<RefresherEventDetail>) => {
    // Only show overlay if triggered manually (not via pull-to-refresh if we want, but user asked for overlay on "refresh button")
    // Wait, the user said "右上角的整理鍵" (Top right refresh button).
    // The IonRefresher is pull-to-refresh. The Header button calls loadData directly.
    // I should modify the Header prop or create a wrapper.
    // But wait, the Header 'onRefresh' prop is passed 'loadData'.
    // I need to wrap loadData or create a specific handler for the button.
    
    // Actually, I will update loadData to handle isRefreshing if I pass a flag or just handle it in a new function.
    await loadData();
    event.detail.complete();
  };
  
  const handleManualRefresh = async () => {
      setIsRefreshing(true);
      await loadData();
      scheduleTodayNotifications();
      // Artificial delay to show the overlay for a bit if load is too fast, or just finish.
      setTimeout(() => setIsRefreshing(false), 500);
  };

  const [scanVerifying, setScanVerifying] = useState(false);
  const pendingBoardingsRef = useRef<Set<string>>(new Set());
  const flushTimerRef = useRef<any>(null);
  const scheduleFlushPending = () => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(async () => {
      const items = Array.from(pendingBoardingsRef.current);
      pendingBoardingsRef.current.clear();
      flushTimerRef.current = null;
      try {
        // 如果有API調用且GPS已啟用，一次性發送GPS位置
        if (gpsSystemEnabled && gpsEnabled) {
          try {
            await sendCurrentLocation(currentTrip?.id || null, true); // 強制發送
          } catch (e) {
            console.error("GPS send error during flush", e);
          }
        }
        const api = await import('../services/api');
        for (const q of items) {
          try { await api.confirmBoarding(q); } catch {}
        }
      } catch {}
    }, 5000);
  };

  const handleScan = async (code: string) => {
    // Parse Booking ID from QR
    const parts = (code || "").trim().split(":");
    let bookingId = "";
    if (parts.length >= 3 && parts[0] === "FT") {
      bookingId = parts[1];
    }

    if (!bookingId) {
      setToastMessage("QRCode 格式錯誤");
      return;
    }

    // 以本地已載入資料快速驗證，延後批次更新後端
    setScanVerifying(true);
    const parts2 = (code || '').trim().split(':');
    const bookingId2 = parts2.length >= 2 ? parts2[1] : '';
    const paxLocal = allPassengers.find(p => p.bookingCode === bookingId2) || passengers.find(p => p.bookingCode === bookingId2);
    const nearest = findNearestTripFromNow(trips);
    if (!nearest) { setToastMessage('目前沒有最近班次'); setScanVerifying(false); return; }
    const nearestStr = `${nearest.date.replace(/-/g,'/')}` + ' ' + `${nearest.time}`;
    const paxTripStr = (paxLocal?.main_datetime || '').replace(/-/g,'/');
    const nowTs = Date.now();
    const depTs = paxTripStr ? new Date(paxTripStr).getTime() : 0;
    const diffSec = depTs ? (nowTs - depTs) / 1000 : 0;
    setToastContext('scan');
    if (!paxLocal) { setToastSuccess(false); setToastMessage('QR 不在目前資料'); setScanVerifying(false); return; }
    if (paxLocal.status === 'boarded') { setToastSuccess(false); setToastMessage('此乘客已上車，不重複核銷'); setScanVerifying(false); return; }
    if (!paxTripStr) { setToastSuccess(false); setToastMessage('未找到乘客主班次時間'); setScanVerifying(false); return; }
    if (paxTripStr !== nearestStr) { setToastSuccess(false); setToastMessage('非最近班次，未核銷'); setScanVerifying(false); return; }
    if (diffSec > 60 * 60) { setToastSuccess(false); setToastMessage('此班次已逾期，未核銷'); setScanVerifying(false); return; }
    if (diffSec < -30 * 60) { setToastSuccess(false); setToastMessage('尚未發車（早於 30 分鐘）'); setScanVerifying(false); return; }

    try {
      setToastSuccess(true);
      setToastMessage('確認上車成功');
      
      // Feedback handled in Scanner; do not duplicate here

      const updateList = (list: Passenger[]) => list.map(p => p.bookingCode === bookingId2 ? { ...p, status: 'boarded' } as Passenger : p);
      setPassengers(prev => updateList(prev));
      setAllPassengers(prev => updateList(prev));
      setAllTripPassengers(prev => updateList(prev));
      pendingBoardingsRef.current.add(code);
      scheduleFlushPending();
    } finally {
      setScanVerifying(false);
    }
  };

  const confirmCheckinAction = async () => {
    if (!pendingCheckin) return;

    try {
      // 如果有API調用且GPS已啟用，一次性發送GPS位置（包含 tripId）
      if (gpsSystemEnabled && gpsEnabled) {
        try {
          const tripId = currentTrip?.id || null;
          await sendCurrentLocation(tripId, true); // 強制發送
        } catch (e) {
          console.error("GPS send error during checkin", e);
        }
      }
      
      const result = await confirmBoarding(pendingCheckin.qrcode);
      if (result.success && result.passenger) {
        setToastMessage(`確認上車: ${result.passenger.name} (${result.passenger.pax}人)`);
        
        // 強制發送 GPS（API 調用時一次性發送）
        if (gpsSystemEnabled && gpsEnabled) {
          try {
            const tripId = currentTrip?.id || null;
            await sendCurrentLocation(tripId, true);
          } catch (e) {
            console.error("GPS send error during confirmBoarding", e);
          }
        }
        
        // Update local state immediately (Optimistic UI)
        const updatePaxStatus = (list: Passenger[]) => list.map(p => 
          p.bookingCode === result.passenger!.bookingCode ? { ...p, status: 'boarded' as const } : p
        );

        setPassengers(prev => updatePaxStatus(prev));
        setAllPassengers(prev => updatePaxStatus(prev));

        // Reload data after short delay to sync
        setTimeout(() => loadData(), 1500);
      } else {
        setToastMessage(`核銷失敗: ${result.message}`);
      }
    } catch (e) {
      setToastMessage("核銷發生錯誤");
    } finally {
      setPendingCheckin(null);
    }
  };

  const handleCheckUpdate = async () => {
    try {
      const api = 'https://api.github.com/repos/Kenzy1995/Hotel-shuttle-system-updata/releases/latest';
      const response = await fetch(api);
      if (!response.ok) throw new Error("GitHub API 取得失敗");
      const rel = await response.json();
      const latestVersion = (rel.tag_name || rel.name || '').replace(/^v/i, '') || '未知版本';
      const currentVersion = appVersion;
      if (compareVersions(latestVersion, currentVersion) > 0) {
        const apk = Array.isArray(rel.assets) ? rel.assets.find((a: any) => String(a.name).toLowerCase().endsWith('.apk')) : null;
        const url = apk?.browser_download_url || rel.html_url || "https://github.com/Kenzy1995/Hotel-shuttle-system-updata/releases";
        setUpdateUrl(url);
        setUpdateRequired(true);
      } else {
        alert("目前已是最新版本");
      }
    } catch (e) {
      alert("檢查更新失敗，請確認 Releases 是否公開或網路連線正常");
    }
  };

  // Filter Logic
  const filterList = (list: Passenger[]) => {
    if (!searchQuery) return list;
    const lower = searchQuery.toLowerCase();
    return list.filter(p => 
      p.name.toLowerCase().includes(lower) || 
      p.bookingCode.toLowerCase().includes(lower) ||
      p.phone.includes(lower) ||
      p.room.toLowerCase().includes(lower)
    );
  };

  // Grouping Logic for Trip Passengers
  const renderTripPassengers = () => {
    if (loadingTrip) return <div className="no-data" style={{textAlign:'center', marginTop:'20px'}}>載入中...</div>;

    const filtered = filterList(passengers);
    if (filtered.length === 0) return <div className="no-data">此班次目前沒有乘客 (或無符合搜尋)。</div>;

    const groups: Record<string, Passenger[]> = {};
    for (const p of filtered) {
      const label = normalizeStationName(p);
      if (!groups[label]) groups[label] = [];
      groups[label].push(p);
    }
    const stations = Object.keys(groups).sort((a, b) => stationSortKey(a) - stationSortKey(b));

    const pad = measureText('字');
    const wStatus = (Math.max(60, Math.max(measureText('狀態'), measureText('已上車')) + pad - pad)) * colScale;
    const wBooking = (Math.max(80, Math.max(measureText('預約編號'), ...filtered.map(p => measureText(p.bookingCode))) + pad - pad)) * colScale;
    const wUpDown = Math.max(measureText('上下'), ...filtered.map(p => measureText(p.updown || ''))) + pad;
    const wRoom = (Math.max(measureText('房號'), ...filtered.map(p => measureText(p.room || ''))) + pad) * colScale;
    const wName = (Math.max(120, Math.max(measureText('姓名'), ...filtered.map(p => measureText(truncateName(p.name || '')))) + pad - 2*pad)) * colScale;
    const wPax = (Math.max(60, Math.max(measureText('人數'), ...filtered.map(p => measureText(String(p.pax || '')))) + pad - 2*pad)) * colScale;
    const wPhone = (Math.max(100, Math.max(measureText('電話'), ...filtered.map(p => measureText(p.phone || ''))) + pad - 3*pad)) * colScale;
    const tripCols = [wStatus,wBooking,wUpDown,wRoom,wName,wPax,wPhone].map(w=>`${Math.ceil(w)}px`).join(' ');
    const tripMinW = [wStatus,wBooking,wUpDown,wRoom,wName,wPax,wPhone].reduce((a,b)=>a+b,0) + 40;

    return (
      <div className="trip-passenger-table-wrap" style={{paddingBottom: 70}}>
        <div className="table-header-row trip-passenger-header" style={{gridTemplateColumns: tripCols, minWidth: tripMinW}}>
           <div>狀態</div>
           <div>預約編號</div>
           <div>上下</div>
           <div>房號</div>
           <div>姓名</div>
           <div className="col-center">人數</div>
           <div className="col-center"></div>
        </div>
        {stations.map(station => {
          const list = groups[station];
          let totalUp = 0;
          let totalDown = 0;
          list.forEach(p => {
             const pax = safeInt(p.pax, 1);
             if (p.updown === '上車') totalUp += pax;
             if (p.updown === '下車') totalDown += pax;
          });

          return (
            <React.Fragment key={station}>
              <div className="station-header" style={{minWidth: tripMinW}}>
                <span>{station}</span>
                <span className="count">(總上：{totalUp} / 總下：{totalDown})</span>
              </div>
              {list.map((p, idx) => (
                <div 
                  key={`${p.id}-${idx}`} 
                  className={`passenger-row ${(p.updown === '下車' || p.status==='no_show') ? 'row-drop-off' : 'row-up'}`}
                  style={{gridTemplateColumns: tripCols, minWidth: tripMinW, paddingTop: `${8*rowScale}px`, paddingBottom: `${8*rowScale}px`}}
                  onClick={() => {
                     const fullDetails = allPassengers.find(ap => ap.bookingCode === p.bookingCode);
                     setDetailContextStation(station);
                     setShowDetailPassenger(fullDetails || p);
                  }}
                >
                   <div className={`p-status-tag ${(p.updown === '下車' || p.status === 'no_show') ? 'drop-off' : (p.status === 'boarded' ? 'ok' : '')}`}>
                      {p.updown === '下車' ? '已下車' : (p.status === 'boarded' ? '已上車' : (p.status === 'no_show' ? '未搭乘' : ''))}
                   </div>
                   <div className="p-booking">{p.bookingCode}</div>
                   <div className={'p-updown'}>{p.updown}</div>
                   <div className="p-room">{p.room || '(餐客)'}</div>
                   <div className="p-name">{truncateName(p.name)}</div>
                   <div className="p-pax">{p.pax}</div>
                   <div className="p-phone">
                     {p.phone && <a href={`tel:${p.phone}`} onClick={e => e.stopPropagation()}><IonIcon icon={call} style={{color: '#666', fontSize: '1.2em'}} /></a>}
                   </div>
                </div>
              ))}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  const renderTripPassengersForStation = (stationFilter: string) => {
    if (loadingTrip) return <div className="no-data" style={{textAlign:'center', marginTop:'20px'}}>載入中...</div>;
    const filtered = filterList(passengers).filter(p => normalizeStationName(p) === stationFilter);
    if (filtered.length === 0) return null;
    const pad = measureText('字');
    const wStatus = (Math.max(60, Math.max(measureText('狀態'), measureText('已上車')) + pad - pad)) * colScale;
    const wBooking = (Math.max(80, Math.max(measureText('預約編號'), ...filtered.map(p => measureText(p.bookingCode))) + pad - pad)) * colScale;
    const wUpDown = Math.max(measureText('上下'), ...filtered.map(p => measureText(p.updown || ''))) + pad;
    const wRoom = (Math.max(measureText('房號'), ...filtered.map(p => measureText(p.room || ''))) + pad) * colScale;
    const wName = (Math.max(120, Math.max(measureText('姓名'), ...filtered.map(p => measureText(truncateName(p.name || '')))) + pad - 2*pad)) * colScale;
    const wPax = (Math.max(60, Math.max(measureText('人數'), ...filtered.map(p => measureText(String(p.pax || '')))) + pad - 2*pad)) * colScale;
    const wPhone = (Math.max(100, Math.max(measureText('電話'), ...filtered.map(p => measureText(p.phone || ''))) + pad - 3*pad)) * colScale;
    const cols = [wStatus,wBooking,wUpDown,wRoom,wName,wPax,wPhone].map(w=>`${Math.ceil(w)}px`).join(' ');
    const minW = [wStatus,wBooking,wUpDown,wRoom,wName,wPax,wPhone].reduce((a,b)=>a+b,0) + 40;
    return (
      <div className="trip-passenger-table-wrap" style={{paddingBottom: 70}}>
        <div className="table-header-row trip-passenger-header" style={{gridTemplateColumns: cols, minWidth: minW}}>
           <div>狀態</div>
           <div>預約編號</div>
           <div>上下</div>
           <div>房號</div>
           <div>姓名</div>
           <div className="col-center">人數</div>
           <div className="col-center"></div>
        </div>
        {filtered.map((p, idx) => (
          <div key={`${p.id}-${idx}`} className={`passenger-row ${(p.updown === '下車' || p.status==='no_show') ? 'row-drop-off' : 'row-up'}`} style={{gridTemplateColumns: cols, minWidth: minW, paddingTop: `${8*rowScale}px`, paddingBottom: `${8*rowScale}px`}} onClick={() => { const fullDetails = allPassengers.find(ap => ap.bookingCode === p.bookingCode); setDetailContextStation(normalizeStationName(p)); setShowDetailPassenger(fullDetails || p); }}>
            <div className={`p-status-tag ${(p.updown === '下車' || p.status === 'no_show') ? 'drop-off' : (p.status === 'boarded' ? 'ok' : '')}`}>{p.updown === '下車' ? '已下車' : (p.status === 'boarded' ? '已上車' : (p.status === 'no_show' ? '未搭乘' : ''))}</div>
            <div className="p-booking">{p.bookingCode}</div>
            <div className={'p-updown'}>{p.updown}</div>
            <div className="p-room">{p.room || '(餐客)'}</div>
            <div className="p-name">{truncateName(p.name)}</div>
            <div className="p-pax">{p.pax}</div>
            <div className="p-phone">{p.phone && <a href={`tel:${p.phone}`} onClick={e => e.stopPropagation()}><IonIcon icon={call} style={{color: '#666', fontSize: '1.2em'}} /></a>}</div>
          </div>
        ))}
      </div>
    );
  };

  // Grouping Logic for All Passengers
  const renderAllPassengers = () => {
    const filtered = filterList(allPassengers);
    if (filtered.length === 0) return <div className="no-data">目前沒有乘客紀錄 (或無符合搜尋)。</div>;

    const byBooking = new Map<string, Passenger>();
    allTripPassengers.forEach(tp => { byBooking.set(tp.bookingCode, tp); });
    const nowTs = Date.now();
    const normalized = filtered.map(p => {
      const dtRaw = p.main_datetime || byBooking.get(p.bookingCode)?.main_datetime || '';
      const dt = dtRaw ? dtRaw.replace(/-/g, '/') : '';
      return { ...p, main_datetime: dt };
    });

    const computeTripTs = (t: Trip) => {
      const dtStr = `${t.date.replace(/-/g,'/')}` + ' ' + `${t.time}`;
      return new Date(dtStr).getTime();
    };
    const allowedSet = new Set<string>();
    const threshold = nowTs - 45 * 60 * 1000;
    trips.forEach(t => {
      const ts = computeTripTs(t);
      if (ts >= threshold) {
        allowedSet.add(`${t.date.replace(/-/g,'/')}` + ' ' + `${t.time}`);
      }
    });
    const kept = normalized.filter(p => allowedSet.has(p.main_datetime || ''));
    if (kept.length === 0) return <div className="no-data">目前沒有可顯示的班次</div>;

    const groups: Record<string, Passenger[]> = {};
    for (const p of kept) {
      const k = (p.main_datetime || '').split(' ')[0];
      if (!groups[k]) groups[k] = [];
      groups[k].push(p);
    }
    const keys = Object.keys(groups).sort((a, b) => parseDateTime(`${a} 00:00`) - parseDateTime(`${b} 00:00`));

    const pad = measureText('字');
    const wTime = (Math.max(measureText('班次'), ...kept.map(p => measureText(((p.main_datetime||'').split(' ')[1]||'')))) + pad) * colScale;
    let wStatus = (Math.max(measureText('狀態'), measureText('已上車')) + pad) * colScale;
    let wBooking = (Math.max(measureText('預約編號'), ...kept.map(p => measureText(p.bookingCode))) + pad) * colScale;
    wBooking = Math.max(1, wBooking - 1*pad);
    let wName = (Math.max(measureText('姓名'), ...kept.map(p => measureText(truncateName(p.name || '')))) + pad) * colScale;
    let wPax = (Math.max(measureText('人數'), ...kept.map(p => measureText(String(p.pax || '')))) + pad) * colScale;
    const wMall = (Math.max(measureText('LaLaport'), ...kept.map(p => measureText(p.mall || ''))) + pad) * colScale;
    const wStation = wMall;
    let wRoom = (Math.max(measureText('房號'), ...kept.map(p => measureText(p.room || ''))) + pad) * colScale;
    wStatus = Math.max(1, wStatus - 1*pad);
    wRoom = Math.max(1, wRoom + 1*pad);
    const allCols = [wTime,wStatus,wBooking,wName,wRoom,wPax,wStation,wStation,wStation,wStation,wStation].map(w=>`${Math.ceil(w)}px`).join(' ');
    const allMinW = [wTime,wStatus,wBooking,wName,wRoom,wPax,wStation,wStation,wStation,wStation,wStation].reduce((a,b)=>a+b,0) + 40;

    return (
      <div className="all-passenger-wrap" style={{paddingBottom: 70}}>
        <div className="table-header-row all-passenger-header" style={{gridTemplateColumns: allCols, minWidth: allMinW}}>
           <div>班次</div>
           <div>狀態</div>
           <div>預約編號</div>
           <div>姓名</div>
           <div>房號</div>
           <div className="col-center">人數</div>
           <div className="col-center">飯店(去)</div>
           <div className="col-center">捷運站</div>
           <div className="col-center">火車站</div>
           <div className="col-center">LaLaport</div>
           <div className="col-center">飯店(回)</div>
       </div>
        {keys.map(key => {
          const totalPeople = groups[key].reduce((sum, p) => sum + safeInt(p.pax, 1), 0);
          const label = key.replace(/-/g, '/');
          return (
            <React.Fragment key={key}>
              <div className="all-trip-header">
                {label} <span className="count">(共計：{totalPeople} 人)</span>
              </div>
              {groups[key].map((p, idx) => (
                <div key={`${p.id}-${idx}`} className={`all-passenger-row ${p.status==='no_show' ? 'row-drop-off' : ''}`} style={{gridTemplateColumns: allCols, minWidth: allMinW}} onClick={() => setShowDetailPassenger(p)}>
                   <div>{(p.main_datetime||'').split(' ')[1]}</div>
                   <div className={`p-status-tag ${p.status==='boarded' ? 'ok' : (p.status==='no_show' ? 'drop-off' : '')}`}>{p.status==='boarded' ? '已上車' : (p.status==='no_show' ? '未搭乘' : '')}</div>
                   <div>{p.bookingCode}</div>
                   <div className="p-name">{truncateName(p.name)}</div>
                   <div>{p.room || '(餐客)'}</div>
                   <div className="col-center">{p.pax}</div>
                   <div className={`col-center ${p.hotel_go?.includes('上') ? 'cell-up' : (p.hotel_go?.includes('下') ? 'cell-down' : '')}`}>{p.hotel_go ? ((p.hotel_go.includes('上') ? '上' : (p.hotel_go.includes('下') ? '下' : ''))) : ''}</div>
                   <div className={`col-center ${p.mrt?.includes('上') ? 'cell-up' : (p.mrt?.includes('下') ? 'cell-down' : '')}`}>{p.mrt ? ((p.mrt.includes('上') ? '上' : (p.mrt.includes('下') ? '下' : ''))) : ''}</div>
                   <div className={`col-center ${p.train?.includes('上') ? 'cell-up' : (p.train?.includes('下') ? 'cell-down' : '')}`}>{p.train ? ((p.train.includes('上') ? '上' : (p.train.includes('下') ? '下' : ''))) : ''}</div>
                   <div className={`col-center ${p.mall?.includes('上') ? 'cell-up' : (p.mall?.includes('下') ? 'cell-down' : '')}`}>{p.mall ? ((p.mall.includes('上') ? '上' : (p.mall.includes('下') ? '下' : ''))) : ''}</div>
                   <div className={`col-center ${p.hotel_back?.includes('上') ? 'cell-up' : (p.hotel_back?.includes('下') ? 'cell-down' : '')}`}>{p.hotel_back ? ((p.hotel_back.includes('上') ? '上' : (p.hotel_back.includes('下') ? '下' : ''))) : ''}</div>
                </div>
              ))}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  // Group Trips by Date
  const renderTrips = () => {
    if (trips.length === 0) return <div className="no-data">目前沒有可顯示的班次。</div>;
    
    const groups: Record<string, Trip[]> = {};
    for (const t of trips) {
      if (!groups[t.date]) groups[t.date] = [];
      groups[t.date].push(t);
    }
    const dates = Object.keys(groups).sort();

    return (
      <div>
        {dates.map(d => (
          <React.Fragment key={d}>
             <div className="date-header">🔔 {d}<span className="count">(共：{groups[d].length} 班)</span></div>
             {groups[d].sort((a,b) => a.time.localeCompare(b.time)).map((t, idx) => (
               <div key={`${t.id}-${idx}`} className="trip-row" onClick={() => handleTripClick(t)}>
                 <div className="trip-left">
                   <div className="trip-time">{t.time}</div>
                 </div>
                 <div className="trip-right">(共計:{t.booked}人)</div>
               </div>
             ))}
          </React.Fragment>
        ))}
      </div>
    );
  };

  return (
    <IonPage>
      {isInitialLoading && (
          <div id="splash-screen" className={splashPhase==='fade' ? 'splash-fade' : ''}>
              <img src="assets/logo.png" className={`splash-logo ${splashPhase==='fade' ? 'zoom-out' : ''}`} alt="Logo" />
              <div className="splash-text">汐止福泰接駁車系統</div>
          </div>
      )}

      {updateRequired && (
        <div className="permission-modal-overlay" style={{zIndex: 1100}}>
           <div className="permission-modal">
              <div className="pm-icon">
                 <img src="assets/logo.png" alt="" />
              </div>
              <div className="pm-title">發現新版本</div>
              <div className="pm-desc">
                 需要更新至最新版本才能繼續使用。
              </div>
              <button className="pm-btn" onClick={() => { if (updateUrl) window.open(updateUrl, '_system'); }}>
                 前往下載更新
              </button>
           </div>
        </div>
      )}

      {isRefreshing && (
          <div id="refresh-overlay">
              <div className="refresh-content">
                  <div className="refresh-spinner"></div>
                  <div style={{color: '#666', fontSize: '14px', fontWeight: 600}}>資料更新中...</div>
              </div>
          </div>
      )}

      <Header 
        title=""
        onSearch={setSearchQuery}
        searchValue={searchQuery}
        showSearch={activeTab === 'passengers' || (activeTab === 'trips' && !!currentTrip)}
        onRefresh={handleManualRefresh}
        onClearSearch={() => setSearchQuery('')}
        onMenuClick={() => setIsMenuOpen(true)}
      />
      
      {/* Sidebar Menu */}
      {isMenuOpen && (
        <div className="sidebar-overlay" onClick={() => { 
          setIsMenuOpen(false); 
          setExpandedSection(null);
          // 離開選單時重置開發選項的展開狀態和授權狀態
          setDevAuthorized(false);
          localStorage.removeItem('dev_auth_ok');
          (window as any).__dev_click_count = 0;
        }}>
           <div className="sidebar-content" onClick={e => e.stopPropagation()}>
              <div className="sidebar-header">
                 <img src="assets/logo.png" className="sidebar-logo" alt="FH" />
                <div className="sidebar-title">汐止福泰_接駁車預約系統 2.0</div>
                 <button className="icon-btn" style={{marginLeft:'auto'}} onClick={() => { 
                   setIsMenuOpen(false); 
                   setExpandedSection(null);
                   // 離開選單時重置開發選項的展開狀態和授權狀態
                   setDevAuthorized(false);
                   localStorage.removeItem('dev_auth_ok');
                   (window as any).__dev_click_count = 0;
                 }}>✕</button>
              </div>
              <div className="sidebar-menu">
                {/* Section: 使用者切換 */}
                {gpsSystemEnabled && (
                <div className="menu-section" style={{order: 10}}>
                    <div className="section-header" onClick={() => toggleSection('user_role')}>
                       <div className="section-title">
                         <span style={{marginRight:8}}>🙋</span>
                         使用者切換
                       </div>
                       <IonIcon icon={expandedSection === 'user_role' ? chevronDownOutline : chevronForwardOutline} />
                    </div>
                    {expandedSection === 'user_role' && (
                       <div className="section-content">
                          <div className="menu-item">
                             <span className="menu-label">目前身分</span>
                             <span style={{marginLeft:'8px', fontWeight:700}}>{userRole === 'desk' ? '櫃台人員' : '接駁司機'}</span>
                          </div>
                          
                          <div className="menu-item" style={{display:'flex', gap:'8px'}}>
                             <button className={`role-btn ${userRole==='desk' ? 'selected' : ''}`} onClick={() => { setUserRole('desk'); localStorage.setItem('user_role','desk'); }}>櫃台人員</button>
                             <button className={`role-btn ${userRole==='driverA' ? 'selected' : ''}`} onClick={() => { setUserRole('driverA'); localStorage.setItem('user_role','driverA'); }}>接駁司機</button>
                          </div>
                          <div style={{fontSize:'12px', color:'#777', marginTop:'4px', textAlign:'center'}}>*櫃台人員將永久關閉GPS定位系統</div>
                       </div>
                    )}
                 </div>
                )}
                
                {/* Section: 顯示清單 */}
                <div className="menu-section" style={{order: 20}}>
                    <div className="section-header" onClick={() => toggleSection('list_visibility')}>
                       <div className="section-title">
                         <span style={{marginRight:8}}>☰</span>
                         清單模式
                       </div>
                       <IonIcon icon={expandedSection === 'list_visibility' ? chevronDownOutline : chevronForwardOutline} />
                    </div>
                    {expandedSection === 'list_visibility' && (
                       <div className="section-content">
                         <div className="menu-item" style={{display:'flex', gap:'8px', flexWrap:'wrap'}}>
                           <button className={`role-btn ${showRecent ? 'selected' : ''}`} onClick={() => applyListSelection(!showRecent, showTripsList, showPassengersList, showFlowList)}>最近發車</button>
                           <button className={`role-btn ${showTripsList ? 'selected' : ''}`} onClick={() => applyListSelection(showRecent, !showTripsList, showPassengersList, showFlowList)}>班次清單</button>
                           <button className={`role-btn ${showPassengersList ? 'selected' : ''}`} onClick={() => applyListSelection(showRecent, showTripsList, !showPassengersList, showFlowList)}>乘客清單</button>
                           <button className={`role-btn ${showFlowList ? 'selected' : ''}`} onClick={() => applyListSelection(showRecent, showTripsList, showPassengersList, !showFlowList)}>接駁出車</button>
                         </div>
                         <div style={{fontSize:'12px', color:'#777', marginTop:'4px', textAlign:'center'}}>*至少選擇一個列表顯示</div>
                         <div className="menu-item column-item" style={{marginTop: 10}}>
                            <span className="menu-label">欄寬</span>
                            <div className="input-row" style={{alignItems:'center', gap:'8px'}}>
                              <input type="range" min="0.8" max="1.6" step="0.05" value={colScale} onChange={e => { const v = parseFloat(e.target.value); setColScale(v); localStorage.setItem('col_scale', String(v)); }} />
                              <span style={{fontSize: 12, color: '#666'}}>{Math.round(colScale*100)}%</span>
                            </div>
                         </div>
                         <div className="menu-item column-item">
                            <span className="menu-label">欄高</span>
                            <div className="input-row" style={{alignItems:'center', gap:'8px'}}>
                              <input type="range" min="0.8" max="1.6" step="0.05" value={rowScale} onChange={e => { const v = parseFloat(e.target.value); setRowScale(v); localStorage.setItem('row_scale', String(v)); }} />
                              <span style={{fontSize: 12, color: '#666'}}>{Math.round(rowScale*100)}%</span>
                            </div>
                         </div>
                       </div>
                    )}
                 </div>

                {/* Section 2: 發車通知 */}
                <div className="menu-section" style={{order: 30}}>
                    <div className="section-header" onClick={() => toggleSection('notification')}>
                       <div className="section-title">
                         <IonIcon icon={notificationsOutline} style={{marginRight: 8}} />
                         發車通知
                       </div>
                       <IonIcon icon={expandedSection === 'notification' ? chevronDownOutline : chevronForwardOutline} />
                    </div>
                    {expandedSection === 'notification' && (
                       <div className="section-content">
                          <div className="menu-item column-item">
                             <span className="menu-label">提前通知時間</span>
                             <div className="input-row">
                                 <input 
                                    type="number" 
                                    value={notificationMinutes} 
                                    onChange={e => {
                                       const val = parseInt(e.target.value);
                                       if (!isNaN(val) && val > 0) setNotificationMinutes(val);
                                    }}
                                 />
                                 <span style={{fontSize: '14px', color: '#666'}}>分鐘</span>
                             </div>
                          </div>
                          
                          <div className="menu-item">
                             <span className="menu-label">通知音效開關</span>
                             <label className="toggle-switch">
                                <input type="checkbox" checked={notificationSoundEnabled} onChange={e => setNotificationSoundEnabled(e.target.checked)} />
                                <span className="slider"></span>
                             </label>
                          </div>

                          {notificationSoundEnabled && (
                             <div className="menu-item column-item">
                                <span className="menu-label">選擇音效</span>
                                <IonSelect 
                                   value={selectedSound} 
                                   placeholder="選擇音效" 
                                   onIonChange={e => setSelectedSound(e.detail.value)}
                                   interface="action-sheet"
                                   style={{width: '100%', background: '#fff', borderRadius: '6px', border: '1px solid #ddd', paddingLeft: '10px'}}
                                >
                                   <IonSelectOption value="notify_sound_1">音效 1</IonSelectOption>
                                   <IonSelectOption value="notify_sound_2">音效 2</IonSelectOption>
                                   <IonSelectOption value="notify_sound_3">音效 3</IonSelectOption>
                                   <IonSelectOption value="notify_sound_4">音效 4</IonSelectOption>
                                </IonSelect>
                                <button onClick={() => { const audio = new Audio(`/assets/sounds/${selectedSound}.mp3`); audio.play(); }} style={{marginTop: '8px', width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', background: '#f7f7f7', fontSize: '14px', fontWeight: 600}}>試播音效</button>
                                <button onClick={triggerTestNotification} style={{marginTop: '8px', width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #0b63ce', background: '#eef6ff', color:'#0b63ce', fontSize: '14px', fontWeight: 600}}>通知測試</button>
                             </div>
                          )}
                       </div>
                    )}
                 </div>

                {/* Section 3: 字體大小 */}
                <div className="menu-section" style={{order: 35}}>
                    <div className="section-header" onClick={() => toggleSection('font')}>
                       <div className="section-title">
                         <IonIcon icon={textOutline} style={{marginRight: 8}} />
                         字體大小
                       </div>
                       <IonIcon icon={expandedSection === 'font' ? chevronDownOutline : chevronForwardOutline} />
                    </div>
                    {expandedSection === 'font' && (
                       <div className="section-content">
                          <div className="menu-item column-item">
                              <span className="menu-label">字體縮放（50% - 200%）</span>
                              <div className="font-size-controls" style={{width:'100%'}}>
                                <input 
                                  type="range" 
                                  min={50} 
                                  max={150} 
                                  step={10}
                                  value={editingFontScale}
                                  onChange={e => {
                                    const v = parseInt(e.target.value, 10);
                                    setEditingFontScale(v);
                                    setFontScale(v);
                                    localStorage.setItem('font_scale', String(v));
                                    (document.body as any).style.zoom = String(v/100);
                                  }}
                                  style={{width:'100%'}}
                                />
                                <div style={{display:'flex', justifyContent:'center', marginTop:'8px'}}>
                                   <span style={{fontSize:'14px', color:'#666'}}>{editingFontScale}%</span>
                                </div>
                              </div>
                          </div>
                       </div>
                    )}
                 </div>

                {/* Section: 開發選項（移至最底、隱藏展開、需連續點擊10次觸發密碼） */}
                <div className="menu-section" style={{order: 100}}>
                    <div className="section-header" onClick={() => {
                      const now = Date.now();
                      const prev = (window as any).__dev_last_click_ts || 0;
                      (window as any).__dev_last_click_ts = now;
                      const diff = now - prev;
                      if (diff < 800) {
                        (window as any).__dev_click_count = ((window as any).__dev_click_count || 0) + 1;
                      } else {
                        (window as any).__dev_click_count = 1;
                      }
                      if (((window as any).__dev_click_count || 0) >= 10) {
                        setDevPasswordOpen(true);
                        (window as any).__dev_click_count = 0;
                      }
                    }}>
                       <div className="section-title" style={{color: '#999'}}>
                         <IonIcon icon={constructOutline} style={{marginRight: 8}} />
                         開發選項
                       </div>
                       {/* 無展開箭頭 */}
                    </div>
                    {devAuthorized && (
                       <div className="section-content">
                          {/* 總開關：控制是否使用即時定位系統 */}
                          <div className="menu-item column-item">
                            <span className="menu-label">即時位置（總開關）</span>
                            <label className="toggle-switch">
                              <input type="checkbox" checked={gpsSystemEnabled} onChange={e => {
                                const val = e.target.checked;
                                setGpsSystemEnabled(val);
                                if (!val) {
                                  setGpsEnabled(false);
                                  localStorage.setItem('gps_enabled', 'false');
                                }
                              }} />
                              <span className="slider"></span>
                            </label>
                            <div style={{fontSize: '12px', color: '#999', marginTop: '4px'}}>
                              關閉時將隱藏"使用者切換"頁面，出車開始也不會觸發GPS
                            </div>
                          </div>
                          
                          {/* GPS定位發送開關（層級結構） */}
                          {gpsSystemEnabled && (
                            <>
                              <div className="menu-item column-item" style={{paddingLeft: '24px', borderLeft: '2px solid #e0e0e0'}}>
                                <span className="menu-label">GPS定位發送</span>
                                <label className="toggle-switch">
                                  <input type="checkbox" checked={gpsEnabled} onChange={e => {
                                    const val = e.target.checked;
                                    setGpsEnabled(val);
                                    localStorage.setItem('gps_enabled', String(val));
                                  }} />
                                  <span className="slider"></span>
                                </label>
                                <div style={{fontSize: '12px', color: '#999', marginTop: '4px'}}>
                                  出車開始時自動打開，出車結束時自動關閉
                                </div>
                              </div>
                              
                              {/* GPS發送間隔設置（只在GPS定位發送開啟時顯示） */}
                              {gpsEnabled && (
                                <div className="menu-item column-item" style={{paddingLeft: '24px', borderLeft: '2px solid #e0e0e0'}}>
                                  <span className="menu-label">更新頻率</span>
                                  <div className="input-row">
                                    <input 
                                      type="number" 
                                      min={3} 
                                      value={gpsInterval} 
                                      onChange={e => {
                                        const v = Math.max(3, parseInt(e.target.value || '3', 10));
                                        setGpsInterval(v);
                                        localStorage.setItem('gps_update_interval', String(v));
                                      }} 
                                      style={{maxWidth: '80px', width: '80px'}}
                                    />
                                    <span style={{fontSize: '14px', color: '#666'}}>分鐘</span>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                          
                          {/* 自動關閉定位（層級結構） */}
                          {gpsSystemEnabled && (
                            <>
                              <div className="menu-item column-item" style={{paddingLeft: '24px', borderLeft: '2px solid #e0e0e0'}}>
                                <span className="menu-label">自動關閉定位</span>
                                <label className="toggle-switch">
                                  <input type="checkbox" checked={autoShutdownEnabled} onChange={e => setAutoShutdownEnabled(e.target.checked)} />
                                  <span className="slider"></span>
                                </label>
                              </div>
                              {autoShutdownEnabled && (
                                <>
                                  <div className="menu-item column-item" style={{paddingLeft: '48px', borderLeft: '2px solid #e0e0e0'}}>
                                    <span className="menu-label">判定時間</span>
                                    <div className="input-row">
                                      <input type="number" min={1} value={autoShutdownMinutes} onChange={e => {
                                        const v = Math.max(1, parseInt(e.target.value || '1', 10));
                                        setAutoShutdownMinutes(v);
                                      }} style={{maxWidth: '80px', width: '80px'}} />
                                      <span style={{fontSize: '14px', color: '#666'}}>分鐘</span>
                                    </div>
                                  </div>
                                  <div className="menu-item column-item" style={{paddingLeft: '48px', borderLeft: '2px solid #e0e0e0'}}>
                                    <span className="menu-label">最小位移</span>
                                    <div className="input-row">
                                      <input type="number" min={1} value={autoShutdownDistance} onChange={e => {
                                        const v = Math.max(1, parseInt(e.target.value || '1', 10));
                                        setAutoShutdownDistance(v);
                                      }} style={{maxWidth: '80px', width: '80px'}} />
                                      <span style={{fontSize: '14px', color: '#666'}}>公尺</span>
                                    </div>
                                  </div>
                                </>
                              )}
                            </>
                          )}
                       </div>
                    )}
                </div>

                {/* Section: 資料更新 */}
                <div className="menu-section" style={{order: 40}}>
                    <div className="section-header" onClick={() => toggleSection('data_update')}>
                       <div className="section-title">
                         <IonIcon icon={cloudDownloadOutline} style={{marginRight: 8}} />
                         資料更新
                       </div>
                       <IonIcon icon={expandedSection === 'data_update' ? chevronDownOutline : chevronForwardOutline} />
                    </div>
                    {expandedSection === 'data_update' && (
                       <div className="section-content">
                          <div className="menu-item column-item">
                             <span className="menu-label">乘客資料更新頻率</span>
                             <div className="input-row">
                                 <input 
                                    type="number" 
                                    min={5}
                                    value={dataInterval} 
                                    onChange={e => {
                                       let val = parseInt(e.target.value);
                                       if (isNaN(val)) return;
                                       if (val < 5) val = 5;
                                       setDataInterval(val);
                                       if (parseInt(e.target.value) < 5) { setToastContext('default'); setToastSuccess(true); setToastMessage('API速率限制'); }
                                    }}
                                 />
                                 <span style={{fontSize: '14px', color: '#666'}}>分鐘</span>
                             </div>
                          </div>
                       </div>
                    )}
                </div>

                

                {/* Section: 問題回報 */}
                <div className="menu-section" style={{order: 50}}>
                   <div className="section-header" onClick={() => toggleSection('issue_report')}>
                      <div className="section-title">
                        <span style={{marginRight:8}}>💬</span>
                        問題回報
                      </div>
                      <IonIcon icon={expandedSection === 'issue_report' ? chevronDownOutline : chevronForwardOutline} />
                   </div>
                   {expandedSection === 'issue_report' && (
                     <div className="section-content">
                        <div className="menu-item" style={{display:'flex', justifyContent:'space-between'}}>
                           <span style={{color:'#666'}}>如有問題請聯繫管理員。</span>
                           <button className="btn-green" onClick={() => { try { window.open('line://ti/p/@715gqbth', '_system'); } catch { window.location.href = 'line://ti/p/@715gqbth'; } }}>回報</button>
                        </div>
                     </div>
                   )}
                </div>

                {/* Section: 恢復原廠 */}
                <div className="menu-section" style={{order: 60}}>
                    <div className="section-header" onClick={() => toggleSection('factory_reset')}>
                    <div className="section-title">
                         <span style={{marginRight: 8}}>⟳</span>
                         恢復原廠
                       </div>
                       <IonIcon icon={expandedSection === 'factory_reset' ? chevronDownOutline : chevronForwardOutline} />
                    </div>
                    {expandedSection === 'factory_reset' && (
                       <div className="section-content">
                         <div className="menu-item">
                           <span style={{marginLeft:0, color:'#666'}}>將所有參數設回原廠設置</span>
                         </div>
                         <div className="menu-item">
                           <button className="modal-btn danger" onClick={() => setShowFactoryModal(true)}>還原</button>
                         </div>
                       </div>
                    )}
                 </div>

                 {/* Section 4: 版本更新 */}
                 <div className="menu-section" style={{order: 80}}>
                    <div className="section-header" onClick={() => toggleSection('update')}>
                       <div className="section-title">
                         <IonIcon icon={cloudDownloadOutline} style={{marginRight: 8}} />
                         版本更新
                       </div>
                       <IonIcon icon={expandedSection === 'update' ? chevronDownOutline : chevronForwardOutline} />
                    </div>
                 {expandedSection === 'update' && (
                   <div className="section-content">
                      <div className="menu-item" style={{gap:'8px'}}>
                         <span className="menu-label">檢查更新</span>
                         <button className="btn-green" onClick={handleCheckUpdate}>檢查</button>
                      </div>
                      
                      <div style={{padding: '10px 20px', fontSize: '12px', color: '#999'}}>
                         目前版本: <a href="https://github.com/Kenzy1995/Hotel-shuttle-system-updata/releases" target="_blank" rel="noopener noreferrer" style={{color:'#0b63ce', textDecoration:'underline'}}>v{appVersion}</a>
                      </div>
                   </div>
                 )}
                 </div
                >

              </div>
              <div className="sidebar-subtitle" style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px'}}>
                <a href="https://kz-tech.netlify.app/" target="_blank" rel="noopener noreferrer" style={{display:'inline-flex', alignItems:'center', gap:6, textDecoration:'none'}}>
                  <img src="assets/kz_logo.png" alt="KZ" style={{width:16, height:16, objectFit:'contain'}} />
                  <span style={{fontSize:'12px', color:'#999', fontWeight:600}}>Design_KZ-TECH</span>
                </a>
                <div style={{fontSize:'12px', color:'#999'}}>目前版本：v{appVersion}</div>
              </div>
           </div>
        </div>
      )}

      <IonContent>
      <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
        <IonRefresherContent pullingText="下拉更新..." refreshingText="資料更新中..."></IonRefresherContent>
      </IonRefresher>
      <audio id="qr-beep" src="assets/sounds/QR Code Scan Beep.mp3" preload="auto" style={{display:'none'}} />
      {/* Login overlay removed; full-page Login route is used */}
      <div id="page-container">
          
          {/* TRIPS TAB */}
          {activeTab === 'trips' && !currentTrip && showTripsList && (
            <div id="page-trips" className="inner-page">
               {renderTrips()}
            </div>
          )}

          {/* TRIP PASSENGERS (Detail View) */}
        {activeTab === 'trips' && currentTrip && (
           <div className="inner-page">
              {!isRecentTripMode && <div className="back-btn" onClick={handleBackToTrips}>← 返回班次列表</div>}
              <div className="trip-header">
                {isRecentTripMode ? (
                  <span className="recent-main-time-card"><span className="recent-label">班次</span> {currentTrip.time}</span>
                ) : (
                  <span className="trip-main-time">{currentTrip.date} {currentTrip.time}</span>
                )}
                {(() => {
                  const showActions = isTripWithinActionWindow(currentTrip, 60);
                  return showActions ? (
                    <div className="trip-actions" style={{marginLeft:'auto'}}>
                      {!flowStarted && (
                        <button className="action-btn action-btn--start" onClick={(e) => { e.stopPropagation(); setStartConfirm(true); }}>{isRecentTripMode ? '出車開始' : '開始'}</button>
                      )}
                      <button className="action-btn action-btn--end" onClick={(e) => { e.stopPropagation(); setEndConfirm(true); }}>{isRecentTripMode ? '出車結束' : '結束'}</button>
                    </div>
                  ) : null;
                })()}
              </div>
              {renderTripPassengers()}
           </div>
        )}

          {/* PASSENGERS TAB */}
          {activeTab === 'passengers' && showPassengersList && (
            <div className="inner-page">
              {renderAllPassengers()}
            </div>
          )}

          {/* FLOW TAB */}
          {activeTab === 'flow' && currentTrip && showFlowList && (
            <div className="inner-page">
              {!flowStarted ? (
                <div style={{display:'flex', flexDirection:'column', minHeight:'60vh'}}>
                  <div style={{background:'transparent', border:'none', padding:'24px', display:'flex', flexDirection:'column', justifyContent:'space-between', minHeight:'60vh'}}>
                    <div>
                      <div style={{fontSize:44, fontWeight:900, textAlign:'center', marginBottom:12, color:'var(--fh-gold)'}}>接駁出車</div>
                      <div style={{display:'flex', flexDirection:'column', gap:10}}>
                        <div style={{fontSize:32, fontWeight:800}}>日期 {currentTrip.date}</div>
                        <div style={{fontSize:32, fontWeight:800, display:'flex', alignItems:'center', gap:12}}>班次 {currentTrip.time}
                          <button style={{marginLeft:8, fontSize:16, padding:'6px 10px', borderRadius:8, border:'1px solid #ddd', background:'#fff'}} onClick={() => setChangeTripOpen(true)}>變更班次</button>
                        </div>
                        <div style={{fontSize:32, fontWeight:800}}>人數 {computeTripTotalPax()}</div>
                      </div>
                    </div>
                    <div style={{marginTop:'24px'}}>
                      <button className="action-btn action-btn--start large" style={{width:'100%'}} onClick={() => setStartConfirm(true)}>出車開始</button>
                    </div>
                  </div>
                </div>

              ) : (
                <div>
                  {(() => {
                    const hasCurrent = filterList(passengers).some(p => normalizeStationName(p)===STATION_ORDER[flowStep]);
                    const isLast = flowStep === STATION_ORDER.length - 1;
                    if (!hasCurrent && !isLast) {
                      let next = -1;
                      for (let i=flowStep+1;i<STATION_ORDER.length;i++) {
                        if (filterList(passengers).some(p => normalizeStationName(p)===STATION_ORDER[i])) { next = i; break; }
                      }
                      if (next>=0) { setFlowStep(next); return null; }
                      // 若後面皆無乘客，仍要顯示最後一站以便結束
                      setFlowStep(STATION_ORDER.length - 1);
                      return null;
                    }
                    return null;
                  })()}
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px'}}>
                    <div style={{display:'flex', alignItems:'center', gap:'8px', marginLeft:'10px'}}>
                      <span className="recent-main-time-card"><span className="recent-label">班次</span> {currentTrip.time}</span>
                    </div>
                    <div style={{display:'flex', gap:'8px'}}>
                      {flowStep <= firstStationIdx ? (
                        <button className="rounded-btn gray" onClick={() => { setFlowStarted(false); }}>上一頁</button>
                      ) : (
                        <button className="rounded-btn gray" onClick={() => {
                          const prevIdx = (() => {
                            for (let i=flowStep-1; i>=0; i--) {
                              if (filterList(passengers).some(p => normalizeStationName(p)===STATION_ORDER[i])) return i;
                            }
                            return Math.max(0, flowStep-1);
                          })();
                          setFlowStep(prevIdx);
                        }}>上一站</button>
                      )}
                      {flowStep < STATION_ORDER.length-1 ? (
                        <button className="action-btn action-btn--start" onClick={() => {
                          const nextIdx = (() => {
                            for (let i=flowStep+1;i<STATION_ORDER.length;i++) {
                              if (filterList(passengers).some(p => normalizeStationName(p)===STATION_ORDER[i])) return i;
                            }
                            return flowStep+1;
                          })();
                          setFlowStep(Math.min(nextIdx, STATION_ORDER.length-1));
                        }}>下一站</button>
                      ) : (
                        <button className="action-btn action-btn--end" onClick={() => setEndConfirm(true)}>出車結束</button>
                      )}
                    </div>
                  </div>
                  {(flowStep === STATION_ORDER.length - 1 || filterList(passengers).some(p => normalizeStationName(p)===STATION_ORDER[flowStep])) && (
                    <>
                      <div className="station-header" style={{marginTop:'6px'}}>
                        <span>{STATION_ORDER[flowStep]}</span>
                      </div>
                      {renderTripPassengersForStation(STATION_ORDER[flowStep])}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

      </div>
    </IonContent>

    {scanVerifying && (
      <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex: 100000}}>
        <div style={{background:'#fff', borderRadius:12, padding:'16px 20px', boxShadow:'0 6px 18px rgba(0,0,0,0.2)', display:'flex', alignItems:'center', gap:12}}>
          <div className="spinner" style={{width:22, height:22, border:'2px solid #ddd', borderTopColor:'#0b63ce', borderRadius:'50%', animation:'spin 0.9s linear infinite'}}></div>
          <div style={{fontSize:14, color:'#333', fontWeight:700}}>資料驗證中...</div>
        </div>
      </div>
    )}

      {/* Floating Scan Button */}
      {currentTrip && flowStarted && (
        <button className="floating-scan-btn" onClick={() => setIsScanning(true)} style={{display: 'flex'}}>
           <img className="floating-scan-icon" src="assets/icon-scan-custom.png" alt="Scan" />
        </button>
      )}

      {/* Bottom Nav */}
      <div className="bottom-nav">
        {showFlowList && (
          <button className={`nav-btn ${activeTab === 'flow' ? 'active' : ''}`} onClick={() => {
            setActiveTab('flow');
            const nearest = findNearestTripFromNow(trips);
            if (nearest) {
              setCurrentTrip(nearest);
              setIsRecentTripMode(false);
              setPassengers(allTripPassengers.filter(p => p.tripId === nearest.id));
            }
          }}>
            <img className="nav-icon" src="assets/bus.png" alt="" />
            <span>接駁出車</span>
          </button>
        )}
        {showRecent && (
          <button className={`nav-btn ${isRecentTripMode && activeTab!=='flow' ? 'active' : ''}`} onClick={handleRecentTripClick}>
            <img className="nav-icon" src="assets/icon-ready.png" alt="" />
            <span>最近發車</span>
          </button>
        )}
        {showTripsList && (
          <button className={`nav-btn ${activeTab === 'trips' && !currentTrip && !isRecentTripMode ? 'active' : ''}`} onClick={() => { setActiveTab('trips'); setCurrentTrip(null); setIsRecentTripMode(false); }}>
            <img className="nav-icon" src="assets/icon-trips.png" alt="" />
            <span>班次清單</span>
          </button>
        )}
        {showPassengersList && (
          <button className={`nav-btn ${activeTab === 'passengers' ? 'active' : ''}`} onClick={() => { setActiveTab('passengers'); setCurrentTrip(null); setIsRecentTripMode(false); }}>
            <img className="nav-icon" src="assets/icon-passengers.png" alt="" />
            <span>乘客清單</span>
          </button>
        )}
      </div>

      {isScanning && (
        <Scanner onScan={handleScan} onClose={() => setIsScanning(false)} disabled={scanVerifying} throttleMs={2000} />
      )}

      {changeTripOpen && currentTrip && (
        <div className="permission-modal-overlay" style={{zIndex: 1100}} onClick={() => setChangeTripOpen(false)}>
          <div className="permission-modal" onClick={e => e.stopPropagation()}>
            <div className="pm-title">變更班次</div>
            <div className="pm-desc">選擇同日其他班次切換</div>
            <div style={{display:'flex', flexDirection:'column', gap:8}}>
              {trips.filter(t => t.date === currentTrip!.date).sort((a,b)=>a.time.localeCompare(b.time)).map((t, idx) => (
                 <button key={`${t.id}-${idx}`} className="modal-btn secondary" onClick={() => { setCurrentTrip(t); setPassengers(allTripPassengers.filter(p => p.tripId === t.id)); setChangeTripOpen(false); }}>切換至 {t.time}</button>
              ))}
            </div>
            <div style={{marginTop:12}}>
              <button className="modal-btn" onClick={() => setChangeTripOpen(false)}>關閉</button>
            </div>
          </div>
        </div>
      )}

      <IonToast
        isOpen={!!toastMessage}
        onDidDismiss={() => { setToastMessage(null); setToastContext('default'); }}
        message={toastMessage || ''}
        duration={2000}
        color={toastContext==='scan' ? (toastSuccess ? 'success' : 'danger') : (toastMessage?.includes('失敗') || toastMessage?.includes('錯誤') ? 'danger' : 'success')}
        position={'bottom'}
        cssClass={'bottom-banner-toast'}
      />

      {/* Detail Overlay */}
      {showDetailPassenger && (
        <div id="detail-overlay" style={{display: 'flex'}} onClick={() => setShowDetailPassenger(null)}>
          <div className="detail-card" onClick={e => e.stopPropagation()}>
              <div className="detail-title" style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
              <span>乘客詳情</span>
              <div style={{display:'inline-flex', gap:'12px'}}>
                {isPassengerTripWithinWindow(showDetailPassenger, 60) && (
                  <>
                    <button className="rounded-btn gray" onClick={(e) => { e.stopPropagation(); setNoShowModal({open:true, countdown:2, target: showDetailPassenger}); }}>No-show</button>
                    <button className="rounded-btn yellow" onClick={(e) => { e.stopPropagation(); setManualModal({open:true, countdown:2, target: showDetailPassenger}); }}>人工驗票</button>
                  </>
                )}
              </div>
            </div>
            <div id="detail-body">
               <DetailRows p={showDetailPassenger} />
            </div>
            <div className="detail-close">
              <button className="modal-btn secondary" onClick={() => setShowDetailPassenger(null)}>關閉</button>
            </div>
          </div>
        </div>
      )}

      {/* No-show Modal */}
      {noShowModal.open && (
        <div className="permission-modal-overlay" style={{zIndex: 1200}} onClick={() => setNoShowModal({open:false, countdown:2, target:null})}>
           <div className="permission-modal" onClick={e => e.stopPropagation()}>
              <div className="pm-title">逾時未搭乘</div>
              <div className="pm-desc">此乘客標記為 No-show。</div>
              <div style={{display:'flex', gap:'8px', justifyContent:'flex-end'}}>
                 <button className="modal-btn secondary" onClick={() => setNoShowModal({open:false, countdown:2, target:null})}>取消</button>
                 <button className="modal-btn primary" disabled={noShowModal.countdown>0} onClick={() => {
                    if (!noShowModal.target) return;
                    const bookingId = noShowModal.target.bookingCode || noShowModal.target.id;
                    setNoShowModal({open:false, countdown:2, target:null});
                    setShowDetailPassenger(null);
                    setToastMessage('已標記為 No-show');
                    const updateList = (list: Passenger[]) => list.map(p => p.bookingCode === bookingId ? { ...p, status: 'no_show' } as Passenger : p);
                    setPassengers(prev => updateList(prev));
                    setAllPassengers(prev => updateList(prev));
                    setAllTripPassengers(prev => updateList(prev));
                    // 如果有API調用且GPS已啟用，一次性發送GPS位置（包含 tripId）
                    if (gpsSystemEnabled && gpsEnabled) {
                      const tripId = currentTrip?.id || null;
                      sendCurrentLocation(tripId, true).catch(()=>{});
                    }
                    import('../services/api').then(async api => {
                      await api.markNoShow(bookingId);
                      // 強制發送 GPS（API 調用時一次性發送）
                      if (gpsSystemEnabled && gpsEnabled) {
                        try {
                          const tripId = currentTrip?.id || null;
                          await sendCurrentLocation(tripId, true);
                        } catch (e) {
                          console.error("GPS send error during markNoShow", e);
                        }
                      }
                    }).catch(()=>{});
                 }}>{noShowModal.countdown>0 ? `確認(${noShowModal.countdown})` : '確認'}</button>
              </div>
           </div>
        </div>
      )}

      {/* Manual Verify Modal */}
      {manualModal.open && (
        <div className="permission-modal-overlay" style={{zIndex: 1200}} onClick={() => setManualModal({open:false, countdown:2, target:null})}>
           <div className="permission-modal" onClick={e => e.stopPropagation()}>
              <div className="pm-title">人工驗票</div>
              <div className="pm-desc">乘客無QRcode，以人工驗票。</div>
              <div style={{display:'flex', gap:'8px', justifyContent:'flex-end'}}>
                 <button className="modal-btn secondary" onClick={() => setManualModal({open:false, countdown:2, target:null})}>取消</button>
                 <button className="modal-btn primary" disabled={manualModal.countdown>0} onClick={() => {
                    if (!manualModal.target) return;
                    const bookingId = manualModal.target.bookingCode || manualModal.target.id;
                    setManualModal({open:false, countdown:2, target:null});
                    setShowDetailPassenger(null);
                    setToastMessage('已標記為 已上車');
                    const updateList = (list: Passenger[]) => list.map(p => p.bookingCode === bookingId ? { ...p, status: 'boarded' } as Passenger : p);
                    setPassengers(prev => updateList(prev));
                    setAllPassengers(prev => updateList(prev));
                    setAllTripPassengers(prev => updateList(prev));
                    // 如果有API調用且GPS已啟用，一次性發送GPS位置（包含 tripId）
                    if (gpsSystemEnabled && gpsEnabled) {
                      const tripId = currentTrip?.id || null;
                      sendCurrentLocation(tripId, true).catch(()=>{});
                    }
                    import('../services/api').then(async api => {
                      await api.markManualBoarding(bookingId);
                      // 強制發送 GPS（API 調用時一次性發送）
                      if (gpsSystemEnabled && gpsEnabled) {
                        try {
                          const tripId = currentTrip?.id || null;
                          await sendCurrentLocation(tripId, true);
                        } catch (e) {
                          console.error("GPS send error during markManualBoarding", e);
                        }
                      }
                    }).catch(()=>{});
                 }}>{manualModal.countdown>0 ? `確認(${manualModal.countdown})` : '確認'}</button>
              </div>
           </div>
        </div>
      )}

      {/* Start Confirm Modal */}
      {startConfirm && (
        <div className="permission-modal-overlay" style={{zIndex: 1200}} onClick={() => setStartConfirm(false)}>
          <div className="permission-modal" onClick={e => e.stopPropagation()}>
             <div className="pm-title">確認發車</div>
             <div className="pm-desc">是否開始本班次的出車？</div>
             <div style={{display:'flex', gap:'8px', justifyContent:'flex-end'}}>
                <button className="modal-btn secondary" onClick={() => setStartConfirm(false)}>取消</button>
                <button className="modal-btn primary" onClick={() => {
                   setStartConfirm(false);
                   
                   // UI Logic
                   const firstIdx = STATION_ORDER.findIndex(st => filterList(passengers).some(p => normalizeStationName(p)===st));
                   setFlowStarted(true);
                   setFlowStep(firstIdx>=0 ? firstIdx : 0);
                   setFirstStationIdx(firstIdx>=0 ? firstIdx : 0);

                   if (gpsSystemEnabled) {
                     try {
                       localStorage.setItem('gps_enabled', 'true');
                       setGpsEnabled(true);
                     } catch {}
                   }
                  if (currentTrip) {
                     const dt = `${currentTrip.date.replace(/-/g,'/')}` + ' ' + `${currentTrip.time}`;
                     setToastMessage('已設定為已發車');
                    // 不再寫入《系統》分頁或更新出車狀態
                     (async () => {
                       try {
                         const resp = await startGoogleTripStart({ main_datetime: dt, driver_role: userRole });
                         if ((resp as any).trip_id) {
                           setActiveTripId((resp as any).trip_id as string);
                           localStorage.setItem('driver_trip_id', (resp as any).trip_id as string);
                         }
                         // 啟動 GPS 發送
                         try { localStorage.setItem('gps_enabled', 'true'); setGpsEnabled(true); } catch {}
                         // 分享地圖邏輯移除
                         
                       } catch {}
                     })();
                  }
                }}>確認</button>
             </div>
          </div>
        </div>
      )}

      {/* End Confirm Modal */}
      {endConfirm && (
        <div className="permission-modal-overlay" style={{zIndex: 1200}} onClick={() => setEndConfirm(false)}>
          <div className="permission-modal" onClick={e => e.stopPropagation()}>
             <div className="pm-title">完成出車</div>
             <div className="pm-desc">是否結束本班次的出車？</div>
             <div style={{display:'flex', gap:'8px', justifyContent:'flex-end'}}>
                <button className="modal-btn secondary" onClick={() => setEndConfirm(false)}>取消</button>
                <button className="modal-btn primary" onClick={async () => {
                   setEndConfirm(false);
                   
                   // UI Logic
                   setFlowStarted(false); 
                   setActiveTab('trips'); 
                   setIsRecentTripMode(true);

                   
                   if (currentTrip) {
                     const dt = `${currentTrip.date.replace(/-/g,'/')}` + ' ' + `${currentTrip.time}`;
                     setToastMessage('已設定為已結束');
                   // 結束時關閉 GPS 發送
                   try { localStorage.setItem('gps_enabled', 'false'); setGpsEnabled(false); } catch {}
                     const tid = activeTripId || localStorage.getItem('driver_trip_id') || '';
                     if (tid) { completeGoogleTrip(tid).catch(()=>{}); localStorage.removeItem('driver_trip_id'); setActiveTripId(null); }
                   }
                }}>確認</button>
             </div>
          </div>
        </div>
      )}

      {/* Factory Reset Confirm */}
      {showFactoryModal && (
        <div className="permission-modal-overlay" style={{zIndex: 1200}} onClick={() => setShowFactoryModal(false)}>
          <div className="permission-modal" onClick={e => e.stopPropagation()}>
            <div className="pm-title">恢復原廠</div>
            <div className="pm-desc">將所有參數設回原廠設置</div>
            <div style={{display:'flex', gap:'8px', justifyContent:'flex-end'}}>
              <button className="modal-btn secondary" onClick={() => setShowFactoryModal(false)}>取消</button>
              <button className="modal-btn primary" onClick={() => { setShowFactoryModal(false); applyFactoryDefaults(); }}>確認</button>
            </div>
          </div>
        </div>
      )}

      {exitPrompt && (
        <div style={{position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center', zIndex:1300}}>
          <div style={{background:'#222', color:'#fff', padding:'12px 18px', borderRadius:12, boxShadow:'0 8px 24px rgba(0,0,0,0.25)', fontWeight:800, animation:'exitPulse 3s ease forwards'}}>
            再按一次退出程式
          </div>
        </div>
      )}

      {/* Checkin Overlay */}
      {pendingCheckin && (
        <div id="checkin-overlay" style={{display: 'flex'}}>
          <div className="checkin-card">
            <div className="checkin-title">確認上車</div>
            <div className="checkin-body">
              {pendingCheckin.passenger ? (
                 <DetailRows p={pendingCheckin.passenger} />
              ) : (
                <>
                  <div className="detail-row">
                    <div className="detail-label">預約編號：</div>
                    <div className="detail-value">{pendingCheckin.bookingId}</div>
                  </div>
                  <div style={{marginTop: '6px', fontSize: '13px', color: '#b00'}}>
                    此預約目前不在列表中，但仍可嘗試核銷。
                  </div>
                </>
              )}
            </div>
            <div className="checkin-actions">
              <button className="btn-secondary" onClick={() => setPendingCheckin(null)}>取消</button>
              <button className="btn-primary" onClick={confirmCheckinAction}>確認</button>
            </div>
          </div>
        </div>
      )}

      {/* Permission Modal */}
  {showPermissionModal && (
        <div className="permission-modal-overlay">
           <div className="permission-modal">
              <div className="pm-icon">
                 <img src="assets/logo.png" alt="" />
              </div>
              <div className="pm-title">需要授權</div>
              <div className="pm-desc">
                 為了提供完整的接駁服務，本應用程式需要以下權限：
                 <ul>
                    <li>📍 <b>位置資訊</b>：用於追蹤車輛位置</li>
                    <li>🔔 <b>通知權限</b>：用於發車提醒</li>
                    <li>📷 <b>相機權限</b>：用於掃描 QRCode</li>
                    <li>📳 <b>震動權限</b>：用於掃描回饋</li>
                 </ul>
              </div>
              <button className="pm-btn" onClick={requestAllPermissions}>
                 一鍵授權開啟
              </button>
           </div>
        </div>
  )}

  {/* Role Select Modal (first run) */}
      {showRoleModal && (
    <div className="permission-modal-overlay" style={{zIndex: 1300, display: gpsSystemEnabled ? 'flex' : 'none', alignItems:'center', justifyContent:'center', position:'fixed', inset:0}}>
       <div className="permission-modal">
          <div className="pm-title">選擇使用者身分</div>
          <div className="pm-desc">請選擇本裝置使用者身分（必選）：</div>
          <div style={{display:'flex', gap:'10px', marginTop:'8px', flexWrap:'wrap'}}>
            <button className={`role-btn ${userRole==='desk' ? 'selected' : ''}`} onClick={() => setUserRole('desk')}>櫃台人員</button>
            <button className={`role-btn ${userRole==='driverA' ? 'selected' : ''}`} onClick={() => setUserRole('driverA')}>司機A</button>
            <button className={`role-btn ${userRole==='driverB' ? 'selected' : ''}`} onClick={() => setUserRole('driverB')}>司機B</button>
            <button className={`role-btn ${userRole==='driverC' ? 'selected' : ''}`} onClick={() => setUserRole('driverC')}>司機C</button>
          </div>
          <div style={{marginTop:'8px', fontSize:'12px', color:'#777', textAlign:'center'}}>*櫃台人員將永久關閉GPS定位系統</div>
          <div style={{display:'flex', gap:'8px', justifyContent:'flex-end', marginTop:'12px'}}>
             <button className="modal-btn primary" disabled={roleCountdown>0} onClick={() => { localStorage.setItem('user_role', userRole); setShowRoleModal(false); }}>{roleCountdown>0 ? `確認(${roleCountdown})` : '確認'}</button>
                </div>
       </div>
    </div>
      )}

  {devPasswordOpen && (
    <div className="permission-modal-overlay" onClick={() => { setDevPasswordOpen(false); setDevPasswordError(null); }}>
      <div className="permission-modal" onClick={e => e.stopPropagation()}>
        <div className="pm-title">開發選項登入</div>
        <div className="pm-desc">輸入密碼以進入。</div>
        <div className="menu-item column-item">
          <input type="password" value={devPasswordInput} onChange={e => setDevPasswordInput(e.target.value)} placeholder="密碼" />
        </div>
        {devPasswordError && <div style={{color:'#b00', fontSize:12}}>{devPasswordError}</div>}
        <div style={{display:'flex', gap:'8px', justifyContent:'flex-end'}}>
          <button className="modal-btn secondary" onClick={() => { setDevPasswordOpen(false); setDevPasswordError(null); }}>取消</button>
          <button className="modal-btn primary" onClick={() => {
            if (devPasswordInput === '5833') {
              setDevAuthorized(true);
              localStorage.setItem('dev_auth_ok','1');
              setExpandedSection('developer');
              setDevPasswordOpen(false);
            } else {
              setDevPasswordError('密碼錯誤');
            }
          }}>確認</button>
        </div>
      </div>
    </div>
  )}
  {/* 分享地圖彈窗移除 */}

    </IonPage>
  );
};

// Subcomponent for Detail Rows to avoid code duplication
const DetailRows: React.FC<{ p: Passenger, stationContext?: string | null, mainTimeFallback?: string }> = ({ p, stationContext, mainTimeFallback }) => {
  let stations = computeUpDownStations(p);
  if (!stations.up && !stations.down && stationContext) {
    const isUp = (p.updown || '').includes('上');
    const isDown = (p.updown || '').includes('下');
    stations = {
      up: isUp ? stationContext : '',
      down: isDown ? stationContext : ''
    };
  }
  
  const renderLabel = (text: string) => (
    <div className="detail-label">
      <span>{text}</span>
      <span>：</span>
    </div>
  );

  return (
    <>
      <div className="detail-row">
        {renderLabel("發車時間")}
        <div className="detail-value">{formatDateTimeLabel(p.main_datetime || mainTimeFallback || '')}</div>
      </div>
      <div className="detail-row">
        {renderLabel("預約編號")}
        <div className="detail-value">{p.bookingCode}</div>
      </div>
      <div className="detail-row">
        {renderLabel("乘車狀態")}
        <div className="detail-value">{p.status === 'boarded' ? '已上車' : '未上車'}</div>
      </div>
      <div className="detail-row">
        {renderLabel("方向")}
        <div className="detail-value">{p.direction}</div>
      </div>
      <div className="detail-row">
        {renderLabel("姓名")}
        <div className="detail-value">{p.name}</div>
      </div>
      <div className="detail-row">
        {renderLabel("手機")}
        <div className="detail-value">
          {p.phone}
          {p.phone && <a href={`tel:${p.phone}`} style={{marginLeft: '6px'}}><IonIcon icon={call} style={{color: '#666', fontSize: '1.2em', verticalAlign: 'middle'}} /></a>}
        </div>
      </div>
      <div className="detail-row">
        {renderLabel("房號")}
        <div className="detail-value">{p.room || '(餐客)'}</div>
      </div>
      <div className="detail-row">
        {renderLabel("人數")}
        <div className="detail-value">{p.pax}</div>
      </div>
      <hr style={{border: 'none', borderTop: '1px solid #eee', margin: '6px 0 4px'}} />
      <div className="detail-row">
        {renderLabel("上車站點")}
        <div className="detail-value">{stations.up}</div>
      </div>
      <div className="detail-row">
        {renderLabel("下車站點")}
        <div className="detail-value">{stations.down}</div>
      </div>
    </>
  );
};

export default Home;
