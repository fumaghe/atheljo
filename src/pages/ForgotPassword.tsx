// src/pages/ForgotPassword.tsx
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const ForgotPassword: React.FC = () => {
  const { user } = useAuth();
  const [usernameInput, setUsernameInput] = useState(user ? user.username : '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000/api";
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setError('');
    setIsLoading(true);

    const username = user ? user.username : usernameInput;
    if (!username) {
      setError('Username is required');
      setIsLoading(false);
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.message || 'Error sending reset link');
      } else {
        // Il messaggio è impostato in modo tale da essere "uniforme"
        setMessage(data.message || 'If that account exists and has an email, a reset link has been sent.');
      }
    } catch (err) {
      console.error(err);
      setError('Server error');
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#06272b] flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold text-[#eeeeee] mb-4">Forgot Password</h1>
      <form onSubmit={handleSubmit} className="w-full max-w-md bg-[#0b3c43] p-8 rounded-lg shadow-xl">
        {!user && (
          <div>
            <label className="block text-sm font-medium text-[#eeeeee] mb-2">Username</label>
            <input
              type="text"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              className="w-full bg-[#06272b] rounded-lg px-4 py-2 border border-[#22c1d4]/20 focus:outline-none focus:border-[#22c1d4]"
              placeholder="Enter your username"
            />
          </div>
        )}
        <button 
          type="submit"
          className="mt-4 w-full bg-[#22c1d4] text-[#06272b] py-2 rounded-lg font-semibold hover:bg-[#22c1d4]/90 transition-colors"
        >
          {isLoading ? "Sending..." : "Send Reset Link"}
        </button>
        {message && (
          <div className="mt-4 mb-4 p-4 bg-red-100 border border-red-200 rounded-lg flex items-center gap-3 text-red-500">
            <span>{message}</span>
          </div>
        )}
        {error && (
          <div className="mt-4 mb-4 p-4 bg-red-100 border border-red-200 rounded-lg flex items-center gap-3 text-red-500">
            <span>{error}</span>
          </div>
        )}
      </form>
    </div>
  );
};

export default ForgotPassword;
