/** Camera access. Video frames stay in this browser tab; nothing is recorded or uploaded. */

export type CameraErrorCode = 'denied' | 'no_camera' | 'in_use' | 'insecure' | 'unsupported' | 'unknown';

export class CameraError extends Error {
  constructor(
    readonly code: CameraErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CameraError';
  }
}

export const CAMERA_ERROR_HELP: Record<CameraErrorCode, string> = {
  denied: 'Camera permission was not granted. You can keep going with manual tracking, or allow the camera in your browser’s site settings and try again.',
  no_camera: 'No camera was found on this device. Manual tracking works without one.',
  in_use: 'The camera is being used by another app or tab. Close it and try again, or use manual tracking.',
  insecure: 'Camera access needs a secure connection (https or localhost). Manual tracking still works.',
  unsupported: 'This browser does not support camera access. Manual tracking still works.',
  unknown: 'The camera could not be started. Manual tracking still works.',
};

export function classifyCameraError(e: unknown): CameraErrorCode {
  const name = (e as { name?: string } | null)?.name ?? '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
    case 'PermissionDeniedError':
      return 'denied';
    case 'NotFoundError':
    case 'OverconstrainedError':
    case 'DevicesNotFoundError':
      return 'no_camera';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'in_use';
    default:
      return 'unknown';
  }
}

export async function startCamera(nav: Navigator = navigator, secure: boolean = globalThis.isSecureContext ?? true): Promise<MediaStream> {
  if (!secure) throw new CameraError('insecure', CAMERA_ERROR_HELP.insecure);
  if (!nav.mediaDevices?.getUserMedia) throw new CameraError('unsupported', CAMERA_ERROR_HELP.unsupported);
  try {
    return await nav.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
    });
  } catch (e) {
    const code = classifyCameraError(e);
    throw new CameraError(code, CAMERA_ERROR_HELP[code]);
  }
}

export function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((t) => t.stop());
}
