// popup.js — Complete NextToppers Pro Workspace Engine

const masterBtn = document.getElementById("masterButton");
const pollBtn = document.getElementById("enablePollShortcut");
const cooldownBtn = document.getElementById("unlockCooldown");

/* Helper to inject code directly into the active webpage context */
function execOnPage(fn) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: fn
    });
  });
}

/* =========================================================
   1. SPEED CONTROLS & FLOATING TIME OVERLAYS
   ========================================================= */
function injectSpeedAndOverlays() {
  if (window._nt_speed_injected) return;
  window._nt_speed_injected = true;

  function getVideo() {
    return document.querySelector("#vjs_video_3_html5_api")
      || document.querySelector("video.vjs-tech")
      || document.querySelector("video")
      || null;
  }
  function getPlayerContainer() {
    return document.querySelector("#vjs_video_3")
      || document.querySelector(".video-js")
      || (getVideo() && getVideo().parentElement)
      || document.body;
  }

  /* Floating UI Speed Selection Pill Buttons */
  const RATES = [2, 1.75, 1.5, 1.25, 1, 0.75, 0.5];

  function createUI(video) {
    if (!video || document.getElementById("nt-speed-control")) return;
    const parent = getPlayerContainer() || document.body;
    if (getComputedStyle(parent).position === "static") parent.style.position = "relative";

    const container = document.createElement("div");
    container.id = "nt-speed-control";
    container.style.cssText = `
      position:absolute; left:12px; top:12px; z-index:2147483647;
      display:flex; gap:8px; align-items:center; pointer-events:auto;
      transition:opacity .12s ease`;

    const base = "padding:4px 6px;font-size:11px;border-radius:8px;border:1px solid rgba(255,255,255,0.04);" +
                 "background:linear-gradient(180deg,rgba(0,0,0,0.46),rgba(255,255,255,0.02));" +
                 "color:#eaf5ff;font-weight:600;cursor:pointer;transition:transform .12s ease;";

    RATES.forEach((r) => {
      const b = document.createElement("button");
      b.textContent = `${r}x`;
      b.dataset.rate = r;
      b.style.cssText = base;
      b.addEventListener("click", () => {
        video.playbackRate = r;
        syncPlaybackRateUI(`${r}x`);
        updateHighlight(r);
      });
      container.appendChild(b);
    });

    parent.appendChild(container);
    updateHighlight(1);
  }

  function syncPlaybackRateUI(label) {
    const vjsLbl = document.querySelector(".vjs-playback-rate-value");
    if (vjsLbl) vjsLbl.textContent = label;
  }

  function updateHighlight(rate) {
    const container = document.getElementById("nt-speed-control");
    if (!container) return;
    container.querySelectorAll("button").forEach((btn) => {
      if (parseFloat(btn.dataset.rate) === parseFloat(rate)) {
        btn.style.background = "white"; btn.style.color = "black";
      } else {
        btn.style.background = "linear-gradient(180deg,rgba(0,0,0,0.46),rgba(255,255,255,0.02))";
        btn.style.color = "#eaf5ff";
      }
    });
  }

  /* HUD Clock Overlay */
  window._nt_clock_enabled = window._nt_clock_enabled ?? true;
  function addClock(video) {
    if (!video || document.getElementById("nt-clock-overlay")) return;
    const parent = getPlayerContainer() || document.body;

    const clock = document.createElement("div");
    clock.id = "nt-clock-overlay";
    clock.style.cssText = `
      position:absolute; top:12px; right:12px; font-size:14px; font-weight:600;
      color:#eaf5ff; background:rgba(0,0,0,0.4); padding:4px 8px; border-radius:6px;
      z-index:2147483647; pointer-events:none; font-family:system-ui, sans-serif;
    `;
    parent.appendChild(clock);

    function updateClock() {
      const now = new Date();
      let hours = now.getHours() % 12 || 12;
      let minutes = now.getMinutes();
      clock.textContent = `${hours}:${minutes < 10 ? "0" + minutes : minutes}`;
    }
    updateClock();
    window._nt_clock_interval = window._nt_clock_interval || setInterval(updateClock, 1000);
  }

  let video = getVideo();
  if (video) { createUI(video); if (window._nt_clock_enabled) addClock(video); }

  // Permanently hide site's built-in top page back layout headers
  const hideArrow = () => { const arrow = document.querySelector('.helpHead.audio-player__top'); if (arrow) arrow.style.display = 'none'; };
  hideArrow();
  new MutationObserver(hideArrow).observe(document.body, { childList: true, subtree: true });
  
  window.updateHighlight = updateHighlight;
  window.createUI = createUI;
  window.addClock = addClock;
}

