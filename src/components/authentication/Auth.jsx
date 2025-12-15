// src/components/Auth.jsx

import React, { useState } from 'react';
import './Auth.css';
import { auth, db } from '../../firebase';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    updateProfile,
} from 'firebase/auth';
import { setDoc, doc, getDoc } from 'firebase/firestore';
import { Eye, EyeOff } from 'lucide-react';

// UPDATED: Receive props for error handling from App.jsx
const Auth = ({ authError, setAuthError }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [message, setMessage] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const handleRegister = async () => {
        setAuthError('');
        setMessage('');
        if (!username.trim()) {
            setAuthError("Please enter a username.");
            return;
        }
        try {
            const usernameRef = doc(db, "usernames", username);
            const usernameSnap = await getDoc(usernameRef);
            if (usernameSnap.exists()) {
                setAuthError("Username is already taken. Please choose another one.");
                return;
            }

            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            await updateProfile(user, { displayName: username });

            // Securely set only non-sensitive fields. 
            // Sensitive fields (plan, isAdmin, etc.) are set by the Cloud Function 'onUserCreated'.
            await setDoc(doc(db, "users", user.uid), {
                uid: user.uid,
                username: username,
                email: email,
            }, { merge: true });

            await setDoc(doc(db, "usernames", username), { uid: user.uid });
        } catch (error) {
            setAuthError(error.message.replace('Firebase: ', ''));
        }
    };

    const handleLogin = async () => {
        setAuthError('');
        setMessage('');
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            setAuthError(error.message.replace('Firebase: ', ''));
        }
    };

    const handleForgotPassword = async () => {
        setAuthError('');
        setMessage('');
        if (!email) {
            setAuthError("Please enter your email to reset your password.");
            return;
        }
        try {
            await sendPasswordResetEmail(auth, email);
            setMessage("Password reset email sent! Check your inbox.");
        } catch (error) {
            setAuthError(error.message.replace('Firebase: ', ''));
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (isLogin) {
            handleLogin();
        } else {
            handleRegister();
        }
    };

    // Handlers to clear the error message when the user starts typing
    const handleEmailChange = (e) => { setAuthError(''); setEmail(e.target.value); };
    const handlePasswordChange = (e) => { setAuthError(''); setPassword(e.target.value); };
    const handleUsernameChange = (e) => { setAuthError(''); setUsername(e.target.value.toLowerCase()); };

    return (
        <div className="auth-container">
            <div className="auth-toggle">
                <button onClick={() => { setIsLogin(true); setAuthError(''); setMessage(''); }} className={isLogin ? 'active' : ''}>Login</button>
                <button onClick={() => { setIsLogin(false); setAuthError(''); setMessage(''); }} className={!isLogin ? 'active' : ''}>Register</button>
            </div>
            <form onSubmit={handleSubmit} className="auth-form">
                <h2>{isLogin ? 'Login' : 'Register'}</h2>
                {!isLogin && (
                    <input type="text" value={username} onChange={handleUsernameChange} placeholder="Username" required />
                )}
                <input type="email" value={email} onChange={handleEmailChange} placeholder="Email" required />
                <div className="password-wrapper">
                    <input type={showPassword ? "text" : "password"} value={password} onChange={handlePasswordChange} placeholder="Password" required minLength="6" />
                    <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label="Toggle password visibility">
                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                </div>

                {/* Display the error from props */}
                {authError && <p className="auth-error">{authError}</p>}
                {message && <p className="auth-message">{message}</p>}

                <button type="submit">{isLogin ? 'Login' : 'Register'}</button>
                {isLogin && (<a href="#" onClick={handleForgotPassword} className="forgot-password-link">Forgot Password?</a>)}
            </form>
        </div>
    );
};

export default Auth;