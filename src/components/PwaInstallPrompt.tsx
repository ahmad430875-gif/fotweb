import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

let pendingInstallPrompt: InstallPromptEvent | null = null

export function PwaInstallButton() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(pendingInstallPrompt)
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    function handleInstallPrompt(event: Event) {
      event.preventDefault()
      pendingInstallPrompt = event as InstallPromptEvent
      setInstallPrompt(pendingInstallPrompt)
      setHelpOpen(false)
    }

    window.addEventListener('beforeinstallprompt', handleInstallPrompt)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
    }
  }, [])

  async function installApp() {
    if (!installPrompt) {
      setHelpOpen((open) => !open)
      return
    }
    try {
      await installPrompt.prompt()
      await installPrompt.userChoice
      pendingInstallPrompt = null
      setInstallPrompt(null)
    } catch {
      setHelpOpen(true)
    }
  }

  const isAppleMobile = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const installInstructions = isAppleMobile
    ? 'In Safari, tap Share, then Add to Home Screen.'
    : 'Open your browser menu and choose Install app or Add to Home screen.'

  return (
    <div className="pwa-install-control">
      <button
        className="pwa-install-button"
        type="button"
        aria-label="Install app"
        aria-expanded={helpOpen}
        onClick={() => void installApp()}
      >
        <Download size={17} aria-hidden="true" />
        <span>Install app</span>
      </button>
      {helpOpen && <div className="pwa-install-help" role="status">
        <span>{installInstructions}</span>
        <button type="button" aria-label="Dismiss install instructions" onClick={() => setHelpOpen(false)}>
          <X size={15} />
        </button>
      </div>}
    </div>
  )
}