/* =========================================================
   2. KEYBOARD SHORTCUTS, ACCUMULATING SEEK & MODAL LOGIC
   ========================================================= */
function injectShortcutsAndModals() {
  if (window._nt_shortcuts_active) return;
  window._nt_shortcuts_active = true;

  function getChatInput() {
    return document.querySelector("input.w-full.text-gray-600") 
      || document.querySelector(".player_container input[type='text']") 
      || document.querySelector("input.input_field")
      || null;
  }
  function isTypingInChat() {
    const ae = document.activeElement;
    return ae && (["INPUT", "TEXTAREA"].includes(ae.tagName) || ae.isContentEditable);
  }

  /* 🎬 YouTube Mobile & Widescreen Double-Tap/Double-Click Skip Logic */
  let lastTapTime = 0, consecutiveTapCount = 0, accumTimer = null, totalSkipped = 0;
  
  function showSkipOverlay(direction, totalAmount) {
    let overlay = document.getElementById("nt-skip-bubble");
    if (!overlay) {
      overlay = document.createElement("div"); overlay.id = "nt-skip-bubble";
      overlay.style.cssText = `position:absolute;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:12px 20px;border-radius:30px;font-weight:bold;z-index:2147483647;pointer-events:none;transition:opacity 0.2s ease;font-family:system-ui, sans-serif;`;
      const container = document.querySelector("#vjs_video_3") || document.querySelector(".video-js") || document.body;
      container.appendChild(overlay);
    }
    overlay.style.left = direction === "forward" ? "" : "15%";
    overlay.style.right = direction === "forward" ? "15%" : "";
    overlay.innerHTML = direction === "forward" ? `⏩ +${totalAmount}s` : `⏪ -${totalAmount}s`;
    overlay.style.opacity = "1";
    clearTimeout(window._nt_skip_fade_timeout);
    window._nt_skip_fade_timeout = setTimeout(() => overlay.style.opacity = "0", 800);
  }

  function handleSideInteraction(clientX, targetWidth) {
    const video = document.querySelector("#vjs_video_3_html5_api") || document.querySelector("video"); 
    if (!video) return;
    const direction = clientX > (targetWidth / 2) ? "forward" : "backward";
    
    consecutiveTapCount++;
    totalSkipped = consecutiveTapCount * 10;
    video.currentTime += direction === "forward" ? 10 : -10;
    
    showSkipOverlay(direction, totalSkipped);
    clearTimeout(accumTimer);
    accumTimer = setTimeout(() => { consecutiveTapCount = 0; totalSkipped = 0; }, 650);
  }

  const playerContainer = document.querySelector("#vjs_video_3") || document.querySelector(".video-js") || document.body;
  
  // Mobile touch event routing
  playerContainer.addEventListener("touchstart", (e) => {
    if (e.target.closest("#nt-speed-control, #nt-clock-overlay, .vjs-control-bar")) return;
    const now = Date.now();
    const rect = playerContainer.getBoundingClientRect();
    if (now - lastTapTime < 300) { 
      e.preventDefault(); 
      handleSideInteraction(e.touches[0].clientX - rect.left, rect.width); 
    }
    lastTapTime = now;
  }, { passive: false });

  // Desktop double-click mapping
  playerContainer.addEventListener("dblclick", (e) => {
    if (e.target.closest("#nt-speed-control, #nt-clock-overlay, .vjs-control-bar")) return;
    const rect = playerContainer.getBoundingClientRect();
    handleSideInteraction(e.clientX - rect.left, rect.width);
  });

  /* Modern Glass Modal Shell Generator */
  function createModalShell() {
    if (document.getElementById("__nt_modal")) return document.getElementById("__nt_modal").querySelector("div");
    const wrap = document.createElement("div"); wrap.id = "__nt_modal";
    wrap.style = "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:2147483647;";
    const backdrop = document.createElement("div"); backdrop.style = "position:absolute;inset:0;background:rgba(3,6,12,0.7);backdrop-filter:blur(6px);";
    const card = document.createElement("div"); card.style = "position:relative;width:340px;border-radius:14px;padding:20px;background:#101216;color:#e8f1ff;font-family:sans-serif;box-shadow:0 20px 40px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.05);";
    wrap.appendChild(backdrop); wrap.appendChild(card); document.body.appendChild(wrap);
    backdrop.addEventListener('click', () => wrap.remove());
    return card;
  }

  function flashMessage(text) {
    const d = document.createElement('div'); d.textContent = text;
    d.style = "position:fixed;right:20px;bottom:22px;background:#7c5cff;color:white;padding:8px 14px;border-radius:8px;z-index:2147483647;font-weight:600;font-family:sans-serif;box-shadow: 0 4px 12px rgba(0,0,0,0.3);";
    document.body.appendChild(d); setTimeout(() => d.remove(), 2000);
  }

  /* Auto Poll Management Subsystems */
  window.openPollModal = function() {
    const shell = createModalShell(); 
    shell.innerHTML = `
      <h3 style="margin-top:0;font-family:sans-serif;">Auto Poll Pre-Selector</h3>
      <p style="font-size:12px;color:#8a99ad;margin-top:-8px;">Queue your option choice below. It will instantly click the tab, choose the option, and submit as soon as the teacher launches it.</p>
    `;

    const input = document.createElement('input'); 
    input.type = 'number'; 
    input.placeholder = 'Option Number (e.g., 1, 2, 3, 4)'; 
    input.style = 'width:93%;padding:10px;margin-bottom:10px;background:#1a1d24;border:1px solid rgba(255,255,255,0.08);color:#fff;border-radius:8px;outline:none;';
    input.value = window._nt_poll_choice || ''; 
    shell.appendChild(input);
    setTimeout(() => input.focus(), 50);

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        window._nt_poll_choice = parseInt(input.value) || null;
        
        if (window._nt_poll_choice) {
          if(window._nt_obs) window._nt_obs.disconnect();
          
          // Setup a high-speed observer to track exactly when an incoming poll element appears
          window._nt_obs = new MutationObserver(() => {
            // Find and force click into the site's "Poll" layout tab instantly
            const tabs = Array.from(document.querySelectorAll(".tab_list button, .tab_list span"));
            const pollTab = tabs.find(el => el.textContent?.trim().toLowerCase() === "poll");
            
            // Check if there are options or action items present inside the player container panels
            const hasPollActive = document.querySelector(".rgt_side input[type='radio']") 
              || document.querySelector(".poll-option") 
              || document.querySelector(".option-item")
              || Array.from(document.querySelectorAll("button")).some(b => b.innerText?.toLowerCase().includes('attempt') || b.innerText?.toLowerCase().includes('submit'));

            if (hasPollActive) {
              if (pollTab) pollTab.closest("button")?.click();

              // Heuristic: Auto-click "Attempt" if the site prompts a confirmation layout wrapper first
              const attemptBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText?.toLowerCase().includes('attempt'));
              if (attemptBtn) attemptBtn.click();

              // Match option choices dynamically by counting DOM structures matching the index selection
              setTimeout(() => {
                const options = Array.from(document.querySelectorAll(".rgt_side input[type='radio'], .poll-option, .option-item, .rgt_side li button"));
                const targetIndex = window._nt_poll_choice - 1;
                
                if (options[targetIndex]) {
                  options[targetIndex].click();
                  
                  // Instantly hit the final Submit button to lock it in
                  const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText?.toLowerCase().includes('submit'));
                  if (submitBtn) submitBtn.click();
                }
              }, 150);
            }
          });
          
          window._nt_obs.observe(document.body, { childList: true, subtree: true });
          flashMessage(`Pre-selected Option ${window._nt_poll_choice}`);
        } else {
          if(window._nt_obs) window._nt_obs.disconnect(); 
          flashMessage("Auto-poll pre-selection cleared");
        }
        document.getElementById("__nt_modal").remove();
      }
    });
  };

  /* Auto Spammer Subsystems */
  /* Auto Spammer Subsystems with Custom Interval Timer */
  window.openAutoMessageModal = function() {
    const shell = createModalShell(); 
    shell.innerHTML = `
      <h3 style="margin-top:0;font-family:sans-serif;">Message Broadcast Spammer</h3>
      <p style="font-size:12px;color:#8a99ad;margin-top:-8px;">Set message, interval (seconds), and press Enter to toggle.</p>
    `;

    const txt = document.createElement('textarea'); 
    txt.placeholder = 'Message text...'; 
    txt.style = 'width:94%;height:60px;background:#1a1d24;color:#fff;border-radius:8px;padding:8px;border:1px solid rgba(255,255,255,0.08);outline:none;resize:none;margin-bottom:10px;';
    txt.value = window._nt_last_msg || ''; 
    shell.appendChild(txt);

    const row = document.createElement('div');
    row.style = 'display:flex;gap:10px;align-items:center;';
    
    const label = document.createElement('span');
    label.textContent = 'Interval (s):';
    label.style = 'font-size:12px;color:#8a99ad;';
    
    const timeInput = document.createElement('input');
    timeInput.type = 'number';
    timeInput.step = '0.1';
    timeInput.min = '0.1';
    timeInput.value = window._nt_spam_interval_val || '0.1';
    timeInput.style = 'width:70px;padding:6px;background:#1a1d24;color:#fff;border:1px solid rgba(255,255,255,0.08);border-radius:6px;outline:none;';
    
    row.appendChild(label);
    row.appendChild(timeInput);
    shell.appendChild(row);

    setTimeout(() => txt.focus(), 50);

    // Helper setup to trigger execution loop
    const startSpam = () => {
      window._nt_last_msg = txt.value.trim();
      window._nt_spam_interval_val = parseFloat(timeInput.value) || 0.1;
      
      if (window._nt_last_msg) {
        if(window._nt_spam) clearInterval(window._nt_spam);
        
        // Immediate first send action
        const runSend = () => {
          const inp = getChatInput();
          if (inp) {
            inp.removeAttribute("disabled"); // Extra safety lock check
            inp.value = window._nt_last_msg; 
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            
            const sBtn = document.querySelector(".player_container button[type='submit']") 
              || Array.from(document.querySelectorAll("button")).find(b => b.innerText?.toLowerCase().includes('send'));
            if (sBtn) {
              sBtn.removeAttribute("disabled");
              sBtn.click();
            }
          }
        };
        
        runSend();
        window._nt_spam = setInterval(runSend, Math.max(50, window._nt_spam_interval_val * 1000));
        flashMessage(`Spam transmission active (${window._nt_spam_interval_val}s)`);
      } else {
        clearInterval(window._nt_spam); 
        window._nt_spam = null;
        flashMessage("Spam engine stopped");
      }
      const m = document.getElementById("__nt_modal"); if(m) m.remove();
    };

    txt.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        startSpam();
      }
    });

    timeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        startSpam();
      }
    });
  };

  /* Global Keyboard Action Routers */
  window.addEventListener("keydown", (e) => {
    if (isTypingInChat()) {
      if (e.key === "Escape") getChatInput().blur();
      return;
    }
    const video = document.querySelector("#vjs_video_3_html5_api") || document.querySelector("video");
    if (e.key === "1" && video) { video.playbackRate = 1.0; window.updateHighlight?.(1.0); }
    if (e.key === "2" && video) { video.playbackRate = 2.0; window.updateHighlight?.(2.0); }
    if (e.key === "3" && video) { video.playbackRate = 1.5; window.updateHighlight?.(1.5); }
    if (e.code === "Space" && video) { e.preventDefault(); video.paused ? video.play() : video.pause(); }
    if (e.key.toLowerCase() === "f" && video) {
      const container = video.closest('.video-js') || video;
      if (!document.fullscreenElement) container.requestFullscreen?.(); else document.exitFullscreen?.();
    }
    if (e.key.toLowerCase() === "t") {
      const clk = document.getElementById("nt-clock-overlay");
      if (clk) clk.remove(); else if(video) window.addClock?.(video);
    }
    if (e.key.toLowerCase() === "p") { 
      e.preventDefault();
      // Instantly snap to the Live Poll tab layout pane
      const tabs = Array.from(document.querySelectorAll(".tab_list button, .tab_list span"));
      const pollTab = tabs.find(el => el.textContent?.trim().toLowerCase() === "poll");
      if (pollTab) pollTab.closest("button")?.click();
      
      window.openPollModal?.(); 
    }
    if (e.key.toLowerCase() === "s") { window.openAutoMessageModal?.(); }
  });
}

