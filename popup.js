// popup.js — full updated version (drop-in replacement)
// Contains: speed UI, shaka-compatible selectors, shortcuts, poll modal (start/stop/enter/up-down),
// auto-message modal (time input default 0.1 + Enter behavior), clock overlay, D toggle, M mute, etc.

/* ----------------------------
   popup DOM elements (popup.html)
   ---------------------------- */
// 🔹 Hide the site's built-in playback rate overlay completely
const unlockBtn = document.getElementById("unlockSpeed");
const reloadSwitch = document.getElementById("reloadSwitch");
const cooldownBtn = document.getElementById("unlockCooldown");
const shortcutsBtn = document.getElementById("enableShortcuts");
const masterBtn = document.getElementById("masterButton");
const pasteBtn = document.getElementById("unlockPaste");
const pollBtn = document.getElementById("enablePollShortcut");

/* small helper to inject code into active tab (page context) */
function execOnPage(fn) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: fn
    });
  });
}

/* ===========================
   SPEED UI / CLOCK / HELPERS
   These are injected into the page when Unlock Speed is clicked.
   They use robust selectors to work with both old Video.js and new Shaka UI.
   =========================== */
unlockBtn.addEventListener("click", () => {
  execOnPage(() => {
    if (window._nt_speed_injected) return;
    window._nt_speed_injected = true;


    /* ---------- selector helpers (tries multiple fallbacks) ---------- */
    function getVideo() {
      return document.querySelector("video.shaka-video")
        || document.querySelector("#videoContainer video")
        || document.querySelector("video")
        || null;
    }
    function getPlayerContainer() {
      return document.querySelector("#videoContainer")
        || document.querySelector(".video-js")
        || document.querySelector(".shaka-controls-container")
        || (getVideo() && getVideo().parentElement)
        || document.body;
    }
    function getControlBar() {
      return document.querySelector(".vjs-control-bar")
        || document.querySelector(".shaka-controls-container")
        || document.querySelector(".shaka-bottom-controls")
        || null;
    }

    /* ---------- UI: floating speed buttons (left) ---------- */
    const RATES = [2, 1.75, 1.5, 1.25, 1, 0.75, 0.5];

    function createUI(video) {
      if (!video) return;
      if (document.getElementById("nt-speed-control")) return;
      const parent = getPlayerContainer() || document.body;
      if (getComputedStyle(parent).position === "static") parent.style.position = "relative";

      const container = document.createElement("div");
      container.id = "nt-speed-control";
      container.style.cssText = `
        position:absolute;
        left:12px;
        top:12px;
        z-index:2147483647;
        display:flex;
        gap:8px;
        align-items:center;
        pointer-events:auto;
        transition:opacity .12s ease`;
      container.classList.remove("nt-hidden");

      const base =
        "padding:4px 6px;font-size:11px;border-radius:8px;border:1px solid rgba(255,255,255,0.04);" +
        "background:linear-gradient(180deg,rgba(0,0,0,0.46),rgba(255,255,255,0.02));" +
        "color:#eaf5ff;font-weight:600;cursor:pointer;transition:transform .12s ease, box-shadow .12s ease;";

      RATES.forEach((r) => {
        const b = document.createElement("button");
        b.textContent = `${r}x`;
        b.dataset.rate = r;
        b.style.cssText = base;
        b.addEventListener("mouseenter", () => (b.style.transform = "translateY(-3px) scale(1.02)"));
        b.addEventListener("mouseleave", () => (b.style.transform = ""));
        b.addEventListener("click", () => {
          video.playbackRate = r;
          syncPlaybackRateUI(rateToLabel(r));
          updateHighlight(r);
        });
        container.appendChild(b);
      });

      parent.appendChild(container);
      updateHighlight(1);
    }

    /* ---------- sync w/ native Shaka / vjs dropdown label if present ---------- */
    function rateToLabel(rate) {
      return `${rate}x`;
    }
    function syncPlaybackRateUI(label) {
      // shaka playback-rate control label
      const shakaLbl = document.querySelector(".shaka-playbackrate-button span") || document.querySelector(".shaka-playbackrate-button");
      if (shakaLbl) {
        if (shakaLbl.tagName === "SPAN") shakaLbl.textContent = label;
        else shakaLbl.innerText = label;
      }
      // vjs label
      const vjsLbl = document.querySelector(".vjs-playback-rate-value");
      if (vjsLbl) vjsLbl.textContent = label;
    }

    /* ---------- native-style dropdown injection (if player lacks it) ---------- */
      
    /*the old function no needed more*/

    // function injectSpeedDropdown() {
    //   const controlBar = getControlBar();
    //   if (!controlBar) return;
    //   if (controlBar.querySelector(".nt-injected-playback-rate")) return;

    //   // try to attach near Shaka's settings container if available
    //   const wrapper = document.createElement("div");
    //   wrapper.className = "nt-injected-playback-rate";
    //   wrapper.style.cssText = "margin-left:8px;display:flex;align-items:center;gap:6px";

    //   const label = document.createElement("div");
    //   label.className = "nt-playback-rate-value";
    //   label.textContent = "1x";
    //   label.style.cssText = "font-weight:600;min-width:36px;text-align:center;color:#eaf5ff";

    //   const menu = document.createElement("div");
    //   menu.className = "nt-playback-rate-menu";
    //   menu.style.cssText = "display:flex;gap:6px";

    //   [0.5, 1, 1.5, 2].forEach((rate) => {
    //     const li = document.createElement("button");
    //     li.className = "nt-menu-item";
    //     li.textContent = `${rate}x`;
    //     li.style.cssText = "padding:4px 8px;border-radius:6px;background:transparent;color:#eaf5ff;border:1px solid rgba(255,255,255,0.04);cursor:pointer";
    //     li.onclick = () => {
    //       const video = getVideo();
    //       if (video) video.playbackRate = rate;
    //       label.textContent = `${rate}x`;
    //       updateHighlight(rate);
    //     };
    //     menu.appendChild(li);
    //   });

    //   wrapper.appendChild(label);
    //   wrapper.appendChild(menu);
    //   controlBar.appendChild(wrapper);
    // }

    /* ---------- Clock overlay (top-right) ---------- */
    window._nt_clock_enabled = window._nt_clock_enabled ?? true;
    function addClock(video) {
      if (!video || document.getElementById("nt-clock-overlay")) return;
      const parent = getPlayerContainer() || document.body;
      if (getComputedStyle(parent).position === "static") parent.style.position = "relative";

      const clock = document.createElement("div");
      clock.id = "nt-clock-overlay";
      clock.style.cssText = `
        position:absolute;
        top:12px;
        right:12px;
        font-size:14px;
        font-weight:600;
        color:#eaf5ff;
        background:rgba(0,0,0,0.4);
        padding:4px 8px;
        border-radius:6px;
        z-index:2147483647;
        pointer-events:none;
        font-family:Inter, system-ui;
      `;
      parent.appendChild(clock);

      function updateClock() {
        const now = new Date();
        let hours = now.getHours();
        let minutes = now.getMinutes();
        hours = hours % 12 || 12;
        if (minutes < 10) minutes = "0" + minutes;
        clock.textContent = `${hours}:${minutes}`;
      }
      updateClock();
      // keep reference so we can clear later if needed
      window._nt_clock_interval = window._nt_clock_interval || setInterval(updateClock, 1000);
    }

    /* ---------- attach UIs when video appears ---------- */
    let attachObserver = null;
    function tryAttach() {
      const video = getVideo();
      if (video) {
        createUI(video);
        // injectSpeedDropdown();
        if (window._nt_clock_enabled) addClock(video);
      }
    }
    tryAttach();

    // Hide the top-left arrow button permanently
    const hideArrow = () => {
      const arrow = document.querySelector('.helpHead.audio-player__top');
      if (arrow) arrow.style.display = 'none';
    };
    hideArrow();
    const arrowObs = new MutationObserver(hideArrow);
    arrowObs.observe(document.body, { childList: true, subtree: true });

    attachObserver = new MutationObserver(() => tryAttach());
    attachObserver.observe(document.documentElement, { childList: true, subtree: true });

    /* ---------- highlight helper ---------- */
    function updateHighlight(rate) {
      const container = document.getElementById("nt-speed-control");
      if (!container) return;
      container.querySelectorAll("button").forEach((btn) => {
        if (parseFloat(btn.dataset.rate) === parseFloat(rate)) {
          btn.style.background = "white";
          btn.style.color = "black";
        } else {
          btn.style.background =
            "linear-gradient(180deg,rgba(0,0,0,0.46),rgba(255,255,255,0.02))";
          btn.style.color = "#eaf5ff";
        }
      });
    }

    // expose for keyboard handlers
    window.createUI = createUI;
    window.updateHighlight = updateHighlight;
    window.addClock = addClock;
  });
});

