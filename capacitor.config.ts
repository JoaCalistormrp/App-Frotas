import { CapacitorConfig } from '@capacitor/cli';

// Em produção, o Capacitor carrega a app directamente do Cloudflare
// (a app já requer internet para o Supabase, por isso não há desvantagem).
// Para dev local: npx cap run android --livereload --external
const PROD_URL = 'https://checklist-frota.grupotomaz.com';

const config: CapacitorConfig = {
  appId: 'com.grupotomaz.frota',
  appName: 'Checklist Frota',
  webDir: 'dist/client',
  server: {
    url: PROD_URL,
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#1a1a4d',
      showSpinner: false,
    },
  },
};

export default config;
