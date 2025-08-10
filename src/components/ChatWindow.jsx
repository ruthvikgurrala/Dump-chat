// src/components/ChatWindow.jsx
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useLayoutEffect
} from 'react';
import { auth, db } from '../firebase';
import {
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  addDoc,
  serverTimestamp,
  deleteDoc,
  doc,
  updateDoc,
  where,
  getDocs
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

const PAGE_SIZE = 20;
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes

const ChatWindow = ({ selectedChat, onBack }) => {
  const [newMessage, setNewMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openActionFor, setOpenActionFor] = useState(null);

  const chatContainerRef = useRef(null);
  const scrollController = useRef({
    shouldScrollToBottom: true,
    shouldPreservePosition: false,
    prevScrollHeight: 0
  });
  const cacheKey = useRef(null);

  const getChatId = useCallback((uid1, uid2) => {
    if (!uid1 || !uid2) return null;
    return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
  }, []);

  // Clear messages & cache when user signs out
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setMessages([]);
        setLastDoc(null);
        setHasMore(true);
        if (cacheKey.current) {
          localStorage.removeItem(cacheKey.current);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Load cache instantly
  useEffect(() => {
    if (!selectedChat) {
      setMessages([]);
      setLastDoc(null);
      setHasMore(true);
      setLoadingInitial(false);
      cacheKey.current = null;
      return;
    }

    const chatId = getChatId(auth.currentUser.uid, selectedChat.uid);
    cacheKey.current = `wisp_chat_${chatId}`;

    try {
      const raw = localStorage.getItem(cacheKey.current);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.ts && Date.now() - parsed.ts < CACHE_TTL_MS) {
          setMessages(parsed.messages || []);
          setLoadingInitial(false);
          scrollController.current.shouldScrollToBottom = true;
        }
      }
    } catch {}

    setLoadingInitial(true);
  }, [selectedChat, getChatId]);

  // Real-time listener (source of truth)
  useEffect(() => {
    if (!selectedChat) return;

    const chatId = getChatId(auth.currentUser.uid, selectedChat.uid);
    const messagesRef = collection(db, 'chats', chatId, 'messages');
    const qLive = query(messagesRef, orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(qLive, snapshot => {
      const docs = snapshot.docs;
      const msgs = docs.map(d => ({ id: d.id, ...d.data() }));
      setMessages(msgs);
      setLastDoc(docs[0] || null);
      setHasMore(docs.length >= PAGE_SIZE);
      setLoadingInitial(false);
      scrollController.current.shouldScrollToBottom = true;

      try {
        localStorage.setItem(cacheKey.current, JSON.stringify({ messages: msgs, ts: Date.now() }));
      } catch {}
    });

    return () => unsubscribe();
  }, [selectedChat, getChatId]);

  // Mark other's messages as seen
  useEffect(() => {
    if (!selectedChat || loadingInitial) return;

    const markSeen = async () => {
      const chatId = getChatId(auth.currentUser.uid, selectedChat.uid);
      const messagesRef = collection(db, 'chats', chatId, 'messages');
      const q = query(messagesRef, where('senderId', '==', selectedChat.uid), where('seen', '==', false));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map(d => updateDoc(doc(db, 'chats', chatId, 'messages', d.id), { seen: true })));
    };

    if (messages.some(m => m.senderId === selectedChat.uid && !m.seen)) {
      markSeen();
    }
  }, [selectedChat, messages, loadingInitial, getChatId]);

  // Scroll handling
  useLayoutEffect(() => {
    const container = chatContainerRef.current;
    if (!container || loadingInitial) return;

    if (scrollController.current.shouldScrollToBottom) {
      container.scrollTop = container.scrollHeight;
      scrollController.current.shouldScrollToBottom = false;
    } else if (scrollController.current.shouldPreservePosition) {
      container.scrollTop = container.scrollHeight - scrollController.current.prevScrollHeight;
      scrollController.current.shouldPreservePosition = false;
    }
  }, [messages, loadingInitial]);

  // Pagination
  const fetchMoreMessages = useCallback(async () => {
    if (!selectedChat || loadingMore || !hasMore || !lastDoc) return;
    setLoadingMore(true);

    const container = chatContainerRef.current;
    if (container) {
      scrollController.current.shouldPreservePosition = true;
      scrollController.current.prevScrollHeight = container.scrollHeight;
    }

    const chatId = getChatId(auth.currentUser.uid, selectedChat.uid);
    const messagesRef = collection(db, 'chats', chatId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(PAGE_SIZE));

    const snapshot = await getDocs(q);
    const olderMsgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).reverse();

    setMessages(prev => [...olderMsgs, ...prev]);
    setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
    setHasMore(snapshot.docs.length === PAGE_SIZE);
    setLoadingMore(false);
  }, [selectedChat, getChatId, lastDoc, hasMore, loadingMore]);

  const handleScroll = useCallback((e) => {
    if (e.target.scrollTop <= 10 && !loadingInitial && hasMore && !loadingMore) {
      fetchMoreMessages();
    }
  }, [fetchMoreMessages, hasMore, loadingInitial, loadingMore]);

  // Send message
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedChat) return;
    const chatId = getChatId(auth.currentUser.uid, selectedChat.uid);
    const messagesRef = collection(db, 'chats', chatId, 'messages');

    const text = newMessage;
    setNewMessage('');
    try {
      await addDoc(messagesRef, {
        text,
        createdAt: serverTimestamp(),
        senderId: auth.currentUser.uid,
        seen: false
      });
    } catch {
      setNewMessage(text);
    }
  };

  // Delete/Edit
  const handleDelete = async (msgId) => {
    if (!selectedChat) return;
    const chatId = getChatId(auth.currentUser.uid, selectedChat.uid);
    await deleteDoc(doc(db, 'chats', chatId, 'messages', msgId));
    setOpenActionFor(null);
  };

  const handleEdit = async (msg) => {
    const newText = prompt("Edit your message:", msg.text);
    if (!newText?.trim()) return;
    const chatId = getChatId(auth.currentUser.uid, selectedChat.uid);
    await updateDoc(doc(db, 'chats', chatId, 'messages', msg.id), { text: newText, edited: true });
    setOpenActionFor(null);
  };

  // Render
  const renderMessages = () => messages.map((msg, idx) => {
    const msgDate = msg.createdAt?.toDate ? msg.createdAt.toDate() : null;
    const prevDate = idx > 0 && messages[idx - 1].createdAt?.toDate
      ? messages[idx - 1].createdAt.toDate()
      : null;
    const showDateDivider = !prevDate || (msgDate && prevDate && msgDate.toDateString() !== prevDate.toDateString());

    const isMine = msg.senderId === auth.currentUser.uid;
    const lastIndex = messages.length - 1;
    const showSeen = isMine && idx === lastIndex && msg.seen;

    return (
      <React.Fragment key={msg.id}>
        {showDateDivider && (
          <div className="chat-date-divider">
            {msgDate ? msgDate.toLocaleDateString() : ''}
          </div>
        )}

        <div className={`message ${isMine ? 'sent' : 'received'}`} data-id={msg.id}>
          <div className="message-content">
            <p>{msg.text}{msg.edited ? ' · edited' : ''}</p>
            <div className="message-meta">
              {msgDate && (
                <span className="message-timestamp">
                  {msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              {showSeen && <span className="seen-indicator">✓ Seen</span>}
            </div>
          </div>
          {isMine && (
            <div className={`message-actions ${openActionFor === msg.id ? 'open' : ''}`}>
              <button onClick={() => handleEdit(msg)}>✏️</button>
              <button onClick={() => handleDelete(msg.id)}>🗑</button>
            </div>
          )}
        </div>
      </React.Fragment>
    );
  });

  if (!selectedChat) {
    return (<div className="chat-window-empty"><h2>Select a chat to start messaging</h2></div>);
  }

  return (
    <div className="chat-window">
      <div className="chat-window-header">
        <button onClick={onBack} className="back-button">←</button>
        <h3>{selectedChat.username}</h3>
      </div>

      <div
        className="messages-list"
        ref={chatContainerRef}
        onScroll={handleScroll}
        style={{ overscrollBehavior: 'contain' }}
      >
        {loadingInitial ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>Loading Chat...</div>
        ) : (
          <>
            {loadingMore && <div style={{ textAlign: 'center', padding: '10px' }}>Loading older messages...</div>}
            {renderMessages()}
          </>
        )}
      </div>

      <form onSubmit={handleSendMessage} className="message-input-form">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          autoComplete="off"
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
};

export default ChatWindow;
