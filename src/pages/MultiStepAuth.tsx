// src/pages/MultiStepAuth.tsx
import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Lock,
  Mail,
  Shuffle,
  User,
  Eye,
  EyeOff,
  HelpCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

import loginPhoto from '../assets/images/login_photo.png';
import logoWhite from '../assets/images/X_White.png';

function getPasswordFeedback(password: string): { level: string; suggestions: string[] } {
  const suggestions: string[] = [];
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  if (!hasUppercase) suggestions.push('Include at least one uppercase letter');
  if (!hasLowercase) suggestions.push('Include at least one lowercase letter');
  if (!hasDigit) suggestions.push('Include at least one number');
  if (!hasSpecial) suggestions.push('Include at least one special character');
  if (password.length < 6) suggestions.push('Password must be at least 6 characters');
  if (password.length < 8) suggestions.push('Add more characters for medium strength');
  if (password.length < 12) suggestions.push('Add more characters for high strength');

  let level = '';
  if (password.length < 6) {
    level = 'Too Weak';
  } else if (password.length >= 12 && hasUppercase && hasLowercase && hasDigit && hasSpecial) {
    level = 'Strong';
  } else if (password.length >= 8 && (hasUppercase || hasLowercase) && hasDigit) {
    level = 'Medium';
  } else {
    level = 'Easy';
  }
  return { level, suggestions };
}

function getPasswordStrengthProps(password: string): { percent: number; color: string } {
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  let percent = 0;
  let color = '';

  if (password.length < 6) {
    percent = 25;
    color = '#00cfe8';
  } else if (password.length >= 12 && hasUppercase && hasLowercase && hasDigit && hasSpecial) {
    percent = 100;
    color = '#f8485e';
  } else if (password.length >= 8 && (hasUppercase || hasLowercase) && hasDigit) {
    percent = 75;
    color = '#999999';
  } else {
    percent = 50;
    color = '#ffffff';
  }
  return { percent, color };
}

function generateSecurePassword(): string {
  const length = 12;
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  const special = '!@#$%^&*()_+~`|}{[]:;?><,./-';
  const getRandom = (str: string) => str[Math.floor(Math.random() * str.length)];

  let password = '';
  password += getRandom(lower);
  password += getRandom(upper);
  password += getRandom(digits);
  password += getRandom(special);
  const all = lower + upper + digits + special;
  for (let i = 4; i < length; i++) {
    password += getRandom(all);
  }
  const shuffled = password.split('').sort(() => 0.5 - Math.random()).join('');
  const { level } = getPasswordFeedback(shuffled);
  if (level !== 'Strong') {
    return generateSecurePassword();
  }
  return shuffled;
}

const steps = [
  { number: 1, label: 'Login' },
  { number: 2, label: 'MFA' },
  { number: 3, label: 'Password' }
];

