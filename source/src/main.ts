import { mount } from 'svelte'
import App from './App.svelte'
import { applyTheme, uiTheme } from './ui/theme.svelte'
import './app.css'

// 先套用上次選的介面主題，避免畫面閃一下預設色
applyTheme(uiTheme.id)

mount(App, { target: document.getElementById('app')! })

// 從網址（GitHub Pages）開啟時才啟用「安裝成 App」與離線快取；雙擊本機檔案時略過
if (location.protocol.startsWith('http')) {
  const link = document.createElement('link')
  link.rel = 'manifest'
  link.href = 'manifest.webmanifest'
  document.head.append(link)
  if ('serviceWorker' in navigator && !import.meta.env.DEV) navigator.serviceWorker.register('sw.js').catch(() => {})
}
