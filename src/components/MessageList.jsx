// src/components/MessageList.jsx
import React, { useEffect, useRef } from 'react';
import { auth } from '../firebase';

const MessageList = ({ messages }) => {
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="messages-list">
      {messages.map(msg => (
        <div key={msg.id} className={`message ${msg.senderId === auth.currentUser.uid ? 'sent' : 'received'}`}>
          <p>{msg.text}</p>
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList;