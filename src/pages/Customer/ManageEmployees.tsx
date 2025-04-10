import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { User } from '../../types/auth';
import { UserPlus, Trash2, Edit, Save, X, Search } from 'lucide-react';
import {
  FaFireAlt,
  FaStar,
  FaGem,
  FaTachometerAlt,
  FaBell,
  FaFileAlt,
  FaBuilding,
  FaInfoCircle,
  FaCogs,
  FaHistory,
  FaBars,
  FaPuzzlePiece,
  FaUser,
  FaUserShield
} from 'react-icons/fa';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import Select from 'react-select';
import { Navigate } from 'react-router-dom';
import NoPermission from '../../pages/NoPermission';

// Interface for a permission item
interface PermissionItem {
  id: string; // e.g. "Dashboard__Alerts"
  page: string;
  component: string;
}

// Specific type for employee roles
type EmployeeRole = 'employee' | 'admin_employee';

// Subscription styling info
const subscriptionInfos: Record<'Essential' | 'Advantage' | 'Premiere', {
  label: string;
  icon: JSX.Element;
  cardClass: string;
  textClass: string;
  highlightColor: string;
}> = {
  Essential: {
    label: 'Essential',
    icon: <FaFireAlt size={20} />,
    cardClass: 'border-2 border-[#f8485e] bg-[#f8485e]/10',
    textClass: 'text-[#f8485e]',
    highlightColor: '#f8485e'
  },
  Advantage: {
    label: 'Advantage',
    icon: <FaStar size={20} />,
    cardClass: 'border-2 border-[#eeeeee] bg-[#eeeeee]/10',
    textClass: 'text-white',
    highlightColor: '#eeeeee'
  },
  Premiere: {
    label: 'Premiere',
    icon: <FaGem size={20} />,
    cardClass: 'border-2 border-[#22c1d4] bg-[#22c1d4]/10',
    textClass: 'text-[#22c1d4]',
    highlightColor: '#22c1d4'
  }
};

const pageIcons: Record<string, JSX.Element> = {
  Sidebar: <FaBars size={16} />,
  Dashboard: <FaTachometerAlt size={16} />,
  Alerts: <FaBell size={16} />,
  AlertHistory: <FaHistory size={16} />,
  Companies: <FaBuilding size={16} />,
  CompaniesDetail: <FaInfoCircle size={16} />,
  SystemDetail: <FaCogs size={16} />,
  Reports: <FaFileAlt size={16} />
};

// Helper to translate a permission into plain language
const translatePermission = (permId: string): string => {
  const parts = permId.split('__');
  if (parts.length === 2) {
    const formatted = parts[1].replace(/([A-Z])/g, ' $1').trim();
    return `${parts[0]} – ${formatted}`;
  }
  return permId;
};

