import React, { useState, useEffect } from 'react';
import { Shield, Zap, Database, Bell } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const featureToggles = [
  {
    id: 'cyber-threat',
    name: 'Cyber Threat Detection',
    description: 'Monitor and detect potential security threats',
    icon: Shield,
  },
  {
    id: 'energy',
    name: 'Energy Consumption Analysis',
    description: 'Track and analyze energy usage patterns',
    icon: Zap,
  },
  {
    id: 'telemetry',
    name: 'Advanced Telemetry',
    description: 'Collect detailed system performance metrics',
    icon: Database,
  },
  {
    id: 'notifications',
    name: 'Enhanced Notifications',
    description: 'Receive detailed alert notifications',
    icon: Bell,
  },
];

// Password validation function that returns strength and suggestions
function getPasswordFeedback(password: string) {
  const suggestions: string[] = [];
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  if (password.length < 6) {
    suggestions.push("Password must be at least 6 characters long");
  }
  if (password.length < 8) {
    suggestions.push("Add more characters to reach a medium strength level");
  }
  if (password.length < 12) {
    suggestions.push("Add more characters to reach a high strength level");
  }
  if (!hasUppercase) {
    suggestions.push("Include at least one uppercase letter");
  }
  if (!hasLowercase) {
    suggestions.push("Include at least one lowercase letter");
  }
  if (!hasDigit) {
    suggestions.push("Include at least one number");
  }
  if (!hasSpecial) {
    suggestions.push("Include at least one special character");
  }

  let level = '';
  if (password.length < 6) {
    level = "Too Weak";
  } else if (password.length >= 12 && hasUppercase && hasLowercase && hasDigit && hasSpecial) {
    level = "High";
  } else if (password.length >= 8 && (hasUppercase || hasLowercase) && hasDigit) {
    level = "Medium";
  } else {
    level = "Easy";
  }

  return { level, suggestions };
}

export default function Settings() {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user ? user.username : '');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [passwordFeedback, setPasswordFeedback] = useState<{ level: string; suggestions: string[] }>({
    level: '',
    suggestions: [],
  });

  // Dynamically update password feedback as new password changes
  useEffect(() => {
    const feedback = getPasswordFeedback(newPassword);
    setPasswordFeedback(feedback);
  }, [newPassword]);

  const handleSaveChanges = async () => {
    setMessage('');
    setError('');
    // If a new password is entered, check if confirmation matches
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    // Optionally enforce at least medium strength here:
    // if (passwordFeedback.level === "Easy" || passwordFeedback.level === "Too Weak") {
    //   setError('The new password is not secure enough.');
    //   return;
    // }
    // Prepare data for update
    const updateData: any = { username: name };
    if (newPassword) {
      updateData.oldPassword = oldPassword;
      updateData.newPassword = newPassword;
    }
    // Call updateUser function from context
    const updated = await updateUser(user!.id, updateData);
    if (updated) {
      setMessage('Profile updated successfully.');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setError('Profile update failed.');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl text-[#f8485e] font-bold">Settings</h1>

      {/* Feature Toggles */}
      <div className="bg-[#0b3c43] rounded-lg p-6 shadow-lg">
        <h2 className="text-xl text-[#f8485e] font-semibold mb-6">Feature Toggles</h2>
        <div className="space-y-4">
          {featureToggles.map((feature) => (
            <div 
              key={feature.id}
              className="flex items-center justify-between p-4 rounded-lg bg-[#06272b]"
            >
              <div className="flex items-center gap-4">
                <feature.icon className="w-6 h-6 text-[#22c1d4]" />
                <div>
                  <h4 className="font-semibold">{feature.name}</h4>
                  <p className="text-sm text-[#eeeeee]/60">{feature.description}</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" />
                <div className="w-11 h-6 bg-[#06272b] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#eeeeee] after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#22c1d4]"></div>
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* User Profile */}
      <div className="bg-[#0b3c43] rounded-lg p-6 shadow-lg">
        <h2 className="text-xl text-[#f8485e] font-semibold mb-6">User Profile</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#06272b] rounded-lg px-4 py-2 border border-[#22c1d4]/20 focus:outline-none focus:border-[#22c1d4]"
              placeholder="Your name"
            />
          </div>
          {/* Old Password Field */}
          <div>
            <label className="block text-sm font-medium mb-2">Old Password</label>
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              className="w-full bg-[#06272b] rounded-lg px-4 py-2 border border-[#22c1d4]/20 focus:outline-none focus:border-[#22c1d4]"
              placeholder="Enter your current password"
            />
          </div>
          {/* New Password Field */}
          <div>
            <label className="block text-sm font-medium mb-2">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-[#06272b] rounded-lg px-4 py-2 border border-[#22c1d4]/20 focus:outline-none focus:border-[#22c1d4]"
              placeholder="Enter your new password"
            />
            {newPassword && (
              <div className="mt-2 text-sm">
                <p>
                  <strong>Password Strength:</strong> <span>{passwordFeedback.level}</span>
                </p>
                {passwordFeedback.suggestions.length > 0 && (
                  <ul className="list-disc ml-5">
                    {passwordFeedback.suggestions.map((sug, index) => (
                      <li key={index}>{sug}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          {/* Confirm New Password Field */}
          <div>
            <label className="block text-sm font-medium mb-2">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-[#06272b] rounded-lg px-4 py-2 border border-[#22c1d4]/20 focus:outline-none focus:border-[#22c1d4]"
              placeholder="Confirm your new password"
            />
          </div>
          {message && <p className="text-green-500">{message}</p>}
          {error && <p className="text-red-500">{error}</p>}
          <button 
            onClick={handleSaveChanges}
            className="w-full bg-[#22c1d4] text-[#06272b] py-2 rounded-lg font-semibold hover:bg-[#22c1d4]/90 transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
