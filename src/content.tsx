// Diagnostic logging function
const log = (message: string, ...args: any[]) => {
  console.log(`[Content Script] ${message}`, ...args)
}

// Error logging function
const logError = (message: string, ...args: any[]) => {
  console.error(`[Content Script Error] ${message}`, ...args)
}

// Global error handling
window.addEventListener("error", (event) => {
  logError("Uncaught error in content script:", event.error)
})

log("Content script loaded and executing")

// Ensure the script is running in the main world
if (window === window.top) {
  log("Content script running in main world")
}

// Create shadow root containers for isolation
const createShadowContainer = (id: string) => {
  const container = document.createElement("div")
  container.id = id
  const shadowRoot = container.attachShadow({ mode: "open" })

  // Create a container for content
  const contentContainer = document.createElement("div")
  shadowRoot.appendChild(contentContainer)

  // Inject styles
  const style = document.createElement("link")
  style.rel = "stylesheet"
  style.href = chrome.runtime.getURL("assets/index.css")
  shadowRoot.appendChild(style)

  document.body.appendChild(container)
  return contentContainer
}

const buttonContainer = createShadowContainer("summary-button-container")
const popupContainer = createShadowContainer("summary-popup-container")

let lastSelectedText = ""

// Create summary popup element
const createSummaryPopup = (
  summary: string,
  position: { x: number; y: number }
) => {
  log("Creating summary popup", { summary, position })

  // Create popup container
  const popupEl = document.createElement("div")
  popupEl.className =
    "fixed z-[10000] bg-white rounded-lg shadow-lg p-4 max-w-md max-h-[300px] overflow-auto"
  popupEl.style.left = `${position.x}px`
  popupEl.style.top = `${position.y}px`

  // Create header
  const headerEl = document.createElement("div")
  headerEl.className = "flex justify-between items-center mb-2"

  const titleEl = document.createElement("h3")
  titleEl.className = "text-lg font-semibold"
  titleEl.textContent = "Summary"

  const closeBtn = document.createElement("button")
  closeBtn.className = "p-1 hover:bg-gray-100 rounded-full"
  closeBtn.textContent = "✕"
  closeBtn.onclick = () => {
    popupContainer.innerHTML = ""
  }

  headerEl.appendChild(titleEl)
  headerEl.appendChild(closeBtn)

  // Create summary text
  const summaryTextEl = document.createElement("p")
  summaryTextEl.className = "text-gray-700"
  summaryTextEl.textContent = summary

  // Assemble popup
  popupEl.appendChild(headerEl)
  popupEl.appendChild(summaryTextEl)

  // Clear previous content and add new popup
  popupContainer.innerHTML = ""
  popupContainer.appendChild(popupEl)
}

// Create summarize button
const createSummarizeButton = (
  selectedText: string,
  position: { x: number; y: number }
) => {
  log("Creating summarize button", { selectedText, position })

  // Create button element
  const buttonEl = document.createElement("button")
  buttonEl.textContent = "Summarize"
  buttonEl.className =
    "fixed z-[10000] bg-blue-500 text-white px-2 py-1 rounded"
  buttonEl.style.left = `${position.x}px`
  buttonEl.style.top = `${position.y}px`

  // Button click handler
  buttonEl.onclick = () => {
    log("Summarize button clicked", { selectedText })

    // Show loading state
    buttonEl.textContent = "Summarizing..."
    buttonEl.disabled = true

    // Send message to background script
    try {
      chrome.runtime.sendMessage(
        { type: "SUMMARIZE", text: selectedText },
        (response) => {
          log("Received summary response", { response })

          // Remove button
          buttonContainer.innerHTML = ""

          // Handle response
          if (chrome.runtime.lastError) {
            logError("Message sending error", chrome.runtime.lastError)
            createSummaryPopup(
              `Error: ${chrome.runtime.lastError.message}`,
              position
            )
            return
          }

          // Check if response is an error object
          if (response && typeof response === "object" && response.error) {
            logError("Summarization error", response.error)
            createSummaryPopup(`Error: ${response.error}`, position)
            return
          }

          // Validate response
          if (typeof response !== "string") {
            logError("Unexpected response type", { type: typeof response })
            createSummaryPopup("Error: Unexpected response format", position)
            return
          }

          // Show summary
          createSummaryPopup(response, position)
        }
      )
    } catch (error) {
      logError("Error sending summarization message", error)
      createSummaryPopup(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        position
      )
    }
  }

  // Clear previous button and add new one
  buttonContainer.innerHTML = ""
  buttonContainer.appendChild(buttonEl)
}

