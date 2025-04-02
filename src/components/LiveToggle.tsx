import React, { useState } from 'react';

interface LiveToggleProps {
  isLive?: boolean;
  onChange?: (isLive: boolean) => void;
}

export default function LiveToggle({ isLive: externalIsLive, onChange }: LiveToggleProps) {
  const [internalIsLive, setInternalIsLive] = useState(false);
  
  // Determine if we're using internal or external state
  const isLive = externalIsLive !== undefined ? externalIsLive : internalIsLive;
  
  const handleToggle = () => {
    const newValue = !isLive;
    if (onChange) {
      onChange(newValue);
    } else {
      setInternalIsLive(newValue);
    }
  };

  return (
    <button
      onClick={handleToggle}
      className={`
        px-3 py-1 rounded-full flex items-center gap-2 transition-colors
        ${isLive 
          ? 'bg-[#22c1d4] text-[#06272b]' 
          : 'bg-[#eeeeee]/10 text-[#eeeeee]'
        }
      `}
    >
      <span className={`
        w-2 h-2 rounded-full
        ${isLive ? 'bg-[#06272b]' : 'bg-[#eeeeee]/60'}
      `} />
      Live
    </button>
  );
}