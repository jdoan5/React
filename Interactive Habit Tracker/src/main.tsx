import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { HabitProvider } from './state/HabitContext'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HabitProvider>
      <App />
    </HabitProvider>
  </StrictMode>,
)
