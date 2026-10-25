import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.syscoadaweh.nabil',
  appName: 'مساعد نبيل',
  webDir: 'dist',
  android: {
    // Keep IndexedDB data under the same origin across app updates.
    allowMixedContent: false,
  },
};

export default config;
