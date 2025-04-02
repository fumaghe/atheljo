// src/pages/NoPermission.tsx
import React from 'react';
import { Link } from 'react-router-dom';

const NoPermission: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#06272b] p-4">
      <div className="bg-[#0b3c43] p-8 rounded-lg shadow-md text-center">
        <h1 className="text-2xl font-bold text-[#f8485e] mb-4">Access Denied</h1>
        <p className="mb-6 text-[#eeeeee]">
          You do not have permission to access this page.
        </p>
        <Link
          to="/"
          className="px-4 py-2 bg-[#22c1d4] text-[#06272b] rounded hover:bg-[#22c1d4]/90 transition-colors"
        >
          Go Back
        </Link>
      </div>
    </div>
  );
};

export default NoPermission;
