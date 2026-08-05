import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

document.documentElement.dataset.build = import.meta.env.VITE_BUILD_ID || 'development'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