// Robust message listener setup
function setupMessageListener() {
  log("Setting up message listener in content script")

  const messageHandler = (
    request: { type: string; text?: string },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: {
      status?: string
      message?: string
      error?: string
      summary?: string
      details?: {
        url?: string
        timestamp?: number
      }
    }) => void
  ) => {
    log("Content script received message", { type: request.type })

    // Handle connection check
    if (request.type === "PING") {
      log("Received connection ping")
      try {
        sendResponse({
          status: "PONG",
          message: "Content script is active",
          details: {
            url: window.location.href,
            timestamp: Date.now()
          }
        })
      } catch (error) {
        logError("Error sending PING response", error)
      }
      return true
    }

    // Handle summarization request
    if (request.type === "SUMMARIZE") {
      log("Received summarization request", { text: request.text })

      // Validate text
      if (!request.text) {
        logError("No text provided for summarization")
        sendResponse({ error: "No text provided" })
        return false
      }

      try {
        // Send message to background script to get summary
        chrome.runtime.sendMessage(
          { type: "SUMMARIZE", text: request.text },
          (response) => {
            log("Received summary response", { response })

            if (chrome.runtime.lastError) {
              logError("Error in summary request", chrome.runtime.lastError)
              sendResponse({ error: chrome.runtime.lastError.message })
              return
            }

            sendResponse(response)
          }
        )

        return true // Allow asynchronous response
      } catch (error) {
        logError("Error in summarization", error)
        sendResponse({ error: String(error) })
        return false
      }
    }

    return false
  }

  // Remove existing listeners to prevent multiple attachments
  chrome.runtime.onMessage.removeListener(messageHandler)

  // Add new listener
  chrome.runtime.onMessage.addListener(messageHandler)

  log("Content script message listener setup complete")
}

// Initial setup of message listener
setupMessageListener()

// Mouse selection logic
document.addEventListener("mouseup", () => {
  const selection = window.getSelection()
  const selectedText = selection?.toString().trim()

  log("Mouse up event", { selectedText })

  // Remove existing button if no text is selected
  if (!selectedText) {
    buttonContainer.innerHTML = ""
    return
  }

  // Don't show button if text hasn't changed
  if (selectedText === lastSelectedText) {
    return
  }

  lastSelectedText = selectedText

  // Get selection coordinates
  const range = selection?.getRangeAt(0)
  const rect = range?.getBoundingClientRect()

  if (!rect) return

  // Position the button below the selection
  const buttonX = rect.left + window.scrollX
  const buttonY = rect.bottom + window.scrollY + 5

  // Create summarize button
  createSummarizeButton(selectedText, { x: buttonX, y: buttonY })
})

// Clean up when the page is unloaded
window.addEventListener("unload", () => {
  log("Page unloading, cleaning up")
  buttonContainer.innerHTML = ""
  popupContainer.innerHTML = ""
})

// Log when content script is fully loaded
log("Content script initialization complete")

// Explicitly expose a global function for debugging
// @ts-ignore
window.contentScriptDebug = {
  getLastSelectedText: () => lastSelectedText,
  sendTestMessage: () => {
    log("Sending test message")
    try {
      chrome.runtime.sendMessage({ type: "PING" }, (response) => {
        log("Test message response", { response })
      })
    } catch (error) {
      logError("Error sending test message", error)
    }
  },
  // Add a method to check connection status
  checkConnection: () => {
    log("Checking connection status")
    try {
      const port = chrome.runtime.connect()
      port.onDisconnect.addListener(() => {
        logError("Port disconnected", chrome.runtime.lastError)
      })
      port.postMessage({ type: "CONNECTION_CHECK" })
    } catch (error) {
      logError("Error checking connection", error)
    }
  }
}
