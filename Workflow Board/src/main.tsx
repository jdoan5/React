import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { BoardProvider } from './state/BoardContext'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BoardProvider>
      <App />
    </BoardProvider>
  </StrictMode>,
)
