export const HyperTrack = {
  getDeviceId: async () => ({ deviceId: '' }),
  startTracking: async () => ({ ok: false }),
  stopTracking: async () => ({ ok: true }),
  setWorkerHandle: async () => ({ ok: true }),
  debugInfo: async () => ({ keyLen: 0, deviceId: '', error: 'removed' }),
  ping: async () => ({ ok: false })
}