const StepIndicator: React.FC<{ step: number }> = ({ step }) => {
  return (
    <div className="mt-8 flex items-center justify-center space-x-4">
      {steps.map((s, idx) => {
        const isActive = step === s.number;
        return (
          <React.Fragment key={s.number}>
            <div className="flex items-center">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold transition-all duration-200 ${
                  isActive
                    ? 'bg-[#00cfe8] text-[#042c2e]'
                    : 'bg-transparent text-[#00cfe8] border border-[#00cfe8]'
                }`}
              >
                {s.number}
              </div>
              <span className="ml-2 text-sm text-white">{s.label}</span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={`h-[2px] w-12 transition-all duration-200 ${
                  step > s.number ? 'bg-[#00cfe8]' : 'bg-[#00cfe8]/20'
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

const MultiStepAuth: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user, login, updateUser, isInitializingSession } = useAuth();
  const [currentUser, setCurrentUser] = useState(user);

  // Controllo se il contesto è sicuro: HTTPS oppure localhost
  const isSecureContext = window.location.protocol === 'https:' || window.location.hostname === 'localhost';

  useEffect(() => {
    if (!currentUser) {
      const stored = localStorage.getItem('aiopsUser');
      if (stored) {
        setCurrentUser(JSON.parse(stored));
      }
    }
  }, [currentUser]);

  const [step, setStep] = useState<number>(1);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [showEmail, setShowEmail] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotMessage, setForgotMessage] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [forgotIsLoading, setForgotIsLoading] = useState(false);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [feedback, setFeedback] = useState<{ level: string; suggestions: string[] }>({
    level: '',
    suggestions: []
  });
  const [currentSuggestion, setCurrentSuggestion] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!isInitializingSession && isAuthenticated && currentUser && !currentUser.forcePasswordChange) {
      navigate('/');
    }
  }, [isAuthenticated, currentUser, isInitializingSession, navigate]);

  useEffect(() => {
    if (!isInitializingSession && currentUser && currentUser.forcePasswordChange) {
      setStep(3);
    }
  }, [currentUser, isInitializingSession]);

  useEffect(() => {
    const fb = getPasswordFeedback(newPassword);
    setFeedback(fb);
    setCurrentSuggestion(fb.suggestions.length > 0 ? fb.suggestions[0] : null);
  }, [newPassword]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!username || !password || (showEmail && !email)) {
      setErrorMsg('Please fill in all required fields.');
      return;
    }
    setIsLoading(true);
    const credentials: any = { username, password };
    if (showEmail) credentials.email = email;
    const result = await login(credentials);
    setIsLoading(false);
    if (!result.success) {
      if (result.twoFactorRequired) {
        if (result.userId) {
          setPendingUserId(result.userId);
          setStep(2);
        } else {
          setShowEmail(true);
          setErrorMsg(result.message || 'Please provide your email to continue.');
        }
      } else {
        if (!username) setErrorMsg('Hai dimenticato il tuo username?');
        else setErrorMsg(result.message || 'Login error');
      }
    } else {
      if (currentUser && currentUser.forcePasswordChange) {
        setStep(3);
      } else {
        navigate('/');
      }
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotMessage('');
    setForgotError('');
    setForgotIsLoading(true);
    const usernameToSend = username.trim();
    if (!usernameToSend) {
      setForgotError('Username is required');
      setForgotIsLoading(false);
      return;
    }
    try {
      // MODIFICA: Usa percorso relativo per API_BASE
      const API_BASE = import.meta.env.VITE_API_BASE || '/api';
      const response = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameToSend })
      });
      const data = await response.json();
      if (!response.ok) {
        setForgotError(data.message || 'Error sending reset link');
      } else {
        setForgotMessage(data.message || 'A reset link has been sent to your registered email.');
      }
    } catch (err) {
      console.error(err);
      setForgotError('Server error');
    }
    setForgotIsLoading(false);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!pendingUserId) {
      setErrorMsg('No pending user found. Please try logging in again.');
      return;
    }
    setIsLoading(true);
    try {
      // MODIFICA: Usa percorso relativo per API_BASE
      const API_BASE = import.meta.env.VITE_API_BASE || '/api';
      const response = await fetch(`${API_BASE}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: pendingUserId, otp })
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) {
        setErrorMsg(data.message || 'OTP not valid');
        setIsLoading(false);
        return;
      }
      localStorage.setItem('aiopsUser', JSON.stringify(data));
      localStorage.setItem('aiopsUserTimestamp', Date.now().toString());
      setCurrentUser(data);
      if (data.forcePasswordChange) {
        setStep(3);
      } else {
        navigate('/');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Server error during OTP verification');
    }
    setIsLoading(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!newPassword || !confirmPassword) {
      setErrorMsg('Please fill in all required fields.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    if (!currentUser) {
      setErrorMsg('No user session found. Please refresh the page.');
      return;
    }
    setIsLoading(true);
    const res = await updateUser(currentUser.id, {
      password: newPassword,
      forcePasswordChange: false
    });
    setIsLoading(false);
    if (!res) {
      setErrorMsg('Error updating the password.');
      return;
    }
    const updatedUser = { ...currentUser, forcePasswordChange: false };
    setCurrentUser(updatedUser);
    localStorage.setItem('aiopsUser', JSON.stringify(updatedUser));
    navigate('/');
  };

  const handleAutoGenerate = () => {
    setIsGenerating(true);
    setGenerationProgress(0);
    const interval = setInterval(() => {
      setGenerationProgress((prev) => {
        if (prev >= 12) {
          clearInterval(interval);
          const generated = generateSecurePassword();
          setNewPassword(generated);
          setConfirmPassword(generated);
          // Utilizza Clipboard API solo se supportata
          if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(generated)
              .then(() => {
                setCopyMessage('Password copied!');
                setTimeout(() => setCopyMessage(''), 3000);
              })
              .catch((err) => console.error('Clipboard API error:', err));
          }
          setIsGenerating(false);
          return prev;
        }
        return prev + 1;
      });
    }, 100);
  };

  const renderGenerationDots = () => {
    const dots = [];
    for (let i = 0; i < 12; i++) {
      dots.push(
        <span
          key={i}
          className={`w-2 h-2 rounded-full mx-1 ${
            i < generationProgress ? 'bg-[#00cfe8]' : 'bg-transparent border border-[#00cfe8]'
          }`}
        />
      );
    }
    return <div className="flex justify-center mt-2">{dots}</div>;
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        if (isForgotPassword) {
          return (
            <form onSubmit={handleForgotPasswordSubmit} className="space-y-6 transition-opacity duration-300">
              {forgotError && (
                <div className="mb-4 p-4 bg-[#f8485e]/10 border border-[#f8485e]/20 rounded flex items-center gap-3 text-[#f8485e]">
                  <AlertCircle className="w-5 h-5" />
                  <span>{forgotError}</span>
                </div>
              )}
              {forgotMessage && (
                <div className="mb-4 p-4 border border-[#f8485e]/20 rounded text-[#f8485e] text-center">
                  {forgotMessage}
                </div>
              )}
              <div>
                <label htmlFor="forgot-username" className="block text-sm font-medium text-white mb-2">
                  Username
                </label>
                <input
                  id="forgot-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-[#0a1f20] rounded px-4 py-3 border border-[#0a1f20] focus:outline-none focus:ring-2 focus:ring-[#00cfe8] transition-all"
                  placeholder="Enter your username"
                  aria-label="Username"
                />
              </div>
              <div>
                <button
                  type="submit"
                  className="w-full bg-[#00cfe8] text-[#042c2e] py-2 rounded font-semibold hover:bg-[#00b3c9] transition-colors"
                >
                  {forgotIsLoading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </div>
              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPassword(false);
                    setForgotMessage('');
                    setForgotError('');
                  }}
                  className="flex items-center justify-center gap-1 text-[#00cfe8] hover:underline"
                >
                  <HelpCircle className="w-4 h-4" />
                  <span>Back to Login</span>
                </button>
              </div>
            </form>
          );
        }
        return (
          <form onSubmit={handleLogin} className="space-y-6 transition-opacity duration-300">
            {errorMsg && (
              <div className="mb-4 p-4 bg-[#f8485e]/10 border border-[#f8485e]/20 rounded flex items-center gap-3 text-[#f8485e]">
                <AlertCircle className="w-5 h-5" />
                <span>{errorMsg}</span>
              </div>
            )}
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-white mb-2">
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="w-5 h-5 text-[#00cfe8]" />
                </div>
                <input
                  id="username"
                  type="text"
                  autoFocus
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-[#0a1f20] pl-10 pr-3 py-3 border border-[#0a1f20] rounded transition-all focus:outline-none focus:ring-2 focus:ring-[#00cfe8]"
                  placeholder="Enter your username"
                  aria-label="Username"
                />
              </div>
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-white mb-2">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="w-5 h-5 text-[#00cfe8]" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#0a1f20] pl-10 pr-10 py-3 border border-[#0a1f20] rounded transition-all focus:outline-none focus:ring-2 focus:ring-[#00cfe8]"
                  placeholder="Enter your password"
                  aria-label="Password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5 text-[#00cfe8]" />
                  ) : (
                    <Eye className="w-5 h-5 text-[#00cfe8]" />
                  )}
                </button>
              </div>
            </div>
            {showEmail && (
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-white mb-2">
                  Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="w-5 h-5 text-[#00cfe8]" />
                  </div>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-[#0a1f20] pl-10 pr-3 py-3 border border-[#0a1f20] rounded transition-all focus:outline-none focus:ring-2 focus:ring-[#00cfe8]"
                    placeholder="Enter your email"
                    aria-label="Email"
                  />
                </div>
              </div>
            )}
            <div>
              <button
                type="submit"
                className="w-full flex justify-center py-3 px-4 bg-[#00cfe8] text-[#042c2e] rounded font-medium hover:bg-[#00b3c9] transition-colors"
              >
                {isLoading ? (
                  <div className="loader border-t-2 border-b-2 border-[#042c2e] rounded-full w-6 h-6 animate-spin" />
                ) : (
                  'Sign in'
                )}
              </button>
            </div>
            <div className="text-center mt-4">
              <button
                type="button"
                onClick={() => setIsForgotPassword(true)}
                className="flex items-center justify-center gap-1 text-[#00cfe8] hover:underline"
              >
                <HelpCircle className="w-4 h-4" />
                <span>Forgot Password?</span>
              </button>
            </div>
          </form>
        );
      case 2:
        return (
          <form onSubmit={handleVerifyOtp} className="space-y-6 transition-opacity duration-300">
            {errorMsg && (
              <div className="mb-4 p-4 bg-[#f8485e]/10 border border-[#f8485e]/20 rounded flex items-center gap-3 text-[#f8485e]">
                <AlertCircle className="w-5 h-5" />
                <span>{errorMsg}</span>
              </div>
            )}
            <div>
              <label htmlFor="otp" className="block text-sm font-medium text-white mb-2">
                OTP Code
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="w-5 h-5 text-[#00cfe8]" />
                </div>
                <input
                  id="otp"
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="w-full bg-[#0a1f20] pl-10 pr-3 py-3 border border-[#0a1f20] rounded transition-all focus:outline-none focus:ring-2 focus:ring-[#00cfe8]"
                  placeholder="Enter OTP code"
                  aria-label="OTP code"
                />
              </div>
            </div>
            <div>
              <button
                type="submit"
                className="w-full py-3 px-4 bg-[#00cfe8] text-[#042c2e] rounded font-medium hover:bg-[#00b3c9] transition-colors"
              >
                {isLoading ? (
                  <div className="loader border-t-2 border-b-2 border-[#042c2e] rounded-full w-6 h-6 animate-spin" />
                ) : (
                  'Verify'
                )}
              </button>
            </div>
          </form>
        );
      case 3:
        return (
          <form onSubmit={handleChangePassword} className="space-y-6 transition-opacity duration-300">
            {errorMsg && (
              <div className="mb-4 p-4 bg-[#f8485e]/10 border border-[#f8485e]/20 rounded flex items-center gap-3 text-[#f8485e]">
                <AlertCircle className="w-5 h-5" />
                <span>{errorMsg}</span>
              </div>
            )}
            <div>
              <label htmlFor="new-password" className="block text-lg font-medium text-white mb-2">
                New Password
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-[#0a1f20] rounded px-4 py-3 border border-[#0a1f20] transition-all focus:outline-none focus:ring-2 focus:ring-[#00cfe8]"
                  placeholder="Enter new password"
                  required
                  disabled={isGenerating}
                  aria-label="New Password"
                />
                {isSecureContext ? (
                  <button
                    type="button"
                    onClick={handleAutoGenerate}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    title="Generate secure password"
                    aria-label="Generate secure password"
                  >
                    <Shuffle className="w-6 h-6 text-[#00cfe8] hover:text-[#f8485e]" />
                    {copyMessage && (
                      <div className="absolute -top-6 right-0 bg-[#042c2e] text-[#f8485e] text-xs px-2 py-1 rounded">
                        {copyMessage}
                      </div>
                    )}
                  </button>
                ) : (
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                    <span className="text-sm text-red-500">Generazione non disponibile su HTTP</span>
                  </div>
                )}
              </div>
              {isGenerating && renderGenerationDots()}
              {newPassword && !isGenerating && (
                <div className="mt-4">
                  <div className="w-full h-2 bg-transparent rounded">
                    <div
                      className="h-2 rounded transition-all duration-500"
                      style={{
                        width: `${getPasswordStrengthProps(newPassword).percent}%`,
                        backgroundColor: getPasswordStrengthProps(newPassword).color
                      }}
                    />
                  </div>
                  <p className="mt-1 text-sm text-white">
                    <strong>Password Strength:</strong> <span>{feedback.level}</span>
                  </p>
                </div>
              )}
              {newPassword && !isGenerating && currentSuggestion && (
                <p className="mt-2 text-sm text-white">{currentSuggestion}</p>
              )}
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-lg font-medium text-white mb-2">
                Confirm New Password
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-[#0a1f20] rounded px-4 py-3 border border-[#0a1f20] transition-all focus:outline-none focus:ring-2 focus:ring-[#00cfe8]"
                placeholder="Confirm new password"
                required
                aria-label="Confirm New Password"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-[#00cfe8] text-[#042c2e] py-3 rounded font-medium hover:bg-[#00b3c9] transition-colors"
            >
              {isLoading ? (
                <div className="loader border-t-2 border-b-2 border-[#042c2e] rounded-full w-6 h-6 animate-spin" />
              ) : (
                'Update Password'
              )}
            </button>
          </form>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <style>{`
        .card-wrapper {
          transform-origin: top center;
          margin: 0 auto;
        }
        @media (max-width: 1024px) {
          .card-wrapper {
            transform: scale(0.9);
          }
        }
        @media (max-width: 768px) {
          .card-wrapper {
            transform: scale(0.6);
          }
        }
        @media (max-width: 640px) {
          .card-wrapper {
            transform: scale(0.7);
          }
        }
        @media (max-width: 480px) {
          .card-wrapper {
            transform: scale(0.6);
          }
        }
      `}</style>
      <div className="font-sans bg-[#0a1f20] min-h-screen flex items-start md:items-center justify-center px-4 py-8">
        <div className="card-wrapper">
          <div className="w-[800px] h-[700px] bg-[#0e2e31] rounded-2xl shadow-lg overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-2 h-full">
              <div className="relative hidden md:block">
                <img
                  src={loginPhoto}
                  alt="Login"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/20" />
                <img
                  src={logoWhite}
                  alt="Logo"
                  className="absolute top-0 left-0 m-4 w-17 h-12 z-10"
                />
              </div>
              <div className="p-6 md:p-10 flex flex-col justify-center">
                <div className="text-center mb-6">
                  {step === 1 && !isForgotPassword && (
                    <h1 className="text-2xl md:text-3xl font-bold text-white">Login</h1>
                  )}
                  {step === 1 && isForgotPassword && (
                    <h1 className="text-2xl md:text-3xl font-bold text-white">Forgot Password</h1>
                  )}
                  {step === 2 && (
                    <h1 className="text-2xl md:text-3xl font-bold text-white">Two-Factor Auth</h1>
                  )}
                  {step === 3 && (
                    <h1 className="text-2xl md:text-3xl font-bold text-white">Change Password</h1>
                  )}
                </div>
                {renderStep()}
                <StepIndicator step={step} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default MultiStepAuth;