/* -------------------------
   Auto-reload control (background handles reload)
   ------------------------- */
chrome.storage.local.get("autoReloadEnabled", (data) => {
  reloadSwitch.checked = data.autoReloadEnabled ?? false;
});
reloadSwitch.addEventListener("change", () => {
  const enabled = reloadSwitch.checked;
  chrome.storage.local.set({ autoReloadEnabled: enabled });
  chrome.runtime.sendMessage({ autoReloadEnabled: enabled });
});
document.getElementById("reloadRow").addEventListener("click", (e) => {
  if (e.target.id === "reloadSwitch") return;
  reloadSwitch.checked = !reloadSwitch.checked;
  reloadSwitch.dispatchEvent(new Event("change"));
});

/* ===========================
   SHORTCUTS / POLL / SPAM / CHAT HELPERS
   Injected into page when Enable Shortcuts is clicked
   =========================== */
shortcutsBtn.addEventListener("click", () => {
  execOnPage(() => {
    if (window._nt_shortcuts_active) return;
    window._nt_shortcuts_active = true;

    /* ----------------
       Small helper: locate chat input (updated for new UI)
       ---------------- */
    function getChatInput() {
      return document.querySelector("input.input_field")
        || document.querySelector("textarea.chat-input")
        || document.querySelector("[data-chat-input='true']")
        || document.querySelector("[contenteditable='true']")
        || null;
    }

    function isTypingInChat() {
      const ae = document.activeElement;
      const chat = getChatInput();
      if (!ae) return false;
      if (["INPUT", "TEXTAREA"].includes(ae.tagName)) return true;
      if (ae.isContentEditable) return true;
      if (chat && (ae === chat || chat.contains(ae))) return true;
      return false;
    }

    /* ----------
       Modal / Panel helpers
       ---------- */
    function createModalShell() {
      if (document.getElementById("__nt_modal")) return document.getElementById("__nt_modal").querySelector("div");
      const wrap = document.createElement("div");
      wrap.id = "__nt_modal";
      wrap.style = `
        position:fixed; inset:0; display:flex;align-items:center;justify-content:center;
        z-index:2147483647; pointer-events:auto;
      `;
      const backdrop = document.createElement("div");
      backdrop.style = `
        position:absolute; inset:0; background:rgba(3,6,12,0.66); backdrop-filter: blur(6px);
      `;
      const card = document.createElement("div");
      card.style = `
        position:relative; width:420px; max-width:92%; border-radius:12px; padding:18px;
        background: linear-gradient(180deg, rgba(18,20,24,0.98), rgba(13,15,18,0.98));
        box-shadow: 0 18px 48px rgba(2,6,23,0.8); color:#e8f1ff; font-family: Inter, system-ui;
        transform: translateY(8px); opacity:0; transition: all .22s cubic-bezier(.2,.9,.3,1);
      `;
      setTimeout(() => { card.style.transform = 'translateY(0)'; card.style.opacity = '1'; }, 10);
      wrap.appendChild(backdrop); wrap.appendChild(card);
      document.body.appendChild(wrap);
      backdrop.addEventListener('click', () => { wrap.remove(); });
      return card;
    }

    function createPanelBottomLeft() {
      const existing = document.getElementById("__nt_poll_panel");
      if (existing) return existing.querySelector("div") || existing;
      const wrap = document.createElement("div");
      wrap.id = "__nt_poll_panel";
      wrap.style = `
        position:fixed;
        left:12px;
        bottom:12px;
        z-index:2147483647;
        pointer-events:auto;
        font-family:Inter,system-ui;
      `;
      const card = document.createElement("div");
      card.style = `
        min-width:260px;
        max-width:360px;
        border-radius:10px;
        padding:10px;
        background: linear-gradient(180deg, rgba(18,20,24,0.92), rgba(13,15,18,0.92));
        color:#e8f1ff;
        box-shadow:0 8px 28px rgba(0,0,0,0.6);
        font-size:13px;
      `;
      wrap.appendChild(card);
      document.body.appendChild(wrap);
      return card;
    }

    function flashMessage(text, color = '#1e90ff') {
      const d = document.createElement('div');
      d.textContent = text;
      d.style = `
        position:fixed; right:20px; bottom:22px; background:${color}; color:white; padding:8px 12px;
        border-radius:8px; z-index:2147483647; font-weight:600; box-shadow:0 8px 30px rgba(2,6,23,0.6);
      `;
      document.body.appendChild(d);
      setTimeout(() => d.style.opacity = '0', 1800);
      setTimeout(() => d.remove(), 2300);
    }

    /* ========= Poll modal & logic (bottom-left panel) ========= */
    window._nt_active_poll_observer = window._nt_active_poll_observer || null;
    window._nt_poll_choice = window._nt_poll_choice || null;
    window._nt_poll_start = window._nt_poll_start || null;

    function openPollModal() {
      const shell = createPanelBottomLeft();
      shell.innerHTML = '';

      const title = document.createElement('div'); title.style = 'font-size:15px;font-weight:700;margin-bottom:8px'; title.textContent = 'Pre-answer Poll';
      const desc = document.createElement('div'); desc.style='color:rgba(255,255,255,0.72);font-size:13px;margin-bottom:10px'; desc.textContent='Choose option number to pre-select when poll appears.';
      const inputRow = document.createElement('div'); inputRow.style='display:flex;gap:8px;margin-bottom:10px';
      const input = document.createElement('input'); input.type='number'; input.min='1'; input.placeholder='Option #'; input.style='flex:1;padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,0.04);background:transparent;color:#eaf6ff;';
      input.value = window._nt_poll_choice || '';
      // ensure enabled and focused
      setTimeout(()=>{ try{ input.removeAttribute('disabled'); input.focus(); input.select(); }catch(e){} }, 10);

      const startBtn = document.createElement('button'); startBtn.textContent='Start Waiting'; startBtn.style='padding:8px;border-radius:8px;background:linear-gradient(90deg,#7c5cff,#6ee7b7);color:#071023;font-weight:700;border:0;cursor:pointer;';
      const stopBtn = document.createElement('button'); stopBtn.textContent='Stop Waiting'; stopBtn.style='padding:8px;border-radius:8px;background:#2b2f34;color:#fff;border:0;cursor:pointer;margin-left:6px';

      inputRow.appendChild(input); inputRow.appendChild(startBtn); inputRow.appendChild(stopBtn);

      const info = document.createElement('div'); info.style='font-size:12px;color:var(--muted);margin-bottom:6px'; info.textContent='Press P to cancel previous pre-poll and start a new one.';

      shell.appendChild(title); shell.appendChild(desc); shell.appendChild(inputRow); shell.appendChild(info);

      // Up/down inside input to change option and prevent global arrow handling
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault(); e.stopPropagation();
          const cur = parseInt(input.value) || 0;
          input.value = (e.key === 'ArrowUp') ? Math.max(1, cur + 1) : Math.max(1, cur - 1);
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault(); e.stopPropagation();
          const val = parseInt(input.value);
          if (val && val > 0) startBtn.click();
          else stopBtn.click();
        }
      });

      // Start waiting: set observer to detect 'Attempt' button then answer
      startBtn.addEventListener('click', () => {
        const val = parseInt(input.value);
        if (!val || val < 1) {
          input.style.outline = '2px solid rgba(255,80,80,0.18)'; return;
        }
        if (window._nt_active_poll_observer) {
          window._nt_active_poll_observer.disconnect();
          window._nt_active_poll_observer = null;
          flashMessage('Previous pre-poll cancelled', '#e74c3c');
        }
        window._nt_poll_choice = val;
        window._nt_poll_start = Date.now();

        const obs = new MutationObserver(() => {
          const attemptBtn = Array.from(document.querySelectorAll('button'))
            .find(b => b.innerText && b.innerText.trim().toLowerCase() === 'attempt');
          if (attemptBtn) {
            attemptBtn.click();
            setTimeout(() => {
              const options = Array.from(document.querySelectorAll('input[type="radio"], .poll-option, .option-item'));
              if (options[window._nt_poll_choice - 1]) {
                try { options[window._nt_poll_choice - 1].click(); } catch(e){}
              }
              const submitBtn = Array.from(document.querySelectorAll('button'))
                .find(b => b.innerText && b.innerText.trim().toLowerCase() === 'submit');
              if (submitBtn) {
                submitBtn.click();
                const elapsed = ((Date.now() - window._nt_poll_start)/1000).toFixed(2);
                flashMessage(`Pre-poll answered in ${elapsed}s`, '#2ecc71');
              }
            }, 350);
            obs.disconnect();
            window._nt_active_poll_observer = null;
            const wrap = document.getElementById('__nt_poll_panel'); if (wrap) wrap.remove();
          }
        });
        obs.observe(document.body, { childList:true, subtree:true });
        window._nt_active_poll_observer = obs;
        flashMessage(`Waiting for poll – option ${val}`, '#f39c12');
        const wrap = document.getElementById('__nt_poll_panel'); if (wrap) wrap.remove();
      });

      // Stop waiting: disconnect observer
      stopBtn.addEventListener('click', () => {
        if (window._nt_active_poll_observer) {
          window._nt_active_poll_observer.disconnect();
          window._nt_active_poll_observer = null;
          flashMessage('Pre-poll stopped', '#e74c3c');
        } else {
          flashMessage('No active pre-poll', '#f39c12');
        }
        const wrap = document.getElementById('__nt_poll_panel'); if (wrap) wrap.remove();
      });
    }

    /* ========= Auto-message modal & logic ========= */
    window._nt_spam_interval = window._nt_spam_interval || null;
    window._nt_auto_interval_default = window._nt_auto_interval_default || '0.1';
    window._nt_last_auto_msg = window._nt_last_auto_msg || '';

    function openAutoMessageModal() {
      const shell = createModalShell();
      shell.innerHTML = '';

      const title = document.createElement('div'); title.style='font-size:16px;font-weight:700;margin-bottom:8px'; title.textContent='Auto-message';
      const desc = document.createElement('div'); desc.style='color:rgba(255,255,255,0.72);font-size:13px;margin-bottom:10px'; desc.textContent='Enter message and interval (seconds). Press Enter to Start/Stop. Shift+Enter = newline.';

      const msgBox = document.createElement('textarea');
      msgBox.placeholder = 'Message to send...';
      msgBox.style = 'width:100%;height:80px;border-radius:10px;padding:10px;border:1px solid rgba(255,255,255,0.04);background:transparent;color:#eaf6ff;margin-bottom:10px';
      msgBox.value = window._nt_last_auto_msg || '';

      const row = document.createElement('div'); row.style = 'display:flex;gap:8px;align-items:center;margin-bottom:12px';

      const timeInput = document.createElement('input');
      timeInput.type = 'number';
      timeInput.step = '0.1'; timeInput.min = '0.05';
      timeInput.value = (window._nt_auto_interval_default || '0.1');
      timeInput.style = 'padding:8px;border-radius:8px;background:transparent;border:1px solid rgba(255,255,255,0.04);color:#eaf6ff;width:80px';

      const startBtn = document.createElement('button'); startBtn.textContent='Start'; startBtn.style='padding:8px 12px;border-radius:8px;background:linear-gradient(90deg,#6ee7b7,#7c5cff);border:0;color:#071023;font-weight:700;cursor:pointer';
      const stopBtn = document.createElement('button'); stopBtn.textContent='Stop'; stopBtn.style='padding:8px 10px;border-radius:8px;background:#2b2f34;color:#fff;border:0;cursor:pointer;margin-left:6px';

      row.appendChild(timeInput); row.appendChild(startBtn); row.appendChild(stopBtn);
      shell.appendChild(title); shell.appendChild(desc); shell.appendChild(msgBox); shell.appendChild(row);

      // focus textarea
      setTimeout(()=>{ try{ msgBox.removeAttribute('disabled'); msgBox.focus(); msgBox.select(); }catch(e){} }, 12);

      startBtn.addEventListener('click', () => {
        const message = msgBox.value && msgBox.value.trim();
        if (!message) { msgBox.style.outline = '2px solid rgba(255,80,80,0.18)'; return; }
        window._nt_last_auto_msg = message;
        let intervalSec = parseFloat(timeInput.value);
        if (!intervalSec || intervalSec < 0.05) intervalSec = parseFloat(window._nt_auto_interval_default || '0.1');
        if (window._nt_spam_interval) clearInterval(window._nt_spam_interval);
        sendChatMessage(message);
        window._nt_spam_interval = setInterval(()=> sendChatMessage(message), Math.max(50, intervalSec*1000));
        flashMessage(`Auto-message started every ${intervalSec}s`, '#2ecc71');
        const wrap = document.getElementById('__nt_modal'); if (wrap) wrap.remove();
      });

      stopBtn.addEventListener('click', () => {
        if (window._nt_spam_interval) {
          clearInterval(window._nt_spam_interval);
          window._nt_spam_interval = null;
          flashMessage('Auto-message stopped', '#e74c3c');
        } else {
          flashMessage('No auto-message running', '#f39c12');
        }
        const wrap = document.getElementById('__nt_modal'); if (wrap) wrap.remove();
      });

      // Enter in textarea -> Start if text, else Stop
      msgBox.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault(); e.stopPropagation();
          const message = (msgBox.value || '').trim();
          if (message.length > 0) startBtn.click(); else stopBtn.click();
        }
      });
    }

    /* ---------- send message helper (heuristic) ---------- */
    function sendChatMessage(text) {
      const input =
        document.querySelector("input.input_field") ||
        document.querySelector("textarea") ||
        document.querySelector("[data-chat-input='true']") ||
        document.querySelector("[contenteditable='true']");
    
      // find send button: either classic send OR your new UI
      const sendBtn =
        document.querySelector('button[type="submit"]') || // your new button
        Array.from(document.querySelectorAll("button")).find((b) => {
          const t = b.innerText && b.innerText.trim().toLowerCase();
          return ["send", "submit", "send message"].includes(t) || b.querySelector("svg");
        });
    
      if (input) {
        // set value
        if (input.isContentEditable) {
          input.textContent = text;
          const ev = new InputEvent("input", { bubbles: true });
          input.dispatchEvent(ev);
        } else {
          input.value = text;
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
    
        // *** actually click send button ***
        if (sendBtn) {
          sendBtn.click(); // click the new button
        } else {
          // fallback: Enter key
          const enter = new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            key: "Enter",
            code: "Enter",
          });
          input.dispatchEvent(enter);
        }
      }
    }


    /* expose modals */
    window.openPollModal = openPollModal;
    window.openAutoMessageModal = openAutoMessageModal;

    /* ---------- keyboard handling (global) ---------- */
    // arrow guard to avoid site handlers while typing
    if (!window._nt_arrow_guard) {
      const guard = (e) => {
        if (!isTypingInChat()) return;
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.stopImmediatePropagation();
          e.stopPropagation();
        }
      };
      document.addEventListener("keydown", guard, true);
      document.addEventListener("keyup", guard, true);
      window._nt_arrow_guard = true;
    }

    // actual key handler
    window.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      // when typing in chat, allow only Escape to blur
      if (isTypingInChat()) {
        if (e.key === "Escape" && document.activeElement === getChatInput()) {
          getChatInput().blur();
        }
        return;
      }

      const video = document.querySelector("video.shaka-video") || document.querySelector("video");

      // Speed keys
      if (e.key === "1") {
          const v = document.querySelector("video.shaka-video") || document.querySelector("video");
          if (v) {
              v.playbackRate = 1.0;
              if (window.updateHighlight) updateHighlight(1.0);
              if (window.syncPlaybackRateUI) window.syncPlaybackRateUI('1x');
          }
          e.preventDefault();
          return;
      }
    if (e.key === "2") {
      const v = document.querySelector("video.shaka-video") || document.querySelector("video");
      if (v) {
        v.playbackRate = 2.0;
        if (window.updateHighlight) updateHighlight(2.0);
        if (window.syncPlaybackRateUI) window.syncPlaybackRateUI('2x');
      }
      e.preventDefault();
      return;
    }
    if (e.key === "3") {
      const v = document.querySelector("video.shaka-video") || document.querySelector("video");
      if (v) {
        v.playbackRate = 1.5;
        if (window.updateHighlight) updateHighlight(1.5);
        if (window.syncPlaybackRateUI) window.syncPlaybackRateUI('1.5x');
      }
      e.preventDefault();
      return;
    }


      // Space toggle play/pause
      if ((e.code === "Space" || e.key === "k") && video) { e.preventDefault(); video.paused ? video.play() : video.pause(); return; }

      // T toggle clock overlay
      if (e.key.toLowerCase() === "t") {
        e.preventDefault();
        const clk = document.getElementById("nt-clock-overlay");
        if (clk) { clk.remove(); window._nt_clock_enabled = false; if (window._nt_clock_interval) { clearInterval(window._nt_clock_interval); window._nt_clock_interval = null; } }
        else { window._nt_clock_enabled = true; const v = document.querySelector("video.shaka-video") || document.querySelector("video"); if (v && window.addClock) addClock(v); }
        return;
      }

      // D toggle speed overlay visibility
      if (e.key.toLowerCase() === "d") {
        e.preventDefault();
        const speed = document.getElementById("nt-speed-control");
        if (speed) {
          // toggle via class to avoid mutation observer re-adding visual glitch
          if (speed.classList.contains("nt-hidden")) { speed.classList.remove("nt-hidden"); speed.style.display = "flex"; }
          else { speed.classList.add("nt-hidden"); speed.style.display = "none"; }
        } else {
          const v = document.querySelector("video.shaka-video") || document.querySelector("video");
          if (v && window.createUI) createUI(v);
        }
        return;
      }

      // F fullscreen toggle
      if (e.key.toLowerCase() === "f" && video) {
        e.preventDefault();
        const container = video.closest('.video-js') || video.closest('#videoContainer') || video;
        if (!document.fullscreenElement) { container.requestFullscreen?.(); container.webkitRequestFullscreen?.(); }
        else { document.exitFullscreen?.(); document.webkitExitFullscreen?.(); }
        return;
      }

      // Arrow skip
      if (video && (e.key === "ArrowRight" || e.key === "l")) { e.preventDefault(); video.currentTime += 10; return; }
      if (video && (e.key === "ArrowLeft" || e.key === "j"))  { e.preventDefault(); video.currentTime -= 10; return; }

      // C focus chat (you changed earlier from T to C)
      if (e.key.toLowerCase() === "c") {
        const chat = getChatInput();
        if (chat) { e.preventDefault(); chat.focus(); return; }
      }

      // M mute/unmute
      if (e.key.toLowerCase() === "m") {
        e.preventDefault();
        const v = document.querySelector("video.shaka-video") || document.querySelector("video");
        if (v) {
          v.muted = !v.muted;
          const msg = v.muted ? "Video Muted" : "Video Unmuted";
          const d = document.createElement('div'); d.textContent = msg;
          d.style = `position:fixed; right:20px; bottom:22px; background:#1e90ff; color:white; padding:8px 12px; border-radius:8px; z-index:2147483647; font-weight:600; box-shadow:0 8px 30px rgba(2,6,23,0.6);`;
          document.body.appendChild(d);
          setTimeout(()=> d.style.opacity='0', 1400);
          setTimeout(()=> d.remove(), 1900);
        }
        return;
      }

      // S open auto-message modal
      if (e.key.toLowerCase() === "s") { e.preventDefault(); if (window.openAutoMessageModal) openAutoMessageModal(); return; }

      // P open poll modal
      if (e.key.toLowerCase() === "p") { e.preventDefault(); if (window.openPollModal) openPollModal(); return; }
    });
  });
});

