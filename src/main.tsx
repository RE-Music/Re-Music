import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './renderer/App.tsx'
import { tauriBridge } from './renderer/utils/tauriBridge'

// Nano-Mus Tauri Bridge Initialization (V25)
const initElectronBridge = () => {
  if (typeof window === 'undefined') return;

  const realInvoke = (command: string, args: any) => tauriBridge.invoke(command, args);

  // Bridge and Queue connection (V28 Royale)
  const queue = (window as any)._ipcQueue || [];

  // Define the real bridge implementation
  const realBridge = {
    invoke: realInvoke,
    on: (channel: string, callback: any) => tauriBridge.on(channel, callback),
    emit: (channel: string, payload: any) => tauriBridge.emit(channel, payload)
  };

  // Standard manual drain for Royale shim
  if (queue.length > 0) {
    console.log(`[TauriBridge] Royale: Draining ${queue.length} items`);
    queue.forEach((item: any) => {
      realInvoke(item.cmd, item.args)
        .then(item.res)
        .catch(item.rej);
    });
    (window as any)._ipcQueue = [];
  }
  
  (window as any).electronAPI = realBridge;
};

initElectronBridge();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
