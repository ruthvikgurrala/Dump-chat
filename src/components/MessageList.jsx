// src/components/MessageList.jsx
import React, { useEffect, useRef } from 'react';
import { auth } from '../firebase';
import { motion } from 'framer-motion';




const MessageList = ({ messages }) => {
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="messages-list">
      {messages.map(msg => (
        <motion.div
          key={msg.id}
          className={`message ${msg.senderId === auth.currentUser.uid ? 'sent' : 'received'}`}
          initial={{ opacity: 0, y: 20 }} // Start invisible and 20px down
          animate={{ opacity: 1, y: 0 }}   // Animate to full opacity at its original position
          transition={{ duration: 0.3 }}
        >
          <p>{msg.text}</p>
        </motion.div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList;