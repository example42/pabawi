declare module '@novnc/novnc' {
  interface RFBOptions {
    shared?: boolean;
    credentials?: { password?: string };
    wsProtocols?: string[];
  }

  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, url: string | URL, options?: RFBOptions);
    disconnect(): void;
    sendCredentials(credentials: { password: string }): void;
    get viewOnly(): boolean;
    set viewOnly(value: boolean);
    get scaleViewport(): boolean;
    set scaleViewport(value: boolean);
    get resizeSession(): boolean;
    set resizeSession(value: boolean);
    get clipViewport(): boolean;
    set clipViewport(value: boolean);
  }
}
