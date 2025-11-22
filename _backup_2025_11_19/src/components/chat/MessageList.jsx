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
  loadingMore
}, forwardedRef) => {
  const containerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const prevMessageCount = useRef(messages?.length || 0);
  const loadingMoreRef = useRef(false);

  useImperativeHandle(forwardedRef, () => containerRef.current, [containerRef.current]);

  // Debug ref initialization
  useEffect(() => {
    if (!containerRef.current) {
      console.log('MessageList: containerRef is null');
    }
    if (!messagesEndRef.current) {
      console.log('MessageList: messagesEndRef is null');
    }
  }, []);

  const getMessageDate = (msg) => {
    if (!msg || !msg.createdAt) return null;
    if (typeof msg.createdAt.toDate === 'function') return msg.createdAt.toDate();
    if (msg.createdAt.seconds) return new Date(msg.createdAt.seconds * 1000);
    if (msg.createdAt instanceof Date) return msg.createdAt;
    return null;
  };

  // Scroll to bottom function
  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current && containerRef.current) {
      setTimeout(() => {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        console.log('MessageList: scrolled to bottom', {
          scrollTop: containerRef.current.scrollTop,
          scrollHeight: containerRef.current.scrollHeight,
          clientHeight: containerRef.current.clientHeight
        });
      }, 150); // Increased delay for DOM rendering
    } else {
      console.log('MessageList: scroll failed', {
        messagesEndRef: !!messagesEndRef.current,
        containerRef: !!containerRef.current
      });
    }
  }, []);

  useEffect(() => {
    // Scroll to bottom on initial load if messages exist
    if (messages?.length > 0 && !loadingMoreRef.current) {
      console.log('MessageList: initial load, attempting scroll to bottom');
      scrollToBottom();
    }
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      prevMessageCount.current = messages?.length || 0;
      return;
    }

    const prevCount = prevMessageCount.current;
    const newCount = messages?.length || 0;
    const added = newCount - prevCount;

    console.log('MessageList: messages count changed', {
      prevCount,
      newCount,
      added,
      loadingMore: loadingMoreRef.current,
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight
    });

    if (added > 0 && !loadingMoreRef.current) {
      console.log('MessageList: attempting scroll to bottom');
      scrollToBottom();
    } else if (added > 0) {
      console.log('MessageList: skipped auto-scroll', { added, loadingMore: loadingMoreRef.current });
    }

    if (loadingMoreRef.current && added > 0) {
      const prevScrollHeight = el.scrollHeight - el.clientHeight;
      requestAnimationFrame(() => {
        const newScrollHeight = el.scrollHeight - el.clientHeight;
        const delta = newScrollHeight - prevScrollHeight;
        el.scrollTop = Math.max(0, delta + el.scrollTop);
        console.log('MessageList: preserved scroll after prepending older messages, delta=', delta);
        loadingMoreRef.current = false;
      });
    }

    prevMessageCount.current = newCount;
  }, [messages, loadingMore, scrollToBottom]);

  useEffect(() => {
    loadingMoreRef.current = !!loadingMore;
  }, [loadingMore]);

  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const scrollTop = el.scrollTop;
    if (scrollTop <= 60 && hasMore && !loadingMore) {
      console.log('MessageList: near top, calling loadMoreMessages()');
      loadMoreMessages?.();
    }
  }, [hasMore, loadingMore, loadMoreMessages]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let timeoutId = null;
    const debouncedScroll = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        onScroll();
      }, 100);
    };

    el.addEventListener('scroll', debouncedScroll, { passive: true });
    return () => {
      clearTimeout(timeoutId);
      el.removeEventListener('scroll', debouncedScroll);
    };
  }, [onScroll]);

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
    <div className="messages-list" ref={containerRef}>
      {loadingMore && <div className="loading-older">Loading older messages...</div>}
      {renderMessages()}
      <div ref={messagesEndRef} />
    </div>
  );
});

export default MessageList;