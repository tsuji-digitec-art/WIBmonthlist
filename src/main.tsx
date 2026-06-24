import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { DataProvider } from './context/DataContext'
import { ToastProvider } from './context/ToastContext'
import { AuthGate } from './components/AuthGate'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <AuthGate>
        <DataProvider>
          <App />
        </DataProvider>
      </AuthGate>
    </ToastProvider>
  </StrictMode>,
)
