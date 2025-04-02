// src/pages/Support/index.tsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Book, MessageSquare, Phone, Mail, Upload, X } from 'lucide-react';

interface SupportTicket {
  subject: string;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  description: string;
  files: File[];
}

const supportResources = [
  {
    title: 'Documentation',
    description: 'Access user guides and technical documentation',
    icon: Book,
    link: '/documentation', // Aggiornato: il link punta a /documentation
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

const faqs = [
  {
    question: 'How do I reset my password?',
    answer:
      'You can reset your password by clicking on the "Forgot Password" link on the login page. Follow the instructions sent to your email to create a new password.',
  },
  {
    question: 'What should I do if I see a capacity warning?',
    answer:
      'When you receive a capacity warning, review your storage usage patterns and consider implementing data cleanup procedures or requesting a capacity upgrade through your account manager.',
  },
  {
    question: 'How often is the telemetry data updated?',
    answer:
      'Telemetry data is updated in real-time when the Live mode is enabled. In standard mode, data is refreshed every 5 minutes to provide accurate system insights while optimizing performance.',
  },
  {
    question: 'How can I optimize my system performance?',
    answer:
      'To optimize system performance, regularly monitor usage patterns, implement data lifecycle policies, and ensure proper capacity planning. Contact our support team for personalized recommendations.',
  },
];

export default function Support() {
  const [ticket, setTicket] = useState<SupportTicket>({
    subject: '',
    priority: 'Medium',
    description: '',
    files: [],
  });
  const [isDragging, setIsDragging] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setTicket(prev => ({
        ...prev,
        files: [...prev.files, ...files],
      }));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      const files = Array.from(e.target.files);
      setTicket(prev => ({
        ...prev,
        files: [...prev.files, ...files],
      }));
    }
  };

  const removeFile = (index: number) => {
    setTicket(prev => ({
      ...prev,
      files: prev.files.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitStatus('submitting');

    // Simulate API call
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      setSubmitStatus('success');
      setTicket({
        subject: '',
        priority: 'Medium',
        description: '',
        files: [],
      });
      setTimeout(() => setSubmitStatus('idle'), 3000);
    } catch (error) {
      setSubmitStatus('error');
      setTimeout(() => setSubmitStatus('idle'), 3000);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl text-[#f8485e] font-bold">Support</h1>

      {/* Support Resources */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {supportResources.map((resource) => (
          <Link
            key={resource.title}
            to={resource.link}
            className="bg-[#0b3c43] rounded-lg p-6 shadow-lg hover:bg-[#0b3c43]/80 transition-colors group"
          >
            <div className="flex items-center gap-4">
              <resource.icon className="w-8 h-8 text-[#22c1d4] group-hover:scale-110 transition-transform" />
              <div>
                <h3 className="text-lg font-semibold">{resource.title}</h3>
                <p className="text-[#eeeeee]/60">{resource.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Support Ticket Form */}
      <div className="bg-[#0b3c43] rounded-lg p-6 shadow-lg">
        <h2 className="text-xl text-[#f8485e] font-semibold mb-6">Create Support Ticket</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Subject</label>
            <input
              type="text"
              value={ticket.subject}
              onChange={(e) => setTicket(prev => ({ ...prev, subject: e.target.value }))}
              className="w-full bg-[#06272b] rounded-lg px-4 py-2 border border-[#22c1d4]/20 focus:outline-none focus:border-[#22c1d4]"
              placeholder="Brief description of the issue"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Priority</label>
            <select
              value={ticket.priority}
              onChange={(e) => setTicket(prev => ({ ...prev, priority: e.target.value as SupportTicket['priority'] }))}
              className="w-full bg-[#06272b] rounded-lg px-4 py-2 border border-[#22c1d4]/20 focus:outline-none focus:border-[#22c1d4]"
            >
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
              <option>Critical</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <textarea
              value={ticket.description}
              onChange={(e) => setTicket(prev => ({ ...prev, description: e.target.value }))}
              className="w-full bg-[#06272b] rounded-lg px-4 py-2 border border-[#22c1d4]/20 focus:outline-none focus:border-[#22c1d4] h-32 resize-none"
              placeholder="Detailed description of your issue..."
              required
            ></textarea>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Attachments</label>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                isDragging
                  ? 'border-[#22c1d4] bg-[#22c1d4]/10'
                  : 'border-[#22c1d4]/20 hover:border-[#22c1d4]/40'
              }`}
            >
              <input
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="flex flex-col items-center cursor-pointer">
                <Upload className="w-8 h-8 text-[#22c1d4] mb-2" />
                <p className="text-[#eeeeee]/60">Drag and drop files here or click to browse</p>
              </label>
            </div>
            {ticket.files.length > 0 && (
              <div className="mt-4 space-y-2">
                {ticket.files.map((file, index) => (
                  <div key={index} className="flex items-center justify-between bg-[#06272b] p-2 rounded">
                    <span className="text-sm truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="text-[#f8485e] hover:text-[#f8485e]/80"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={submitStatus === 'submitting'}
            className={`w-full py-2 rounded-lg font-semibold transition-colors ${
              submitStatus === 'submitting'
                ? 'bg-[#22c1d4]/50 cursor-not-allowed'
                : submitStatus === 'success'
                ? 'bg-green-500 text-white'
                : submitStatus === 'error'
                ? 'bg-[#f8485e] text-white'
                : 'bg-[#22c1d4] text-[#06272b] hover:bg-[#22c1d4]/90'
            }`}
          >
            {submitStatus === 'submitting'
              ? 'Submitting...'
              : submitStatus === 'success'
              ? 'Ticket Submitted!'
              : submitStatus === 'error'
              ? 'Error Submitting Ticket'
              : 'Submit Ticket'}
          </button>
        </form>
      </div>

      {/* FAQ Section */}
      <div className="bg-[#0b3c43] rounded-lg p-6 shadow-lg">
        <h2 className="text-xl text-[#f8485e] font-semibold mb-6">Frequently Asked Questions</h2>
        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <details key={index} className="group">
              <summary className="flex justify-between items-center cursor-pointer p-4 rounded-lg bg-[#06272b] hover:bg-[#06272b]/80">
                <span className="font-medium">{faq.question}</span>
                <span className="transition group-open:rotate-180">▼</span>
              </summary>
              <div className="p-4 text-[#eeeeee]/80">{faq.answer}</div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
