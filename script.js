const chatArea = document.getElementById('chatArea');
const userInp = document.getElementById('userInp');
const sendBtn = document.getElementById('sendBtn');

function botResponse(text) {
    const row = document.createElement('div');
    row.className = 'message-row ai';
    row.innerHTML = `
        <div class="avatar">AI</div>
        <div class="bubble">${text}</div>
    `;
    chatArea.appendChild(row);
    chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: 'smooth' });
}

function userMessage() {
    const val = userInp.value.trim();
    if (!val) return;

    const row = document.createElement('div');
    row.className = 'message-row user';
    row.innerHTML = `
        <div class="avatar">Me</div>
        <div class="bubble">${val}</div>
    `;
    chatArea.appendChild(row);
    userInp.value = '';
    chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: 'smooth' });

    // AI Thinking Simulation
    setTimeout(() => {
        botResponse("Analysis complete. This command is within my neural parameters. I am ready for Phase 3 integration.");
    }, 1200);
}

sendBtn.onclick = userMessage;
userInp.onkeypress = (e) => { if(e.key === 'Enter') userMessage(); };
