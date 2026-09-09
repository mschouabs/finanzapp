import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.finanzapp.app',
  appName: 'FinanzApp',
  webDir: 'out',
  server: {
    // Apunta a producción — no requiere export estático
    url: 'https://finanzapp.vercel.app',
    cleartext: false,
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#0a0a0a',
  },
  android: {
    backgroundColor: '#0a0a0a',
    allowMixedContent: false,
  },
}

export default config
