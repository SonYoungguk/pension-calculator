import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // GitHub Pages는 https://<user>.github.io/pension-calculator/ 하위 경로에 배포된다
  base: process.env.GITHUB_ACTIONS ? '/pension-calculator/' : '/',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