/* ---------- Unlock chat cooldown ---------- */
cooldownBtn.addEventListener("click", () => {
  execOnPage(() => {
    const tryUnlock = () => {
      const input = document.querySelector("input.input_field[disabled]") || document.querySelector("textarea[disabled]");
      if (input) input.removeAttribute("disabled");
      const sendBtn = Array.from(document.querySelectorAll("button")).find((b) => (b.innerText || "").trim().toLowerCase() === "send");
      if (sendBtn && sendBtn.disabled) sendBtn.disabled = false;
    };
    const obs = new MutationObserver(tryUnlock);
    obs.observe(document.body, { childList: true, subtree: true });
    tryUnlock();
  });
});

/* ---------- Enable Copy/Paste ---------- */
pasteBtn.addEventListener("click", () => {
  execOnPage(() => {
    const input = document.querySelector("input.input_field") || document.querySelector("textarea") || document.activeElement;
    if (input) {
      input.removeAttribute("onpaste"); input.removeAttribute("oncopy"); input.onpaste = null; input.oncopy = null;
      const allow = (e) => { e.stopImmediatePropagation(); return true; };
      document.addEventListener("paste", allow, true);
      document.addEventListener("copy", allow, true);
    }
  });
});

/* ---------- Poll button in popup (mirrors P key) ---------- */
pollBtn.addEventListener("click", () => {
  execOnPage(() => {
    if (window.openPollModal) window.openPollModal();
  });
});

/* ---------- Master Button (enables main features) ---------- */
masterBtn.addEventListener("click", () => {
  unlockBtn.click();
  shortcutsBtn.click();
  cooldownBtn.click();
  pasteBtn.click();
  // pollBtn.click(); // optional
});

/* End of popup.js */
