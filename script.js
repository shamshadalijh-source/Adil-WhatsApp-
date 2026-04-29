(function () {
    const messagesEl = document.getElementById("messages");
    const inputEl = document.getElementById("message-input");
    const sendBtn = document.getElementById("send-btn");
    const statusText = document.getElementById("status-text");
    const onlineCount = document.getElementById("online-count");
    const lastPreview = document.getElementById("last-preview");
    const lastTime = document.getElementById("last-time");

    const usernameModal = document.getElementById("username-modal");
    const usernameInput = document.getElementById("username-input");
    const usernameSubmit = document.getElementById("username-submit");

    let socket = null;
    let mySid = null;
    let myUsername = null;

    // Helper: current time as HH:MM
    function nowTime() {
        const d = new Date();
        const h = String(d.getHours()).padStart(2, "0");
        const m = String(d.getMinutes()).padStart(2, "0");
        return `${h}:${m}`;
    }

    function scrollToBottom() {
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function appendMessage({ text, time, outgoing, sender }) {
        const bubble = document.createElement("div");
        bubble.className = "message " + (outgoing ? "outgoing" : "incoming");

        if (!outgoing && sender) {
            const senderEl = document.createElement("div");
            senderEl.className = "sender";
            senderEl.textContent = sender;
            bubble.appendChild(senderEl);
        }

        const textEl = document.createElement("span");
        textEl.className = "text";
        textEl.textContent = text;
        bubble.appendChild(textEl);

        const metaEl = document.createElement("span");
        metaEl.className = "meta";
        metaEl.textContent = time;
        if (outgoing) {
            const check = document.createElement("span");
            check.className = "check";
            check.textContent = "✓✓";
            metaEl.appendChild(check);
        }
        bubble.appendChild(metaEl);

        messagesEl.appendChild(bubble);
        scrollToBottom();

        // Update sidebar preview
        lastPreview.textContent = (sender ? sender + ": " : "") + text;
        lastTime.textContent = time;
    }

    function appendSystem(text, time) {
        const el = document.createElement("div");
        el.className = "system-message";
        el.textContent = `${text} · ${time}`;
        messagesEl.appendChild(el);
        scrollToBottom();
    }

    function sendMessage() {
        const text = inputEl.value.trim();
        if (!text) return;

        if (socket && socket.connected) {
            // Server will broadcast; we render via 'new_message' so timestamp matches
            socket.emit("send_message", { text });
        } else {
            // Offline fallback so the UI still feels alive
            appendMessage({
                text,
                time: nowTime(),
                outgoing: true,
                sender: myUsername,
            });
        }

        inputEl.value = "";
        inputEl.focus();
    }

    // Send button click
    sendBtn.addEventListener("click", sendMessage);

    // Enter key in input
    inputEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // ----- Socket.IO connection -----
    function connect(username) {
        myUsername = username;
        statusText.textContent = "connecting…";

        socket = io({
            transports: ["websocket", "polling"],
        });

        socket.on("connect", () => {
            mySid = socket.id;
            statusText.textContent = "online";
            socket.emit("join", { username, room: "main" });
        });

        socket.on("disconnect", () => {
            statusText.textContent = "offline";
        });

        socket.on("joined", (data) => {
            console.log("Joined room:", data);
        });

        socket.on("new_message", (msg) => {
            const outgoing = msg.sid === mySid;
            appendMessage({
                text: msg.text,
                time: msg.time,
                outgoing,
                sender: outgoing ? null : msg.username,
            });
        });

        socket.on("system_message", (msg) => {
            appendSystem(msg.text, msg.time);
        });

        socket.on("user_count", (data) => {
            const c = data.count || 1;
            onlineCount.textContent = c;
            statusText.textContent = `${c} online`;
        });
    }

    // Username modal flow
    function submitUsername() {
        const name = usernameInput.value.trim();
        if (!name) {
            usernameInput.focus();
            return;
        }
        usernameModal.classList.add("hidden");
        connect(name);
        inputEl.focus();
    }

    usernameSubmit.addEventListener("click", submitUsername);
    usernameInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
            e.preventDefault();
            submitUsername();
        }
    });

    // Auto-focus username input
    usernameInput.focus();
})();
