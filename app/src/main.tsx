import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import App from "@/App"
import { TooltipProvider } from "@/components/ui/tooltip"
import "@/index.css"

// Follow the system light/dark setting.
const media = window.matchMedia("(prefers-color-scheme: dark)")
const applyTheme = () => document.documentElement.classList.toggle("dark", media.matches)
applyTheme()
media.addEventListener("change", applyTheme)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider delayDuration={400}>
      <App />
    </TooltipProvider>
  </StrictMode>,
)
