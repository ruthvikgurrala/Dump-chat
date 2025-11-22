import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { auth, db } from '../../firebase';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  deleteDoc,
  doc,
  updateDoc,
  where,
  getDocs,
  getDoc as fetchSingleDoc,
  setDoc,
  arrayUnion,
  arrayRemove,
  limit,
  startAfter
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import './ChatWindow.css';
import MessageList from './MessageList';
import MessageInput from './MessageInput';

const MESSAGES_PAGE_SIZE = 20;

const ChatWindow = ({ selectedChat, onBack, onMessageSent }) => {
  const [chatError, setChatError] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState(null);
  const [messageToEdit, setMessageToEdit] = useState(null);
  const [messageToDelete, setMessageToDelete] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const messageInputRef = useRef(null);
  const hoverDelayTimers = useRef(new Map());
  const messagesListRef = useRef(null);
  const initialLoadedRef = useRef(false);

  const getChatId = useCallback((uid1, uid2) => {
    if (!uid1 || !uid2) return null;
    return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
  }, []);

  const toDateSafe = (ts) => {
    if (!ts) return null;
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (ts.seconds) return new Date(ts.seconds * 1000);
    if (ts instanceof Date) return ts;
    return null;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setMessages([]);
        setLoadingInitial(true);
        initialLoadedRef.current = false;
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!selectedChat) {
      setMessages([]);
      setLoadingInitial(false);
      initialLoadedRef.current = false;
      return;
    }

    const chatId = getChatId(auth.currentUser.uid, selectedChat.uid);
    if (!chatId) return;

    setLoadingInitial(true);
    setMessages([]);
    setLastDoc(null);
    setHasMore(true);
    initialLoadedRef.current = false;

    console.log('Setting up onSnapshot listener for chat:', chatId);

    const messagesRef = collection(db, 'chats', chatId, 'messages');
    const qLive = query(messagesRef, orderBy('createdAt', 'desc'), limit(MESSAGES_PAGE_SIZE));

    const unsubscribe = onSnapshot(qLive, (snapshot) => {
      const changes = snapshot.docChanges();

      setMessages((prevMessages) => {
        let newMessages = [...prevMessages];

        changes.forEach((change) => {
          const messageData = { id: change.doc.id, ...change.doc.data() };
          if (change.type === 'added') {
            if (!newMessages.find((m) => m.id === change.doc.id)) {
              newMessages.push(messageData);
              console.log('Added new message:', messageData);
            }
          } else if (change.type === 'modified') {
            newMessages = newMessages.map((m) =>
              m.id === change.doc.id ? messageData : m
            );
            console.log('Updated message:', messageData);
          } else if (change.type === 'removed') {
            newMessages = newMessages.filter((m) => m.id !== change.doc.id);
            console.log('Removed message:', change.doc.id);
          }
        });

        // Sort messages by createdAt (ascending) for display
        newMessages.sort((a, b) => {
          const dateA = toDateSafe(a.createdAt) || new Date(0);
          const dateB = toDateSafe(b.createdAt) || new Date(0);
          return dateA - dateB;
        });

        console.log(`Processed ${changes.length} message changes. Total messages: ${newMessages.length}`);
        return newMessages;
      });

      setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
      setHasMore(snapshot.docs.length === MESSAGES_PAGE_SIZE);
      setLoadingInitial(false);
      initialLoadedRef.current = true;
    }, (error) => {
      console.error('Firestore listener error:', error);
      setLoadingInitial(false);
    });

    return () => {
      try {
        unsubscribe();
      } catch (e) {
        console.error('Error unsubscribing:', e);
      }
    };
  }, [selectedChat, getChatId]);  // Removed 'messages' from dependencies

  useLayoutEffect(() => {
    if (!messagesListRef.current) return;
    const el = messagesListRef.current;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const loadMoreMessages = useCallback(async () => {
  if (!selectedChat || !hasMore || !lastDoc || loadingMore) {
    console.debug('loadMoreMessages aborted', { selectedChat: !!selectedChat, hasMore, lastDoc: !!lastDoc, loadingMore });
    return;
  }

  setLoadingMore(true);
  try {
    const chatId = getChatId(auth.currentUser.uid, selectedChat.uid);
    const messagesRef = collection(db, 'chats', chatId, 'messages');

    const el = messagesListRef.current;
    const prevScrollHeight = el ? el.scrollHeight : 0;
    const prevScrollTop = el ? el.scrollTop : 0;

    const q = query(messagesRef, orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(MESSAGES_PAGE_SIZE));
    const snap = await getDocs(q);

    if (!snap.empty) {
      const loadedDesc = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const ordered = loadedDesc.reverse();

      // Add this log for visibility
      console.log('Fetched older batch of', ordered.length, 'messages:', ordered);

      await new Promise(resolve => setTimeout(resolve, 750));

      setMessages(prev => {
        const filtered = ordered.filter(o => !prev.find(p => p.id === o.id));
        // Optional: Log how many were actually added after filtering
        console.log('Added', filtered.length, 'older messages to state');
        return [...filtered, ...prev];
      });

      setLastDoc(snap.docs[snap.docs.length - 1]);
      setHasMore(snap.docs.length === MESSAGES_PAGE_SIZE);

      setTimeout(() => {
        if (!el) return;
        const newScrollHeight = el.scrollHeight;
        const delta = newScrollHeight - prevScrollHeight;
        el.scrollTop = delta + prevScrollTop;
        console.log('ChatWindow: preserved scroll after prepending older messages (delta)', delta);
      }, 60);
    } else {
      setHasMore(false);
    }
  } catch (err) {
    console.error('ChatWindow loadMoreMessages error', err);
  } finally {
    setLoadingMore(false);
  }
}, [selectedChat, hasMore, lastDoc, loadingMore, getChatId]);

  useEffect(() => {
    if (!selectedChat || loadingInitial || messages.length === 0) return;
    const markSeen = async () => {
      try {
        const chatId = getChatId(auth.currentUser.uid, selectedChat.uid);
        const messagesRef = collection(db, 'chats', chatId, 'messages');
        const q = query(messagesRef,
          where('senderId', '==', selectedChat.uid),
          where('receiverId', '==', auth.currentUser.uid),
          where('seen', '==', false));
        const snap = await getDocs(q);
        await Promise.all(snap.docs.map(d => updateDoc(doc(db, 'chats', chatId, 'messages', d.id), { seen: true }).catch(() => {})));
      } catch (err) {
        console.error('markSeen error', err);
      }
    };
    if (messages.some(m => m.senderId === selectedChat.uid && !m.seen)) {
      markSeen();
    }
  }, [selectedChat, messages, loadingInitial, getChatId]);

  const handleMessageMouseEnter = useCallback((id) => {
    if (hoverDelayTimers.current.has(id)) clearTimeout(hoverDelayTimers.current.get(id));
    const el = document.querySelector(`[data-id="${id}"] .message-actions`);
    if (el) el.classList.add('show-delayed');
  }, []);

  const handleMessageMouseLeave = useCallback((id) => {
    const t = setTimeout(() => {
      const el = document.querySelector(`[data-id="${id}"] .message-actions`);
      if (el) el.classList.remove('show-delayed');
      hoverDelayTimers.current.delete(id);
    }, 300);
    hoverDelayTimers.current.set(id, t);
  }, []);

  const handleSendMessage = async (e) => {
  e.preventDefault();
  if (!newMessage.trim() || !selectedChat) return;

  const chatId = getChatId(auth.currentUser.uid, selectedChat.uid);
  const text = newMessage;
  setNewMessage('');
  const timestamp = serverTimestamp();

  try {
    if (messageToEdit) {
      await updateDoc(doc(db, 'chats', chatId, 'messages', messageToEdit.id), { text, edited: true });
      setMessageToEdit(null);
    } else {
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        text,
        createdAt: timestamp,
        senderId: auth.currentUser.uid,
        receiverId: selectedChat.uid,
        seen: false,
        edited: false
      });

      const currentUserRef = doc(db, 'users', auth.currentUser.uid);
      const selectedChatRef = doc(db, 'users', selectedChat.uid);
      await Promise.allSettled([
        updateDoc(currentUserRef, { savedChats: arrayRemove(selectedChat.uid) }),
        updateDoc(currentUserRef, { savedChats: arrayUnion(selectedChat.uid) }),
        updateDoc(selectedChatRef, { savedChats: arrayRemove(auth.currentUser.uid) }),
        updateDoc(selectedChatRef, { savedChats: arrayUnion(auth.currentUser.uid) })
      ]);

      if (onMessageSent) onMessageSent(selectedChat);

      const userRef = doc(db, 'users', auth.currentUser.uid);
      const userSnap = await fetchSingleDoc(userRef);
      if (userSnap.exists()) {
        await updateDoc(userRef, { dailyMessageCount: (userSnap.data().dailyMessageCount || 0) + 1 }).catch(() => {});
      } else {
        await setDoc(userRef, { dailyMessageCount: 1 }, { merge: true }).catch(() => {});
      }

      // Force scroll after sending
      setTimeout(() => {
        if (messagesListRef.current && messagesListRef.current.lastElementChild) {
          messagesListRef.current.lastElementChild.scrollIntoView({ behavior: 'smooth' });
          console.log('ChatWindow: forced scroll to bottom after sending message');
        } else {
          console.log('ChatWindow: scroll failed', {
            messagesListRef: !!messagesListRef.current,
            lastElementChild: !!messagesListRef.current?.lastElementChild
          });
        }
      }, 150);
    }
  } catch (error) {
    console.error('Error sending message:', error, JSON.stringify(error));
    setChatError(error.code === 'permission-denied'
      ? "You have reached your daily message limit for the free plan."
      : "Failed to send message. Please try again.");
  }
};

  const confirmDelete = async () => {
    if (!messageToDelete || !selectedChat) return;
    const chatId = getChatId(auth.currentUser.uid, selectedChat.uid);
    await deleteDoc(doc(db, 'chats', chatId, 'messages', messageToDelete.id)).catch(err => console.error(err));
    setShowDeleteConfirm(false);
    setMessageToDelete(null);
  };

  const handleEdit = (msg) => {
    setMessageToEdit(msg);
    setNewMessage(msg.text);
    messageInputRef.current?.focus();
  };

  const cancelEdit = () => {
    setMessageToEdit(null);
    setNewMessage('');
  };

  const handleDelete = (msg) => {
    setMessageToDelete(msg);
    setShowDeleteConfirm(true);
  };

  if (!selectedChat) {
    return (<div className="chat-window-empty"><h2>Select a chat to start messaging</h2></div>);
  }

  return (
    <div className="chat-window">
      {showDeleteConfirm && (
        <div className="confirm-delete-overlay">
          <div className="confirm-delete-modal">
            <h4>Delete Message?</h4>
            <p>Are you sure you want to permanently delete this message?</p>
            <div className="confirm-delete-actions">
              <button onClick={() => setShowDeleteConfirm(false)} className="cancel-btn">Cancel</button>
              <button onClick={confirmDelete} className="delete-btn">Delete</button>
            </div>
          </div>
        </div>
      )}
      <div className="chat-window-header">
        <button onClick={onBack} className="back-button">←</button>
        <h3>{selectedChat.username}</h3>
      </div>
      <div className="chat-messages-container">
        {loadingInitial ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>Loading Chat...</div>
        ) : (
          <MessageList
            ref={messagesListRef}
            messages={messages}
            handleMessageMouseEnter={handleMessageMouseEnter}
            handleMessageMouseLeave={handleMessageMouseLeave}
            handleEdit={handleEdit}
            handleDelete={handleDelete}
            loadMoreMessages={loadMoreMessages}
            hasMore={hasMore}
            loadingMore={loadingMore}
          />
        )}
      </div>
      <MessageInput
        newMessage={newMessage}
        setNewMessage={setNewMessage}
        handleSendMessage={handleSendMessage}
        messageToEdit={messageToEdit}
        cancelEdit={cancelEdit}
        chatError={chatError}
        setChatError={setChatError}
        messageInputRef={messageInputRef}
      />
    </div>
  );
};

export default ChatWindow;