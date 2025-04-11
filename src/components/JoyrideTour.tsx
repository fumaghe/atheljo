import React, { useMemo } from 'react';
import Joyride, { CallBackProps, Step } from 'react-joyride';
import { useAuth } from '../context/AuthContext';
import { useSubscriptionPermissions } from '../hooks/useSubscriptionPermissions';

interface JoyrideTourProps {
  onFinish: () => void;
}

const JoyrideTour: React.FC<JoyrideTourProps> = ({ onFinish }) => {
  const { user, updateUser } = useAuth();

  // Recupero dei permessi per alcune voci della Sidebar
  const reportsPermission = useSubscriptionPermissions("Sidebar", "Reports Link");
  const analyticsPermission = useSubscriptionPermissions("Sidebar", "Systems Link");

  // Definizione degli step del tour
  const steps: Step[] = useMemo(() => {
    if (!user) return [];

    const stepsArray: Step[] = [
      {
        target: "#main-content",
        content: "Welcome to Avalon Dashboard! Explore, monitor and manage your system and unit data.",
        placement: "bottom"
      },
      {
        target: "#header-subscription-icon",
        content: "This icon represents your subscription plan and changes based on your plan.",
        placement: "bottom"
      },
      {
        target: "#header-user-icon",
        content: "Click here to open the user menu for additional options.",
        placement: "bottom"
      },
      {
        target: "#header-dropdown-menu",
        content: `In the dropdown menu you will find: ${
          user.role === "admin" ? "Management options, " : ""
        }${
          (user.role === "admin" || user.role === "customer") ? "Sub-Accounts, " : ""
        }Settings, Support, Sign Out, and Restart Walkthrough.`,
        placement: "left"
      },
      {
        target: "#sidebar-nav",
        content: "This is the Sidebar used for navigation.",
        placement: "right"
      },
      {
        target: "#sidebar-link-dashboard",
        content: "Dashboard: View an overview of your key metrics.",
        placement: "right"
      },
      {
        target: "#sidebar-link-analytics",
        content: "Analytics: Examine detailed insights and system performance.",
        placement: "right"
      },
      {
        target: "#sidebar-link-alerts",
        content: "Alerts: Check for important notifications and system alerts.",
        placement: "right"
      },
      {
        target: "#sidebar-link-reports",
        content: "Reports: Access comprehensive system reports.",
        placement: "right"
      },
      {
        target: "#sidebar-link-your-subscription",
        content: "SmartCARE: Manage your subscription and additional features.",
        placement: "right"
      }
    ];

    return stepsArray;
  }, [user, reportsPermission, analyticsPermission]);

  // Callback del tour
  const handleJoyrideCallback = (data: CallBackProps) => {
    const finishedStatuses: string[] = ['finished', 'skipped'];

    // Se il passo corrente è lo step #3 (user icon) e l'azione è "next",
    // apri il menu utente per mostrare lo step sul dropdown (#4) correttamente.
    if (data.index === 3 && data.action === "next") {
      const event = new CustomEvent('openUserMenu');
      window.dispatchEvent(event);
    }

    // Quando il tour termina o viene saltato, aggiorniamo il profilo utente
    if (finishedStatuses.includes(data.status)) {
      if (user) {
        updateUser(user.id, { walkthroughCompleted: true })
          .catch(err => console.error("Error updating walkthrough flag:", err));
      }
      onFinish();
    }
  };

  return (
    <Joyride
      steps={steps}
      continuous
      showSkipButton
      scrollToFirstStep
      callback={handleJoyrideCallback}
      styles={{
        options: {
          zIndex: 10000,
          backgroundColor: "#06272b",
          primaryColor: "#22c1d4",
          textColor: "#eeeeee",
        },
        buttonSkip: {
          color: "#f8485e",
        },
      }}
    />
  );
};

export default JoyrideTour;
