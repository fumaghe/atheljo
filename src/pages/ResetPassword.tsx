// src/pages/ResetPassword.tsx
import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Shuffle } from 'lucide-react';

function getPasswordFeedback(password: string): { level: string; suggestions: string[] } {
  const suggestions: string[] = [];
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  if (!hasUppercase) suggestions.push("Include at least one uppercase letter");
  if (!hasLowercase) suggestions.push("Include at least one lowercase letter");
  if (!hasDigit) suggestions.push("Include at least one number");
  if (!hasSpecial) suggestions.push("Include at least one special character");
  if (password.length < 6) suggestions.push("Password must be at least 6 characters");
  if (password.length < 8) suggestions.push("Add more characters to achieve medium strength");
  if (password.length < 12) suggestions.push("Add more characters to achieve high strength");

  let level = '';
  if (password.length < 6) {
    level = "Too Weak";
  } else if (password.length >= 12 && hasUppercase && hasLowercase && hasDigit && hasSpecial) {
    level = "Strong";
  } else if (password.length >= 8 && (hasUppercase || hasLowercase) && hasDigit) {
    level = "Medium";
  } else {
    level = "Easy";
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
    color = '#22c1d4';
  } else if (password.length >= 12 && hasUppercase && hasLowercase && hasDigit && hasSpecial) {
    percent = 100;
    color = '#f8485e';
  } else if (password.length >= 8 && (hasUppercase || hasLowercase) && hasDigit) {
    percent = 75;
    color = '#999999';
  } else {
    percent = 50;
    color = '#eeeeee';
  }
  return { percent, color };
}

function generateSecurePassword(): string {
  const length = 12;
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";
  const special = "!@#$%^&*()_+~`|}{[]:;?><,./-";
  const getRandom = (str: string) => str[Math.floor(Math.random() * str.length)];

  let password = "";
  password += getRandom(lower);
  password += getRandom(upper);
  password += getRandom(digits);
  password += getRandom(special);
  const all = lower + upper + digits + special;
  for (let i = 4; i < length; i++) {
    password += getRandom(all);
  }
  let shuffled = password.split('').sort(() => 0.5 - Math.random()).join('');
  const { level } = getPasswordFeedback(shuffled);
  if (level !== "Strong") {
    return generateSecurePassword();
  }
  return shuffled;
}

const ResetPassword: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [feedback, setFeedback] = useState<{ level: string; suggestions: string[] }>({ level: '', suggestions: [] });
  const [currentSuggestion, setCurrentSuggestion] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fb = getPasswordFeedback(newPassword);
    setFeedback(fb);
    setCurrentSuggestion(fb.suggestions.length > 0 ? fb.suggestions[0] : null);
  }, [newPassword]);

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
          navigator.clipboard.writeText(generated);
          setCopyMessage('Password copied!');
          setTimeout(() => setCopyMessage(''), 3000);
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
            i < generationProgress ? 'bg-[#22c1d4]' : 'bg-[#06272b] border border-[#22c1d4]'
          }`}
        ></span>
      );
    }
    return <div className="flex justify-center mt-2">{dots}</div>;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setError('');
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!token) {
      setError('Invalid or missing token.');
      return;
    }
    setIsLoading(true);
    try {
      const API_BASE = import.meta.env.VITE_API_BASE || "/api";
      const response = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword })
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.message || 'Error resetting password.');
      } else {
        setMessage(data.message || 'Password reset successfully.');
        setTimeout(() => navigate('/login'), 2000);
      }
    } catch (err) {
      console.error(err);
      setError('Server error.');
    }
    setIsLoading(false);
  };

  const { percent, color } = getPasswordStrengthProps(newPassword);

  return (
    <div className="min-h-screen bg-[#06272b] flex flex-col items-center justify-center p-4">
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-5px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .fade-in {
          animation: fadeIn 0.5s ease forwards;
        }
      `}</style>
      <div className="w-full max-w-md bg-[#0b3c43] p-8 rounded-lg shadow-xl">
        <h1 className="text-3xl font-bold text-[#f8485e] mb-6 text-center">Reset Password</h1>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="relative">
            <label className="block text-sm font-medium text-[#eeeeee] mb-2">
              New Password:
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-[#06272b] rounded-lg px-4 py-3 border border-[#22c1d4]/20 focus:outline-none focus:border-[#22c1d4]"
              placeholder="Enter new password"
              required
              disabled={isGenerating}
            />
            <button
              type="button"
              onClick={handleAutoGenerate}
              className="absolute inset-y-0 right-0 flex items-center pr-3"
              title="Generate secure password"
            >
              <Shuffle className="w-6 h-6 text-[#22c1d4] hover:text-[#f8485e]" />
              {copyMessage && (
                <div className="absolute -top-6 right-0 bg-[#06272b] text-[#f8485e] text-xs px-2 py-1 rounded">
                  {copyMessage}
                </div>
              )}
            </button>
            {isGenerating && renderGenerationDots()}
            {newPassword && !isGenerating && (
              <div className="mt-4">
                <div className="w-full h-2 bg-[#06272b] rounded">
                  <div
                    className="h-2 rounded"
                    style={{
                      width: `${percent}%`,
                      backgroundColor: color,
                      transition: 'width 0.5s ease'
                    }}
                  ></div>
                </div>
                <p className="mt-1 text-sm text-[#eeeeee]">
                  <strong>Password Strength:</strong> <span>{feedback.level}</span>
                </p>
              </div>
            )}
            {newPassword && !isGenerating && currentSuggestion && (
              <p className="mt-2 text-sm text-[#eeeeee] fade-in">
                {currentSuggestion}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-[#eeeeee] mb-2">
              Confirm New Password:
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-[#06272b] rounded-lg px-4 py-3 border border-[#22c1d4]/20 focus:outline-none focus:border-[#22c1d4]"
              placeholder="Confirm new password"
              required
            />
          </div>
          <button 
            type="submit"
            className="mt-4 w-full bg-[#22c1d4] text-[#06272b] py-3 rounded-lg font-semibold hover:bg-[#22c1d4]/90 transition-colors"
          >
            {isLoading ? "Resetting..." : "Reset Password"}
          </button>
          {message && (
            <div className="mt-4 mb-4 p-4 bg-red-100 border border-red-200 rounded-lg flex items-center gap-3 text-red-500 fade-in">
              <span>{message}</span>
            </div>
          )}
          {error && (
            <div className="mt-4 mb-4 p-4 bg-red-100 border border-red-200 rounded-lg flex items-center gap-3 text-red-500 fade-in">
              <span>{error}</span>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;
