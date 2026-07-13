import type { SatisfactoryBridge } from './ipc-types';

declare global {
  interface Window {
    /** Typed IPC bridge injected by the Electron preload script. */
    readonly satisfactory: SatisfactoryBridge;
  }
}

export {};
