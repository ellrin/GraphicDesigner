import { mount } from 'svelte'
import App from './App.svelte'
import { applyTheme, uiTheme } from './ui/theme.svelte'
import './app.css'

// 先套用上次選的介面主題，避免畫面閃一下預設色
applyTheme(uiTheme.id)

mount(App, { target: document.getElementById('app')! })
