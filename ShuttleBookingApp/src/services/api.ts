import axios from 'axios';

const API_BASE = "https://driver-api2-995728097341.asia-east1.run.app";

export interface Trip {
  id: string;
  date: string;
  time: string;
  route: string;
  seats: number;
  booked: number;
}

export interface Passenger {
  id: string;
  tripId: string;
  bookingCode: string;
  name: string;
  phone: string;
  room: string;
  pax: number;
  station: string;
  direction: string;
  updown: string;
  status: 'booked' | 'boarded' | 'cancelled' | 'no_show';
  // Full details from passenger_list
  hotel_go?: string;
  mrt?: string;
  train?: string;
  mall?: string;
  hotel_back?: string;
  main_datetime?: string;
}

export interface DriverDataResponse {
  trips: {
    trip_id: string;
    date: string;
    time: string;
    total_pax: number;
  }[];
  trip_passengers: {
    trip_id: string;
    station: string;
    updown: string;
    booking_id: string;
    name: string;
    phone: string;
    room: string;
    pax: number;
    status: string;
    direction: string;
    qrcode: string;
  }[];
  passenger_list: {
    booking_id: string;
    main_datetime: string;
    depart_time: string;
    name: string;
    phone: string;
    room: string;
    pax: number;
    ride_status: string;
    direction: string;
    hotel_go: string;
    mrt: string;
    train: string;
    mall: string;
    hotel_back: string;
  }[];
}

// 時間格式正規化函數：將單數字小時轉換為兩位數格式
// 例如："0:50" -> "00:50", "8:30" -> "08:30", "10:00" -> "10:00"
const normalizeTimeFormat = (timeStr: string): string => {
  if (!timeStr) return timeStr;
  // 匹配時間格式 H:MM 或 HH:MM
  const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (timeMatch) {
    const hours = timeMatch[1].padStart(2, '0');
    const minutes = timeMatch[2];
    return `${hours}:${minutes}`;
  }
  return timeStr;
};

// 日期時間字符串正規化：確保時間部分為 HH:MM 格式
const normalizeDateTimeFormat = (dtStr: string): string => {
  if (!dtStr) return dtStr;
  const parts = dtStr.trim().split(" ");
  if (parts.length === 2) {
    const datePart = parts[0];
    const timePart = normalizeTimeFormat(parts[1]);
    return `${datePart} ${timePart}`;
  }
  return dtStr;
};

// 請求去重緩存（防止並發重複請求）
let fetchAllDataPromise: Promise<{ trips: Trip[], tripPassengers: Passenger[], allPassengers: Passenger[] }> | null = null;

