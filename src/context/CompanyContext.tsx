// src/context/CompanyContext.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import firestore from '../firebaseClient';
import { collection, getDocs, QueryDocumentSnapshot } from 'firebase/firestore';

interface SystemData {
  name: string;
  hostid: string;
  pool: string;
  type: string;
  used: number;
  avail: number;
  used_snap: number;
  perc_used: number;
  perc_snap: number;
  sending_telemetry: boolean;
  first_date: string;
  last_date: string;
  MUP: number;
  avg_speed: number;
  avg_time: number;
  company: string;
}

interface CompanyContextType {
  companies: string[];
  isLoading: boolean;
  error: string | null;
}

const CompanyContext = createContext<CompanyContextType>({
  companies: [],
  isLoading: false,
  error: null
});

export const CompanyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [companies, setCompanies] = useState<string[]>(['all']);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadCompanies = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Ottieni i documenti dalla collection "system_data"
        const querySnapshot = await getDocs(collection(firestore, 'system_data'));
        const data: SystemData[] = querySnapshot.docs.map(
          (doc: QueryDocumentSnapshot) => doc.data() as SystemData
        );
        // Estrae i nomi univoci delle aziende
        const uniqueCompanies = Array.from(new Set(data.map(system => system.company)));
        setCompanies(['all', ...uniqueCompanies]);
      } catch (err) {
        console.error('Error loading companies:', err);
        setError('Failed to load company data');
      } finally {
        setIsLoading(false);
      }
    };

    loadCompanies();
  }, []);

  return (
    <CompanyContext.Provider value={{ companies, isLoading, error }}>
      {children}
    </CompanyContext.Provider>
  );
};

export const useCompany = () => useContext(CompanyContext);
