// src/components/MessageInput.jsx
import React from 'react';
import './MessageInput.css';

const MessageInput = ({
  newMessage,
  setNewMessage,
  handleSendMessage,
  messageToEdit,
  cancelEdit,
  messageInputRef,
  chatError,
  setChatError
}) => {
  return (
    <form onSubmit={handleSendMessage} className="message-input-form">
      {chatError && (
        <div className="chat-error-message">
          <span>{chatError}</span>
          <button type="button" onClick={() => setChatError('')}>×</button>
        </div>
      )}
      {messageToEdit && (
        <div className="edit-mode-indicator">
          <p>Editing message...</p>
          <button type="button" onClick={cancelEdit}>Cancel</button>
        </div>
      )}
      <div className="input-area-wrapper">
        <input
          ref={messageInputRef}
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
        />
        <button type="submit">{messageToEdit ? 'Save' : 'Send'}</button>
      </div>
    </form>
  );
};

export default MessageInput;