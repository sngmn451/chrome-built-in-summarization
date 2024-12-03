// Background script for handling extension messaging and side panel

// Utility function to log detailed tab information
function logTabDetails(tabId: number) {
  chrome.tabs.get(tabId, (tab) => {
    console.log(`Tab ${tabId} details:`, {
      url: tab.url,
      status: tab.status,
      active: tab.active,
      incognito: tab.incognito
    })
  })
}

// Placeholder summarization function
function summarizeText(text: string) {
  console.log("Summarizing text:", text)
  const words = text.split(/\s+/)
  const summary = words.slice(0, Math.min(20, words.length)).join(" ") + "..."
  return summary
}

// Extension installation listener
chrome.runtime.onInstalled.addListener(() => {
  console.log("Summarization Extension Installed")
  // Add context menu item
  chrome.contextMenus.create({
    id: "summarize-text",
    title: "Summarize Selected Text",
    contexts: ["selection"]
  })
})

// Robust message handling function
function setupMessageHandlers() {
  console.log("Setting up background script message handlers")

  const messageHandler = function (
    request: { type: string; text?: string },
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ) {
    console.log("Background script received message:", request)
    console.log("Message type:", request.type)
    console.log("Sender:", sender)

    // Connection ping handler
    if (request.type === "PING") {
      console.log("Received PING from content script")
      sendResponse({
        status: "PONG",
        message: "Background script is active",
        timestamp: Date.now()
      })
      return true
    }

    // Summarization request handler
    if (request.type === "SUMMARIZE") {
      console.log("Received summarization request")

      // Ensure text is provided
      if (!request.text) {
        console.error("No text provided for summarization")
        sendResponse({ error: "No text provided" })
        return false
      }

      // Perform summarization
      try {
        const summary = summarizeText(request.text)
        console.log("Summary generated:", summary)

        sendResponse(summary)
        return true
      } catch (error) {
        console.error("Summarization error:", error)
        sendResponse({
          error: `Summarization failed: ${(error as Error).message}`
        })
        return false
      }
    }

    return false
  }

  // Remove any existing listeners to prevent multiple attachments
  chrome.runtime.onMessage.removeListener(messageHandler)

  // Add the new listener
  chrome.runtime.onMessage.addListener(messageHandler)
}

// Utility function to check if content script is connected
function checkContentScriptConnection(tabId: number): Promise<boolean> {
  return new Promise((resolve) => {
    console.log(`Checking content script connection for tab ${tabId}`)

    // Log tab details before connection check
    logTabDetails(tabId)

    // Timeout to prevent hanging
    const timeout = setTimeout(() => {
      console.error(`Connection check timed out for tab ${tabId}`)
      resolve(false)
    }, 5000)

    try {
      // Attempt to inject content script if not already present
      chrome.scripting.executeScript(
        {
          target: { tabId: tabId },
          func: () => {
            console.log("Content script injection check")
            return true
          }
        },
        (results) => {
          console.log("Injection script results:", results)
        }
      )

      // Send a ping message to the content script
      chrome.tabs.sendMessage(tabId, { type: "PING" }, (response) => {
        // Clear the timeout
        clearTimeout(timeout)

        if (chrome.runtime.lastError) {
          console.error(
            `Connection check failed for tab ${tabId}:`,
            JSON.stringify(chrome.runtime.lastError)
          )

          // Attempt to inject content script
          chrome.scripting.executeScript(
            {
              target: { tabId: tabId },
              files: ["content.js"]
            },
            () => {
              console.log(
                `Attempted to inject content script into tab ${tabId}`
              )
            }
          )

          resolve(false)
        } else {
          console.log(
            `Connection check successful for tab ${tabId}. Response:`,
            response
          )
          resolve(true)
        }
      })
    } catch (error) {
      // Clear the timeout
      clearTimeout(timeout)

      console.error(`Error in connection check for tab ${tabId}:`, error)
      resolve(false)
    }
  })
}

// Initialize message handlers on script load
setupMessageHandlers()

// Handle context menu click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  console.log("Context menu clicked:", info)
  console.log("Tab details:", tab)

  if (info.menuItemId === "summarize-text" && info.selectionText && tab?.id) {
    console.log("Preparing to send summarize message to tab:", tab.id)
    console.log("Selected text:", info.selectionText)

    // Ensure side panel is open
    if (chrome.sidePanel && tab) {
      try {
        // Open side panel for the current window
        await chrome.sidePanel.open({ windowId: tab.windowId })

        // Small delay to ensure side panel is fully opened
        await new Promise((resolve) => setTimeout(resolve, 500))
      } catch (error) {
        console.error("Error opening side panel:", error)
      }
    }

    // Check content script connection first
    const isConnected = await checkContentScriptConnection(tab.id)

    if (!isConnected) {
      console.error("Content script not connected. Attempting to reload tab.")

      // Optional: Reload the tab to ensure content script is injected
      chrome.tabs.reload(tab.id, {}, () => {
        console.log("Tab reloaded. Waiting a moment before sending message.")

        // Wait a short time to allow content script to load
        setTimeout(() => {
          if (!tab.id) return
          try {
            chrome.tabs.sendMessage(
              tab.id,
              {
                type: "SUMMARIZE",
                text: info.selectionText
              },
              (response) => {
                console.log("Delayed message response:", response)

                // Handle any errors or display the summary
                if (chrome.runtime.lastError) {
                  console.error(
                    "Error sending delayed message:",
                    JSON.stringify(chrome.runtime.lastError)
                  )
                }
              }
            )
          } catch (error) {
            console.error("Error sending delayed message:", error)
          }
        }, 1000)
      })
    } else {
      // If connected, send message directly
      try {
        chrome.tabs.sendMessage(
          tab.id,
          {
            type: "SUMMARIZE",
            text: info.selectionText
          },
          (response) => {
            console.log("Immediate message response:", response)

            // Handle any errors or display the summary
            if (chrome.runtime.lastError) {
              console.error(
                "Error sending immediate message:",
                chrome.runtime.lastError
              )
            }
          }
        )
      } catch (error) {
        console.error("Error sending immediate message:", error)
      }
    }
  }
})

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  console.log("Extension icon clicked")

  if (chrome.sidePanel && tab) {
    try {
      // Open side panel for the current window
      await chrome.sidePanel.open({ windowId: tab.windowId })

      console.log("Side panel opened successfully")
    } catch (error) {
      console.error("Error opening side panel:", error)
    }
  }
})
