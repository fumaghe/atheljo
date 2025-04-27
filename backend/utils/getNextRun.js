// backend/utils/getNextRun.js
export function getNextRun(now, frequency, customInterval) {
    switch (frequency) {
      case 'hourly':
        return new Date(now.getTime() + 60 * 60 * 1000);
      case 'daily':
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
      case 'weekly':
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      case 'monthly':
        return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      case 'custom':
        if (customInterval && customInterval <= 24) {
          return new Date(now.getTime() + customInterval * 60 * 60 * 1000); // ore
        }
        if (customInterval) {
          return new Date(now.getTime() + customInterval * 24 * 60 * 60 * 1000); // giorni
        }
        return null;
      default:
        return null;
    }
  }
  