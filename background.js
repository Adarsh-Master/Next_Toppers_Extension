let interval = null;
let currentTabId = null;

function startReload(tabId) {
  stopReload();
  currentTabId = tabId;
  interval = setInterval(() => {
    chrome.tabs.reload(currentTabId);
    console.log("🔁 Reloading tab:", currentTabId);
  }, 10000);
}

function stopReload() {
  if (interval) {
    clearInterval(interval);
    interval = null;
    currentTabId = null;
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (typeof msg.autoReloadEnabled === "boolean") {
    if (msg.autoReloadEnabled) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) startReload(tabs[0].id);
      });
    } else {
      stopReload();
    }
  }

  if (typeof msg.shortcutsEnabled === "boolean") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: (enabled) => {
            if (enabled && !window._shortcutsAdded) {
              const waitForVideo = () => {
                const video = document.querySelector("video");
                if (video) {
                  window.addEventListener("keydown", function (e) {
                    const target = e.target.tagName;

                    // 🔹 If typing in chat (or any input/textarea)
                    if (["INPUT", "TEXTAREA"].includes(target)) {
                      // ESC will unfocus chat input
                      if (e.key === "Escape") {
                        e.target.blur();
                        console.log("🚪 Exited chat input");
                      }
                      return; // don’t run other shortcuts while typing
                    }

                    // Speed controls
                    let rate = null;
                    if (e.key === "1") rate = 1.0;
                    else if (e.key === "2") rate = 2.0;
                    else if (e.key === "3") rate = 1.5;

                    if (rate !== null) {
                      video.playbackRate = rate;
                      const label = document.querySelector(".vjs-playback-rate-value");
                      if (label) label.textContent = `${rate}x`;
                      console.log(`⏩ Playback rate set to ${rate}x`);
                      return;
                    }

                    // Space = play/pause (only in fullscreen)
                    if (e.code === "Space" && document.fullscreenElement) {
                      e.preventDefault();
                      if (video.paused) {
                        video.play();
                        console.log("▶️ Play (fullscreen)");
                      } else {
                        video.pause();
                        console.log("⏸️ Pause (fullscreen)");
                      }
                      return;
                    }

                    // F = toggle fullscreen
                    if (e.key.toLowerCase() === "f") {
                      e.preventDefault();
                      if (!document.fullscreenElement) {
                        const playerContainer = video.closest(".video-js") || video;
                        if (playerContainer.requestFullscreen) {
                          playerContainer.requestFullscreen();
                        } else if (playerContainer.webkitRequestFullscreen) {
                          playerContainer.webkitRequestFullscreen();
                        }
                        console.log("⛶ Enter fullscreen");
                      } else {
                        if (document.exitFullscreen) {
                          document.exitFullscreen();
                        } else if (document.webkitExitFullscreen) {
                          document.webkitExitFullscreen();
                        }
                        console.log("❎ Exit fullscreen");
                      }
                      return;
                    }
                  });

                  window._shortcutsAdded = true;
                  console.log("✅ Shortcuts enabled");
                } else {
                  const observer = new MutationObserver(() => {
                    const vid = document.querySelector("video");
                    if (vid) {
                      observer.disconnect();
                      waitForVideo();
                    }
                  });
                  observer.observe(document.body, { childList: true, subtree: true });
                }
              };

              waitForVideo();
            }
          },
          args: [msg.shortcutsEnabled]
        });
      }
    });
  }
});
