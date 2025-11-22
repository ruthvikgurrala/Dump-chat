import React, { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { auth } from '../../firebase';
import { motion } from 'framer-motion';
import './MessageList.css';

const MessageList = forwardRef(({
  messages,
  handleMessageMouseEnter,
  handleMessageMouseLeave,
  handleEdit,
  handleDelete,
  loadMoreMessages,
  hasMore,
  loadingMore,
  ...props
}, forwardedRef) => {
  const containerRef = useRef(null);

  useImperativeHandle(forwardedRef, () => containerRef.current, [containerRef.current]);

  const getMessageDate = (msg) => {
    if (!msg || !msg.createdAt) return null;
    if (typeof msg.createdAt.toDate === 'function') return msg.createdAt.toDate();
    if (msg.createdAt.seconds) return new Date(msg.createdAt.seconds * 1000);
    if (msg.createdAt instanceof Date) return msg.createdAt;
    return null;
  };

  const handleScroll = useCallback((e) => {
    const el = e.target;
    if (!el) return;

    // 1. Call parent onScroll (for isAtBottom tracking)
    if (props.onScroll) {
      props.onScroll(e);
    }

    // 2. Internal Load More Logic
    const scrollTop = el.scrollTop;
    if (scrollTop <= 60 && hasMore && !loadingMore) {
      console.log('MessageList: near top, calling loadMoreMessages()');
      loadMoreMessages?.();
    }
  }, [hasMore, loadingMore, loadMoreMessages, props.onScroll]);

  const renderMessages = () => {
    if (!messages || messages.length === 0) return null;
    return messages.map((msg, idx) => {
      const msgDate = getMessageDate(msg);
      const prevDate = idx > 0 ? getMessageDate(messages[idx - 1]) : null;
      const showDateDivider = !prevDate || (msgDate && prevDate && msgDate.toDateString() !== prevDate.toDateString());
      const isMine = msg.senderId === auth.currentUser.uid;

      const lastSentMessage = messages.slice().reverse().find(m => m.senderId === auth.currentUser.uid);
      const showSeen = isMine && lastSentMessage && msg.id === lastSentMessage.id && msg.seen;

      return (
        <React.Fragment key={msg.id}>
          {showDateDivider && msgDate && (
            <div className="chat-date-divider">{msgDate.toDateString()}</div>
          )}
          <motion.div
            className={`message ${isMine ? 'sent' : 'received'}`}
            data-id={msg.id}
            onMouseEnter={() => handleMessageMouseEnter?.(msg.id)}
            onMouseLeave={() => handleMessageMouseLeave?.(msg.id)}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
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
              <div className="message-actions">
                <button onClick={() => handleEdit?.(msg)}>✏️</button>
                <button onClick={() => handleDelete?.(msg)}>🗑️</button>
              </div>
            )}
          </motion.div>
        </React.Fragment>
      );
    });
  };

  return (
    <div className="messages-list" ref={containerRef} onScroll={handleScroll}>
      {loadingMore && <div className="loading-older">Loading older messages...</div>}
      {renderMessages()}

    </div>
  );
});

export default MessageList;