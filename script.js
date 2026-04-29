const API_KEY = "AIzaSyBxxxxxxxxxxxxxxx"; // Apni asli key yahan paste karein

const chatArea = document.getElementById('chatArea');
const userInp = document.getElementById('userInp');
const sendBtn = document.getElementById('sendBtn');

async function getAIResponse(prompt) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
        })
    });
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}

async function userMessage() {
    const val = userInp.value.trim();
    if (!val) return;

    // User Message Display
    addBubble(val, 'user');
    userInp.value = '';
    
    // AI Thinking...
    const thinkingRow = addBubble("Processing...", 'ai');
    
    try {
        const reply = await getAIResponse(val);
        thinkingRow.querySelector('.bubble').innerText = reply;
    } catch (error) {
        thinkingRow.querySelector('.bubble').innerText = "Opps! Connection slow hai ya key sahi nahi.";
    }
}

function addBubble(text, type) {
    const row = document.createElement('div');
    row.className = `message-row ${type}`;
    row.innerHTML = `
        <div class="avatar">${type === 'ai' ? 'AI' : 'Me'}</div>
        <div class="bubble">${text}</div>
    `;
    chatArea.appendChild(row);
    chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: 'smooth' });
    return row;
}

sendBtn.onclick = userMessage;
userInp.onkeypress = (e) => { if(e.key === 'Enter') userMessage(); };
