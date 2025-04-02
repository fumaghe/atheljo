import React from 'react';
import { Shield, Zap, Database, Bell } from 'lucide-react';

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

export default function Settings() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Feature Toggles */}
      <div className="bg-[#0b3c43] rounded-lg p-6 shadow-lg">
        <h2 className="text-xl font-semibold mb-6">Feature Toggles</h2>
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
        <h2 className="text-xl font-semibold mb-6">User Profile</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Name</label>
            <input
              type="text"
              className="w-full bg-[#06272b] rounded-lg px-4 py-2 border border-[#22c1d4]/20 focus:outline-none focus:border-[#22c1d4]"
              placeholder="Andrea Fumagalli"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Email</label>
            <input
              type="email"
              className="w-full bg-[#06272b] rounded-lg px-4 py-2 border border-[#22c1d4]/20 focus:outline-none focus:border-[#22c1d4]"
              placeholder="afumagalli@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Password</label>
            <input
              type="password"
              className="w-full bg-[#06272b] rounded-lg px-4 py-2 border border-[#22c1d4]/20 focus:outline-none focus:border-[#22c1d4]"
              placeholder="••••••••"
            />
          </div>
          <button className="w-full bg-[#22c1d4] text-[#06272b] py-2 rounded-lg font-semibold hover:bg-[#22c1d4]/90 transition-colors">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}