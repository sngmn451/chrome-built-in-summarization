import { Toucan } from "toucan-js"
const sentry = new Toucan({
  dsn: "https://ce977c036bbb433dafd067640420f7c0@o4506307840770048.ingest.us.sentry.io/4508407520493568",
  environment: import.meta.env.PROD ? "production" : "development"
})

// Extension installation listener
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "summarize-text",
    title: "Summarize Selected Text",
    contexts: ["selection"]
  })
})

const options = {
  sharedContext: "Explain me like I'm five",
  type: "tl;dr",
  format: "plain-text",
  length: "medium"
}

// @ts-expect-error new chrome feature
if ("ai" in self && "summarizer" in self.ai) {
  // 🎨 UI Thread: Handle context menu click
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "summarize-text" && info.selectionText && tab?.id) {
      if (chrome.sidePanel && tab) {
        try {
          chrome.sidePanel.open({ windowId: tab.windowId })

          await new Promise((resolve) => setTimeout(resolve, 500))
        } catch (error) {
          sentry.captureException(error)
        }
      }
      try {
        // @ts-expect-error new chrome feature
        const available = (await self.ai.summarizer.capabilities()).available
        let summarizer
        if (available === "no") {
          chrome.runtime.sendMessage({
            type: "ERROR",
            error: "The Summarizer API isn't usable"
          })
          return
        }
        if (available === "readily") {
          chrome.runtime.sendMessage({
            chunk: "",
            type: "STREAM_RESPONSE",
            isFirst: true
          })
          // @ts-expect-error new chrome feature
          summarizer = await self.ai.summarizer.create(options)

          await summarizer.ready

          const stream = await summarizer.summarize(info.selectionText, {
            context: `article from ${new URL(tab.url!).origin}`
          })
          for await (const chunk of stream) {
            chrome.runtime.sendMessage({
              chunk,
              type: "STREAM_RESPONSE"
            })
          }
          chrome.runtime.sendMessage({
            type: "STREAM_COMPLETE"
          })
        } else {
          // The Summarizer API can be used after the model is downloaded.
          // @ts-expect-error new chrome feature
          summarizer = await self.ai.summarizer.create(options)
          summarizer.addEventListener(
            "downloadprogress",
            (e: { loaded: number; total: number }) => {
              console.log(e.loaded, e.total)
              chrome.runtime.sendMessage({
                type: "AI_INITIATE",
                total: e.total,
                loaded: e.loaded
              })
            }
          )
          await summarizer.ready
        }
      } catch (error) {
        sentry.captureException(error)
      }
    }
  })

  // ⚡ Extension Icon: Open side panel when extension icon is clicked
  chrome.action.onClicked.addListener(async (tab) => {
    if (chrome.sidePanel && tab) {
      try {
        await chrome.sidePanel.open({ windowId: tab.windowId })
      } catch (error) {
        sentry.captureException(error)
      }
    }
  })
} else {
  sentry.captureMessage("Try to access Summarizer", "fatal", {
    data: {
      userAgent: navigator.userAgent
    }
  })
}
