import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yugraj.selfattendance',
  appName: 'Self Attendance',
  webDir: 'dist',
  backgroundColor: '#0f172a',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      backgroundColor: '#0f172a',
      style: 'DARK',
    },
  },
};

export default config;
