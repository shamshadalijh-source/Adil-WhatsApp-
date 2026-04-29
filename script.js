/* ==========================================================================
   NEXUS AI — script.js
   Composer logic, voice input (Web Speech API), AI typing indicator,
   auto-scroll, and feather icon bootstrap.
   ========================================================================== */

(() => {
  "use strict";

  /* ---------- 1. DOM REFERENCES ---------- */
  const chatContainer = document.getElementById("chat-container");
  const composer      = document.getElementById("composer");
  const messageInput  = document.getElementById("message-input");
  const sendBtn       = document.getElementById("send-btn");
  const micBtn        = document.getElementById("mic-btn");
  const settingsBtn   = document.getElementById("settings-btn");

  /* ---------- 2. STATE ---------- */
  const state = {
    isThinking:  false,
    isRecording: false,
    recognition: null,   // SpeechRecognition instance (lazy-init)
  };

  /* ---------- 3. ICON BOOTSTRAP ---------- */
  // Feather replaces all <i data-feather="..."> tags with inline SVGs.
  function refreshIcons() {
    if (window.feather && typeof window.feather.replace === "function") {
      window.feather.replace({ "stroke-width": 2 });
    }
  }

  /* ---------- 4. MESSAGE RENDERING ---------- */

  /**
   * Append a chat bubble to the conversation.
   * @param {"user"|"ai"} role
   * @param {string}      text
   * @returns {HTMLElement} the appended bubble
   */
  function appendMessage(role, text) {
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${role}`;
    bubble.textContent = text;
    chatContainer.appendChild(bubble);
    scrollToBottom();
    return bubble;
  }

  /**
   * Show the animated "AI is thinking" pulse bubble.
   * @returns {HTMLElement} the thinking bubble (so we can replace it later)
   */
  function showThinkingIndicator() {
    const bubble = document.createElement("div");
    bubble.className = "chat-bubble ai is-thinking";
    bubble.setAttribute("aria-label", "Nexus is thinking");
    bubble.innerHTML = `
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="dot"></span>
    `;
    chatContainer.appendChild(bubble);
    scrollToBottom();
    return bubble;
  }

  /* ---------- 5. SCROLL HELPERS ---------- */
  function scrollToBottom() {
    // requestAnimationFrame ensures we scroll after the new node is painted.
    requestAnimationFrame(() => {
      chatContainer.scrollTo({
        top: chatContainer.scrollHeight,
        behavior: "smooth",
      });
    });
  }

  /* ---------- 6. SEND BUTTON ENABLED STATE ---------- */
  function updateSendButtonState() {
    const hasText = messageInput.value.trim().length > 0;
    sendBtn.disabled = !hasText || state.isThinking;
  }

  /* ---------- 7. CORE: SEND A MESSAGE ---------- */
  async function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed || state.isThinking) return;

    // 1. Render the user's bubble immediately
    appendMessage("user", trimmed);
    messageInput.value = "";
    updateSendButtonState();

    // 2. Show thinking indicator
    state.isThinking = true;
    updateSendButtonState();
    const thinkingBubble = showThinkingIndicator();

    // 3. Get response from AI
    try {
      const reply = await getAIReply(trimmed);
      thinkingBubble.remove();
      appendMessage("ai", reply);
    } catch (err) {
      thinkingBubble.remove();
      appendMessage("ai", "Something went wrong. Please try again.");
      console.error("AI request failed:", err);
    } finally {
      state.isThinking = false;
      updateSendButtonState();
      messageInput.focus();
    }
  }

  /* ---------- 8. AI ADAPTER ---------- */

  /**
   * Calls the backend chat endpoint and returns the assistant reply.
   * Replace the URL below with your actual API route.
   * The default implementation is a friendly local stub so the UI works
   * out of the box without a backend.
   *
   * @param {string} userMessage
   * @returns {Promise<string>}
   */
  async function getAIReply(userMessage) {
    // -------- Real backend call (uncomment to use) --------
    // const res = await fetch("/api/chat", {
    //   method:  "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body:    JSON.stringify({ message: userMessage }),
    // });
    // if (!res.ok) throw new Error(`Request failed (${res.status})`);
    // const data = await res.json();
    // return data.reply;

    // -------- Local stub (works without a backend) --------
    await new Promise(r => setTimeout(r, 900 + Math.random() * 700));
    return `You said: "${userMessage}". I'm Nexus AI — connect a backend to /api/chat to enable real responses.`;
  }

  /* ---------- 9. VOICE INPUT (Web Speech API) ---------- */

  function getSpeechRecognition() {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return null;

    const r = new Ctor();
    r.lang            = navigator.language || "en-US";
    r.interimResults  = true;
    r.continuous      = false;
    r.maxAlternatives = 1;
    return r;
  }

  function setRecordingUI(isRecording) {
    state.isRecording = isRecording;
    micBtn.classList.toggle("is-recording", isRecording);
    micBtn.setAttribute(
      "aria-label",
      isRecording ? "Stop voice input" : "Start voice input"
    );
  }

  function toggleVoiceInput() {
    // Lazy-init: build the recognizer the first time the mic is tapped.
    if (!state.recognition) {
      state.recognition = getSpeechRecognition();
      if (!state.recognition) {
        appendMessage(
          "ai",
          "Voice input isn't supported in this browser. Try Chrome on Android."
        );
        return;
      }

      const r = state.recognition;
      let baseValue = "";

      r.onstart = () => {
        baseValue = messageInput.value ? messageInput.value.trimEnd() + " " : "";
        setRecordingUI(true);
      };

      r.onresult = (event) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        messageInput.value = baseValue + transcript;
        updateSendButtonState();
      };

      r.onerror = (event) => {
        console.warn("Speech recognition error:", event.error);
        setRecordingUI(false);
      };

      r.onend = () => {
        setRecordingUI(false);
      };
    }

    if (state.isRecording) {
      state.recognition.stop();
    } else {
      try {
        state.recognition.start();
      } catch (err) {
        // Calling start() while already started throws; safely reset.
        console.warn("Could not start recognition:", err);
        setRecordingUI(false);
      }
    }
  }

  /* ---------- 10. SETTINGS BUTTON (placeholder) ---------- */
  function openSettings() {
    // Hook this up to your settings sheet / route.
    appendMessage("ai", "Settings panel coming soon.");
  }

  /* ---------- 11. EVENT WIRING ---------- */
  composer.addEventListener("submit", (e) => {
    e.preventDefault();
    sendMessage(messageInput.value);
  });

  messageInput.addEventListener("input", updateSendButtonState);

  // Send on Enter (without Shift) for desktop keyboards
  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(messageInput.value);
    }
  });

  micBtn.addEventListener("click", toggleVoiceInput);
  settingsBtn.addEventListener("click", openSettings);

  /* ---------- 12. INITIAL BOOT ---------- */
  function boot() {
    refreshIcons();
    updateSendButtonState();

    // Greet the user with an opening AI bubble
    appendMessage(
      "ai",
      "Hey, I'm Nexus AI. Ask me anything, or tap the mic to speak."
    );

    // Focus the input on desktop only — avoids forcing the keyboard open on mobile
    if (window.matchMedia("(hover: hover)").matches) {
      messageInput.focus();
    }
  }

  // Wait for Feather (defer) plus DOM readiness
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
