/**
 * Mariner's AI Grid - Signal K Bridge
 * Ingests real-time NMEA 2000 data via Signal K WebSocket.
 */

export interface SignalKData {
  path: string;
  value: any;
  timestamp: string;
}

export class SignalKBridge {
  private socket: WebSocket | null = null;
  private url: string;

  constructor(host: string = 'localhost', port: number = 3000) {
    this.url = `ws://${host}:${port}/signalk/v1/stream?subscribe=all`;
  }

  connect(onData: (data: SignalKData) => void) {
    console.log(`Connecting to Signal K: ${this.url}`);
    this.socket = new WebSocket(this.url);

    this.socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.updates) {
          msg.updates.forEach((update: any) => {
            update.values.forEach((val: any) => {
              onData({
                path: val.path,
                value: val.value,
                timestamp: update.timestamp,
              });
            });
          });
        }
      } catch (e) {
        console.error('Signal K Parse Error:', e);
      }
    };

    this.socket.onerror = (error) => {
      console.error('Signal K WebSocket Error:', error);
    };

    this.socket.onclose = () => {
      console.log('Signal K Connection Closed');
    };
  }

  disconnect() {
    this.socket?.close();
    this.socket = null;
  }
}
