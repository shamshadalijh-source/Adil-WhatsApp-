/* ==========================================================================
   script.js — Nexus AI (Pro Multimodal)
   - Streaming SSE chat (gemini-2.5-flash backend, last-10-message memory)
   - Image generation via /api/chat (Pollinations)
   - Web Speech API STT (mic) + Web Speech API TTS toggle
   - Markdown rendering + Prism syntax-highlighted, copyable code blocks
   - Skeleton "thinking" loader → smooth word-by-word streaming
   ========================================================================== */
(() => {
  "use strict";

  /* ---------- 1. CONFIG ---------- */
  const API_BASE      = "";
  const CHAT_ENDPOINT = `${API_BASE}/api/chat`;

  /* ---------- 2. DOM ---------- */
  const chatContainer = document.getElementById("chat-container");
  const composer      = document.getElementById("composer");
  const messageInput  = document.getElementById("message-input");
  const sendBtn       = document.getElementById("send-btn");
  const micBtn        = document.getElementById("mic-btn");
  const ttsBtn        = document.getElementById("tts-btn");
  const settingsBtn   = document.getElementById("settings-btn");

  /* ---------- 3. STATE ---------- */
  const state = {
    isThinking:  false,
    isRecording: false,
    ttsEnabled:  false,
    recognition: null,
    history:     [],   // { role:"user"|"assistant", content }
  };

  /* ---------- 4. ICONS ---------- */
  function refreshIcons() {
    if (window.feather && typeof window.feather.replace === "function") {
      window.feather.replace({ "stroke-width": 2 });
    }
  }

  /* ---------- 5. MARKDOWN + CODE ARTIFACTS ---------- */
  function configureMarked() {
    if (!window.marked) return;
    window.marked.setOptions({
      gfm:        true,
      breaks:     true,
      mangle:     false,
      headerIds:  false,
    });
  }

  function renderMarkdown(md) {
    if (!window.marked || !window.DOMPurify) {
      // Fallback to plain-text rendering if libs not yet loaded
      const div = document.createElement("div");
      div.textContent = md;
      return div.innerHTML;
    }
    const raw  = window.marked.parse(md);
    return window.DOMPurify.sanitize(raw, {
      ADD_ATTR: ["target", "rel"],
    });
  }

  /** Wrap each <pre><code class="language-x"> in a copyable, highlighted artifact. */
  function decorateCodeBlocks(root) {
    root.querySelectorAll("pre > code").forEach((codeEl) => {
      const pre = codeEl.parentElement;
      if (!pre || pre.parentElement?.classList.contains("code-artifact")) return;

      const lang = (codeEl.className.match(/language-([\w-]+)/) || [, "text"])[1];

      const wrap = document.createElement("div");
      wrap.className = "code-artifact";

      const head = document.createElement("div");
      head.className = "code-head";
      const label = document.createElement("span");
      label.textContent = lang;
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "copy-btn";
      copyBtn.textContent = "Copy";
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(codeEl.textContent || "");
          copyBtn.textContent = "Copied!";
          copyBtn.classList.add("copied");
          setTimeout(() => {
            copyBtn.textContent = "Copy";
            copyBtn.classList.remove("copied");
          }, 1400);
        } catch {
          copyBtn.textContent = "Failed";
        }
      });
      head.append(label, copyBtn);

      pre.parentNode.insertBefore(wrap, pre);
      wrap.append(head, pre);

      if (window.Prism) window.Prism.highlightElement(codeEl);
    });
  }

  /* ---------- 6. BUBBLES ---------- */
  function appendUserBubble(text) {
    const b = document.createElement("div");
    b.className = "chat-bubble user";
    b.textContent = text;
    chatContainer.appendChild(b);
    scrollToBottom();
    return b;
  }

  function appendAIBubble() {
    const b = document.createElement("div");
    b.className = "chat-bubble ai";
    chatContainer.appendChild(b);
    scrollToBottom();
    return b;
  }

  function showSkeleton() {
    const b = document.createElement("div");
    b.className = "chat-bubble ai is-thinking";
    b.setAttribute("aria-label", "Nexus is thinking");
    b.innerHTML = `
      <div class="skeleton-line s-1"></div>
      <div class="skeleton-line s-2"></div>
      <div class="skeleton-line s-3"></div>
    `;
    chatContainer.appendChild(b);
    scrollToBottom();
    return b;
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: "smooth" });
    });
  }

  function updateSendButtonState() {
    const has = messageInput.value.trim().length > 0;
    sendBtn.disabled = !has || state.isThinking;
  }

  /* ---------- 7. SEND ---------- */
  async function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed || state.isThinking) return;

    appendUserBubble(trimmed);
    messageInput.value = "";
    updateSendButtonState();

    state.isThinking = true;
    updateSendButtonState();

    const skeleton = showSkeleton();
    let aiBubble = null;
    let buffer   = "";
    let imageUrl = null;

    try {
      await streamChat(trimmed, {
        onText(chunk) {
          if (!aiBubble) {
            skeleton.remove();
            aiBubble = appendAIBubble();
          }
          buffer += chunk;
          // Live render with markdown — keeps formatting consistent during stream
          aiBubble.innerHTML = renderMarkdown(buffer);
          scrollToBottom();
        },
        onImage({ url, prompt }) {
          if (!aiBubble) {
            skeleton.remove();
            aiBubble = appendAIBubble();
          }
          imageUrl = url;
          aiBubble.innerHTML =
            renderMarkdown(buffer) +
            `<img class="ai-image" src="${url}" alt="${escapeAttr(prompt)}" loading="lazy" />` +
            `<span class="image-caption">${escapeHtml(prompt)}</span>`;
          scrollToBottom();
        },
      });

      if (!aiBubble) {
        skeleton.remove();
        aiBubble = appendAIBubble();
        aiBubble.textContent = "(no reply)";
      } else {
        // Final pass: highlight & wire copy buttons on any code blocks
        decorateCodeBlocks(aiBubble);
        // Speak the reply if TTS is on (skip if it's an image-only reply)
        if (state.ttsEnabled && buffer.trim()) speak(stripMarkdown(buffer));
      }

      // Persist conversation memory (cap at last 20 entries client-side too)
      state.history.push({ role: "user",      content: trimmed });
      state.history.push({ role: "assistant", content: buffer || (imageUrl ? "[image]" : "") });
      if (state.history.length > 20) state.history.splice(0, state.history.length - 20);
    } catch (err) {
      skeleton.remove();
      const errBubble = appendAIBubble();
      errBubble.textContent = `Something went wrong: ${err.message}`;
      console.error(err);
    } finally {
      state.isThinking = false;
      updateSendButtonState();
      messageInput.focus();
    }
  }

  /* ---------- 8. SSE STREAMING CLIENT ---------- */
  async function streamChat(message, { onText, onImage }) {
    const res = await fetch(CHAT_ENDPOINT, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
      body:    JSON.stringify({ message, history: state.history }),
    });
    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => "");
      throw new Error(`Request failed (${res.status}) ${t}`);
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buf = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      // Process complete SSE events (separated by blank line)
      let sep;
      while ((sep = buf.indexOf("\n\n")) !== -1) {
        const rawEvent = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        const evt = parseSSE(rawEvent);
        if (!evt) continue;
        if (evt.event === "text"  && evt.data?.chunk) onText(evt.data.chunk);
        if (evt.event === "image" && evt.data?.url)   onImage(evt.data);
        if (evt.event === "error") throw new Error(evt.data?.message || "AI error");
        if (evt.event === "done")  return;
      }
    }
  }

  function parseSSE(block) {
    let event = "message", dataLines = [];
    for (const line of block.split("\n")) {
      if (line.startsWith(":")) continue;             // comment / keep-alive
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) return null;
    const dataStr = dataLines.join("\n");
    try { return { event, data: JSON.parse(dataStr) }; }
    catch { return { event, data: dataStr }; }
  }

  /* ---------- 9. VOICE INPUT (STT) ---------- */
  function getRecognition() {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return null;
    const r = new Ctor();
    r.lang            = navigator.language || "en-US";
    r.interimResults  = true;
    r.continuous      = false;
    r.maxAlternatives = 1;
    return r;
  }

  function setRecordingUI(on) {
    state.isRecording = on;
    micBtn.classList.toggle("is-recording", on);
    micBtn.setAttribute("aria-label", on ? "Stop voice input" : "Start voice input");
  }

  async function ensureMicPermission() {
    if (!navigator.mediaDevices?.getUserMedia) return true;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      return true;
    } catch { return false; }
  }

  async function toggleVoiceInput() {
    if (!state.recognition) {
      state.recognition = getRecognition();
      if (!state.recognition) {
        alert("Voice input isn't supported in this browser. Try Chrome or Edge.");
        return;
      }
      const r = state.recognition;
      let base = "";

      r.onstart = () => {
        base = messageInput.value ? messageInput.value.trimEnd() + " " : "";
        setRecordingUI(true);
      };
      r.onresult = (e) => {
        let transcript = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          transcript += e.results[i][0].transcript;
        }
        messageInput.value = base + transcript;
        updateSendButtonState();
        const last = e.results[e.results.length - 1];
        if (last.isFinal) setTimeout(() => sendMessage(messageInput.value), 120);
      };
      r.onerror = (e) => {
        console.warn("STT error:", e.error);
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          alert("Microphone access was denied. Please enable it in your browser settings.");
        }
        setRecordingUI(false);
      };
      r.onend = () => setRecordingUI(false);
    }

    if (state.isRecording) { state.recognition.stop(); return; }
    if (!(await ensureMicPermission())) {
      alert("Microphone permission is required for voice input.");
      return;
    }
    try { state.recognition.start(); }
    catch (err) { console.warn(err); setRecordingUI(false); }
  }

  /* ---------- 10. TEXT-TO-SPEECH (TTS) ---------- */
  function toggleTTS() {
    if (!("speechSynthesis" in window)) {
      alert("Voice replies aren't supported in this browser.");
      return;
    }
    state.ttsEnabled = !state.ttsEnabled;
    ttsBtn.setAttribute("aria-pressed", String(state.ttsEnabled));
    ttsBtn.title = state.ttsEnabled ? "Voice replies: ON" : "Voice replies: OFF";
    if (!state.ttsEnabled) window.speechSynthesis.cancel();
  }

  function speak(text) {
    if (!("speechSynthesis" in window) || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang   = navigator.language || "en-US";
    u.rate   = 1.02;
    u.pitch  = 1.0;
    u.volume = 1.0;
    window.speechSynthesis.speak(u);
  }

  /* ---------- 11. UTILITIES ---------- */
  function stripMarkdown(md) {
    return md
      .replace(/```[\s\S]*?```/g, " (code block) ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/[*_>#~]/g, "")
      .replace(/\!\[[^\]]*\]\([^)]+\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  /* ---------- 12. WIRING ---------- */
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
  ttsBtn.addEventListener("click", toggleTTS);
  settingsBtn.addEventListener("click", () => alert("Settings panel coming soon."));

  /* ---------- 13. BOOT ---------- */
  function boot() {
    refreshIcons();
    configureMarked();
    updateSendButtonState();

    const greeting = appendAIBubble();
    greeting.innerHTML = renderMarkdown(
      "**Hey, I'm Nexus AI.** Ask me anything, tap the mic to speak, or try `generate an image of a neon cyberpunk city`. Toggle the speaker icon to hear my replies."
    );
    decorateCodeBlocks(greeting);

    if (window.matchMedia("(hover: hover)").matches) messageInput.focus();
  }

  // Wait for the deferred CDN scripts (marked, DOMPurify, Prism, Feather)
  if (document.readyState === "complete") boot();
  else window.addEventListener("load", boot);
})();
