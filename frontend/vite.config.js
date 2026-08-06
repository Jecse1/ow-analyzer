import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // 외부 접속 허용
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000', // 서버 내부의 백엔드 주소
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/api')
      },
      // 밴픽 실시간 대결 WebSocket (개발용) — 백엔드 /ws/banpick 로 프록시
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
        changeOrigin: true
      }
    }
  }
})


