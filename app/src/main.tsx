import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@fontsource/be-vietnam-pro/400.css"
import "@fontsource/be-vietnam-pro/500.css"
import "@fontsource/be-vietnam-pro/600.css"
import "@fontsource/be-vietnam-pro/700.css"
import "@fontsource-variable/literata/opsz.css"
import "@fontsource-variable/literata/opsz-italic.css"
import "@fontsource-variable/jetbrains-mono/index.css"

import App from "@/App"
import { TooltipProvider } from "@/components/ui/tooltip"
import "@/index.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider delayDuration={400}>
      <App />
    </TooltipProvider>
  </StrictMode>,
)
