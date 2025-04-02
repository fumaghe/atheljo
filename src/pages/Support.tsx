import React from 'react';
import { Book, MessageSquare, Phone, Mail } from 'lucide-react';

const supportResources = [
  {
    title: 'Documentation',
    description: 'Access user guides and technical documentation',
    icon: Book,
    link: '#',
  },
  {
    title: 'Support Ticket',
    description: 'Create a new support ticket',
    icon: MessageSquare,
    link: '#',
  },
  {
    title: 'Phone Support',
    description: '+1 (555) 123-4567',
    icon: Phone,
    link: 'tel:+15551234567',
  },
  {
    title: 'Email Support',
    description: 'support@example.com',
    icon: Mail,
    link: 'mailto:support@example.com',
  },
];

export default function Support() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Support</h1>

      {/* Support Resources */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {supportResources.map((resource) => (
          <a
            key={resource.title}
            href={resource.link}
            className="bg-[#0b3c43] rounded-lg p-6 shadow-lg hover:bg-[#0b3c43]/80 transition-colors"
          >
            <div className="flex items-center gap-4">
              <resource.icon className="w-8 h-8 text-[#22c1d4]" />
              <div>
                <h3 className="text-lg font-semibold">{resource.title}</h3>
                <p className="text-[#eeeeee]/60">{resource.description}</p>
              </div>
            </div>
          </a>
        ))}
      </div>

      {/* Support Ticket Form */}
      <div className="bg-[#0b3c43] rounded-lg p-6 shadow-lg">
        <h2 className="text-xl font-semibold mb-6">Create Support Ticket</h2>
        <form className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Subject</label>
            <input
              type="text"
              className="w-full bg-[#06272b] rounded-lg px-4 py-2 border border-[#22c1d4]/20 focus:outline-none focus:border-[#22c1d4]"
              placeholder="Brief description of the issue"
            />
           </div>
          <div>
            <label className="block text-sm font-medium mb-2">Priority</label>
            <select className="w-full bg-[#06272b] rounded-lg px-4 py-2 border border-[#22c1d4]/20 focus:outline-none focus:border-[#22c1d4]">
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
              <option>Critical</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <textarea
              className="w-full bg-[#06272b] rounded-lg px-4 py-2 border border-[#22c1d4]/20 focus:outline-none focus:border-[#22c1d4] h-32"
              placeholder="Detailed description of your issue..."
            ></textarea>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Attachments</label>
            <div className="border-2 border-dashed border-[#22c1d4]/20 rounded-lg p-4 text-center">
              <p className="text-[#eeeeee]/60">
                Drag and drop files here or click to browse
              </p>
            </div>
          </div>
          <button className="w-full bg-[#22c1d4] text-[#06272b] py-2 rounded-lg font-semibold hover:bg-[#22c1d4]/90 transition-colors">
            Submit Ticket
          </button>
        </form>
      </div>

      {/* FAQ Section */}
      <div className="bg-[#0b3c43] rounded-lg p-6 shadow-lg">
        <h2 className="text-xl font-semibold mb-6">Frequently Asked Questions</h2>
        <div className="space-y-4">
          <details className="group">
            <summary className="flex justify-between items-center cursor-pointer p-4 rounded-lg bg-[#06272b] hover:bg-[#06272b]/80">
              <span className="font-medium">How do I reset my password?</span>
              <span className="transition group-open:rotate-180">▼</span>
            </summary>
            <div className="p-4 text-[#eeeeee]/80">
              You can reset your password by clicking on the "Forgot Password" link on the login page. Follow the instructions sent to your email to create a new password.
            </div>
          </details>
          <details className="group">
            <summary className="flex justify-between items-center cursor-pointer p-4 rounded-lg bg-[#06272b] hover:bg-[#06272b]/80">
              <span className="font-medium">What should I do if I see a capacity warning?</span>
              <span className="transition group-open:rotate-180">▼</span>
            </summary>
            <div className="p-4 text-[#eeeeee]/80">
              When you receive a capacity warning, review your storage usage patterns and consider implementing data cleanup procedures or requesting a capacity upgrade through your account manager.
            </div>
          </details>
          <details className="group">
            <summary className="flex justify-between items-center cursor-pointer p-4 rounded-lg bg-[#06272b] hover:bg-[#06272b]/80">
              <span className="font-medium">How often is the telemetry data updated?</span>
              <span className="transition group-open:rotate-180">▼</span>
            </summary>
            <div className="p-4 text-[#eeeeee]/80">
              Telemetry data is updated in real-time when the Live mode is enabled. In standard mode, data is refreshed every 5 minutes to provide accurate system insights while optimizing performance.
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}