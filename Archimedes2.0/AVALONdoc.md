# Avalon Documentation

Restructuring the Archimedes Analyzer to integrate with the Avalon WebApp

---

## Introduction

This documentation provides an overview of the site's main features, highlighting what is available to the user without delving too deeply into technical details.

---

## Table of Contents

1. [Main Features](#main-features)
2. [Installation](#installation)
3. [General Structure](#general-structure)
4. [Authentication & Security](#authentication--security)
5. [User Interface](#user-interface)
6. [Dashboard](#dashboard)
7. [Analytics](#analytics)
   - [Companies Overview](#companies-overview)
   - [Company Detail](#company-detail)
   - [System Detail](#system-detail)
   - [State Vector Chart](#state-vector-chart)
   - [Health Score Explanation](#health-score-explanation)
8. [Alerts History](#alerts-history)
9. [Reports](#reports)
10. [Subscription](#subscription)
11. [Sub-Accounts](#sub-accounts)
12. [Permissions](#permissions)
13. [Settings](#settings)
14. [Support](#support)
15. [Contributing](#contributing)
16. [Final Notes](#final-notes)

---

## Main Features

- **Integration with Database Systems**: The site connects to SQL and document-based databases to retrieve telemetry data and store analysis results.
- **Telemetry Data Analysis**: The system extracts useful information for managing and monitoring the services offered by Avalon.
- **Graph Generation**: Visualization tools allow the creation of charts and reports for quick data interpretation.
- **Security and Authentication**: Login flows and password management are designed to ensure secure user access.

---

## Installation

*(Installation and configuration details will be updated with step-by-step instructions, requirements, and environment variables.)*

---

## General Structure

The project is organized into modules that manage the following functionalities:

- **Database (DB)**: Connection and management of data from SQL (MerlinDB) and document-based (ArchimedesDB) databases.
- **File System (FS)**: Document management, with options for different databases such as Firestore and MongoDB.
- **Main Application**: Setting up environmental parameters and coordinating the analysis process.
- **Results**: Organizing and formatting the analyzed data for report generation.
- **Utils**: Support functions for common operations, including chart creation and exporting results in various formats (CSV, JSON, Excel, Parquet).

---

## Authentication & Security

The site offers a range of features designed to ensure both security and ease of use in system access:

### Login and Access
- **Multi-Step Login**: A guided process that takes the user from the initial login to identity verification via OTP, if necessary.
- **Password Recovery**: A simple option to request a reset link in case the password is forgotten.

### Password Management
- **Password Change**: An assisted procedure to modify the password, useful both during a reset and when an update is required.
- **Automatic Password Generation**: Internal tools that help create secure passwords, providing immediate feedback on the strength of the chosen combination.

---

## User Interface

This section describes the main components of the interface, designed to simplify interaction and make the most useful information immediately accessible.

### Header

- **Branding and Visual Identity**  
  The application logos are displayed in an optimized manner for different devices, ensuring a recognizable visual identity.

- **Demo Message**  
  A central section informs the user that they are using the demo version and offers a link for further information.

- **Data Update**  
  The status of the last update is shown, with the time or a message indicating no updates, and a button to manually request a new update. Visual indicators communicate the success or any error of the operation.

- **User Menu**  
  The profile icon allows access to a personal menu that includes the user’s name and options such as account management, settings, support, and logout. A symbol representing the subscription plan is also displayed, if applicable.

### Sidebar

- **Main Navigation**  
  The sidebar provides direct links to the essential sections of the site, such as Dashboard, Analytics, Alerts, and Reports, facilitating quick and intuitive navigation.

- **Subscription Management**  
  There is a dedicated subscription section that displays a specific icon based on the active plan, allowing access to or management of subscription details.

- **Responsive Interface**  
  The sidebar adapts to user preferences, being expandable or collapsible depending on screen size and individual needs.

- **Permission-Based Controls**  
  Some menu items are only visible based on the user’s role or subscription level, ensuring that the presented options are always relevant to each profile.

---

## Dashboard

The Dashboard is the main page of the site and serves as the starting point for data monitoring and analysis. Its main features include:

- **Customizable Filters**  
  Users can apply filters to view only relevant data. It is possible to select the company, system type, pool, telemetry status, and time interval to focus on the data of interest.

- **Alerts Section**  
  The most recent alerts related to monitored systems are displayed, highlighting issues such as excessive capacity usage or sudden trend changes. These alerts help quickly identify potential problems.

- **System Statistics**  
  A summary of key metrics provides immediate information on the status of the systems, including the number of systems in "Healthy," "Warning," or "Critical" conditions and other performance indicators.

- **Interactive Charts**  
  The Dashboard integrates several interactive charts:
  - **System Status Chart**: Displays the distribution of systems by status.
  - **System Types Chart**: Illustrates the breakdown of systems by type.
  - **Capacity Distribution Chart**: Shows the distribution of capacity among active usage, snapshots, and free space.
  - **Capacity Trends Charts**: Presents the trends in capacity usage and snapshots over time, with the option to select the preferred unit of measure.

- **Loading Indicator**  
  A loading indicator is shown during data retrieval to inform the user of the update status.

- **Permission-Based Access**  
  Some sections of the Dashboard, such as detailed charts and statistics, may only be fully visible if the user has the appropriate permissions based on their role or subscription plan. Otherwise, the information may be partially hidden with an invitation to upgrade.

---

## Analytics

The Analytics section allows users to delve deeper into system data analysis, providing detailed information and interactive visualizations.

### Companies Overview
- **Description**: Aggregates statistics for each company, showing the number of systems, pools, used and total capacity, and the average usage percentage.
- **Features**:
  - Search and filters to select companies based on system status and software version.
  - Summary cards for each company highlighting key data with visual cues on capacity, health status, and telemetry activity.
- **Interaction**: By clicking on a company card, the user accesses a detailed page for that specific company.

### Company Detail
- **Description**: Provides an in-depth overview of the systems belonging to a single company.
- **Features**:
  - Display of aggregated statistics, such as the total number of systems and overall health (healthy, warning, critical).
  - Detailed system information on capacity, health status, and performance.
- **Interaction**: The user can click on a system to view additional details.

### System Detail
- **Description**: Offers a detailed view of a specific system.
- **Features**:
  - In-depth data on capacity, performance, and telemetry.
  - Interactive charts showing historical usage trends and future forecasts.
  - A "State Vector Analysis" section to analyze system evolution over time.
- **Interaction**: Allows the user to examine the system's behavior and identify potential improvement areas.

### State Vector Chart
- **Description**: An interactive chart displaying data trends over time.
- **Features**:
  - Options for line or candlestick views, offering different perspectives on weekly trends.
  - Selection of the time interval and unit of measure (GB, GiB, TB).
- **Interaction**: The user can adjust the settings to obtain the most suitable view for their needs.

### Health Score Explanation
- **Description**: The **Health Score** is a key indicator that provides an overall evaluation of a system’s health.
- **Health Score Calculation**:
  - **Capacity**: Evaluates space usage against an ideal value.
  - **Performance**: Measures how frequently the system sends telemetry data relative to an optimal interval.
  - **Telemetry**: Indicates whether the system is actively transmitting data.
  - **Snapshots**: Analyzes the impact of data used for snapshots.
  - **MUP**: Considers the efficiency in resource utilization.
- **Breakdown**:
  - Each parameter contributes a specific weight to the final score.
  - The result, expressed in points, indicates whether the system is in good condition or needs attention.
  - Detailed explanations show how each parameter affects the overall score.

---

## Alerts History

The Alerts History page allows a complete view of the system-generated alerts history.

- **Historical View**:  
  A list of alerts is displayed in descending order by date, with the ability to filter by alert type (forecast, sudden increase, sudden decrease, inactivity, etc.) and by host.

- **Filters and Pagination**:  
  The user can select filters by type and host and progressively load more alerts if available.

- **Permission Indicators**:  
  If the subscription level does not allow full detail viewing, partially blurred versions are displayed with a lock icon, inviting the user to upgrade their plan.

- **User Experience**:  
  All information is presented in a clear, readable format with icons indicating the alert type and its importance (e.g., red for high criticality).

---

## Reports

The Reports page offers the possibility to generate and manage PDF reports that summarize the data collected by the system.

- **Report Generation**:  
  The user can select a specific host (or all hosts) and choose whether to send the report via email or simply download it. It is also possible to schedule automatic report sending at regular intervals (e.g., daily or weekly).

- **Report Content**:  
  The reports include:
  - Aggregated system statistics.
  - Charts (such as the Usage Chart and the Capacity Chart) – in some demo versions, these elements are shown as placeholders.
  - Detailed tables displaying data for each system.
  - A summary of the System Health Score.

- **Permission Indicators**:  
  If the subscription level does not allow full report generation, the interface shows a "dummy" version of the report along with an invitation to upgrade the plan.

- **Report History and Scheduling**:  
  Users can access the history of generated reports and active schedules, with the option to download previously sent reports or cancel a scheduled report.

---

## Subscription

The Subscription page allows the user to compare the different subscription levels available and view the benefits and features included in each plan.

- **Plan Comparison**:  
  The three subscription levels (Essential, Advantage, Premiere) are presented in a comparative grid. Each plan shows:
  - A representative icon and the plan name.
  - The monthly price.
  - Specific benefits, organized by page (e.g., Dashboard, Reports, etc.) and categorized based on access level ("full" or "blur").

- **Benefits and New Features**:  
  Through interactive tooltips, the user can see which components or features are fully included and which are partially accessible (blurred) in their plan.

- **Subscription Status**:  
  The expiration date of the subscription (or an infinity symbol for administrators) is also displayed along with a button to update or change the current plan.

- **Upgrade Invitation**:  
  If the user lacks permission for some features, an upgrade invitation is highlighted, explaining the benefits of a higher-level plan.

---

## Sub-Accounts

The Sub-Accounts section allows users with administrative privileges to manage secondary (sub-account) accounts for their clients.

- **Employee Management**:  
  Administrators can add, modify, and remove sub-accounts, delegating access and operational management to employees or collaborators.
  
- **Permission Configuration**:  
  When creating or editing a sub-account, it is possible to select specific permissions for each section of the site. The interface groups permissions by page, offering buttons to enable or disable all at once (NONE or FULL) and the option to manually select desired permissions.

- **Selection of Visible Companies**:  
  For "admin employee" roles, it is possible to define which companies the sub-account can view using a multi-select system.

- **Guided Interaction**:  
  The interface uses a step-by-step wizard that guides the administrator through entering basic information, selecting permissions, and providing a final summary before saving.

---

## Permissions

The Permissions page allows administrators to manage and configure component and page-level permissions for the different subscription levels.

- **Viewing and Editing**:  
  Administrators can see a complete list of system components (e.g., “Alerts Card”, “System Statistics”, “Usage Forecast”) and configure the access level for each component for each plan (None, Blur, or Full).

- **Page Grouping**:  
  Permissions are organized by page, facilitating management and comparison between various components. Each group can be expanded or collapsed for better readability.

- **Interactive Interface**:  
  Using tooltips and buttons, the interface allows for quick bulk modification of permissions for a particular page or individually for each component.

- **Immediate Feedback**:  
  Changes are immediately reflected, with the option to save the updated configuration, making the process transparent and intuitive.

---

## Settings

The Settings page allows the user to update their profile and change their password, as well as enable some advanced features (feature toggles).

- **Feature Toggles**:  
  Here, several features are listed (e.g., Cyber Threat Detection, Energy Consumption Analysis, Advanced Telemetry, and Enhanced Notifications). Although at this stage they are only presented as part of the interface, they offer a preview of the system's future capabilities.

- **User Profile & Password**:  
  Users can update their name and change their password. During password modification, dynamic feedback on its strength is provided along with suggestions for improvement, ensuring that the new password is secure.

---

## Support

The Support page is under development and offers the following main features:

- **Support Resources**:  
  An interactive grid provides quick links to useful resources:
  - **Documentation**: By clicking on this link, the user can open the detailed system documentation.
  - **Support Ticket**: An option to create a new support ticket.
  - **Phone & Email Support**: Information for contacting support via phone or email.

- **Support Ticket Form**:  
  A form allows the user to submit a support request by filling in the subject, priority, description, and attaching files if necessary.

- **FAQ**:  
  A FAQ section answers common questions such as password reset, capacity warning management, and system performance optimization.

---

## Contributing

*(Guidelines for contributing to the project, including instructions for pull requests, issues, and coding standards, will be added in the future.)*

---

## Final Notes

This documentation is updated as the project evolves. For more information or questions, please contact the development team.
