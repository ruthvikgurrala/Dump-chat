// src/components/Chat.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { auth, db } from '../firebase';
import { 
    doc, 
    getDoc, 
    setDoc, 
    onSnapshot, 
    collection, 
    query, 
    orderBy,
    limit,
    getDocs,
    where
} from 'firebase/firestore';
import Sidebar from './chat/Sidebar';
import ChatWindow from './chat/ChatWindow';
import SettingsMenu from './settings/SettingsMenu';
import GoPremium from './premium/GoPremium';
import ProfilePage from './social/ProfilePage';
import FriendsList from './social/FriendsList';
import FriendRequests from './social/FriendRequests';
import './Chat.css';

const Chat = ({ theme, setTheme, accent, setAccent, userProfile }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeChats, setActiveChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [autoDumpEnabled, setAutoDumpEnabled] = useState(true);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  const [viewState, setViewState] = useState('chat');
  const [viewingUserId, setViewingUserId] = useState(null);
  const [historyStack, setHistoryStack] = useState(['chat']);

  const messageListenersRef = useRef(new Map());
  const settingsMenuRef = useRef(null);
  const settingsBtnRef = useRef(null);
  const friendRequestsBtnRef = useRef(null);
  const friendRequestsMenuRef = useRef(null);
  const [isFriendRequestsOpen, setIsFriendRequestsOpen] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  /* ---------------- RESIZE HANDLER ---------------- */
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  /* ---------------- CLOSE MENUS ON OUTSIDE CLICK ---------------- */
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isMenuOpen && 
          settingsMenuRef.current && 
          !settingsMenuRef.current.contains(event.target) &&
          settingsBtnRef.current &&
          !settingsBtnRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
      if (isFriendRequestsOpen &&
        friendRequestsMenuRef.current &&
        !friendRequestsMenuRef.current.contains(event.target) &&
        friendRequestsBtnRef.current &&
        !friendRequestsBtnRef.current.contains(event.target)) {
        setIsFriendRequestsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen, isFriendRequestsOpen]);

  /* ---------------- LOAD USER CHATS ---------------- */
  useEffect(() => {
    if (!auth.currentUser) return;
    const userRef = doc(db, 'users', auth.currentUser.uid);
    const unsubscribe = onSnapshot(userRef, async (userSnap) => {
      if (userSnap.exists()) {
        const userData = userSnap.data();
        const autoDumpPref = userData.autoDump !== undefined ? userData.autoDump : true;
        setAutoDumpEnabled(autoDumpPref);

        if (autoDumpPref === false && userData.savedChats?.length > 0) {
          const chatPromises = userData.savedChats.map(async (uid) => {
            const chatUserSnap = await getDoc(doc(db, 'users', uid));
            const lastMessage = await getLastMessage(uid);
            if (chatUserSnap.exists()) {
              return {
                ...chatUserSnap.data(),
                lastMessageTimestamp: lastMessage?.createdAt?.toDate() || new Date(0),
              };
            }
            return null;
          });
          const loadedChats = (await Promise.all(chatPromises)).filter(chat => chat !== null);
          const sortedChats = loadedChats.sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);
          setActiveChats(sortedChats);
        } else if (autoDumpPref === true) {
          setActiveChats([]);
        }
      }
    });
    return () => unsubscribe();
  }, [auth.currentUser?.uid]);

  /* ---------------- FRIEND REQUEST BADGE ---------------- */
  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(
      collection(db, 'friendRequests'),
      where('receiverId', '==', auth.currentUser.uid),
      where('status', '==', 'pending')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPendingRequestsCount(snapshot.size);
    });
    return () => unsubscribe();
  }, [auth.currentUser?.uid]);

  const getLastMessage = async (otherUserId) => {
    const chatId = [auth.currentUser.uid, otherUserId].sort().join('_');
    const messagesRef = collection(db, 'chats', chatId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'desc'), limit(1));
    const snap = await getDocs(q);
    return snap.docs[0]?.data();
  };

  /* ---------------- CHAT START ---------------- */
  const handleStartChat = useCallback(async (user) => {
    const newTimestamp = new Date();
    const existingChatIndex = activeChats.findIndex(chat => chat.uid === user.uid);
    let updatedChats;
    if (existingChatIndex !== -1) {
      updatedChats = activeChats.map(chat =>
        chat.uid === user.uid 
          ? { ...chat, lastMessageTimestamp: newTimestamp }
          : chat
      );
    } else {
      const newChat = { ...user, lastMessageTimestamp: newTimestamp };
      updatedChats = [newChat, ...activeChats];
    }
    const sortedChats = updatedChats.sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);
    setActiveChats(sortedChats);
    setSelectedChat(user);

    if (viewState !== 'chat') {
        setHistoryStack(prev => [...prev, 'chat']);
        setViewState('chat');
    }
  }, [activeChats, viewState]);

  const handleBack = useCallback(() => {
    setSelectedChat(null);
  }, []);

  const handleNavigate = useCallback((newState) => {
      setHistoryStack(prev => [...prev, newState]);
      setViewState(newState);
      setIsMenuOpen(false);
      setIsFriendRequestsOpen(false);
  }, []);

  const goBack = useCallback(() => {
    setHistoryStack(prev => {
        if (prev.length > 1) {
            const newStack = prev.slice(0, -1);
            setViewState(newStack[newStack.length - 1]);
            return newStack;
        }
        setViewState('chat');
        return ['chat'];
    });
  }, []);

  const handleViewFriendsList = useCallback(() => {
    setHistoryStack(prev => [...prev, 'friendsList']);
    setViewState('friendsList');
  }, []);

  const handleViewFriendProfile = useCallback((userId) => {
    setViewingUserId(userId);
    setHistoryStack(prev => [...prev, 'viewingFriendProfile']);
    setViewState('viewingFriendProfile');
  }, []);

  const handleViewOtherProfile = useCallback((userId) => {
    setViewingUserId(userId);
    setHistoryStack(prev => [...prev, 'viewingOtherProfile']);
    setViewState('viewingOtherProfile');
  }, []);

  /* ---------------- CONTENT RENDER ---------------- */
  const renderContent = () => {
    switch (viewState) {
      case 'premium':
        return <GoPremium onBack={goBack} userProfile={userProfile} />;

      case 'myProfile':
        return (
          <div className="full-screen-view">
            <ProfilePage 
              onBack={goBack} 
              userProfile={userProfile} 
              viewingUserId={auth.currentUser?.uid} 
              onViewFriendsList={handleViewFriendsList} 
            />
          </div>
        );

      case 'friendsList':
        return (
          <div className="dual-pane-layout">
            <FriendsList 
              onBack={goBack} 
              friendsList={userProfile.friends || []} 
              onStartChat={handleStartChat} 
              onViewUser={handleViewFriendProfile} 
            />
            <ProfilePage 
              onBack={goBack} 
              userProfile={userProfile} 
              viewingUserId={auth.currentUser?.uid} 
              onViewFriendsList={handleViewFriendsList} 
            />
          </div>
        );

      case 'viewingFriendProfile':
        return (
          <div className="dual-pane-layout">
            <FriendsList 
              onBack={goBack} 
              friendsList={userProfile.friends || []} 
              onStartChat={handleStartChat} 
              onViewUser={handleViewFriendProfile} 
            />
            <ProfilePage 
              onBack={goBack} 
              userProfile={userProfile} 
              viewingUserId={viewingUserId} 
              onStartChat={handleStartChat} 
            />
          </div>
        );

      case 'viewingOtherProfile':
        return (
          <div className="dual-pane-layout">
            <Sidebar 
              onStartChat={handleStartChat} 
              activeChats={activeChats} 
              onSelectChat={setSelectedChat} 
              selectedChat={selectedChat} 
              onViewUser={handleViewOtherProfile} 
            />
            <ProfilePage 
              onBack={goBack} 
              userProfile={userProfile} 
              viewingUserId={viewingUserId} 
              onStartChat={handleStartChat} 
            />
          </div>
        );

      case 'chat':
      default:
        return (
          <div className="dual-pane-layout">
            <Sidebar 
              onStartChat={handleStartChat}
              activeChats={activeChats}
              onSelectChat={setSelectedChat}
              selectedChat={selectedChat}
              onViewUser={handleViewOtherProfile}
            />
            <ChatWindow 
              selectedChat={selectedChat}
              onBack={handleBack}
              onMessageSent={() => {}}
            />
          </div>
        );
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h1>Wisp</h1>
        <div className="header-controls">
          <button ref={friendRequestsBtnRef} onClick={() => setIsFriendRequestsOpen(!isFriendRequestsOpen)} className="settings-btn friend-requests-btn">
            💌
            {pendingRequestsCount > 0 && <span className="notification-badge">{pendingRequestsCount}</span>}
          </button>
          <button ref={settingsBtnRef} onClick={() => setIsMenuOpen(!isMenuOpen)} className="settings-btn">⚙️</button>
          {isMenuOpen && (
            <div ref={settingsMenuRef}>
              <SettingsMenu
                user={auth.currentUser}
                onAutoDumpChange={setAutoDumpEnabled}
                theme={theme}
                setTheme={setTheme}
                accent={accent}
                setAccent={setAccent}
                onShowPremium={() => handleNavigate('premium')}
                onShowProfile={() => handleNavigate('myProfile')}
              />
            </div>
          )}
           {isFriendRequestsOpen && (
            <div ref={friendRequestsMenuRef} className="friend-requests-popover">
              <FriendRequests
                onBack={() => setIsFriendRequestsOpen(false)}
                onStartChat={handleStartChat}
                userProfile={userProfile}
              />
            </div>
          )}
        </div>
      </div>
      <div className="chat-body">
        {renderContent()}
      </div>
    </div>
  );
};

export default Chat;
