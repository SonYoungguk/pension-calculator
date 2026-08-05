import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { validateData } from './engine/validate'
import './index.css'

// 법령 데이터 불변식 검증 — 개발 모드에서 실패하면 즉시 멈춘다 (SPEC §2)
if (import.meta.env.DEV) validateData()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
