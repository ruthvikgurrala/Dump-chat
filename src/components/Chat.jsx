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
  where,
  addDoc,
  deleteDoc,
  serverTimestamp,
  arrayRemove,
  arrayUnion
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
  const [friendsTabChats, setFriendsTabChats] = useState([]); // Lifted state
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

  /* ---------------- HELPER: GET LAST MESSAGE ---------------- */
  const getLastMessage = async (otherUserId) => {
    const chatId = [auth.currentUser.uid, otherUserId].sort().join('_');
    const messagesRef = collection(db, 'chats', chatId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'desc'), limit(1));
    const snap = await getDocs(q);
    return snap.docs[0]?.data();
  };

  /* ---------------- LOAD USER CHATS (Active & Friends) ---------------- */
  useEffect(() => {
    if (!auth.currentUser) return;
    const userRef = doc(db, 'users', auth.currentUser.uid);
    const unsubscribe = onSnapshot(userRef, async (userSnap) => {
      if (userSnap.exists()) {
        const userData = userSnap.data();
        const autoDumpPref = userData.autoDump !== undefined ? userData.autoDump : true;
        setAutoDumpEnabled(autoDumpPref);

        // 1. Load Active Chats (Saved Chats)
        if (autoDumpPref === false && userData.savedChats?.length > 0) {
          const chatPromises = userData.savedChats.map(async (uid) => {
            const chatUserSnap = await getDoc(doc(db, 'users', uid));
            const lastMessage = await getLastMessage(uid);
            if (chatUserSnap.exists()) {
              return {
                ...chatUserSnap.data(),
                uid: chatUserSnap.id, // Ensure UID is present
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

        // 2. Load Friends Tab Chats
        if (userData.friendsTab?.length > 0) {
          const friendPromises = userData.friendsTab.map(async (uid) => {
            const friendSnap = await getDoc(doc(db, 'users', uid));
            const lastMessage = await getLastMessage(uid);
            if (friendSnap.exists()) {
              return {
                ...friendSnap.data(),
                uid: friendSnap.id, // Ensure UID is present
                lastMessageTimestamp: lastMessage?.createdAt?.toDate() || new Date(0),
              };
            }
            return null;
          });
          const loadedFriends = (await Promise.all(friendPromises)).filter(f => f !== null);
          const sortedFriends = loadedFriends.sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);
          setFriendsTabChats(sortedFriends);
        } else {
          setFriendsTabChats([]);
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

  /* ---------------- CHAT HANDLERS ---------------- */
  const handleStartChat = useCallback(async (user) => {
    const newTimestamp = new Date();

    // Update Active Chats
    setActiveChats(prev => {
      const existingIndex = prev.findIndex(chat => chat.uid === user.uid);
      let updated;
      if (existingIndex !== -1) {
        updated = prev.map(chat => chat.uid === user.uid ? { ...chat, lastMessageTimestamp: newTimestamp } : chat);
      } else {
        // Only add to active if not in friends tab (handled by Sidebar logic usually, but good to be safe)
        // Actually, handleStartChat usually implies moving to active or just opening.
        // For now, we just update timestamp if it exists, or add it.
        // But wait, if it's in friendsTab, it shouldn't be in activeChats usually.
        updated = [{ ...user, lastMessageTimestamp: newTimestamp }, ...prev];
      }
      return updated.sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);
    });

    // Update Friends Tab Chats (if user is there)
    setFriendsTabChats(prev => {
      const existingIndex = prev.findIndex(chat => chat.uid === user.uid);
      if (existingIndex !== -1) {
        const updated = prev.map(chat => chat.uid === user.uid ? { ...chat, lastMessageTimestamp: newTimestamp } : chat);
        return updated.sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);
      }
      return prev;
    });

    setSelectedChat(user);

    if (viewState !== 'chat') {
      setHistoryStack(prev => [...prev, 'chat']);
      setViewState('chat');
    }
  }, [viewState]);

  const handleMessageSent = useCallback(() => {
    if (!selectedChat) return;
    const newTimestamp = new Date();

    // Update Active Chats
    setActiveChats(prev => {
      const existingIndex = prev.findIndex(chat => chat.uid === selectedChat.uid);
      if (existingIndex !== -1) {
        const updated = prev.map(chat => chat.uid === selectedChat.uid ? { ...chat, lastMessageTimestamp: newTimestamp } : chat);
        return updated.sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);
      }
      return prev;
    });

    // Update Friends Tab Chats
    setFriendsTabChats(prev => {
      const existingIndex = prev.findIndex(chat => chat.uid === selectedChat.uid);
      if (existingIndex !== -1) {
        const updated = prev.map(chat => chat.uid === selectedChat.uid ? { ...chat, lastMessageTimestamp: newTimestamp } : chat);
        return updated.sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);
      }
      return prev;
    });
  }, [selectedChat]);

  const handleMessageDeleted = useCallback(async () => {
    if (!selectedChat) return;

    // Fetch the NEW last message (since the previous one was deleted)
    const lastMsg = await getLastMessage(selectedChat.uid);
    const newTimestamp = lastMsg?.createdAt?.toDate() || new Date(0); // Default to epoch if no messages left

    // Update Active Chats
    setActiveChats(prev => {
      const existingIndex = prev.findIndex(chat => chat.uid === selectedChat.uid);
      if (existingIndex !== -1) {
        const updated = prev.map(chat => chat.uid === selectedChat.uid ? { ...chat, lastMessageTimestamp: newTimestamp } : chat);
        return updated.sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);
      }
      return prev;
    });

    // Update Friends Tab Chats
    setFriendsTabChats(prev => {
      const existingIndex = prev.findIndex(chat => chat.uid === selectedChat.uid);
      if (existingIndex !== -1) {
        const updated = prev.map(chat => chat.uid === selectedChat.uid ? { ...chat, lastMessageTimestamp: newTimestamp } : chat);
        return updated.sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);
      }
      return prev;
    });
  }, [selectedChat]);

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

  const handleSendFriendRequest = useCallback(async (receiverId) => {
    if (!auth.currentUser) return;
    try {
      await addDoc(collection(db, 'friendRequests'), {
        senderId: auth.currentUser.uid,
        receiverId: receiverId,
        status: 'pending',
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error sending friend request:", error);
    }
  }, []);

  const handleCancelFriendRequest = useCallback(async (receiverId) => {
    if (!auth.currentUser) return;
    try {
      const q = query(
        collection(db, 'friendRequests'),
        where('senderId', '==', auth.currentUser.uid),
        where('receiverId', '==', receiverId),
        where('status', '==', 'pending')
      );
      const snapshot = await getDocs(q);
      snapshot.forEach(async (doc) => {
        await deleteDoc(doc.ref);
      });
    } catch (error) {
      console.error("Error cancelling friend request:", error);
    }
  }, []);

  const handleRespondToRequests = useCallback(() => {
    setIsFriendRequestsOpen(true);
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
              handleAddFriend={handleSendFriendRequest}
              handleCancelFriendRequest={handleCancelFriendRequest}
              onRespondToRequests={handleRespondToRequests}
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
              handleAddFriend={handleSendFriendRequest}
              handleCancelFriendRequest={handleCancelFriendRequest}
              onRespondToRequests={handleRespondToRequests}
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
              handleAddFriend={handleSendFriendRequest}
              handleCancelFriendRequest={handleCancelFriendRequest}
              onRespondToRequests={handleRespondToRequests}
            />
          </div>
        );

      case 'viewingOtherProfile':
        return (
          <div className="dual-pane-layout">
            <Sidebar
              onStartChat={handleStartChat}
              activeChats={activeChats}
              friendsTabChats={friendsTabChats} // Pass to Sidebar
              onSelectChat={setSelectedChat}
              selectedChat={selectedChat}
              onViewUser={handleViewOtherProfile}
            />
            <ProfilePage
              onBack={goBack}
              userProfile={userProfile}
              viewingUserId={viewingUserId}
              onStartChat={handleStartChat}
              handleAddFriend={handleSendFriendRequest}
              handleCancelFriendRequest={handleCancelFriendRequest}
              onRespondToRequests={handleRespondToRequests}
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
              friendsTabChats={friendsTabChats} // Pass to Sidebar
              onSelectChat={setSelectedChat}
              selectedChat={selectedChat}
              onViewUser={handleViewOtherProfile}
            />
            <ChatWindow
              selectedChat={selectedChat}
              onBack={handleBack}
              onMessageSent={handleMessageSent} // Pass handler
              onMessageDeleted={handleMessageDeleted} // Pass delete handler
            />
          </div>
        );
    }
  };

  /* ---------------- MOBILE TOGGLE LOGIC ---------------- */
  // Determine if we should show the "Right Pane" (Chat, Profile, etc.) on mobile
  const showRightPaneOnMobile =
    (viewState === 'chat' && !!selectedChat) ||
    viewState === 'viewingFriendProfile' ||
    viewState === 'viewingOtherProfile' ||
    viewState === 'myProfile';

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
      <div className={`chat-body ${showRightPaneOnMobile ? 'mobile-show-right-pane' : ''}`}>
        {renderContent()}
      </div>
    </div>
  );
};

export default Chat;
