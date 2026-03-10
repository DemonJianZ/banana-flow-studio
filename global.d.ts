/// <reference types="vite/client" />

interface AppData {
  API_PATH: string
  token: string
  router: any
  fetch: any
}
declare global {
  interface Window {
    __MICRO_APP_NAME__: string;
    rawWindow: Window
    microApp: {
      getData: () => AppData
      addDataListener: (datalistener: Function, autoTrigger?: boolean) => void
      clearDataListener: () => void
    }
  }
}
