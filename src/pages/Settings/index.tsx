// src/pages/Settings/index.tsx
import React, { useState, useEffect } from 'react';
import { Shield, Zap, Bell, Database, Files } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

/* ───────────────────────────────── FEATURE TOGGLES ────────────────────────── */

const featureToggles = [
  /* ① attivo – sarà usato in SystemDetail */
  {
    id: 'file-trends',
    name: 'File Trends',
    description: 'Visualize added & deleted files over time',
    icon: Files,
    comingSoon: false
  },

  /* ②-③-④ solo “Coming Soon” */
  {
    id: 'cyber-threat',
    name: 'Cyber Threat Detection',
    description: 'Monitor and detect potential security threats',
    icon: Shield,
    comingSoon: true
  },
  {
    id: 'energy',
    name: 'Energy Consumption Analysis',
    description: 'Track and analyze energy usage patterns',
    icon: Zap,
    comingSoon: true
  },
  {
    id: 'notifications',
    name: 'Enhanced Notifications',
    description: 'Receive detailed alert notifications',
    icon: Bell,
    comingSoon: true
  }
];

/* ───────────────────────── PASSWORD-HELPER (immutato) ─────────────────────── */

function getPasswordFeedback(password: string) {
  const suggestions: string[] = [];
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasDigit     = /[0-9]/.test(password);
  const hasSpecial   = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  if (password.length < 6)  suggestions.push('Password must be at least 6 characters long');
  if (password.length < 8)  suggestions.push('Add more characters to reach a medium strength level');
  if (password.length < 12) suggestions.push('Add more characters to reach a high strength level');
  if (!hasUppercase) suggestions.push('Include at least one uppercase letter');
  if (!hasLowercase) suggestions.push('Include at least one lowercase letter');
  if (!hasDigit)     suggestions.push('Include at least one number');
  if (!hasSpecial)   suggestions.push('Include at least one special character');

  let level = '';
  if (password.length < 6) level = 'Too Weak';
  else if (
    password.length >= 12 &&
    hasUppercase && hasLowercase && hasDigit && hasSpecial
  ) level = 'High';
  else if (password.length >= 8 && (hasUppercase || hasLowercase) && hasDigit)
    level = 'Medium';
  else level = 'Easy';

  return { level, suggestions };
}

/* ───────────────────────────── COMPONENTE ─────────────────────────────────── */

export default function Settings() {
  const { user, updateUser } = useAuth();

  /* profilo */
  const [name, setName]                       = useState(user ? user.username : '');
  const [oldPassword, setOldPassword]         = useState('');
  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage]                 = useState('');
  const [error, setError]                     = useState('');

  /* feedback password */
  const [passwordFeedback, setPasswordFeedback] = useState<{
    level: string;
    suggestions: string[];
  }>({ level: '', suggestions: [] });

  /* feature-toggles state (letto dal profilo) */
  const [features, setFeatures] = useState<Record<string, boolean>>(
    user?.features || {}
  );

  /* ─── effetti ─────────────────────────────────────────────────────────────── */

  /* live password-strength */
  useEffect(() => {
    setPasswordFeedback(getPasswordFeedback(newPassword));
  }, [newPassword]);

  /* ─── handler: toggle change ──────────────────────────────────────────────── */

  const handleToggleChange = async (id: string, value: boolean) => {
    const next = { ...features, [id]: value };
    setFeatures(next);
    /* salva immediatamente su Firestore */
    await updateUser(user!.id, { features: next });
  };

  /* ─── handler: profilo save ──────────────────────────────────────────────── */

  const handleSaveChanges = async () => {
    setMessage('');
    setError('');

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    const updateData: any = { username: name };
    if (newPassword) {
      updateData.oldPassword = oldPassword;
      updateData.newPassword = newPassword;
    }

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

  /* ─── render ─────────────────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      <h1 className="text-2xl text-[#f8485e] font-bold">Settings</h1>

      {/* ╭────────────────────────── FEATURE TOGGLES ─────────────────────────╮ */}
      <div className="bg-[#0b3c43] rounded-lg p-6 shadow-lg">
        <h2 className="text-xl text-[#f8485e] font-semibold mb-6">Feature Toggles</h2>

        <div className="space-y-4">
          {featureToggles.map((feature) => {
            const isChecked = !!features[feature.id];
            return (
              <div
                key={feature.id}
                className="flex items-center justify-between p-4 rounded-lg bg-[#06272b]"
              >
                <div className="flex items-center gap-4">
                  <feature.icon className="w-6 h-6 text-[#22c1d4]" />
                  <div>
                    <h4 className="font-semibold">{feature.name}</h4>
                    <p className="text-sm text-[#eeeeee]/60">
                      {feature.description}
                      {feature.comingSoon && (
                        <span className="ml-2 italic text-[#eeeeee]/40">
                          (Coming&nbsp;Soon)
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    disabled={feature.comingSoon}
                    checked={isChecked}
                    onChange={(e) =>
                      handleToggleChange(feature.id, e.target.checked)
                    }
                  />
                  <div className="w-11 h-6 bg-[#06272b] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#eeeeee] after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#22c1d4]"></div>
                </label>
              </div>
            );
          })}
        </div>
      </div>
      {/* ╰─────────────────────────────────────────────────────────────────────╯ */}

      {/* ╭────────────────────────── USER PROFILE ────────────────────────────╮ */}
      <div className="bg-[#0b3c43] rounded-lg p-6 shadow-lg">
        <h2 className="text-xl text-[#f8485e] font-semibold mb-6">User Profile</h2>

        <div className="space-y-4">
          {/* Name */}
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

          {/* Old password */}
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

          {/* New password */}
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
                  <strong>Password Strength:</strong>{' '}
                  <span>{passwordFeedback.level}</span>
                </p>
                {passwordFeedback.suggestions.length > 0 && (
                  <ul className="list-disc ml-5">
                    {passwordFeedback.suggestions.map((sug, idx) => (
                      <li key={idx}>{sug}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Confirm new password */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-[#06272b] rounded-lg px-4 py-2 border border-[#22c1d4]/20 focus:outline-none focus:border-[#22c1d4]"
              placeholder="Confirm your new password"
            />
          </div>

          {/* messages */}
          {message && <p className="text-green-500">{message}</p>}
          {error &&   <p className="text-red-500">{error}</p>}

          {/* save */}
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
