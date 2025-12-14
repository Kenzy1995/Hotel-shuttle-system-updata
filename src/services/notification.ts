import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

export const ensureNotificationChannel = async (
  soundName: string = 'notify_sound_1'
) => {
  if (Capacitor.getPlatform() !== 'android') return;
  // Use unique channel ID per sound to ensure sound changes take effect
  const channelId = `departures_vibrate_${soundName}`;
  try {
    await LocalNotifications.createChannel({
      id: channelId,
      name: '班次提醒',
      description: '即將發車提醒',
      importance: 5,
      sound: soundName,
      vibration: true,
      visibility: 1,
      lights: true
    });
  } catch {}
};

export const scheduleDepartureNotification = async (
  tripTime: Date, 
  minutesBefore = 30,
  soundEnabled = false,
  soundName = 'notify_sound_1'
) => {
  // Notify X minutes before
  let notifyTime = new Date(tripTime.getTime() - minutesBefore * 60 * 1000);
  const now = new Date();
  // If the pre-notice time has passed but the trip is still in the future, fire shortly
  if (notifyTime < now && tripTime > now) {
    notifyTime = new Date(now.getTime() + 10_000);
  }
  // If the trip itself already passed, skip
  if (tripTime <= now) return;

  const timeStr = `${String(tripTime.getHours()).padStart(2, '0')}:${tripTime.getMinutes().toString().padStart(2, '0')}`;

  // For Android res/raw, just the filename without extension
  // If sound is disabled, we can leave it undefined or use default
  const soundPath = soundEnabled ? soundName : undefined;

  // Ensure channel exists and carries the desired sound (Android only)
  await ensureNotificationChannel(soundName);
  
  const channelId = Capacitor.getPlatform() === 'android' ? `departures_vibrate_${soundName}` : undefined;

  await LocalNotifications.schedule({
    notifications: [
      {
        title: "汐止福泰接駁車_系統通知",
        body: `班次【${timeStr} 】即將發車，請準備前往接駁`,
        id: Math.floor(notifyTime.getTime() / 1000),
        schedule: { at: notifyTime },
        channelId: channelId,
        sound: soundPath,
        smallIcon: Capacitor.getPlatform() === 'android' ? 'ic_launcher' : undefined,
        largeIcon: Capacitor.getPlatform() === 'android' ? 'ic_notification_large' : undefined,
        iconColor: Capacitor.getPlatform() === 'android' ? '#0b63ce' : undefined,
        attachments: undefined,
        actionTypeId: "",
        extra: null,
        // Android specific channel configuration might be needed for custom sounds in some versions,
        // but often 'sound' property is enough if the channel is created with sound importance.
        // Capacitor 6 might handle this, but let's stick to basic property first.
      }
    ]
  });
};
