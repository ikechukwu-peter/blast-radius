import { drawFrame, type Scene } from './renderer';

export const FPS = 30;

export interface EncodedVideo {
  blob: Blob;
  ext: 'mp4' | 'webm';
  /** False when the browser couldn't make H.264, which X requires. */
  shareable: boolean;
}

/**
 * Renders every frame and encodes it in the browser with WebCodecs (via Mediabunny), faster than
 * real time and frame-exact. H.264 in MP4 where possible, because X and LinkedIn need it.
 */
export async function encodeVideo(scene: Scene, onProgress: (p: number) => void, signal: AbortSignal): Promise<EncodedVideo> {
  const { Output, Mp4OutputFormat, WebMOutputFormat, BufferTarget, CanvasSource, QUALITY_HIGH, getFirstEncodableVideoCodec } = await import('mediabunny');
  const { width, height } = scene.frame;
  const codec = await getFirstEncodableVideoCodec(['avc', 'vp9', 'av1'], { width, height });
  if (!codec) throw new Error('This browser cannot encode video. Try the latest Chrome, Edge or Safari.');
  const mp4 = codec === 'avc';

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false })!;

  const output = new Output({ format: mp4 ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec, bitrate: QUALITY_HIGH, keyFrameInterval: 2 });
  output.addVideoTrack(source, { frameRate: FPS });
  await output.start();

  const frames = Math.round(scene.opts.duration * FPS);
  for (let i = 0; i < frames; i++) {
    if (signal.aborted) {
      await output.cancel();
      throw new DOMException('Cancelled', 'AbortError');
    }
    drawFrame(ctx, scene, i / FPS);
    await source.add(i / FPS, 1 / FPS);
    if (i % 3 === 0) onProgress(i / frames);
  }
  await output.finalize();
  onProgress(1);
  const buffer = output.target.buffer!;
  return { blob: new Blob([buffer], { type: mp4 ? 'video/mp4' : 'video/webm' }), ext: mp4 ? 'mp4' : 'webm', shareable: mp4 };
}
