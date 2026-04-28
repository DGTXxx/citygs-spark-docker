import { CameraControlPacket, makeId, ProtocolMessage, RenderStats, SessionAssigned } from '@citygs/shared';

export class SignalingClient {
  readonly clientId = makeId('client');
  private ws?: WebSocket;
  session?: SessionAssigned;
  onStatus?: (status: string) => void;
  onStats?: (stats: RenderStats) => void;
  onAssigned?: (session: SessionAssigned) => void;

  connect(url: string) {
    this.disconnect();
    this.onStatus?.('signaling-connecting');
    this.ws = new WebSocket(url);
    this.ws.onopen = () => this.onStatus?.('signaling-connected');
    this.ws.onclose = () => this.onStatus?.('signaling-closed');
    this.ws.onerror = () => this.onStatus?.('signaling-error');
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data) as ProtocolMessage;
      if (msg.type === 'session.assigned') {
        this.session = msg;
        this.onAssigned?.(msg);
      }
      if (msg.type === 'stats.render') this.onStats?.(msg);
      if (msg.type === 'error') this.onStatus?.(`error: ${msg.message}`);
    };
  }

  disconnect() {
    this.session = undefined;
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED && this.ws.readyState !== WebSocket.CLOSING) {
      this.ws.close();
    }
    this.ws = undefined;
  }

  requestSession(sceneId: string) {
    this.send({ type: 'session.request', clientId: this.clientId, sceneId, preferredCodec: 'h264', maxWidth: 1280, maxHeight: 720, maxFps: 60 });
  }

  sendCamera(packet: Omit<CameraControlPacket, 'type' | 'sessionId' | 'timestampMs'>) {
    if (!this.session) return;
    this.send({ type: 'camera.control', sessionId: this.session.sessionId, timestampMs: Date.now(), ...packet });
  }

  private send(msg: ProtocolMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
}