/* =========================================================
   3. CHAT COOLDOWN & COPY/PASTE BYPASS OVERRIDES
   ========================================================= */
function unlockChatAndPaste() {
  const forceEnableElements = () => {
    // 1. Force remove the disabled status on the chat text input field
    const input = document.querySelector(".player_container input[type='text']") 
      || document.querySelector("input.w-full.text-gray-600")
      || document.querySelector("input.input_field");
    if (input) {
      if (input.hasAttribute("disabled")) input.removeAttribute("disabled");
      if (input.disabled) input.disabled = false;
    }

    // 2. Force remove the disabled status on the Orange Send Arrow button icon wrapper
    const sendBtn = document.querySelector(".player_container button[type='submit']") 
      || Array.from(document.querySelectorAll("button")).find(b => b.innerHTML.includes('paint0_linear_6730_5285') || b.innerText?.toLowerCase().includes('send'));
    if (sendBtn) {
      if (sendBtn.hasAttribute("disabled")) sendBtn.removeAttribute("disabled");
      if (sendBtn.disabled) sendBtn.disabled = false;
    }
  };

  // Run immediately and listen for changes when NextToppers counts down the timer ticks
  const chatObserver = new MutationObserver(forceEnableElements);
  chatObserver.observe(document.body, { childList: true, subtree: true, attributes: true });
  forceEnableElements();

  // 3. Absolute clipboard lock bypass engine (bypasses stopImmediatePropagation on site)
  const allowClipboard = (e) => {
    e.stopImmediatePropagation();
    return true;
  };
  document.addEventListener("paste", allowClipboard, true);
  document.addEventListener("copy", allowClipboard, true);
  document.addEventListener("contextmenu", allowClipboard, true);
}

/* =========================================================
   4. POPUP UI BUTTON ACTION INTERFACES
   ========================================================= */
masterBtn.addEventListener("click", () => {
  execOnPage(injectSpeedAndOverlays);
  execOnPage(injectShortcutsAndModals);
  execOnPage(unlockChatAndPaste);
});

pollBtn.addEventListener("click", () => {
  execOnPage(injectShortcutsAndModals);
  execOnPage(() => { if(window.openPollModal) window.openPollModal(); });
});

cooldownBtn.addEventListener("click", () => {
  execOnPage(injectShortcutsAndModals);
  execOnPage(() => { if(window.openAutoMessageModal) window.openAutoMessageModal(); });
});
