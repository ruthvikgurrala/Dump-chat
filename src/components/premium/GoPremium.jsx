// src/components/premium/GoPremium.jsx
import React, { useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import { getPublicConfig, auth, db } from '../../firebase';
import { doc, setDoc } from 'firebase/firestore';
import './GoPremium.css';

const GoPremium = ({ onBack, userProfile }) => {
  const [prices, setPrices] = useState({
    webium: '...',
    mobilum: '...',
    omnium: '...'
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [subscribing, setSubscribing] = useState(false);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const result = await getPublicConfig();
        const data = result.data;

        if (data.error) {
          throw new Error(data.error);
        }

        setPrices({
          webium: `₹${data.priceWeb}`,
          mobilum: `₹${data.priceMobilum}`,
          omnium: `₹${data.priceOmnium}`
        });
        setIsLoading(false);

      } catch (error) {
        console.error("Error fetching prices via function:", error);
        setError("Failed to load pricing. Please try again later.");
        setPrices({ webium: '₹19', mobilum: '₹39', omnium: '₹49' });
        setIsLoading(false);
      }
    };
    fetchPrices();
  }, []);

  const handleSubscribe = async (planKey) => {
    if (subscribing || !auth.currentUser) return;

    setSubscribing(true);
    setSuccess('');

    const userRef = doc(db, 'users', auth.currentUser.uid);

    try {
      await setDoc(userRef, { plan: planKey }, { merge: true });
      setSuccess(`Successfully subscribed to ${planKey}! This is a dummy transaction.`);

      setTimeout(async () => {
        await setDoc(userRef, { plan: 'free' }, { merge: true });
        setSubscribing(false);
        setSuccess('Plan has been reverted to free.');
        setTimeout(() => setSuccess(''), 3000);
      }, 5000);

    } catch (err) {
      console.error("Dummy subscription failed:", err);
      setError("Dummy subscription failed. Please check console.");
      setSubscribing(false);
    }
  };

  const plans = [
    { name: "Webium", price: prices.webium, features: ["Unlimited web access", "No message restrictions", "Priority support"], borderColor: "bronze", disabled: false, planKey: "web" },
    { name: "Mobilum", price: prices.mobilum, features: ["Unlimited mobile access", "All Webium features", "Push notifications"], borderColor: "silver", disabled: true, planKey: "mobile" },
    { name: "Omnium", price: prices.omnium, features: ["Access on all platforms", "All Mobilum & Webium features", "Sync across devices"], highlight: true, borderColor: "gold", disabled: true, planKey: "omnium" },
  ];

  const isPlanSubscribed = (planKey) => {
    if (!userProfile || !userProfile.plan) return false;

    const currentUserPlan = userProfile.plan;
    if (currentUserPlan === 'omnium') {
      return true;
    } else if (currentUserPlan === planKey) {
      return true;
    }
    return false;
  };

  if (isLoading) {
    return (
      <div className="go-premium-container">
        <div className="loading-message">Loading premium plans...</div>
      </div>
    );
  }

  return (
    <div
      className="go-premium-container"
    >
      <div className="go-premium-header">
        <button onClick={onBack} className="back-button">←</button>
        <h2>Go Premium</h2>
      </div>

      {error && <div className="premium-error-message">{error}</div>}
      {success && <div className="premium-success-message">{success}</div>}

      <div className="premium-grid">
        {plans.map((plan, index) => {
          const subscribed = isPlanSubscribed(plan.planKey);
          return (
            <div
              key={plan.planKey}
              className={`premium-card ${plan.highlight ? 'highlight' : ''} ${plan.borderColor}-border`}
            >
              <h3 className="plan-name">{plan.name}</h3>
              <p className="plan-price">{plan.price}<span>{plan.price !== "Free" && "/month"}</span></p>
              <ul className="feature-list">
                {plan.features.map((feature, i) => (
                  <li key={i}><Check size={16} /> {feature}</li>
                ))}
              </ul>
              <button
                className="buy-btn"
                disabled={subscribing || plan.disabled || subscribed}
                onClick={() => handleSubscribe(plan.planKey)}
              >
                {subscribing ? "Subscribing..." : subscribed ? "Subscribed" : plan.disabled ? "Coming Soon" : "Subscribe"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default GoPremium;

/*
// ==========================================
// to enable permanent subscriptions and all plans.
// ==========================================

const GoPremium = ({ onBack, userProfile }) => {
  const [prices, setPrices] = useState({
    webium: '...',
    mobilum: '...',
    omnium: '...'
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [subscribing, setSubscribing] = useState(false);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const result = await getPublicConfig();
        const data = result.data;

        if (data.error) {
          throw new Error(data.error);
        }

        setPrices({
          webium: `₹${data.priceWeb}`,
          mobilum: `₹${data.priceMobilum}`,
          omnium: `₹${data.priceOmnium}`
        });
        setIsLoading(false);

      } catch (error) {
        console.error("Error fetching prices via function:", error);
        setError("Failed to load pricing. Please try again later.");
        setPrices({ webium: '₹19', mobilum: '₹39', omnium: '₹49' });
        setIsLoading(false);
      }
    };
    fetchPrices();
  }, []);

  // --- DEMO MODE: Permanent Subscription ---
  const handleSubscribe = async (planKey) => {
    if (subscribing || !auth.currentUser) return;

    setSubscribing(true);
    setSuccess('');

    const userRef = doc(db, 'users', auth.currentUser.uid);

    try {
      // Permanent update (no revert timeout)
      await setDoc(userRef, { plan: planKey }, { merge: true });
      setSuccess(`Successfully subscribed to ${planKey}! (Demo Mode)`);
      setSubscribing(false);

    } catch (err) {
      console.error("Demo subscription failed:", err);
      setError("Demo subscription failed. Please check console.");
      setSubscribing(false);
    }
  };

  // --- DEMO MODE: All Plans Enabled ---
  const plans = [
    { name: "Webium", price: prices.webium, features: ["Unlimited web access", "No message restrictions", "Priority support"], borderColor: "bronze", disabled: false, planKey: "web" },
    { name: "Mobilum", price: prices.mobilum, features: ["Unlimited mobile access", "All Webium features", "Push notifications"], borderColor: "silver", disabled: false, planKey: "mobile" },
    { name: "Omnium", price: prices.omnium, features: ["Access on all platforms", "All Mobilum & Webium features", "Sync across devices"], highlight: true, borderColor: "gold", disabled: false, planKey: "omnium" },
  ];

  const isPlanSubscribed = (planKey) => {
    if (!userProfile || !userProfile.plan) return false;

    const currentUserPlan = userProfile.plan;
    if (currentUserPlan === 'omnium') {
      return true;
    } else if (currentUserPlan === planKey) {
      return true;
    }
    return false;
  };

  if (isLoading) {
    return (
      <div className="go-premium-container">
        <div className="loading-message">Loading premium plans...</div>
      </div>
    );
  }

  return (
    <div
      className="go-premium-container"
    >
      <div className="go-premium-header">
        <button onClick={onBack} className="back-button">←</button>
        <h2>Go Premium (Demo Mode)</h2>
      </div>

      {error && <div className="premium-error-message">{error}</div>}
      {success && <div className="premium-success-message">{success}</div>}

      <div className="premium-grid">
        {plans.map((plan, index) => {
          const subscribed = isPlanSubscribed(plan.planKey);
          return (
            <div
              key={plan.planKey}
              className={`premium-card ${plan.highlight ? 'highlight' : ''} ${plan.borderColor}-border`}
            >
              <h3 className="plan-name">{plan.name}</h3>
              <p className="plan-price">{plan.price}<span>{plan.price !== "Free" && "/month"}</span></p>
              <ul className="feature-list">
                {plan.features.map((feature, i) => (
                  <li key={i}><Check size={16} /> {feature}</li>
                ))}
              </ul>
              <button
                className="buy-btn"
                disabled={subscribing || plan.disabled || subscribed}
                onClick={() => handleSubscribe(plan.planKey)}
              >
                {subscribing ? "Subscribing..." : subscribed ? "Subscribed" : plan.disabled ? "Coming Soon" : "Subscribe"}
              </button>
            </div>
          );
        })}
      </div>

      { // --- DEMO MODE: Cancel Button --- }
      <button 
        className="cancel-btn" 
        style={{ marginTop: '20px', padding: '10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', width: '100%' }}
        onClick={async () => {
          await setDoc(doc(db, 'users', auth.currentUser.uid), { plan: 'free' }, { merge: true });
          alert("Plan cancelled (Demo Mode)");
        }}
      >
        Cancel Plan (Demo Only)
      </button>

    </div>
  );
};
*/