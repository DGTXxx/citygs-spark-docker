export type Role = 'client' | 'worker' | 'signaling';

export type Vec3 = [number, number, number];
export type Quaternion = [number, number, number, number];

export interface CameraPose {
  position: Vec3;
  rotation: Quaternion;
  fovYDegrees: number;
  near: number;
  far: number;
}

export interface CameraControlPacket {
  type: 'camera.control';
  sessionId: string;
  sequence: number;
  timestampMs: number;
  mode: 'delta' | 'snapshot';
  pose?: CameraPose;
  delta?: {
    yaw?: number;
    pitch?: number;
    roll?: number;
    dolly?: number;
    truck?: number;
    pedestal?: number;
  };
}

export interface SessionRequest {
  type: 'session.request';
  clientId: string;
  sceneId: string;
  preferredCodec?: 'h264' | 'av1';
  maxWidth?: number;
  maxHeight?: number;
  maxFps?: number;
}

export interface SessionAssigned {
  type: 'session.assigned';
  sessionId: string;
  clientId: string;
  workerId: string;
  sceneId: string;
}

export interface WorkerRegister {
  type: 'worker.register';
  workerId: string;
  capabilities: WorkerCapabilities;
}

export interface WorkerCapabilities {
  renderer: 'mock' | 'gsplat' | 'citygs' | 'custom-cuda';
  codecs: Array<'h264' | 'hevc' | 'av1'>;
  maxWidth: number;
  maxHeight: number;
  maxFps: number;
  gpuName?: string;
  gpuMemoryGb?: number;
}

export interface RenderStats {
  type: 'stats.render';
  sessionId: string;
  timestampMs: number;
  fps: number;
  renderMs: number;
  encodeMs: number;
  bitrateKbps: number;
  latencyMs?: number;
  gpuMemoryUsedMb?: number;
}

export interface WebRtcSignal {
  type: 'webrtc.signal';
  sessionId: string;
  from: Role;
  to: Role;
  payload: unknown;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
  sessionId?: string;
}

export type ProtocolMessage =
  | SessionRequest
  | SessionAssigned
  | WorkerRegister
  | CameraControlPacket
  | RenderStats
  | WebRtcSignal
  | ErrorMessage;

export function isProtocolMessage(value: unknown): value is ProtocolMessage {
  return Boolean(value && typeof value === 'object' && 'type' in value);
}

export function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}
