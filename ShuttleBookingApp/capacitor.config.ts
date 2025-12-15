import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.forte.driver',
  appName: 'Forte Driver',
    webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
