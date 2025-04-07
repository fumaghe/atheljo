// src/pages/Subscription/YourSubscription.tsx

import React, { useEffect, useState } from 'react';
import {
  FaFireAlt,
  FaStar,
  FaGem
} from 'react-icons/fa';
import { 
  Home,
  FileText,
  BarChart2,
  Clock,
  List,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

/* ======================
   Tipi e interfacce
   ====================== */
export interface SubscriptionPermission {
  page: string;
  component: string;
  permissions: {
    None: PermissionType;
    Essential: PermissionType;
    Advantage: PermissionType;
    Premiere: PermissionType;
  };
}

type PermissionType = 'none' | 'blur' | 'full';
type SubscriptionLevel = 'Essential' | 'Advantage' | 'Premiere';

interface BenefitGroup {
  full: SubscriptionPermission[];
  blur: SubscriptionPermission[];
}

/* ======================
   Utility: conversioni e date
   ====================== */
function hexToRgba(hex: string, alpha: number): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString();
}

function permissionRank(p: PermissionType) {
  switch (p) {
    case 'none':
      return 0;
    case 'blur':
      return 1;
    case 'full':
      return 2;
  }
}

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
}

const Tooltip: React.FC<TooltipProps> = ({ content, children }) => {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative inline-block">
      <div
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        className="inline-block"
      >
        {children}
      </div>
      {visible && (
        <div className="absolute left-0 mt-1 z-10 bg-gray-800 text-white text-sm p-3 rounded shadow-lg min-w-[200px]">
          {content}
        </div>
      )}
    </div>
  );
};

/* ======================
   Dati piani (icone, colore, prezzo)
   ====================== */
const subscriptionInfos: Record<
  SubscriptionLevel,
  {
    label: string;
    icon: JSX.Element;
    highlightColor: string;
    price: number;
  }
> = {
  Essential: {
    label: 'Essential',
    icon: <FaFireAlt size={24} />,
    highlightColor: '#f8485e',
    price: 19.99
  },
  Advantage: {
    label: 'Advantage',
    icon: <FaStar size={24} />,
    highlightColor: '#eeeeee',
    price: 39.99
  },
  Premiere: {
    label: 'Premiere',
    icon: <FaGem size={24} />,
    highlightColor: '#22c1d4',
    price: 49.99
  }
};

/* ======================
   Icone per le pagine
   ====================== */
const pageIcons: Record<string, JSX.Element> = {
  Dashboard: <Home className="w-5 h-5 inline-block" />,
  Alerts: <AlertTriangle className="w-5 h-5 inline-block" />,
  AlertHistory: <Clock className="w-5 h-5 inline-block" />,
  Companies: <BarChart2 className="w-5 h-5 inline-block" />,
  CompaniesDetail: <BarChart2 className="w-5 h-5 inline-block" />,
  Reports: <FileText className="w-5 h-5 inline-block" />,
  Sidebar: <List className="w-5 h-5 inline-block" />,
  SystemDetail: <BarChart2 className="w-5 h-5 inline-block" />
};

/* ======================
   Mappa di un piano
   ====================== */
function buildMapForLevel(
  allItems: SubscriptionPermission[],
  level: SubscriptionLevel
): Map<string, PermissionType> {
  const map = new Map<string, PermissionType>();
  for (const item of allItems) {
    const perm = item.permissions[level];
    // Mappiamo sempre, anche se "blur" o "full"
    map.set(`${item.page}::${item.component}`, perm);
  }
  return map;
}

/* ======================
   Unione di più mappe
   ====================== */
function unionMaps(...maps: Map<string, PermissionType>[]): Map<string, PermissionType> {
  const result = new Map<string, PermissionType>();

  for (const map of maps) {
    for (const [key, perm] of map.entries()) {
      if (result.has(key)) {
        const existing = result.get(key)!;
        if (permissionRank(perm) > permissionRank(existing)) {
          result.set(key, perm);
        }
      } else {
        result.set(key, perm);
      }
    }
  }

  // Rimuoviamo i 'none' finali (se rimane "none", lo togliamo)
  for (const [key, perm] of result.entries()) {
    if (perm === 'none') {
      result.delete(key);
    }
  }
  return result;
}

/* ======================
   Calcolo “nuovi” o “migliorati”
   ====================== */
