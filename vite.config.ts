import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Content-Security-Policy. The important directive for privacy is `connect-src 'self'`:
 * @mediapipe/tasks-vision 1.x POSTs usage metrics (not images) to odml.pa.googleapis.com.
 * Blocking all third-party connections keeps everything on this device.
 * Dev mode additionally allows the Vite HMR websocket and the React refresh inline preamble.
 */
function cspPlugin(): Plugin {
  const common = [
    "default-src 'self'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob: mediastream:",
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  return {
    name: 'medical-workout-csp',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const dev = Boolean(ctx.server);
        const policy = [
          ...common,
          dev
            ? "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'"
            : "script-src 'self' 'wasm-unsafe-eval'",
          dev ? "connect-src 'self' ws: wss:" : "connect-src 'self'",
        ].join('; ');
        return html.replace(
          '<!--CSP-->',
          `<meta http-equiv="Content-Security-Policy" content="${policy}" />`,
        );
      },
    },
  };
}

/**
 * Headers that cannot be set from a <meta> tag. Production hosting should send the same headers
 * (see README "Deploying"). `Permissions-Policy` limits the camera to this origin and disables
 * microphone and geolocation, which the app never needs.
 */
const SECURITY_HEADERS = {
  'Content-Security-Policy': "frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

export default defineConfig({
  plugins: [react(), cspPlugin()],
  server: { port: 5180, strictPort: true, headers: SECURITY_HEADERS },
  preview: { port: 4180, strictPort: true, headers: SECURITY_HEADERS },
  build: { target: 'es2022', sourcemap: true },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
