import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/index.css'

// 不开 StrictMode：drei 的 <Html> 在 React 19 严格模式的双重挂载下会丢掉第一个标签
createRoot(document.getElementById('root')!).render(<App />)
