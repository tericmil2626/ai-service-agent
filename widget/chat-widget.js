(function() {
  'use strict';

  // Configuration
  const scriptTag = document.currentScript;
  const API_URL = (scriptTag?.getAttribute('data-api-url') || 'http://localhost:3002').replace(/\/$/, '');
  const BUSINESS_ID = scriptTag?.getAttribute('data-business-id') || 'default';
  
  // Generate session ID
  const SESSION_ID = 'session_' + Math.random().toString(36).substring(2, 15);
  
  // State
  let isOpen = false;
  let messages = [];
  let isTyping = false;

  // Styles
  const styles = `
    .ai-chat-widget {
      --aw-primary: #f59e0b;
      --aw-primary-hover: #d97706;
      --aw-bg: #ffffff;
      --aw-text: #1f2937;
      --aw-text-light: #6b7280;
      --aw-border: #e5e7eb;
      --aw-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .ai-chat-button {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: var(--aw-primary);
      border: none;
      cursor: pointer;
      box-shadow: var(--aw-shadow);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s, background 0.2s;
      z-index: 9999;
    }

    .ai-chat-button:hover {
      transform: scale(1.05);
      background: var(--aw-primary-hover);
    }

    .ai-chat-button svg {
      width: 28px;
      height: 28px;
      color: white;
    }

    .ai-chat-window {
      position: fixed;
      bottom: 90px;
      right: 20px;
      width: 380px;
      height: 500px;
      background: var(--aw-bg);
      border-radius: 16px;
      box-shadow: var(--aw-shadow);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      z-index: 9998;
      opacity: 0;
      transform: translateY(20px) scale(0.95);
      pointer-events: none;
      transition: opacity 0.2s, transform 0.2s;
    }

    .ai-chat-window.open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: all;
    }

    .ai-chat-header {
      background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%);
      color: white;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .ai-chat-header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .ai-chat-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--aw-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
    }

    .ai-chat-title {
      font-weight: 600;
      font-size: 15px;
    }

    .ai-chat-subtitle {
      font-size: 12px;
      opacity: 0.8;
    }

    .ai-chat-close {
      background: none;
      border: none;
      color: white;
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      transition: background 0.2s;
    }

    .ai-chat-close:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    .ai-chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .ai-chat-message {
      max-width: 80%;
      padding: 12px 16px;
      border-radius: 16px;
      font-size: 14px;
      line-height: 1.5;
      animation: messageIn 0.3s ease-out;
    }

    @keyframes messageIn {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .ai-chat-message.user {
      align-self: flex-end;
      background: var(--aw-primary);
      color: white;
      border-bottom-right-radius: 4px;
    }

    .ai-chat-message.bot {
      align-self: flex-start;
      background: #f3f4f6;
      color: var(--aw-text);
      border-bottom-left-radius: 4px;
    }

    .ai-chat-typing {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 12px 16px;
      background: #f3f4f6;
      border-radius: 16px;
      align-self: flex-start;
      width: fit-content;
    }

    .ai-chat-typing-dot {
      width: 8px;
      height: 8px;
      background: var(--aw-text-light);
      border-radius: 50%;
      animation: typing 1.4s infinite;
    }

    .ai-chat-typing-dot:nth-child(2) { animation-delay: 0.2s; }
    .ai-chat-typing-dot:nth-child(3) { animation-delay: 0.4s; }

    @keyframes typing {
      0%, 60%, 100% { transform: translateY(0); }
      30% { transform: translateY(-10px); }
    }

    .ai-chat-input-area {
      padding: 16px 20px;
      border-top: 1px solid var(--aw-border);
      display: flex;
      gap: 12px;
    }

    .ai-chat-input {
      flex: 1;
      padding: 12px 16px;
      border: 1px solid var(--aw-border);
      border-radius: 24px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }

    .ai-chat-input:focus {
      border-color: var(--aw-primary);
    }

    .ai-chat-send {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: var(--aw-primary);
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }

    .ai-chat-send:hover {
      background: var(--aw-primary-hover);
    }

    .ai-chat-send svg {
      width: 20px;
      height: 20px;
      color: white;
    }

    .ai-chat-send:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .ai-chat-welcome {
      text-align: center;
      padding: 20px;
      color: var(--aw-text-light);
      font-size: 13px;
    }

    @media (max-width: 480px) {
      .ai-chat-window {
        width: calc(100vw - 40px);
        height: calc(100vh - 120px);
        right: 20px;
        left: 20px;
      }
    }
  `;

  // Inject styles
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);

  // Create widget HTML
  function createWidget() {
    const container = document.createElement('div');
    container.className = 'ai-chat-widget';
    container.innerHTML = `
      <button class="ai-chat-button" aria-label="Open chat">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      </button>
      
      <div class="ai-chat-window">
        <div class="ai-chat-header">
          <div class="ai-chat-header-left">
            <div class="ai-chat-avatar">🦞</div>
            <div>
              <div class="ai-chat-title">Service Assistant</div>
              <div class="ai-chat-subtitle">Typically replies instantly</div>
            </div>
          </div>
          <button class="ai-chat-close" aria-label="Close chat">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        
        <div class="ai-chat-messages">
          <div class="ai-chat-welcome">
            👋 Hi! I'm here to help you schedule service or answer questions.
          </div>
        </div>
        
        <div class="ai-chat-input-area">
          <input type="text" class="ai-chat-input" placeholder="Type your message..." maxlength="500">
          <button class="ai-chat-send" aria-label="Send message">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"></path>
            </svg>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(container);
    return container;
  }

  // Initialize
  const widget = createWidget();
  const button = widget.querySelector('.ai-chat-button');
  const window_ = widget.querySelector('.ai-chat-window');
  const closeBtn = widget.querySelector('.ai-chat-close');
  const messagesContainer = widget.querySelector('.ai-chat-messages');
  const input = widget.querySelector('.ai-chat-input');
  const sendBtn = widget.querySelector('.ai-chat-send');

  // Toggle chat
  function toggleChat() {
    isOpen = !isOpen;
    window_.classList.toggle('open', isOpen);
    if (isOpen) {
      input.focus();
    }
  }

  button.addEventListener('click', toggleChat);
  closeBtn.addEventListener('click', toggleChat);

  // Add message to UI
  function addMessage(text, sender) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `ai-chat-message ${sender}`;
    msgDiv.textContent = text;
    messagesContainer.appendChild(msgDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    messages.push({ text, sender, timestamp: new Date() });
  }

  // Show typing indicator
  function showTyping() {
    if (isTyping) return;
    isTyping = true;
    
    const typingDiv = document.createElement('div');
    typingDiv.className = 'ai-chat-typing';
    typingDiv.innerHTML = `
      <div class="ai-chat-typing-dot"></div>
      <div class="ai-chat-typing-dot"></div>
      <div class="ai-chat-typing-dot"></div>
    `;
    typingDiv.id = 'typing-indicator';
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // Hide typing indicator
  function hideTyping() {
    isTyping = false;
    const typing = document.getElementById('typing-indicator');
    if (typing) typing.remove();
  }

  // Send message to API
  async function sendMessage(text) {
    if (!text.trim()) return;

    // Add user message
    addMessage(text, 'user');
    input.value = '';
    sendBtn.disabled = true;

    // Show typing
    showTyping();

    try {
      const response = await fetch(`${API_URL}/webhook/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_phone: SESSION_ID,
          message: text,
          session_id: SESSION_ID
        })
      });

      const data = await response.json();
      
      hideTyping();
      
      if (data.success) {
        addMessage(data.response, 'bot');
      } else {
        addMessage('Sorry, I had trouble processing that. Please try again.', 'bot');
      }
    } catch (error) {
      hideTyping();
      addMessage('Sorry, I\'m having trouble connecting. Please try again later.', 'bot');
      console.error('Chat error:', error);
    }

    sendBtn.disabled = false;
  }

  // Event listeners
  sendBtn.addEventListener('click', () => sendMessage(input.value));
  
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendMessage(input.value);
    }
  });

  // Welcome message after a short delay
  setTimeout(() => {
    if (messages.length === 0) {
      addMessage("Hi there! 👋 I'm your AI assistant. I can help you schedule a service appointment, get a quote, or answer questions about our services. What can I help you with today?", 'bot');
    }
  }, 1000);

})();
