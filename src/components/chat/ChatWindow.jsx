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
    limit,
    startAfter
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import './ChatWindow.css';
import MessageList from './MessageList';
import MessageInput from './MessageInput';

const MESSAGES_PAGE_SIZE = 20;

const ChatWindow = ({ selectedChat, onBack, onMessageSent, onMessageDeleted }) => {
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
    const maxLoadedCountRef = useRef(0); // Track max messages loaded to handle cache->server transitions
    const isAtBottomRef = useRef(true); // Track if user is at bottom

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

    // Handle Scroll Event to track if user is at bottom
    const handleScroll = useCallback(() => {
        if (!messagesListRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = messagesListRef.current;
        // Consider "at bottom" if within 50px of the bottom
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
        isAtBottomRef.current = isAtBottom;
    }, []);

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
        maxLoadedCountRef.current = 0;
        isAtBottomRef.current = true; // Reset to true on chat switch

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
                        // Check if we already have this message (optimistic update)
                        const existingIndex = newMessages.findIndex(m => {
                            if (m.id === change.doc.id) return true;

                            // Robust check using clientMessageId
                            if (m.pending && messageData.clientMessageId && m.clientMessageId === messageData.clientMessageId) {
                                return true;
                            }

                            // Fallback for older messages or if clientMessageId is missing
                            if (m.pending && m.text === messageData.text) {
                                // Safe timestamp comparison
                                const t1 = m.createdAt?.seconds ? m.createdAt.seconds * 1000 : m.createdAt?.getTime?.() || 0;
                                const t2 = messageData.createdAt?.seconds ? messageData.createdAt.seconds * 1000 : messageData.createdAt?.getTime?.() || 0;
                                // Allow small difference (e.g. 2 seconds) due to client/server clock skew
                                return Math.abs(t1 - t2) < 2000;
                            }
                            return false;
                        });

                        if (existingIndex !== -1) {
                            // Replace pending message with real one
                            newMessages[existingIndex] = messageData;
                        } else if (!newMessages.find((m) => m.id === change.doc.id)) {
                            newMessages.push(messageData);
                        }
                    } else if (change.type === 'modified') {
                        newMessages = newMessages.map((m) =>
                            m.id === change.doc.id ? messageData : m
                        );
                    } else if (change.type === 'removed') {
                        newMessages = newMessages.filter((m) => m.id !== change.doc.id);
                    }
                });

                // Sort messages by createdAt (ascending) for display
                newMessages.sort((a, b) => {
                    const dateA = toDateSafe(a.createdAt) || new Date(); // Fallback to NOW if pending
                    const dateB = toDateSafe(b.createdAt) || new Date();
                    return dateA - dateB;
                });

                return newMessages;
            });

            // Pagination Logic
            if (snapshot.empty) {
                setLastDoc(null);
                setHasMore(false);
            } else if (snapshot.docs.length > maxLoadedCountRef.current) {
                setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
                setHasMore(snapshot.docs.length === MESSAGES_PAGE_SIZE);
                maxLoadedCountRef.current = snapshot.docs.length;
            }

            if (!initialLoadedRef.current) {
                setLoadingInitial(false);
                initialLoadedRef.current = true;
            }
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
    }, [selectedChat, getChatId]);

    // Smart Scroll Effect
    useLayoutEffect(() => {
        if (!messagesListRef.current) return;
        const el = messagesListRef.current;

        // 1. Initial Load: Always scroll to bottom
        if (!initialLoadedRef.current && messages.length > 0) {
            el.scrollTop = el.scrollHeight;
            return;
        }

        // 2. Loading History: Do NOT scroll (handled in loadMoreMessages)
        if (loadingMore) return;

        // 3. New Message: Scroll ONLY if user was already at bottom OR it's their own message
        if (isAtBottomRef.current) {
            el.scrollTop = el.scrollHeight;
        }
    }, [messages, loadingMore]);

    const loadMoreMessages = useCallback(async () => {
        if (!selectedChat || !hasMore || !lastDoc || loadingMore) {
            return;
        }

        setLoadingMore(true);
        try {
            const chatId = getChatId(auth.currentUser.uid, selectedChat.uid);
            const messagesRef = collection(db, 'chats', chatId, 'messages');

            const el = messagesListRef.current;
            const prevScrollHeight = el ? el.scrollHeight : 0;

            const q = query(messagesRef, orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(MESSAGES_PAGE_SIZE));
            const snap = await getDocs(q);

            if (!snap.empty) {
                const loadedDesc = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                const ordered = loadedDesc.reverse();

                await new Promise(resolve => setTimeout(resolve, 100)); // Reduced delay for speed

                setMessages(prev => {
                    const filtered = ordered.filter(o => !prev.find(p => p.id === o.id));
                    return [...filtered, ...prev];
                });

                setLastDoc(snap.docs[snap.docs.length - 1]);
                setHasMore(snap.docs.length === MESSAGES_PAGE_SIZE);

                // Restore scroll position
                requestAnimationFrame(() => {
                    if (!el) return;
                    const newScrollHeight = el.scrollHeight;
                    const delta = newScrollHeight - prevScrollHeight;
                    el.scrollTop = delta; // Keep user at the same relative point
                });
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
                await Promise.all(snap.docs.map(d => updateDoc(doc(db, 'chats', chatId, 'messages', d.id), { seen: true }).catch(() => { })));
            } catch (err) {
                console.error('markSeen error', err);
            }
        };
        markSeen();
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

        const clientMessageId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        try {
            if (messageToEdit) {
                // Optimistic Update for Edit
                setMessages(prev => prev.map(m =>
                    m.id === messageToEdit.id ? { ...m, text, edited: true } : m
                ));

                await updateDoc(doc(db, 'chats', chatId, 'messages', messageToEdit.id), { text, edited: true });
                setMessageToEdit(null);
            } else {
                // Optimistic Update for New Message
                const messageDataForFirestore = {
                    text: text,
                    createdAt: serverTimestamp(),
                    senderId: auth.currentUser.uid,
                    receiverId: selectedChat.uid,
                    seen: false,
                    edited: false,
                    clientMessageId: clientMessageId,
                };

                const optimisticMessage = {
                    id: `temp-${clientMessageId}`,
                    ...messageDataForFirestore,
                    createdAt: new Date(),
                    pending: true,
                    clientMessageId: clientMessageId,
                };

                setMessages(prev => [...prev, optimisticMessage]);
                isAtBottomRef.current = true;

                // Send to Firestore
                await addDoc(collection(db, 'chats', chatId, 'messages'), messageDataForFirestore);

                // Update savedChats for the SENDER only
                const senderRef = doc(db, 'users', auth.currentUser.uid);
                try {
                    await updateDoc(senderRef, {
                        savedChats: arrayUnion(selectedChat.uid)
                    });
                } catch (err) {
                    if (err.code === 'not-found' || err.message.includes('No document to update')) {
                        await setDoc(senderRef, { savedChats: [selectedChat.uid] }, { merge: true });
                    }
                }

                // Update daily message count
                try {
                    const senderSnapshot = await fetchSingleDoc(senderRef);
                    if (senderSnapshot && senderSnapshot.exists()) {
                        await updateDoc(senderRef, { dailyMessageCount: (senderSnapshot.data().dailyMessageCount || 0) + 1 });
                    } else {
                        await setDoc(senderRef, { dailyMessageCount: 1 }, { merge: true });
                    }
                } catch (analyticsError) {
                    console.error('Error updating daily message count:', analyticsError);
                }

                // Notify parent to update sort order
                if (onMessageSent) onMessageSent();
            }
        } catch (error) {
            console.error('Error sending message:', error, JSON.stringify(error));
            setChatError(error.code === 'permission-denied'
                ? "You have reached your daily message limit for the free plan."
                : "Failed to send message. Please try again.");

            // Revert optimistic update if needed
            if (!messageToEdit) {
                setMessages(prev => prev.filter(m => m.clientMessageId !== clientMessageId));
            }
        }
    };

    const confirmDelete = async () => {
        if (!messageToDelete || !selectedChat) return;
        const chatId = getChatId(auth.currentUser.uid, selectedChat.uid);
        await deleteDoc(doc(db, 'chats', chatId, 'messages', messageToDelete.id)).catch(err => console.error(err));
        setShowDeleteConfirm(false);
        setMessageToDelete(null);
        if (onMessageDeleted) onMessageDeleted();
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
                        onScroll={handleScroll}
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