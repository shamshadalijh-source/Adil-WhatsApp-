/* ==========================================================================
   NEXUS AI — script.js (updated for live Gemini backend)
   ========================================================================== */

(() => {
  "use strict";

  /* ---------- 1. CONFIG ---------- */
  // If you serve the HTML from the same origin as the API, leave this empty.
  // Otherwise set it to your deployed API origin, e.g. "https://your-app.replit.app"
  const API_BASE = "";
  const CHAT_ENDPOINT = `${API_BASE}/api/chat`;

  /* ---------- 2. DOM REFERENCES ---------- */
  const chatContainer = document.getElementById("chat-container");
  const composer      = document.getElementById("composer");
  const messageInput  = document.getElementById("message-input");
  const sendBtn       = document.getElementById("send-btn");
  const micBtn        = document.getElementById("mic-btn");
  const settingsBtn   = document.getElementById("settings-btn");

  /* ---------- 3. STATE ---------- */
  const state = {
    isThinking:  false,
    isRecording: false,
    recognition: null,                 // SpeechRecognition instance (lazy)
    history:     [],                   // [{ role: "user"|"assistant", content }]
  };

  /* ---------- 4. ICON BOOTSTRAP ---------- */
  function refreshIcons() {
    if (window.feather && typeof window.feather.replace === "function") {
      window.feather.replace({ "stroke-width": 2 });
    }
  }

  /* ---------- 5. MESSAGE RENDERING ---------- */
  function appendMessage(role, text) {
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${role}`;
    bubble.textContent = text;
    chatContainer.appendChild(bubble);
    scrollToBottom();
    return bubble;
  }

  function showThinkingIndicator() {
    const bubble = document.createElement("div");
    bubble.className = "chat-bubble ai is-thinking";
    bubble.setAttribute("aria-label", "Nexus is thinking");
    bubble.innerHTML = `<span class="dot"></span><span class="dot"></span><span class="dot"></span>`;
    chatContainer.appendChild(bubble);
    scrollToBottom();
    return bubble;
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: "smooth" });
    });
  }

  function updateSendButtonState() {
    const hasText = messageInput.value.trim().length > 0;
    sendBtn.disabled = !hasText || state.isThinking;
  }

  /* ---------- 6. CORE: SEND A MESSAGE ---------- */
  async function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed || state.isThinking) return;

    appendMessage("user", trimmed);
    messageInput.value = "";
    updateSendButtonState();

    state.isThinking = true;
    updateSendButtonState();
    const thinkingBubble = showThinkingIndicator();

    try {
      const reply = await getAIReply(trimmed);
      thinkingBubble.remove();
      appendMessage("ai", reply);

      // Persist to local history so follow-ups have context
      state.history.push({ role: "user",      content: trimmed });
      state.history.push({ role: "assistant", content: reply   });

      // Cap history at the last 20 turns to stay snappy
      if (state.history.length > 40) {
        state.history.splice(0, state.history.length - 40);
      }
    } catch (err) {
      thinkingBubble.remove();
      appendMessage("ai", `Something went wrong: ${err.message}`);
      console.error("AI request failed:", err);
    } finally {
      state.isThinking = false;
      updateSendButtonState();
      messageInput.focus();
    }
  }

  /* ---------- 7. AI ADAPTER — calls /api/chat (Gemini-backed) ---------- */
  async function getAIReply(userMessage) {
    const res = await fetch(CHAT_ENDPOINT, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        message: userMessage,
        history: state.history,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Request failed (${res.status}) ${text}`);
    }

    const data = await res.json();
    if (!data || typeof data.reply !== "string") {
      throw new Error("Malformed AI response");
    }
    return data.reply;
  }

  /* ---------- 8. VOICE INPUT (Web Speech API) ---------- */
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
    micBtn.setAttribute("aria-label", isRecording ? "Stop voice input" : "Start voice input");
  }

  async function ensureMicPermission() {
    // Prompt for mic permission up front — improves UX on Android Chrome.
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      return true;
    } catch {
      return false;
    }
  }

  async function toggleVoiceInput() {
    if (!state.recognition) {
      state.recognition = getSpeechRecognition();
      if (!state.recognition) {
        appendMessage("ai", "Voice input isn't supported in this browser. Try Chrome on Android or desktop.");
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

        // Auto-send when the final result arrives
        const last = event.results[event.results.length - 1];
        if (last.isFinal) {
          setTimeout(() => sendMessage(messageInput.value), 120);
        }
      };

      r.onerror = (event) => {
        console.warn("Speech recognition error:", event.error);
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          appendMessage("ai", "Microphone access was denied. Please enable it in your browser settings.");
        }
        setRecordingUI(false);
      };

      r.onend = () => setRecordingUI(false);
    }

    if (state.isRecording) {
      state.recognition.stop();
      return;
    }

    const allowed = await ensureMicPermission();
    if (!allowed) {
      appendMessage("ai", "I need microphone permission to listen. Please allow it and try again.");
      return;
    }

    try {
      state.recognition.start();
    } catch (err) {
      console.warn("Could not start recognition:", err);
      setRecordingUI(false);
    }
  }

  /* ---------- 9. SETTINGS BUTTON (placeholder) ---------- */
  function openSettings() {
    appendMessage("ai", "Settings panel coming soon.");
  }

  /* ---------- 10. EVENT WIRING ---------- */
  composer.addEventListener("submit", (e) => {
    e.preventDefault();
    sendMessage(messageInput.value);
  });

  messageInput.addEventListener("input", updateSendButtonState);

  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(messageInput.value);
    }
  });

  micBtn.addEventListener("click", toggleVoiceInput);
  settingsBtn.addEventListener("click", openSettings);

  /* ---------- 11. BOOT ---------- */
  function boot() {
    refreshIcons();
    updateSendButtonState();
    appendMessage("ai", "Hey, I'm Nexus AI. Ask me anything, or tap the mic to speak.");
    if (window.matchMedia("(hover: hover)").matches) messageInput.focus();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
