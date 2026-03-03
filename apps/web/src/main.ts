import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import pinia from './stores'

import 'virtual:uno.css'
import './styles/index.scss'

const app = createApp(App)

app.use(pinia)
app.use(router)

app.mount('#app')
