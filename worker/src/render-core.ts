import type { CameraPose, RenderStats } from '@citygs/shared';

export interface SceneDescriptor {
  sceneId: string;
  modelPath: string;
  dataset?: 'MatrixCity' | 'custom';
  metadata?: Record<string, unknown>;
}

export interface EncodedVideoFrame {
  timestampMs: number;
  codec: 'h264' | 'hevc' | 'av1';
  data: Uint8Array;
  isKeyFrame: boolean;
}

export interface RenderCore {
  loadScene(scene: SceneDescriptor): Promise<void>;
  setCamera(pose: CameraPose): Promise<void>;
  renderFrame(): Promise<Uint8Array>;
  getStats(sessionId: string): RenderStats;
  dispose(): Promise<void>;
}

export interface VideoEncoderBridge {
  configure(options: { codec: 'h264' | 'av1'; width: number; height: number; fps: number }): Promise<void>;
  encode(rawFrame: Uint8Array, timestampMs: number): Promise<EncodedVideoFrame>;
  dispose(): Promise<void>;
}

export interface WebRtcPublisher {
  start(sessionId: string): Promise<void>;
  publish(frame: EncodedVideoFrame): Promise<void>;
  handleSignal(payload: unknown): Promise<unknown | undefined>;
  stop(): Promise<void>;
}

// TODO: implement with gsplat/CityGS on a CUDA server.
// Typical hook points:
// 1. loadScene -> load trained Gaussian .ply/checkpoint into GPU memory.
// 2. setCamera -> update view/projection matrices from browser packet.
// 3. renderFrame -> call CUDA rasterizer and return GPU/CPU frame buffer.
// 4. VideoEncoderBridge -> feed frame to NVENC H.264/AV1.
// 5. WebRtcPublisher -> send encoded frames to browser via WebRTC.