// ============================
// EmployeeCard Component
// ============================
interface EmployeeCardProps {
  employee: User;
  onEdit: (employee: User) => void;
  onDelete: (id: string) => void;
  groupedPermissions: Record<string, PermissionItem[]>;
  subInfo: { highlightColor: string };
}
const EmployeeCard: React.FC<EmployeeCardProps> = ({ employee, onEdit, onDelete, groupedPermissions, subInfo }) => {
  const [expanded, setExpanded] = useState(false);

  // Calculate how many sections are enabled for this employee
  const enabledSections = Object.keys(groupedPermissions).filter(page =>
    employee.permissions?.some(perm => groupedPermissions[page].some(p => p.id === perm))
  ).length;

  return (
    <div className="bg-[#06272b] rounded-lg p-4 shadow transition-shadow">
      <div className="flex justify-between items-center cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          {employee.role === 'admin_employee' ? (
            <FaUserShield className="text-[#22c1d4]" size={20} />
          ) : (
            <FaUser className="text-[#22c1d4]" size={20} />
          )}
          <div>
            <h3 className="font-semibold text-[#eeeeee] text-xl">{employee.username}</h3>
            <p className="text-sm text-[#eeeeee]/70">Role: {employee.role}</p>
            <p className="text-sm text-[#eeeeee]/70">
              Permissions: {enabledSections} sections enabled (click for details)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={(e) => { e.stopPropagation(); onEdit(employee); }} 
            title="Edit" 
            className="p-2 hover:bg-[#0b3c43] rounded-full transition-colors"
          >
            <Edit className="w-5 h-5 text-[#22c1d4]" />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onDelete(employee.id); }} 
            title="Delete" 
            className="p-2 hover:bg-[#0b3c43] rounded-full transition-colors"
          >
            <Trash2 className="w-5 h-5 text-[#f8485e]" />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="mt-4 border-t pt-4">
          {Object.entries(groupedPermissions)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([page, perms]) => {
              const pageSelected = employee.permissions?.some(perm => perms.some(p => p.id === perm));
              if (!pageSelected) return null;
              return (
                <div key={page} className="mb-4">
                  <h4 className="flex items-center gap-2 font-semibold uppercase text-sm mb-1">
                    {pageIcons[page] || <FaPuzzlePiece size={16} />}
                    <span>{page}</span>
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {perms.map(perm => {
                      const selected = employee.permissions?.includes(perm.id);
                      return (
                        <span key={perm.id} className={`px-2 py-1 rounded text-xs font-semibold ${selected ? 'bg-[#22c1d4] text-[#06272b]' : 'bg-[#06272b] text-[#eeeeee] border border-[#22c1d4]'}`}>
                          {translatePermission(perm.id)}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
};

// ============================
// EmployeeWizard Component (Step Form)
// ============================
// Added "existingUsernames" prop for real‑time username verification
interface EmployeeWizardProps {
  employeeToEdit?: User;
  onSave: (employee: Partial<User>) => Promise<void>;
  availableCompanies: string[];
  groupedPermissions: Record<string, PermissionItem[]>;
  subInfo: { highlightColor: string };
  isAdmin: boolean;
  currentCompany: string;
  parentId: string;
  parentSubscription: "None" | "Essential" | "Advantage" | "Premiere";
  onCancel: () => void;
  existingUsernames: string[];
}
const EmployeeWizard: React.FC<EmployeeWizardProps> = ({
  employeeToEdit,
  onSave,
  availableCompanies,
  groupedPermissions,
  subInfo,
  isAdmin,
  currentCompany,
  parentId,
  parentSubscription,
  onCancel,
  existingUsernames
}) => {
  // If we are editing, initialize state with the existing employee data
  const [newEmployee, setNewEmployee] = useState<Partial<User>>(
    employeeToEdit
      ? { ...employeeToEdit }
      : {
          username: '',
          password: '',
          role: 'employee',
          company: isAdmin ? '' : currentCompany,
          permissions: []
        }
  );
  // State for visible companies (for admin_employee)
  const [visibleCompanies, setVisibleCompanies] = useState<string[]>(
    employeeToEdit && employeeToEdit.role === 'admin_employee' && employeeToEdit.visibleCompanies
      ? employeeToEdit.visibleCompanies
      : []
  );
  const [step, setStep] = useState(1);

  // State for real-time username verification
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    // If there is no value or if we're editing and the username hasn't changed, consider it available
    if (!newEmployee.username || (employeeToEdit && newEmployee.username === employeeToEdit.username)) {
      setUsernameAvailable(true);
      return;
    }
    if (existingUsernames.includes(newEmployee.username)) {
      setUsernameAvailable(false);
    } else {
      setUsernameAvailable(true);
    }
  }, [newEmployee.username, existingUsernames, employeeToEdit]);

  // Permission selection and toggle
  const togglePermission = (permId: string) => {
    setNewEmployee(prev => {
      const current = prev.permissions || [];
      return current.includes(permId)
        ? { ...prev, permissions: current.filter(p => p !== permId) }
        : { ...prev, permissions: [...current, permId] };
    });
  };

  const bulkTogglePermissions = (page: string, mode: 'none' | 'full') => {
    setNewEmployee(prev => {
      const current = prev.permissions || [];
      if (mode === 'none') {
        return {
          ...prev,
          permissions: current.filter(p => !groupedPermissions[page].some(perm => perm.id === p))
        };
      } else {
        const toAdd = groupedPermissions[page].map(perm => perm.id);
        return { ...prev, permissions: Array.from(new Set([...current, ...toAdd])) };
      }
    });
  };

  const renderStepContent = () => {
    if (step === 1) {
      // Basic information
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Username</label>
            <input
              type="text"
              value={newEmployee.username}
              onChange={(e) => setNewEmployee({ ...newEmployee, username: e.target.value })}
              className={`w-full bg-[#06272b] rounded-lg px-4 py-2 border ${
                usernameAvailable === false ? 'border-[#f8485e]' : 'border-[#22c1d4]'
              }`}
              placeholder="Enter username"
            />
            {usernameAvailable === false && (
              <p className="mt-1 text-sm text-[#f8485e]">Username already in use</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Password</label>
            <input
              type="password"
              value={newEmployee.password || ''}
              onChange={(e) => setNewEmployee({ ...newEmployee, password: e.target.value })}
              className="w-full bg-[#06272b] rounded-lg px-4 py-2 border border-[#22c1d4]"
              placeholder="Enter password"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Role</label>
            <select
              value={newEmployee.role || 'employee'}
              onChange={(e) =>
                setNewEmployee({ ...newEmployee, role: e.target.value as EmployeeRole })
              }
              className="w-full bg-[#06272b] rounded-lg px-4 py-2 border border-[#22c1d4]"
              disabled={!isAdmin}
            >
              <option value="employee">Employee</option>
              {isAdmin && <option value="admin_employee">Admin Employee</option>}
            </select>
          </div>
          {isAdmin && newEmployee.role === 'admin_employee' && (
            <div>
              <label className="block text-sm font-medium mb-2">Visible Companies</label>
              <Select
                isMulti
                placeholder="Search and select companies..."
                options={[
                  { value: 'all', label: 'All Companies' },
                  ...availableCompanies.map(company => ({ value: company, label: company }))
                ]}
                value={
                  visibleCompanies.length === 0
                    ? []
                    : visibleCompanies.includes('all')
                      ? [{ value: 'all', label: 'All Companies' }]
                      : visibleCompanies.map(comp => ({ value: comp, label: comp }))
                }
                onChange={(selected) => {
                  const selectedValues = selected.map(opt => opt.value);
                  if (selectedValues.includes('all')) {
                    setVisibleCompanies(['all']);
                  } else {
                    setVisibleCompanies(selectedValues);
                  }
                }}
                classNamePrefix="react-select"
                styles={{
                  control: (provided) => ({
                    ...provided,
                    backgroundColor: '#06272b',
                    borderColor: '#22c1d4',
                    color: '#eeeeee'
                  }),
                  multiValue: (provided) => ({
                    ...provided,
                    backgroundColor: '#22c1d4'
                  }),
                  multiValueLabel: (provided) => ({
                    ...provided,
                    color: '#06272b',
                    fontWeight: 'bold'
                  }),
                  multiValueRemove: (provided) => ({
                    ...provided,
                    color: '#06272b',
                    ':hover': {
                      backgroundColor: '#f8485e',
                      color: 'white'
                    }
                  }),
                  menu: (provided) => ({
                    ...provided,
                    backgroundColor: '#06272b'
                  }),
                  option: (provided, state) => ({
                    ...provided,
                    backgroundColor: state.isFocused ? '#22c1d4' : '#06272b',
                    color: state.isFocused ? '#06272b' : '#eeeeee'
                  }),
                  placeholder: (provided) => ({
                    ...provided,
                    color: '#eeeeee80'
                  }),
                  singleValue: (provided) => ({
                    ...provided,
                    color: '#eeeeee'
                  })
                }}
              />
            </div>
          )}
        </div>
      );
    } else if (step === 2) {
      // Permissions selection
      return (
        <div className="space-y-4">
          {Object.entries(groupedPermissions).length === 0 ? (
            <span className="text-sm text-[#eeeeee]/70">
              No permissions available for the current subscription level
            </span>
          ) : (
            Object.entries(groupedPermissions)
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([page, perms]) => (
                <div key={page} className="mb-4 border rounded bg-[#06272b] p-3">
                  <div className="flex items-center justify-between font-semibold uppercase text-sm mb-1">
                    <span className="flex items-center gap-1">
                      {pageIcons[page] || <FaPuzzlePiece size={16} />}
                      {page}
                    </span>
                    <span className="flex gap-1">
                      <button
                        onClick={() => bulkTogglePermissions(page, 'none')}
                        className="px-2 py-1 rounded border text-xs font-semibold transition-colors bg-[#06272b] text-[#eeeeee] border-[#22c1d4]"
                      >
                        NONE
                      </button>
                      <button
                        onClick={() => bulkTogglePermissions(page, 'full')}
                        className={`px-2 py-1 rounded border text-xs font-semibold transition-colors bg-[${subInfo.highlightColor}] text-[#06272b]`}
                      >
                        FULL
                      </button>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {perms.map(perm => {
                      const isSelected = newEmployee.permissions?.includes(perm.id);
                      return (
                        <button
                          key={perm.id}
                          type="button"
                          onClick={() => togglePermission(perm.id)}
                          className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                            isSelected
                              ? `bg-[${subInfo.highlightColor}] text-[#06272b]`
                              : 'bg-[#06272b] text-[#eeeeee] border border-[#22c1d4]'
                          }`}
                        >
                          {translatePermission(perm.id)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
          )}
        </div>
      );
    } else if (step === 3) {
      // Summary preview
      return (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-[#eeeeee]">Summary</h3>
          <p className="text-[#eeeeee]">Username: {newEmployee.username}</p>
          <p className="text-[#eeeeee]">Role: {newEmployee.role}</p>
          <p className="text-[#eeeeee]">
            Selected permissions:{' '}
            {newEmployee.permissions && newEmployee.permissions.length > 0
              ? newEmployee.permissions.map(perm => translatePermission(perm)).join(', ')
              : 'None'}
          </p>
          {isAdmin && newEmployee.role === 'admin_employee' && (
            <p className="text-[#eeeeee]">
              Visible Companies:{' '}
              {visibleCompanies.length > 0
                ? visibleCompanies.includes('all')
                  ? 'All Companies'
                  : visibleCompanies.join(', ')
                : 'None'}
            </p>
          )}
        </div>
      );
    }
  };

  const handleSubmit = async () => {
    const payload: Partial<User> = {
      ...newEmployee,
      parentCustomerId: parentId,
      visibleCompanies:
        newEmployee.role === 'admin_employee'
          ? visibleCompanies.includes('all')
            ? availableCompanies
            : visibleCompanies
          : [],
    };

    if (newEmployee.role === 'employee' || newEmployee.role === 'admin_employee') {
      payload.subscription = parentSubscription;
    }

    // Prevent submitting if the username is not available
    if (usernameAvailable === false) {
      alert("The username is already in use. Please choose another.");
      return;
    }
    
    await onSave(payload);
  };

  return (
    <div className="bg-[#0b3c43] rounded-lg p-6 shadow-lg space-y-6">
      <h2 className="text-2xl font-semibold text-[#eeeeee]">
        {employeeToEdit ? 'Edit Employee' : 'Add New Employee'}
      </h2>
      {renderStepContent()}
      <div className="flex justify-between">
        <button
          onClick={onCancel}
          className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold bg-[#06272b] hover:bg-[#06272b]/80 transition-colors text-[#eeeeee]"
        >
          Cancel
        </button>
        <div className="flex gap-2">
          {step > 1 && (
            <button
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold bg-[#06272b] hover:bg-[#06272b]/80 transition-colors text-[#eeeeee]"
            >
              Back
            </button>
          )}
          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 && (!newEmployee.username || usernameAvailable === false)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors ${
                step === 1 && (!newEmployee.username || usernameAvailable === false)
                  ? 'bg-gray-500 cursor-not-allowed text-[#06272b]'
                  : `bg-[${subInfo.highlightColor}] text-[#06272b] hover:bg-[${subInfo.highlightColor}]/90`
              }`}
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold bg-[${subInfo.highlightColor}] text-[#06272b] hover:bg-[${subInfo.highlightColor}]/90 transition-colors`}
            >
              <Save className="w-5 h-5" />
              Save Employee
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================
// ManageEmployees Component (Main)
// ============================
const ManageEmployees: React.FC = () => {
  const { user, getUsers, addUser, updateUser, deleteUser, isAuthenticated, isInitializingSession } = useAuth();

  if (isInitializingSession) {
    return (
      <div style={{ color: '#eeeeee', textAlign: 'center', padding: '2rem' }}>
        Loading session...
      </div>
    );
  }
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role === 'employee' || user.role === 'admin_employee') {
    return <NoPermission />;
  }

  const [employees, setEmployees] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddingEmployee, setIsAddingEmployee] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<User | null>(null);
  const [availableCompanies, setAvailableCompanies] = useState<string[]>([]);
  const [allowedPermissions, setAllowedPermissions] = useState<PermissionItem[]>([]);

  // Fetch employees
  useEffect(() => {
    if (!user) return;
    getUsers().then(allUsers => {
      const filtered = allUsers.filter(u =>
        (u.role === 'employee' || u.role === 'admin_employee') &&
        u.parentCustomerId === user!.id
      );
      setEmployees(filtered);
    });
  }, [getUsers, user]);

  // Fetch permissions from the backend
  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        const API_BASE = import.meta.env.VITE_API_BASE || '/api';
        const res = await fetch(`${API_BASE}/subscription-permissions`);
        if (!res.ok) {
          console.error('Error fetching subscription permissions');
          return;
        }
        const allPermissions = await res.json();
        const customerSubscription = user!.subscription || 'None';

        // Also consider permissions with "blur" level
        const filtered: PermissionItem[] = allPermissions
          .filter((sp: any) => {
            if (customerSubscription === 'None') return false;
            const permLevel = sp.permissions[customerSubscription];
            return permLevel === 'full' || permLevel === 'blur';
          })
          .map((sp: any) => ({
            id: `${sp.page}__${sp.component}`,
            page: sp.page,
            component: sp.component
          }));

        setAllowedPermissions(filtered);
      } catch (error) {
        console.error('Error fetching permissions:', error);
      }
    };

    if (user) {
      fetchPermissions();
    }
  }, [user]);

  // Fetch companies from the backend
  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const API_BASE = import.meta.env.VITE_API_BASE || '/api';
        const res = await fetch(`${API_BASE}/companies`);
        if (res.ok) {
          const companies = await res.json();
          setAvailableCompanies(companies);
        } else {
          console.error('Failed to load companies.');
        }
      } catch (error) {
        console.error('Error loading companies:', error);
      }
    };

    fetchCompanies();
  }, []);

  // Group permissions by page
  const groupedPermissions = allowedPermissions.reduce((acc, perm) => {
    if (!acc[perm.page]) acc[perm.page] = [];
    acc[perm.page].push(perm);
    return acc;
  }, {} as Record<string, PermissionItem[]>);

  // Subscription style based on the client subscription
  const subInfo =
    user && user.subscription && subscriptionInfos[user.subscription as 'Essential' | 'Advantage' | 'Premiere']
      ? subscriptionInfos[user.subscription as 'Essential' | 'Advantage' | 'Premiere']
      : subscriptionInfos['Essential'];

  // Handler to add a new employee
  const handleAddEmployee = async (newEmp: Partial<User>) => {
    if (!newEmp.username || !newEmp.password) {
      alert('Please fill in the required fields (username, password).');
      return;
    }
    const createdEmp = await addUser(newEmp as User);
    if (createdEmp) {
      setEmployees(prev => [...prev, createdEmp]);
      setIsAddingEmployee(false);
      setEditingEmployee(null);
    } else {
      alert('Employee creation failed.');
    }
  };

  // Handler to update an employee
  const handleUpdateEmployee = async (updatedEmp: Partial<User>) => {
    if (!updatedEmp.id) return;
    if (!updatedEmp.password) {
      delete updatedEmp.password;
    }
    updatedEmp.permissions = updatedEmp.permissions?.map((p: any) =>
      typeof p === 'object' ? p.id : p
    ) || [];
    const updated = await updateUser(updatedEmp.id, updatedEmp);
    if (updated) {
      setEmployees(prev => prev.map(u => (u.id === updatedEmp.id ? updated : u)));
      setEditingEmployee(null);
      setIsAddingEmployee(false);
    }
  };

  // Handler to delete an employee
  const handleDeleteEmployee = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this employee?')) {
      const deleted = await deleteUser(id);
      if (deleted) {
        setEmployees(prev => prev.filter(u => u.id !== id));
      }
    }
  };

  // Handler to start editing an employee
  const handleEditEmployee = (employee: User) => {
    setEditingEmployee(employee);
    setIsAddingEmployee(true);
  };

  const filteredEmployees = employees.filter(e =>
    e.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-[#eeeeee]">Manage Employees</h1>
        <div className="flex gap-4">
          <button
            onClick={() => { setIsAddingEmployee(!isAddingEmployee); setEditingEmployee(null); }}
            className={`flex items-center gap-2 bg-[${subInfo.highlightColor}] text-[#06272b] px-4 py-2 rounded-lg font-semibold hover:bg-[${subInfo.highlightColor}]/90 transition-colors`}
          >
            {isAddingEmployee ? <X className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
            {isAddingEmployee ? 'Cancel' : 'Add Employee'}
          </button>
        </div>
      </div>

      {/* Search field */}
      <div className="bg-[#0b3c43] rounded-lg p-4 shadow-lg">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#eeeeee]/60" />
          <input
            type="text"
            placeholder="Search employee..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[#06272b] rounded-lg border border-[#22c1d4] focus:outline-none focus:border-[#22c1d4]"
          />
        </div>
      </div>

      {/* Add/Edit Employee Form */}
      {isAddingEmployee && (
        <EmployeeWizard 
          employeeToEdit={editingEmployee || undefined}
          onSave={editingEmployee ? handleUpdateEmployee : handleAddEmployee}
          availableCompanies={availableCompanies}
          groupedPermissions={groupedPermissions}
          subInfo={subInfo}
          isAdmin={user!.role === 'admin'}
          currentCompany={user!.company}
          parentId={user!.id}
          parentSubscription={user!.subscription}
          onCancel={() => { setIsAddingEmployee(false); setEditingEmployee(null); }}
          existingUsernames={employees.map(e => e.username)}
        />
      )}

      {/* Employee List */}
      <div className="bg-[#0b3c43] rounded-lg p-6 shadow-lg">
        <h2 className="text-2xl font-semibold text-[#eeeeee] mb-4">Employees</h2>
        {filteredEmployees.length === 0 ? (
          <div className="text-center py-8 text-[#eeeeee]/60">
            No employees found with these filters.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredEmployees.map(emp => (
              <EmployeeCard
                key={emp.id}
                employee={emp}
                onEdit={handleEditEmployee}
                onDelete={handleDeleteEmployee}
                groupedPermissions={groupedPermissions}
                subInfo={subInfo}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ManageEmployees;
