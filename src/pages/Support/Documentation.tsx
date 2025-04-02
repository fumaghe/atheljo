import React from 'react';
import { IconType } from 'react-icons';
import {
  FiActivity,
  FiDownload,
  FiGrid,
  FiShield,
  FiMonitor,
  FiHome,
  FiBarChart2,
  FiAlertTriangle,
  FiFileText,
  FiUserPlus,
  FiSettings,
  FiHelpCircle,
  FiGitMerge,
  FiInfo,
} from 'react-icons/fi';
import { FaFireAlt } from 'react-icons/fa';

// Definizione dei tipi per le sezioni della documentazione
interface SectionProps {
  id: string;
  title: string;
  Icon: IconType;
  children?: React.ReactNode;
}

// Componente per ogni sezione
const Section: React.FC<SectionProps> = ({ id, title, Icon, children }) => {
  return (
    <section id={id} className="bg-[#0b3c43] rounded-lg p-6 shadow-lg">
      <h2 className="text-2xl text-[#f8485e] font-semibold mb-4 inline-flex items-center">
        <Icon className="mr-2" /> {title}
      </h2>
      {children}
    </section>
  );
};

// Componente principale della Documentazione
const Documentation: React.FC = () => {
  // Array delle sezioni della documentazione
  const sections: SectionProps[] = [
    {
      id: 'main-features',
      title: 'Main Features',
      Icon: FiActivity,
      children: (
        <ul className="list-disc list-inside text-[#eeeeee] space-y-2">
          <li>
            <strong>Integration with Database Systems:</strong> The site connects to SQL (MerlinDB) and document-based (ArchimedesDB) databases to retrieve telemetry data and store analysis results.
          </li>
          <li>
            <strong>Telemetry Data Analysis:</strong> Extracts useful information for managing and monitoring the services offered by Avalon.
          </li>
          <li>
            <strong>Graph Generation:</strong> Visualization tools allow the creation of charts and reports for quick data interpretation.
          </li>
          <li>
            <strong>Security and Authentication:</strong> Login flows and password management are designed to ensure secure user access.
          </li>
        </ul>
      ),
    },
    {
      id: 'installation',
      title: 'Installation',
      Icon: FiDownload,
      children: (
        <p className="text-[#eeeeee]">
          *(Installation and configuration details will be updated with step-by-step instructions, requirements, and environment variables.)*
        </p>
      ),
    },
    {
      id: 'general-structure',
      title: 'General Structure',
      Icon: FiGrid,
      children: (
        <>
          <p className="text-[#eeeeee] mb-2">
            The project is organized into modules that manage the following functionalities:
          </p>
          <ul className="list-disc list-inside text-[#eeeeee] space-y-2">
            <li>
              <strong>Database (DB):</strong> Connection and management of data from SQL (MerlinDB) and document-based (ArchimedesDB) databases.
            </li>
            <li>
              <strong>File System (FS):</strong> Document management, with options for databases such as Firestore and MongoDB.
            </li>
            <li>
              <strong>Main Application:</strong> Sets up environmental parameters and coordinates the analysis process.
            </li>
            <li>
              <strong>Results:</strong> Organizes and formats the analyzed data for report generation.
            </li>
            <li>
              <strong>Utils:</strong> Contains support functions for common operations, including chart creation and exporting results (CSV, JSON, Excel, Parquet).
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'authentication-security',
      title: 'Authentication & Security',
      Icon: FiShield,
      children: (
        <>
          <h3 className="text-xl font-semibold text-[#f8485e] mb-2">Login and Access</h3>
          <ul className="list-disc list-inside text-[#eeeeee] space-y-2 mb-4">
            <li>
              <strong>Multi-Step Login:</strong> A guided process that takes the user from the initial login to identity verification via OTP, if necessary.
            </li>
            <li>
              <strong>Password Recovery:</strong> Provides a simple option to request a reset link in case the password is forgotten.
            </li>
          </ul>
          <h3 className="text-xl font-semibold text-[#f8485e] mb-2">Password Management</h3>
          <ul className="list-disc list-inside text-[#eeeeee] space-y-2">
            <li>
              <strong>Password Change:</strong> An assisted procedure to modify the password, either during a reset or when an update is needed.
            </li>
            <li>
              <strong>Automatic Password Generation:</strong> Tools to create secure passwords with immediate feedback on their strength.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'user-interface',
      title: 'User Interface',
      Icon: FiMonitor,
      children: (
        <>
          <h3 className="text-xl font-semibold text-[#f8485e] mb-2">Header</h3>
          <ul className="list-disc list-inside text-[#eeeeee] space-y-2 mb-4">
            <li>
              <strong>Branding and Visual Identity:</strong> Application logos are displayed in an optimized manner for different devices, ensuring a recognizable visual identity.
            </li>
            <li>
              <strong>Demo Message:</strong> A central section informs the user that they are using the demo version, with a link for further information.
            </li>
            <li>
              <strong>Data Update:</strong> Displays the status of the last update along with a button to manually request a new update, using visual indicators for success or error.
            </li>
            <li>
              <strong>User Menu:</strong> Provides access to account management, settings, support, and logout options, and displays the user’s name and a subscription icon if applicable.
            </li>
          </ul>
          <h3 className="text-xl font-semibold text-[#f8485e]">Sidebar</h3>
          <ul className="list-disc list-inside text-[#eeeeee] space-y-2">
            <li>
              <strong>Main Navigation:</strong> Direct links to key sections such as Dashboard, Analytics, Alerts, and Reports.
            </li>
            <li>
              <strong>Subscription Management:</strong> Displays a dedicated section with an icon representing the active subscription plan.
            </li>
            <li>
              <strong>Responsive Interface:</strong> Adapts to screen size and user preferences by being expandable or collapsible.
            </li>
            <li>
              <strong>Permission-Based Controls:</strong> Only displays menu items relevant to the user’s role or subscription.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'dashboard',
      title: 'Dashboard',
      Icon: FiHome,
      children: (
        <ul className="list-disc list-inside text-[#eeeeee] space-y-2">
          <li>
            <strong>Customizable Filters:</strong> Allows users to apply filters based on company, system type, pool, telemetry status, and time interval.
          </li>
          <li>
            <strong>Alerts Section:</strong> Displays recent alerts related to monitored systems.
          </li>
          <li>
            <strong>System Statistics:</strong> Provides a summary of key metrics including system health statuses and performance indicators.
          </li>
          <li>
            <strong>Interactive Charts:</strong> Includes interactive charts for system status, types, capacity distribution, and trends.
          </li>
          <li>
            <strong>Loading Indicator:</strong> Shows a loading animation during data retrieval.
          </li>
          <li>
            <strong>Permission-Based Access:</strong> Detailed charts and statistics are fully visible only if the user has appropriate permissions; otherwise, they appear partially hidden with an upgrade prompt.
          </li>
        </ul>
      ),
    },
    {
      id: 'analytics',
      title: 'Analytics',
      Icon: FiBarChart2,
      children: (
        <>
          <h3 className="text-xl font-semibold text-[#f8485e] mb-2">Companies Overview</h3>
          <p className="text-[#eeeeee] mb-2">
            Aggregates statistics for each company, including system counts, capacity details, and average usage percentages.
          </p>
          <h3 className="text-xl font-semibold text-[#f8485e] mb-2">Company Detail</h3>
          <p className="text-[#eeeeee] mb-2">
            Provides an in-depth overview of a single company’s systems with aggregated statistics and detailed data on capacity, health, and performance.
          </p>
          <h3 className="text-xl font-semibold text-[#f8485e] mb-2">System Detail</h3>
          <p className="text-[#eeeeee] mb-2">
            Offers a detailed view of a specific system with in-depth data on capacity, performance, and telemetry, including interactive charts for historical trends and forecasts.
          </p>
          <h3 className="text-xl font-semibold text-[#f8485e] mb-2">State Vector Chart</h3>
          <p className="text-[#eeeeee] mb-2">
            An interactive chart displaying data trends over time with options for line or candlestick views and unit selection.
          </p>
          <h3 className="text-xl font-semibold text-[#f8485e] mb-2">Health Score Explanation</h3>
          <p className="text-[#eeeeee]">
            The Health Score, a key indicator of system condition, is based on:
            <ul className="list-disc list-inside ml-6 space-y-1">
              <li><strong>Capacity:</strong> Evaluation of space usage against an ideal value.</li>
              <li><strong>Performance:</strong> Frequency of telemetry data relative to an optimal interval.</li>
              <li><strong>Telemetry:</strong> Level of data transmission activity.</li>
              <li><strong>Snapshots:</strong> Impact of snapshot data on overall capacity.</li>
              <li><strong>MUP:</strong> Efficiency in resource utilization.</li>
            </ul>
          </p>
        </>
      ),
    },
    {
      id: 'alerts-history',
      title: 'Alerts History',
      Icon: FiAlertTriangle,
      children: (
        <ul className="list-disc list-inside text-[#eeeeee] space-y-2">
          <li>
            <strong>Historical View:</strong> Displays a list of alerts in descending order by date with filtering options.
          </li>
          <li>
            <strong>Filters and Pagination:</strong> Allows filtering and progressive loading of alerts.
          </li>
          <li>
            <strong>Permission Indicators:</strong> For restricted subscriptions, details appear partially blurred with a lock icon.
          </li>
          <li>
            <strong>User Experience:</strong> Alerts are presented with clear icons indicating their type and importance.
          </li>
        </ul>
      ),
    },
    {
      id: 'reports',
      title: 'Reports',
      Icon: FiFileText,
      children: (
        <ul className="list-disc list-inside text-[#eeeeee] space-y-2">
          <li>
            <strong>Report Generation:</strong> Generate PDF reports with options for email or direct download, including scheduling.
          </li>
          <li>
            <strong>Report Content:</strong> Includes system statistics, interactive charts, detailed tables, and a Health Score summary.
          </li>
          <li>
            <strong>Permission Indicators:</strong> Limited views for subscriptions without full report generation, with an upgrade prompt.
          </li>
          <li>
            <strong>Report History and Scheduling:</strong> Manage previously generated reports and active schedules.
          </li>
        </ul>
      ),
    },
    {
      id: 'subscription',
      title: 'Subscription',
      Icon: FaFireAlt,
      children: (
        <ul className="list-disc list-inside text-[#eeeeee] space-y-2">
          <li>
            <strong>Plan Comparison:</strong> Displays the three subscription levels (Essential, Advantage, Premiere) in a comparative grid with representative icons, plan names, monthly prices, and benefits.
          </li>
          <li>
            <strong>Benefits and New Features:</strong> Interactive tooltips indicate which components are fully included and which are partially accessible.
          </li>
          <li>
            <strong>Subscription Status:</strong> Shows the expiration date of the current plan (or an infinity symbol for administrators) and includes a button to update or change the plan.
          </li>
          <li>
            <strong>Upgrade Invitation:</strong> For users with restricted permissions, an invitation to upgrade is prominently displayed.
          </li>
        </ul>
      ),
    },
    {
      id: 'sub-accounts',
      title: 'Sub-Accounts',
      Icon: FiUserPlus,
      children: (
        <ul className="list-disc list-inside text-[#eeeeee] space-y-2">
          <li>
            <strong>Employee Management:</strong> Administrators can add, modify, and remove sub-accounts to delegate access and operational tasks.
          </li>
          <li>
            <strong>Permission Configuration:</strong> Select specific permissions for each section when creating or editing a sub-account.
          </li>
          <li>
            <strong>Visible Companies:</strong> Define which companies a sub-account can view with a multi-select system.
          </li>
          <li>
            <strong>Guided Interaction:</strong> A step-by-step wizard guides administrators through entering details, selecting permissions, and final review.
          </li>
        </ul>
      ),
    },
    {
      id: 'permissions',
      title: 'Permissions',
      Icon: FiShield,
      children: (
        <ul className="list-disc list-inside text-[#eeeeee] space-y-2">
          <li>
            <strong>Viewing and Editing:</strong> Administrators can modify access levels for each component (e.g., Alerts, Statistics, Forecasts) per subscription plan.
          </li>
          <li>
            <strong>Page Grouping:</strong> Permissions are organized by page for easy management.
          </li>
          <li>
            <strong>Interactive Interface:</strong> Bulk modifications, tooltips, and individual controls facilitate rapid updates.
          </li>
          <li>
            <strong>Immediate Feedback:</strong> Changes are instantly reflected in the UI.
          </li>
        </ul>
      ),
    },
    {
      id: 'settings',
      title: 'Settings',
      Icon: FiSettings,
      children: (
        <ul className="list-disc list-inside text-[#eeeeee] space-y-2">
          <li>
            <strong>Feature Toggles:</strong> Enable or disable advanced features such as Cyber Threat Detection, Energy Consumption Analysis, Advanced Telemetry, and Enhanced Notifications.
          </li>
          <li>
            <strong>User Profile &amp; Password:</strong> Update personal details and change your password with dynamic feedback on password strength.
          </li>
        </ul>
      ),
    },
    {
      id: 'support',
      title: 'Support',
      Icon: FiHelpCircle,
      children: (
        <ul className="list-disc list-inside text-[#eeeeee] space-y-2">
          <li>
            <strong>Support Resources:</strong> Quick links to documentation, support ticket submission, and contact details for phone or email support.
          </li>
          <li>
            <strong>Support Ticket Form:</strong> Submit a support request with subject, priority, description, and file attachments.
          </li>
          <li>
            <strong>FAQ:</strong> Answers to common questions regarding password resets, capacity warnings, and system performance.
          </li>
        </ul>
      ),
    },
    {
      id: 'contributing',
      title: 'Contributing',
      Icon: FiGitMerge,
      children: (
        <p className="text-[#eeeeee]">
          *(Guidelines for contributing, including pull request instructions, issue reporting, and coding standards, will be added in the future.)*
        </p>
      ),
    },
    {
      id: 'final-notes',
      title: 'Final Notes',
      Icon: FiInfo,
      children: (
        <p className="text-[#eeeeee]">
          This documentation is updated as the project evolves. For more information or questions, please contact the development team.
        </p>
      ),
    },
  ];

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <header>
        <h1 className="text-3xl text-[#f8485e] font-bold">Avalon Documentation</h1>
        <p className="text-[#eeeeee]/80 mt-2">
          Restructuring the Archimedes Analyzer to integrate with the Avalon WebApp
        </p>
        <hr className="border-[#22c1d4]/20 my-4" />
      </header>

      {/* Table of Contents */}
      <nav className="bg-[#0b3c43] rounded-lg p-6 shadow-lg">
        <h2 className="text-2xl text-[#f8485e] font-semibold mb-4">Table of Contents</h2>
        <ol className="list-decimal list-inside text-[#eeeeee] space-y-2">
          {sections.map(({ id, title, Icon }) => (
            <li key={id}>
              <a href={`#${id}`} className="hover:text-[#22c1d4] inline-flex items-center">
                <Icon className="mr-2" /> {title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* Render delle sezioni */}
      {sections.map((section) => (
        <Section key={section.id} {...section} />
      ))}
    </div>
  );
};

export default Documentation;
