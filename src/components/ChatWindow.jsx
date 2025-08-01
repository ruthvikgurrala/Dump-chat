// src/components/ChatWindow.jsx

import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from '../firebase';
import { collection, addDoc, serverTimestamp, onSnapshot, query, orderBy } from 'firebase/firestore';

const ChatWindow = ({ selectedChat, onBack }) => {
  const [newMessage, setNewMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  const getChatId = (uid1, uid2) => {
    return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
  };

  useEffect(() => {
    if (!selectedChat) {
      setMessages([]);
      return;
    }
    const chatId = getChatId(auth.currentUser.uid, selectedChat.uid);
    const messagesRef = collection(db, 'chats', chatId, 'messages');
    const q = query(messagesRef, orderBy('createdAt'));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const msgs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs);
    });

    return () => unsubscribe();
  }, [selectedChat]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (newMessage.trim() === '') return;

    const chatId = getChatId(auth.currentUser.uid, selectedChat.uid);
    const messagesRef = collection(db, 'chats', chatId, 'messages');

    try {
      await addDoc(messagesRef, {
        text: newMessage,
        createdAt: serverTimestamp(),
        senderId: auth.currentUser.uid,
      });
      setNewMessage('');
    } catch (error) {
      console.error("Error sending message: ", error);
    }
  };

  if (!selectedChat) {
    return (
      <div className="chat-window-empty">
        <h2>Select a chat to start messaging</h2>
      </div>
    );
  }

  return (
    <div className="chat-window">
      <div className="chat-window-header">
        <button onClick={onBack} className="back-button">←</button>
        <h3>{selectedChat.username}</h3>
      </div>
      
      <div className="messages-list">
        {messages.map(msg => (
          <div key={msg.id} className={`message ${msg.senderId === auth.currentUser.uid ? 'sent' : 'received'}`}>
            <p>{msg.text}</p>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSendMessage} className="message-input-form">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
};

export default ChatWindow;