function calculateNewItems(
  currentMap: Map<string, PermissionType>,
  previousMap: Map<string, PermissionType>
): Set<string> {
  const newSet = new Set<string>();
  for (const [key, newPerm] of currentMap.entries()) {
    const oldPerm = previousMap.get(key) || 'none';
    if (permissionRank(newPerm) > permissionRank(oldPerm)) {
      newSet.add(key);
    }
  }
  return newSet;
}

interface PlanItem {
  key: string; // "Dashboard::System Stats"
  page: string;
  component: string;
  permission: PermissionType;
  isNew: boolean;
}

export default function YourSubscription() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [permissions, setPermissions] = useState<SubscriptionPermission[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [benefits, setBenefits] = useState<Record<SubscriptionLevel, BenefitGroup>>({
    Essential: { full: [], blur: [] },
    Advantage: { full: [], blur: [] },
    Premiere: { full: [], blur: [] }
  });

  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        setLoading(true);
        const apiBase = import.meta.env.VITE_API_BASE || '/api';
        const res = await fetch(`${apiBase}/subscription-permissions`);
        if (!res.ok) {
          throw new Error('Failed to fetch subscription permissions');
        }
        const data: SubscriptionPermission[] = await res.json();
        setPermissions(data);

        // Prepara la struttura con le sezioni "full" e "blur" per ogni piano
        const newBenefits: Record<SubscriptionLevel, BenefitGroup> = {
          Essential: { full: [], blur: [] },
          Advantage: { full: [], blur: [] },
          Premiere: { full: [], blur: [] }
        };

        data.forEach(item => {
          (['Essential', 'Advantage', 'Premiere'] as SubscriptionLevel[]).forEach(level => {
            const perm = item.permissions[level];
            if (perm === 'full') {
              newBenefits[level].full.push(item);
            } else if (perm === 'blur') {
              newBenefits[level].blur.push(item);
            }
          });
        });

        setBenefits(newBenefits);
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Error fetching subscription permissions');
      } finally {
        setLoading(false);
      }
    };

    fetchPermissions();
  }, []);

  // Arrays combinati per ogni livello
  const essentialAll = [...benefits.Essential.full, ...benefits.Essential.blur];
  const advantageAll = [...benefits.Advantage.full, ...benefits.Advantage.blur];
  const premiereAll = [...benefits.Premiere.full, ...benefits.Premiere.blur];

  // Costruzione mappe
  const essentialMap = buildMapForLevel(essentialAll, 'Essential');
  const advantageMap = buildMapForLevel(advantageAll, 'Advantage');
  const premiereMap = buildMapForLevel(premiereAll, 'Premiere');

  // Unioni
  const essentialUnion = unionMaps(essentialMap);
  const advantageUnion = unionMaps(essentialMap, advantageMap);
  const premiereUnion = unionMaps(essentialMap, advantageMap, premiereMap);

  // Calcolo "nuovi"
  const essentialNewSet = new Set<string>();
  const advantageNewSet = calculateNewItems(advantageUnion, essentialUnion);
  const premiereNewSet = calculateNewItems(premiereUnion, advantageUnion);

  // Crea array di PlanItem
  function mapToPlanItems(
    unionMap: Map<string, PermissionType>,
    newSet: Set<string>
  ): PlanItem[] {
    const result: PlanItem[] = [];
    for (const [key, perm] of unionMap.entries()) {
      const [page, component] = key.split('::');

      // Escludiamo direttamente i blur
      if (perm === 'blur') continue;

      result.push({
        key,
        page,
        component,
        permission: perm,
        isNew: newSet.has(key)
      });
    }
    return result;
  }

  const essentialItems = mapToPlanItems(essentialUnion, essentialNewSet);
  const advantageItems = mapToPlanItems(advantageUnion, advantageNewSet);
  const premiereItems = mapToPlanItems(premiereUnion, premiereNewSet);

  // Raggruppa i PlanItem per "page"
  function groupByPage(items: PlanItem[]): Record<string, PlanItem[]> {
    return items.reduce((acc, item) => {
      if (!acc[item.page]) {
        acc[item.page] = [];
      }
      acc[item.page].push(item);
      return acc;
    }, {} as Record<string, PlanItem[]>);
  }

  // Filtra eventuali pagine senza "full"
  function filterEmptyPages(grouped: Record<string, PlanItem[]>): Record<string, PlanItem[]> {
    return Object.fromEntries(
      Object.entries(grouped).filter(([page, items]) => items.length > 0)
    );
  }

  const essentialGroupedRaw = groupByPage(essentialItems);
  const advantageGroupedRaw = groupByPage(advantageItems);
  const premiereGroupedRaw = groupByPage(premiereItems);

  const essentialGrouped = filterEmptyPages(essentialGroupedRaw);
  const advantageGrouped = filterEmptyPages(advantageGroupedRaw);
  const premiereGrouped = filterEmptyPages(premiereGroupedRaw);

  const handleUpgrade = () => {
    navigate('/settings');
  };

  function renderSubscriptionExpiration() {
    if (user?.role === 'admin') {
      return '∞';
    }
    if (user?.subscriptionExpires) {
      return formatDate(user.subscriptionExpires);
    }
    return '-';
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-xl text-[#22c1d4]">Loading subscription details...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-xl text-[#f8485e]">{error}</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Titolo principale */}
      <h2 className="text-3xl font-bold mb-1 text-white">Compare Subscription Levels</h2>

      {/* Scadenza abbonamento */}
      <p className="text-white mb-6">
        <strong>Subscription expiration:</strong> {renderSubscriptionExpiration()}
      </p>

      {/* Griglia dei 3 piani */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {(['Essential', 'Advantage', 'Premiere'] as SubscriptionLevel[]).map(level => {
          const info = subscriptionInfos[level];
          const isCurrentPlan = user?.subscription === level;
          const isMiddleCard = level === 'Advantage';
          const bgColor = hexToRgba(info.highlightColor, 0.1);

          let groupedData: Record<string, PlanItem[]>;
          switch (level) {
            case 'Essential':
              groupedData = essentialGrouped;
              break;
            case 'Advantage':
              groupedData = advantageGrouped;
              break;
            case 'Premiere':
              groupedData = premiereGrouped;
              break;
          }

          return (
            <div
              key={level}
              className={`
                relative rounded-lg shadow p-6 flex flex-col
                transition-all text-white
                ${isMiddleCard ? 'md:-mt-6 md:z-10 md:scale-105' : ''}
              `}
              style={{
                backgroundColor: bgColor,
                border: `2px solid ${info.highlightColor}`
              }}
            >
              {/* Badge per il piano corrente */}
              {isCurrentPlan && (
                <div
                  className="absolute top-0 right-0 px-3 py-1 text-sm font-semibold"
                  style={{ backgroundColor: info.highlightColor }}
                >
                  Current Plan
                </div>
              )}

              {/* Header: icona e nome */}
              <div className="flex flex-col items-center justify-center mb-4">
                <span style={{ color: info.highlightColor }}>{info.icon}</span>
                <h3 className="mt-2 text-2xl font-bold">{info.label}</h3>
              </div>

              {/* Prezzo */}
              <div className="text-center mb-4">
                <span className="text-3xl font-extrabold">
                  ${info.price}
                  <span className="text-base font-normal"> / month</span>
                </span>
              </div>

              {/* Sezione pagine con tooltip per i componenti */}
              <div className="flex-1 flex flex-col gap-3">
                {Object.keys(groupedData).length === 0 ? (
                  <p className="text-sm opacity-70">No benefits configured.</p>
                ) : (
                  Object.entries(groupedData).map(([page, items]) => (
                    <div key={page}>
                      <Tooltip
                        content={
                          <ul className="space-y-1">
                            {items.map((item, idx) => (
                              <li key={idx} className="flex items-center gap-2">
                                <CheckCircle className="w-4 h-4 flex-none text-green-400" />
                                <span>
                                  {item.component}
                                  {item.isNew && (
                                    <span className="ml-1 text-xs bg-green-500 text-white px-1 py-0.5 rounded">
                                      NEW
                                    </span>
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>
                        }
                      >
                        <div className="flex items-center gap-2 cursor-pointer">
                          {pageIcons[page] || <FileText className="w-5 h-5 flex-none" />}
                          <span className="font-semibold">{page}</span>
                        </div>
                      </Tooltip>
                    </div>
                  ))
                )}
              </div>

              {/* Bottone per selezionare/aggiornare piano */}
              <div className="mt-4">
                <button
                  onClick={handleUpgrade}
                  disabled={isCurrentPlan}
                  className={`
                    w-full py-2 rounded-lg font-bold transition-colors
                    ${
                      isCurrentPlan
                        ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                        : 'bg-white text-black hover:bg-gray-100'
                    }
                  `}
                >
                  {isCurrentPlan ? 'Your Current Plan' : `Select ${info.label}`}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
