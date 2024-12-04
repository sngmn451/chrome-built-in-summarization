import { lazy, Suspense, useEffect, useState } from "react"
import { UAParser } from "ua-parser-js"

const { browser } = UAParser(navigator.userAgent)
const NotSupported = lazy(() =>
  import("./containers/not-supported").then((module) => ({
    default: module.NotSupported
  }))
)
const NotEnable = lazy(() =>
  import("./containers/not-enabled").then((module) => ({
    default: module.NotEnable
  }))
)

function App() {
  // @ts-expect-error new chrome feature
  const [enabled] = useState("ai" in self && "summarizer" in self.ai)
  const [downloadprogress, setDownloadprogress] = useState<string>("")
  const [summary, setSummary] = useState<string>("")
  const [error, setError] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)
  const [support] = useState(Number(browser.major) > 130)
  const [available, setAvailable] = useState<boolean>(false)

  useEffect(() => {
    // @ts-expect-error new chrome feature
    self.ai.summarizer
      .capabilities()
      .then((d: { available: "readily" | "no" | string }) =>
        setAvailable(d.available === "readily")
      )
  }, [])

  useEffect(() => {
    // Listen for messages from content script
    const handleMessage = async (request: {
      type: string
      text?: string
      chunk?: string
      isFirst?: boolean
      total?: number
      loaded?: number
      error?: string
    }) => {
      console.log({ request })
      switch (request.type) {
        case "AI_INITIATE":
          setIsLoading(true)
          setDownloadprogress(`${request.loaded}/${request.total}`)
          break
        case "ERROR":
          setError(request?.error ?? "")
          break
        case "STREAM_RESPONSE":
          setDownloadprogress("")
          setIsLoading(true)
          setError("")
          if (request.isFirst) {
            setSummary(request.chunk!)
          } else {
            setSummary((prev) => prev + request.chunk)
          }
          break
        default:
          setIsLoading(false)
          setError("")
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage)
    }
  }, [])

  if (!enabled || !available) {
    return <NotEnable />
  }
  if (!support) {
    return <NotSupported />
  }
  return (
    <Suspense>
      <div className="p-4 max-w-md mx-auto space-y-4">
        <div className="space-y-2">
          <p className="text-xs text-foreground/70">
            Highlight the text you want to summarize, right click and select "⚡
            Summarize Selected Text"
          </p>
          {downloadprogress && (
            <div className="rounded-md text-sm">Downloading Summarizer..</div>
          )}
          {isLoading && (
            <div className="border rounded-md animate-pulse p-4">
              Generating summary...
            </div>
          )}
          {summary && (
            <div className="mt-4 p-3 border rounded">
              <h2 className="font-semibold mb-2">Summary:</h2>
              <div dangerouslySetInnerHTML={{ __html: summary }} />
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-100 text-red-700 rounded">
            <h2 className="font-semibold mb-2">Error:</h2>
            <p className="text-sm">{error}</p>
          </div>
        )}
      </div>
    </Suspense>
  )
}

export default App
