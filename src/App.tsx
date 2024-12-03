import { Suspense, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

function App() {
  const [selectedText, setSelectedText] = useState<string>("")
  const [summary, setSummary] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)

  useEffect(() => {
    // Listen for messages from content script
    const handleMessage = (request: any) => {
      if (request.type === "SELECTED_TEXT") {
        setSelectedText(request.text)
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage)
    }
  }, [])

  const handleSummarize = async () => {
    if (!selectedText) return

    setIsLoading(true)
    try {
      const summaryResponse = await chrome.runtime.sendMessage({
        type: "SUMMARIZE",
        text: selectedText
      })
      setSummary(summaryResponse)
    } catch (error) {
      console.error("Summarization failed:", error)
      setSummary("Failed to generate summary")
    } finally {
      setIsLoading(false)
    }
  }

  const handleClear = () => {
    setSelectedText("")
    setSummary(null)
  }

  return (
    <Suspense>
      <div className="p-4 max-w-md mx-auto">
        <h1 className="text-2xl font-bold mb-4">AI Summarizer</h1>

        {selectedText && (
          <div className="mb-4">
            <h2 className="font-semibold">Selected Text:</h2>
            <p className="text-sm text-gray-600 mb-2">{selectedText}</p>
          </div>
        )}

        <div className="space-y-2">
          <Button
            onClick={handleSummarize}
            disabled={!selectedText || isLoading}
            className="w-full"
          >
            {isLoading ? "Summarizing..." : "Generate Summary"}
          </Button>

          {selectedText && (
            <Button onClick={handleClear} variant="outline" className="w-full">
              Clear Selection
            </Button>
          )}
        </div>

        {summary && (
          <div className="mt-4 p-3 bg-gray-100 rounded">
            <h2 className="font-semibold mb-2">Summary:</h2>
            <p className="text-sm">{summary}</p>
          </div>
        )}
      </div>
    </Suspense>
  )
}

export default App
