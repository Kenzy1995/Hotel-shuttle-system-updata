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

export const fetchAllData = async (): Promise<{ trips: Trip[], tripPassengers: Passenger[], allPassengers: Passenger[] }> => {
  try {
    const res = await axios.get(`${API_BASE}/api/driver/data`);
    const data: DriverDataResponse = res.data;

    const trips: Trip[] = data.trips.map(t => ({
      id: t.trip_id,
      date: t.date,
      time: t.time,
      route: '',
      seats: 0,
      booked: t.total_pax
    }));

    const passengerDetailsMap = new Map<string, typeof data.passenger_list[0]>();
    data.passenger_list.forEach(p => {
      passengerDetailsMap.set(p.booking_id, p);
    });

    const tripMap = new Map<string, {date: string, time: string}>();
    data.trips.forEach(t => {
      tripMap.set(t.trip_id, {date: t.date, time: t.time});
    });

    const tripPassengers: Passenger[] = data.trip_passengers.map(p => {
      const details = passengerDetailsMap.get(p.booking_id);
      const tripInfo = tripMap.get(p.trip_id);
      const derivedDateTime = tripInfo ? `${tripInfo.date.replace(/-/g, '/')} ${tripInfo.time}` : '';
      
      return {
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
        main_datetime: details?.main_datetime || derivedDateTime
      };
    });

    const allPassengers: Passenger[] = [];
    const processedBookings = new Set<string>();

    // 1. Process explicit passenger list
    data.passenger_list.forEach(p => {
      processedBookings.add(p.booking_id);
      
      let derivedDateTime = '';
      if (!p.main_datetime) {
         const tp = data.trip_passengers.find(tp => tp.booking_id === p.booking_id);
         if (tp) {
             const tripInfo = tripMap.get(tp.trip_id);
             if (tripInfo) {
                 derivedDateTime = `${tripInfo.date.replace(/-/g, '/')} ${tripInfo.time}`;
             }
         }
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

    // 2. Add missing passengers from trip_passengers (Expired trips logic fix)
    data.trip_passengers.forEach(p => {
      if (!processedBookings.has(p.booking_id)) {
        processedBookings.add(p.booking_id);

        const tripInfo = tripMap.get(p.trip_id);
        const derivedDateTime = tripInfo ? `${tripInfo.date.replace(/-/g, '/')} ${tripInfo.time}` : '';
        
        // Infer station columns
        let hotel_go = '', mrt = '', train = '', mall = '', hotel_back = '';
        const s = (p.station || '').trim();
        const ud = p.updown || '';
        
        if (s.includes('福泰') || s.includes('Forte')) {
           // Guess direction based on derivedDateTime or just assume based on station text if available
           // But here we rely on standard stations.
           // If it's the start, it's Hotel Go. If it's end, it's Hotel Back.
           // Since we don't have order, we'll try to guess or just put in Hotel Go if it's "上車" and Hotel Back if "下車"? 
           // Better: Check direction from p.direction
           if (p.direction === '去程') hotel_go = ud;
           else if (p.direction === '回程') hotel_back = ud;
           else {
             // Fallback
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
    console.error("Fetch All Data Error", e);
    return { trips: [], tripPassengers: [], allPassengers: [] };
  }
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
    console.error(e);
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
    console.error(e);
    return false;
  }
};

export const markManualBoarding = async (bookingId: string): Promise<boolean> => {
  try {
    const res = await axios.post(`${API_BASE}/api/driver/manual_boarding`, { booking_id: bookingId });
    return res.data && res.data.status === 'success';
  } catch (e) {
    console.error(e);
    return false;
  }
};

export const updateTripStatus = async (mainDatetime: string, status: '已發車' | '已結束'): Promise<boolean> => {
  try {
    const res = await axios.post(`${API_BASE}/api/driver/trip_status`, { main_datetime: mainDatetime, status });
    return res.data && res.data.status === 'success';
  } catch (e) {
    console.error(e);
    return false;
  }
};

export const fetchTripRoute = async (mainDatetime: string): Promise<{ stops: Array<{ id: string; lat: number; lng: number }> }> => {
  try {
    const res = await axios.get(`${API_BASE}/api/driver/trip_route`, { params: { main_datetime: mainDatetime } });
    return res.data || { stops: [] };
  } catch (e) {
    console.error(e);
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
    console.error(e);
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
    console.error(e);
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
    const dtStr = `${t.date} ${t.time}`; // "2025-12-08 08:00"
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