export const fetchAllData = async (): Promise<{ trips: Trip[], tripPassengers: Passenger[], allPassengers: Passenger[] }> => {
  // 如果已有進行中的請求，直接返回該 Promise
  if (fetchAllDataPromise) {
    return fetchAllDataPromise;
  }
  
  fetchAllDataPromise = (async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/driver/data`);
    const data: DriverDataResponse = res.data;

    // 優化：合併遍歷，減少循環次數
    // 1. 一次性構建所有需要的 Map 和數組
    const trips: Trip[] = [];
    const tripMap = new Map<string, {date: string, time: string}>();
    const passengerDetailsMap = new Map<string, typeof data.passenger_list[0]>();
    const processedBookings = new Set<string>();
    const allPassengers: Passenger[] = [];
    const tripPassengers: Passenger[] = [];
    
    // 2. 單次遍歷 trips 構建 trips 數組和 tripMap
    data.trips.forEach(t => {
      // 統一日期格式為 YYYY/MM/DD
      const normalizedDate = t.date.replace(/-/g, '/');
      trips.push({
        id: t.trip_id,
        date: normalizedDate,
        time: t.time,
        route: '',
        seats: 0,
        booked: t.total_pax
      });
      tripMap.set(t.trip_id, {date: normalizedDate, time: t.time});
    });

    // 3. 單次遍歷 passenger_list 構建 passengerDetailsMap
    data.passenger_list.forEach(p => {
      passengerDetailsMap.set(p.booking_id, p);
    });

    // 4. 單次遍歷 trip_passengers 構建 tripPassengers 和處理 allPassengers
    data.trip_passengers.forEach(p => {
      const details = passengerDetailsMap.get(p.booking_id);
      const tripInfo = tripMap.get(p.trip_id);
      const normalizedTime = tripInfo ? normalizeTimeFormat(tripInfo.time) : '';
      const derivedDateTime = tripInfo ? `${tripInfo.date.replace(/-/g, '/')} ${normalizedTime}` : '';
      
      // 構建 tripPassengers
      tripPassengers.push({
        id: p.booking_id,
        tripId: p.trip_id,
        bookingCode: p.booking_id,
        name: p.name,
        phone: p.phone,
        room: p.room,
        pax: p.pax,
        station: p.station,
        direction: p.direction,
        updown: p.updown,
        status: (p.status && p.status.includes('已上車')) ? 'boarded' : (p.status && p.status.includes('No-show')) ? 'no_show' : 'booked',
        hotel_go: details?.hotel_go || '',
        mrt: details?.mrt || '',
        train: details?.train || '',
        mall: details?.mall || '',
        hotel_back: details?.hotel_back || '',
        main_datetime: details?.main_datetime 
          ? normalizeDateTimeFormat(details.main_datetime.replace(/-/g, '/'))
          : derivedDateTime
      });
    });

    // 5. 單次遍歷 passenger_list 構建 allPassengers（優先使用）
    data.passenger_list.forEach(p => {
      processedBookings.add(p.booking_id);
      
      let derivedDateTime = '';
      if (!p.main_datetime) {
         const tp = data.trip_passengers.find(tp => tp.booking_id === p.booking_id);
         if (tp) {
             const tripInfo = tripMap.get(tp.trip_id);
             if (tripInfo) {
                 const normalizedTime = normalizeTimeFormat(tripInfo.time);
                 derivedDateTime = `${tripInfo.date.replace(/-/g, '/')} ${normalizedTime}`;
             }
         }
      } else {
        // 如果已有 main_datetime，也要正規化時間格式
        derivedDateTime = normalizeDateTimeFormat(p.main_datetime.replace(/-/g, '/'));
      }

      allPassengers.push({
        id: p.booking_id,
        tripId: '',
        bookingCode: p.booking_id,
        name: p.name,
        phone: p.phone,
        room: p.room,
        pax: p.pax,
        station: '',
        direction: p.direction,
        updown: '',
        status: (p.ride_status && p.ride_status.includes('已上車')) ? 'boarded' : (p.ride_status && p.ride_status.includes('No-show')) ? 'no_show' : 'booked',
        hotel_go: p.hotel_go,
        mrt: p.mrt,
        train: p.train,
        mall: p.mall,
        hotel_back: p.hotel_back,
        main_datetime: p.main_datetime || derivedDateTime
      });
    });

    // 6. 單次遍歷 trip_passengers 添加缺失的乘客（已優化：使用已構建的 Map）
    data.trip_passengers.forEach(p => {
      if (!processedBookings.has(p.booking_id)) {
        processedBookings.add(p.booking_id);

        const tripInfo = tripMap.get(p.trip_id);
        const normalizedTime = tripInfo ? normalizeTimeFormat(tripInfo.time) : '';
        const derivedDateTime = tripInfo ? `${tripInfo.date.replace(/-/g, '/')} ${normalizedTime}` : '';
        
        // Infer station columns
        let hotel_go = '', mrt = '', train = '', mall = '', hotel_back = '';
        const s = (p.station || '').trim();
        const ud = p.updown || '';
        
        if (s.includes('福泰') || s.includes('Forte')) {
           if (p.direction === '去程') hotel_go = ud;
           else if (p.direction === '回程') hotel_back = ud;
           else {
             if (ud === '上車') hotel_go = ud;
             else hotel_back = ud;
           }
        } else if (s.includes('捷運') || s.includes('Exhibition')) {
           mrt = ud;
        } else if (s.includes('火車') || s.includes('Train')) {
           train = ud;
        } else if (s.includes('LaLaport') || s.includes('Lalaport')) {
           mall = ud;
        }

        allPassengers.push({
          id: p.booking_id,
          tripId: p.trip_id,
          bookingCode: p.booking_id,
          name: p.name,
          phone: p.phone,
          room: p.room,
          pax: p.pax,
          station: '',
          direction: p.direction,
          updown: '',
          status: (p.status && p.status.includes('已上車')) ? 'boarded' : (p.status && p.status.includes('No-show')) ? 'no_show' : 'booked',
          hotel_go,
          mrt,
          train,
          mall,
          hotel_back,
          main_datetime: derivedDateTime
        });
      }
    });

      return { trips, tripPassengers, allPassengers };
    } catch (e) {
      return { trips: [], tripPassengers: [], allPassengers: [] };
    } finally {
      // 清除緩存，允許下次請求
      fetchAllDataPromise = null;
    }
  })();
  
  return fetchAllDataPromise;
};

export const fetchTrips = async (): Promise<Trip[]> => {
  // Deprecated: prefer fetchAllData
  const data = await fetchAllData();
  return data.trips;
};

export const fetchPassengers = async (tripId?: string): Promise<Passenger[]> => {
    // Deprecated: prefer fetchAllData
    const data = await fetchAllData();
    if (tripId) {
      return data.tripPassengers.filter(p => p.tripId === tripId);
    }
    return data.allPassengers;
 };

export const confirmBoarding = async (qrcode: string): Promise<{ success: boolean; passenger?: Passenger; message?: string, main_datetime?: string }> => {
  try {
      const res = await axios.post(`${API_BASE}/api/driver/checkin`, { qrcode });
      const data = res.data;
      
      if (data.status === 'success') {
          // Construct a passenger object from response if possible, or just return success
          return { 
              success: true, 
              passenger: {
                  id: data.booking_id,
                  bookingCode: data.booking_id,
                  name: data.name,
                  pax: data.pax,
                  // ... other fields might be missing in response
              } as Passenger,
              message: data.message,
              main_datetime: data.main_datetime
          };
      } else {
          return { success: false, message: data.message || data.status, main_datetime: data.main_datetime };
      }
  } catch (e: any) {
    return { success: false, message: e.message };
  }
};

export const lookupQrInfo = async (qrcode: string): Promise<{ booking_id?: string; name?: string; main_datetime?: string; ride_status?: string }> => {
  try {
    const res = await axios.post(`${API_BASE}/api/driver/qrcode_info`, { qrcode });
    return res.data || {};
  } catch (e) {
    return {};
  }
};

export const markNoShow = async (bookingId: string): Promise<boolean> => {
  try {
    const res = await axios.post(`${API_BASE}/api/driver/no_show`, { booking_id: bookingId });
    return res.data && res.data.status === 'success';
  } catch (e) {
    return false;
  }
};

export const markManualBoarding = async (bookingId: string): Promise<boolean> => {
  try {
    const res = await axios.post(`${API_BASE}/api/driver/manual_boarding`, { booking_id: bookingId });
    return res.data && res.data.status === 'success';
  } catch (e) {
    return false;
  }
};

export const updateTripStatus = async (mainDatetime: string, status: '已發車' | '已結束'): Promise<boolean> => {
  try {
    const res = await axios.post(`${API_BASE}/api/driver/trip_status`, { main_datetime: mainDatetime, status });
    return res.data && res.data.status === 'success';
  } catch (e) {
    return false;
  }
};

export const fetchTripRoute = async (mainDatetime: string): Promise<{ stops: Array<{ id: string; lat: number; lng: number }> }> => {
  try {
    const res = await axios.get(`${API_BASE}/api/driver/trip_route`, { params: { main_datetime: mainDatetime } });
    return res.data || { stops: [] };
  } catch (e) {
    return { stops: [] };
  }
};

export const startGoogleTripStart = async (params: {
  main_datetime: string;
  driver_role?: string;
  stops?: string[]; // 新增：從APP傳遞的停靠站點列表
}): Promise<{ trip_id?: string; share_url?: string; stops?: Array<{ id: string; lat: number; lng: number }> }> => {
  try {
    const res = await axios.post(`${API_BASE}/api/driver/google/trip_start`, params);
    return res.data || {};
  } catch (e) {
    return {};
  }
};

export const completeGoogleTrip = async (tripId: string, mainDatetime?: string): Promise<boolean> => {
  try {
    const role = localStorage.getItem('user_role') || 'driverA';
    const res = await axios.post(`${API_BASE}/api/driver/google/trip_complete`, { 
      trip_id: tripId, 
      driver_role: role,
      main_datetime: mainDatetime || tripId // 如果沒有提供 main_datetime，使用 trip_id
    });
    return res.data && res.data.status === 'success';
  } catch (e) {
    return false;
  }
};

export const findNearestTripFromNow = (tripList: Trip[]): Trip | null => {
  if (!tripList || tripList.length === 0) return null;
  const nowTs = Date.now();
  let bestFuture: Trip | null = null;
  let bestFutureTs: number | null = null;
  let lastPast: Trip | null = null;
  let lastPastTs: number | null = null;

  for (const t of tripList) {
    const normalizedTime = normalizeTimeFormat(t.time);
    const dtStr = `${t.date} ${normalizedTime}`; // "2025-12-08 08:00"
    const dt = new Date(dtStr.replace(/-/g, '/')); // simple parse
    const ts = dt.getTime();

    if (ts >= nowTs) {
      if (bestFutureTs === null || ts < bestFutureTs) {
        bestFutureTs = ts;
        bestFuture = t;
      }
    } else {
      if (lastPastTs === null || ts > lastPastTs) {
        lastPastTs = ts;
        lastPast = t;
      }
    }
  }
  if (bestFuture && bestFutureTs !== null && lastPast && lastPastTs !== null) {
    const futureDelta = Math.abs(bestFutureTs - nowTs);
    const pastDelta = Math.abs(nowTs - lastPastTs);
    return pastDelta <= futureDelta ? lastPast : bestFuture;
  }
  return bestFuture || lastPast;
};
