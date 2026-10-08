import React, { useState, useMemo, useEffect } from 'react';
import { 
  ComposedChart,
  Bar, 
  Line,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  LabelList
} from 'recharts';
import { 
  ChevronRight, 
  ChevronDown, 
  Search, 
  LayoutGrid, 
  Filter, 
  FileText, 
  BarChart3, 
  Users, 
  ShieldCheck, 
  TrendingUp,
  Info,
  Edit2,
  Plus,
  Save,
  Trash2,
  X,
  Check,
  ArrowLeft,
  Calendar,
  Settings2,
  LogIn,
  LogOut,
  UserPlus,
  History,
  Key,
  User,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Sparkles,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut, 
  updatePassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  addDoc, 
  serverTimestamp,
  Timestamp,
  deleteField,
  writeBatch
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { rawCSV } from './data/edpexData';
import { EdPExItem, GroupData, YearlyData, InputType, UserRole, UserProfile, ActivityLog, University, ComparisonUniversityData } from './types';
import DashboardView from './components/DashboardView';
import CsvImportModal from './components/CsvImportModal';

// CSV Parser
const parseCSV = (csv: string): EdPExItem[] => {
  const lines = csv.trim().split('\n');
  const headers = lines[0].split(',');
  
  return lines.slice(1).map(line => {
    const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    const item: any = {};
    headers.forEach((header, index) => {
      item[header.trim()] = values[index]?.replace(/^"|"$/g, '').trim() || '';
    });
    return item as EdPExItem;
  });
};

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const DEFAULT_UNIVERSITIES: University[] = [
  { id: 'buuic', name: 'BUUIC วิทยาลัยนานาชาติ มหาวิทยาลัยบูรพา', abbreviation: 'BUUIC', isDefault: true, color: '#2563eb' },
  { id: 'cu', name: 'จุฬาลงกรณ์มหาวิทยาลัย', abbreviation: 'CU', color: '#ef4444' },
  { id: 'tu', name: 'มหาวิทยาลัยธรรมศาสตร์', abbreviation: 'TU', color: '#f59e0b' },
  { id: 'mu', name: 'มหาวิทยาลัยมหิดล', abbreviation: 'MU', color: '#10b981' },
];

export default function App() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [displayMode, setDisplayMode] = useState<'dashboard' | 'tree'>('dashboard');
  const [items, setItems] = useState<EdPExItem[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['7.1']));
  const [expandedSubGroups, setExpandedSubGroups] = useState<Set<string>>(new Set());
  const [expandedSubSubGroups, setExpandedSubSubGroups] = useState<Set<string>>(new Set());
  const [selectedUniversityId, setSelectedUniversityId] = useState<string>('buuic');
  const [universities, setUniversities] = useState<University[]>(DEFAULT_UNIVERSITIES);
  
  // Auth State
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // Navigation State
  const [view, setView] = useState<'dashboard' | 'input' | 'login' | 'user-manager' | 'logs' | 'university-manager'>('dashboard');
  const [selectedItem, setSelectedItem] = useState<EdPExItem | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importModalInitialTab, setImportModalInitialTab] = useState<'upload' | 'ai' | 'guide'>('upload');
  const [deletingIndicator, setDeletingIndicator] = useState<EdPExItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState('');
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState<{ current: number; total: number } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [editingItem, setEditingItem] = useState<EdPExItem | null>(null);
  const [newItem, setNewItem] = useState<Partial<EdPExItem>>({
    group_id: '7.1',
    sub_group_char: 'ก',
    sub_sub_group_num: '1',
    result_title: '',
  });

  // Initialize universities from Firestore
  useEffect(() => {
    if (!userProfile || userProfile.role === 'pending') {
      setUniversities(DEFAULT_UNIVERSITIES);
      return;
    }

    const path = 'universities';
    const unsubscribe = onSnapshot(collection(db, path), (snapshot) => {
      const fetchedUnivs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as University));
      if (fetchedUnivs.length > 0) {
        setUniversities(fetchedUnivs);
      } else if (userProfile?.role === 'admin') {
        // Seed from defaults if empty - only for admin
        DEFAULT_UNIVERSITIES.forEach(async (u) => {
          try {
            await setDoc(doc(db, path, u.id), u);
          } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, path);
          }
        });
      }
    });
    return () => unsubscribe();
  }, [userProfile]);

  // Logging Helper
  const logAction = async (action: string, details: string) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'logs'), {
        userId: user.uid,
        userEmail: user.email,
        action,
        details,
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error('Error logging action:', error);
    }
  };

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const path = `users/${firebaseUser.uid}`;
        try {
          const docRef = doc(db, 'users', firebaseUser.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data() as UserProfile;
            if (firebaseUser.email?.toLowerCase() === 'podchara.kl@go.buu.ac.th') {
              setUserProfile({ ...data, role: 'admin' });
            } else {
              setUserProfile(data);
            }
          } else {
            // Check if default admin
            if (firebaseUser.email?.toLowerCase() === 'podchara.kl@go.buu.ac.th') {
              const profile: UserProfile = {
                uid: firebaseUser.uid,
                email: firebaseUser.email!,
                role: 'admin',
                displayName: 'Default Admin'
              };
              await setDoc(docRef, profile);
              setUserProfile(profile);
            } else {
              setUserProfile({ uid: firebaseUser.uid, email: firebaseUser.email!, role: 'guest' });
            }
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, path);
        }
      } else {
        setUserProfile(null);
      }
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Initialize items from Firestore
  useEffect(() => {
    if (!userProfile || userProfile.role === 'pending') {
      setItems([]);
      return;
    }

    const path = 'indicators';
    const unsubscribe = onSnapshot(collection(db, path), (snapshot) => {
      const fetchedItems = snapshot.docs.map(doc => ({ ...doc.data(), result_id: doc.id } as EdPExItem));
      setItems(fetchedItems);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });
    return () => unsubscribe();
  }, [userProfile]);

  // Helper to sanitize data for Firestore (recursively strips undefined values so Firestore does not reject them)
  const cleanFirestoreData = (obj: any): any => {
    if (obj === null || obj === undefined) return null;
    if (typeof obj !== 'object') return obj;
    if (obj instanceof Timestamp) return obj;
    if (Array.isArray(obj)) {
      return obj
        .filter(v => v !== undefined)
        .map(v => cleanFirestoreData(v));
    }
    
    const clean: any = {};
    for (const key in obj) {
      const val = obj[key];
      if (val !== undefined) {
        clean[key] = cleanFirestoreData(val);
      }
    }
    return clean;
  };

  const saveToFirestore = async (item: EdPExItem) => {
    const { result_id, ...data } = item;
    const path = 'indicators';
    try {
      if (result_id) {
        await updateDoc(doc(db, path, result_id), cleanFirestoreData(data));
      } else {
        await addDoc(collection(db, path), cleanFirestoreData(data));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  // Helper to parse indicator index into EdPEx group hierarchy
  const parseIndicatorIndex = (index: string): {
    group_id: string;
    sub_group_char: string;
    sub_sub_group_num: string;
    item_num: string;
  } => {
    const clean = index.trim();
    const match = clean.match(/^([0-9]+\.[0-9]+)\s*([ก-ฮa-zA-Z]?)\s*(?:\(?([0-9]+)\)?)?(?:-([0-9]+))?/);
    if (match) {
      return {
        group_id: match[1] || '7.1',
        sub_group_char: match[2] || 'ก',
        sub_sub_group_num: match[3] || '1',
        item_num: match[4] || '1'
      };
    }
    const groupMatch = clean.match(/^([0-9]+\.[0-9]+)/);
    if (groupMatch) {
      return {
        group_id: groupMatch[1],
        sub_group_char: 'ก',
        sub_sub_group_num: '1',
        item_num: '1'
      };
    }
    return {
      group_id: '7.1',
      sub_group_char: 'ก',
      sub_sub_group_num: '1',
      item_num: '1'
    };
  };

  const handleBatchImportRecords = async (updates: { itemId: string; updatedItem: EdPExItem }[]) => {
    const isAllowed = userProfile?.role === 'admin' || userProfile?.role === 'staff' || user?.email?.toLowerCase() === 'podchara.kl@go.buu.ac.th';
    if (!isAllowed) {
      alert('คุณไม่มีสิทธิ์ในการนำเข้าข้อมูล (เฉพาะผู้ดูแลระบบและเจ้าหน้าที่เท่านั้น)');
      return;
    }
    const path = 'indicators';
    const batchSize = 400;

    try {
      for (let i = 0; i < updates.length; i += batchSize) {
        const chunk = updates.slice(i, i + batchSize);
        const batch = writeBatch(db);
        chunk.forEach(({ itemId, updatedItem }) => {
          const { result_id, ...data } = updatedItem;
          const clean = cleanFirestoreData(data);
          batch.set(doc(db, path, itemId), clean, { merge: true });
        });
        await batch.commit();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
      throw error;
    }
  };

  // Unified batch import: can create new indicators and merge yearly performance records in one operation
  const handleBatchImportUnified = async (payloads: Array<{
    index: string;
    result_title?: string;
    group_id?: string;
    sub_group_char?: string;
    sub_sub_group_num?: string;
    unit?: string;
    records: YearlyData[];
    comparisonUniversities?: ComparisonUniversityData[];
  }>) => {
    const isAllowed = userProfile?.role === 'admin' || userProfile?.role === 'staff' || user?.email?.toLowerCase() === 'podchara.kl@go.buu.ac.th';
    if (!isAllowed) {
      alert('คุณไม่มีสิทธิ์ในการนำเข้าข้อมูล (เฉพาะผู้ดูแลระบบและเจ้าหน้าที่เท่านั้น)');
      return;
    }
    const path = 'indicators';
    const batchSize = 400;

    const GROUP_DEFAULT_TITLES: Record<string, string> = {
      '7.1': 'ผลลัพธ์ด้านการเรียนรู้ของผู้เรียน และด้านกระบวนการ',
      '7.2': 'ผลลัพธ์ด้านลูกค้า',
      '7.3': 'ผลลัพธ์ด้านบุคลากร',
      '7.4': 'ผลลัพธ์ด้านการนำองค์กรและการกำกับดูแลองค์กร',
      '7.5': 'ผลลัพธ์ด้านงบประมาณ การเงิน การตลาด และกลยุทธ์'
    };

    try {
      for (let i = 0; i < payloads.length; i += batchSize) {
        const chunk = payloads.slice(i, i + batchSize);
        const batch = writeBatch(db);

        chunk.forEach(payload => {
          const itemIndex = payload.index.trim();
          const existingItem = items.find(item => item.index.trim().toLowerCase() === itemIndex.toLowerCase());

          if (existingItem) {
            // Update existing indicator
            const currentRecords: YearlyData[] = [...(existingItem.data?.records || [])];
            const currentComparison: ComparisonUniversityData[] = [...(existingItem.data?.comparisonUniversities || [])];
            
            // Merge records
            payload.records.forEach(newRec => {
              const idx = currentRecords.findIndex(r => r.year === newRec.year);
              if (idx >= 0) {
                currentRecords[idx] = {
                  ...currentRecords[idx],
                  actual: newRec.actual,
                  ...(newRec.target !== undefined ? { target: newRec.target } : {})
                };
              } else {
                currentRecords.push(newRec);
              }
            });
            currentRecords.sort((a, b) => a.year.localeCompare(b.year, undefined, { numeric: true }));

            // Merge comparison universities if any
            if (payload.comparisonUniversities && payload.comparisonUniversities.length > 0) {
              payload.comparisonUniversities.forEach(newComp => {
                const cIdx = currentComparison.findIndex(c => c.abbreviation.toLowerCase() === newComp.abbreviation.toLowerCase());
                if (cIdx >= 0) {
                  newComp.records.forEach(cr => {
                    const rIdx = currentComparison[cIdx].records.findIndex(r => r.year === cr.year);
                    if (rIdx >= 0) {
                      currentComparison[cIdx].records[rIdx] = cr;
                    } else {
                      currentComparison[cIdx].records.push(cr);
                    }
                  });
                } else {
                  currentComparison.push(newComp);
                }
              });
            }

            const updateData: any = {
              data: {
                type: 'yearly',
                unit: payload.unit || existingItem.data?.unit || '',
                records: currentRecords,
                ...(currentComparison.length > 0 ? { comparisonUniversities: currentComparison } : {}),
                mainColor: existingItem.data?.mainColor || '#2563eb',
                targetColor: existingItem.data?.targetColor || '#93c5fd'
              }
            };
            if (payload.result_title && (existingItem.result_title === '-' || !existingItem.result_title)) {
              updateData.result_title = payload.result_title;
            }

            batch.set(doc(db, path, existingItem.result_id), cleanFirestoreData(updateData), { merge: true });
          } else {
            // Create brand new indicator
            const parsed = parseIndicatorIndex(itemIndex);
            const groupId = payload.group_id || parsed.group_id;
            const subGroupChar = payload.sub_group_char || parsed.sub_group_char;
            const subSubGroupNum = payload.sub_sub_group_num || parsed.sub_sub_group_num;
            const itemNum = parsed.item_num;

            const newDocRef = doc(collection(db, path));
            const newItemData = {
              group_id: groupId,
              group_title: items.find(i => i.group_id === groupId)?.group_title || GROUP_DEFAULT_TITLES[groupId] || `หมวด ${groupId}`,
              sub_group_char: subGroupChar,
              sub_group_title: items.find(i => i.group_id === groupId && i.sub_group_char === subGroupChar)?.sub_group_title || `ด้าน ${subGroupChar}`,
              sub_sub_group_num: subSubGroupNum,
              sub_sub_group_title: items.find(i => i.group_id === groupId && i.sub_group_char === subGroupChar && i.sub_sub_group_num === subSubGroupNum)?.sub_sub_group_title || `หัวข้อ (${subSubGroupNum})`,
              item_num: String(itemNum),
              index: itemIndex,
              result_title: payload.result_title || `ตัวชี้วัด ${itemIndex}`,
              data: {
                type: 'yearly',
                unit: payload.unit || '',
                records: payload.records.sort((a, b) => a.year.localeCompare(b.year, undefined, { numeric: true })),
                ...(payload.comparisonUniversities && payload.comparisonUniversities.length > 0 ? { comparisonUniversities: payload.comparisonUniversities } : {}),
                mainColor: '#2563eb',
                targetColor: '#93c5fd'
              }
            };

            batch.set(newDocRef, cleanFirestoreData(newItemData));
          }
        });

        await batch.commit();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
      throw error;
    }
  };

  const handleBatchImportNewIndicators = async (newIndicators: any[]) => {
    const isAllowed = userProfile?.role === 'admin' || userProfile?.role === 'staff' || user?.email?.toLowerCase() === 'podchara.kl@go.buu.ac.th';
    if (!isAllowed) {
      alert('คุณไม่มีสิทธิ์ในการเพิ่มตัวชี้วัดใหม่ (เฉพาะผู้ดูแลระบบและเจ้าหน้าที่เท่านั้น)');
      return;
    }
    const path = 'indicators';
    const batchSize = 400;

    const GROUP_DEFAULT_TITLES: Record<string, string> = {
      '7.1': 'ผลลัพธ์ด้านการเรียนรู้ของผู้เรียน และด้านกระบวนการ',
      '7.2': 'ผลลัพธ์ด้านลูกค้า',
      '7.3': 'ผลลัพธ์ด้านบุคลากร',
      '7.4': 'ผลลัพธ์ด้านการนำองค์กรและการกำกับดูแลองค์กร',
      '7.5': 'ผลลัพธ์ด้านงบประมาณ การเงิน การตลาด และกลยุทธ์'
    };

    try {
      for (let i = 0; i < newIndicators.length; i += batchSize) {
        const chunk = newIndicators.slice(i, i + batchSize);
        const batch = writeBatch(db);
        chunk.forEach((item) => {
          const newDocRef = doc(collection(db, path));
          const groupId = String(item.group_id || '7.1');
          const subGroupChar = String(item.sub_group_char || 'ก');
          const subSubGroupNum = String(item.sub_sub_group_num || '1');
          const itemIndex = String(item.index || '');
          const itemNum = item.item_num || (itemIndex.includes('-') ? itemIndex.split('-')[1] : '1');

          const payload: any = {
            group_id: groupId,
            group_title: items.find(i => i.group_id === groupId)?.group_title || GROUP_DEFAULT_TITLES[groupId] || `หมวด ${groupId}`,
            sub_group_char: subGroupChar,
            sub_group_title: items.find(i => i.group_id === groupId && i.sub_group_char === subGroupChar)?.sub_group_title || `ด้าน ${subGroupChar}`,
            sub_sub_group_num: subSubGroupNum,
            sub_sub_group_title: items.find(i => i.group_id === groupId && i.sub_group_char === subGroupChar && i.sub_sub_group_num === subSubGroupNum)?.sub_sub_group_title || `หัวข้อ (${subSubGroupNum})`,
            item_num: String(itemNum),
            index: itemIndex,
            result_title: String(item.result_title || ''),
            data: {
              type: 'yearly',
              unit: item.unit || '',
              records: []
            }
          };

          const clean = cleanFirestoreData(payload);
          batch.set(newDocRef, clean);
        });
        await batch.commit();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
      throw error;
    }
  };

  const filteredItems = useMemo(() => {
    if (!searchTerm) return items;
    const lowerSearch = searchTerm.toLowerCase();
    return items.filter(item => 
      item.result_title.toLowerCase().includes(lowerSearch) ||
      item.index.toLowerCase().includes(lowerSearch) ||
      item.group_title.toLowerCase().includes(lowerSearch) ||
      item.sub_group_title.toLowerCase().includes(lowerSearch) ||
      item.sub_sub_group_title.toLowerCase().includes(lowerSearch)
    );
  }, [items, searchTerm]);

  const groupedData = useMemo(() => {
    const groups: { [id: string]: GroupData } = {};

    filteredItems.forEach(item => {
      if (!groups[item.group_id]) {
        groups[item.group_id] = {
          id: item.group_id,
          title: item.group_title,
          subGroups: {}
        };
      }

      const g = groups[item.group_id];
      if (!g.subGroups[item.sub_group_char]) {
        g.subGroups[item.sub_group_char] = {
          title: item.sub_group_title,
          subSubGroups: {}
        };
      }

      const sg = g.subGroups[item.sub_group_char];
      if (!sg.subSubGroups[item.sub_sub_group_num]) {
        sg.subSubGroups[item.sub_sub_group_num] = {
          title: item.sub_sub_group_title,
          items: []
        };
      }

      sg.subSubGroups[item.sub_sub_group_num].items.push(item);
    });

    return Object.values(groups).sort((a, b) => a.id.localeCompare(b.id));
  }, [filteredItems]);

  const toggleGroup = (id: string) => {
    const next = new Set(expandedGroups);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedGroups(next);
  };

  const toggleSubGroup = (id: string) => {
    const next = new Set(expandedSubGroups);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedSubGroups(next);
  };

  const toggleSubSubGroup = (id: string) => {
    const next = new Set(expandedSubSubGroups);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedSubSubGroups(next);
  };

  const getGroupIcon = (id: string) => {
    switch (id) {
      case '7.1': return <BarChart3 className="w-5 h-5" />;
      case '7.2': return <Users className="w-5 h-5" />;
      case '7.3': return <Users className="w-5 h-5" />;
      case '7.4': return <ShieldCheck className="w-5 h-5" />;
      case '7.5': return <TrendingUp className="w-5 h-5" />;
      default: return <FileText className="w-5 h-5" />;
    }
  };

  const handleUpdateTitle = async (type: 'group' | 'sub' | 'subsub', id: string, newTitle: string) => {
    if (userProfile?.role !== 'admin') return;
    
    const updatedItems = items.map(item => {
      if (type === 'group' && item.group_id === id) {
        return { ...item, group_title: newTitle };
      }
      if (type === 'sub') {
        const [groupId, char] = id.split('-');
        if (item.group_id === groupId && item.sub_group_char === char) {
          return { ...item, sub_group_title: newTitle };
        }
      }
      if (type === 'subsub') {
        const [groupId, char, num] = id.split('-');
        if (item.group_id === groupId && item.sub_group_char === char && item.sub_sub_group_num === num) {
          return { ...item, sub_sub_group_title: newTitle };
        }
      }
      return item;
    });

    // Update all affected items in Firestore
    const affected = updatedItems.filter((item, idx) => JSON.stringify(item) !== JSON.stringify(items[idx]));
    for (const item of affected) {
      await saveToFirestore(item);
    }
  };

  const handleDeleteItem = (resultId: string) => {
    const isAllowed = userProfile?.role === 'admin' || userProfile?.role === 'staff' || user?.email?.toLowerCase() === 'podchara.kl@go.buu.ac.th';
    if (!isAllowed) {
      alert('คุณไม่มีสิทธิ์ในการลบตัวชี้วัด (เฉพาะผู้ดูแลระบบและเจ้าหน้าที่เท่านั้น)');
      return;
    }
    const targetItem = items.find(i => i.result_id === resultId);
    if (targetItem) {
      setDeletingIndicator(targetItem);
    }
  };

  const executeDeleteIndicator = async () => {
    if (!deletingIndicator) return;
    const isAllowed = userProfile?.role === 'admin' || userProfile?.role === 'staff' || user?.email?.toLowerCase() === 'podchara.kl@go.buu.ac.th';
    if (!isAllowed) {
      alert('คุณไม่มีสิทธิ์ในการลบตัวชี้วัด (เฉพาะผู้ดูแลระบบและเจ้าหน้าที่เท่านั้น)');
      return;
    }

    setIsDeleting(true);
    const path = 'indicators';
    try {
      await deleteDoc(doc(db, path, deletingIndicator.result_id));
      logAction('ลบตัวชี้วัด', `ลบตัวชี้วัด ${deletingIndicator.index}: ${deletingIndicator.result_title}`);
      if (selectedItem?.result_id === deletingIndicator.result_id) {
        setSelectedItem(null);
        setView('dashboard');
      }
      if (isModalOpen) {
        setIsModalOpen(false);
      }
      setDeletingIndicator(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteAllIndicators = async () => {
    const isAllowed = userProfile?.role === 'admin' || userProfile?.role === 'staff' || user?.email?.toLowerCase() === 'podchara.kl@go.buu.ac.th';
    if (!isAllowed) {
      alert('คุณไม่มีสิทธิ์ในการลบตัวชี้วัด (เฉพาะผู้ดูแลระบบและเจ้าหน้าที่เท่านั้น)');
      return;
    }

    if (deleteAllConfirmText.trim().toLowerCase() !== 'delete' && deleteAllConfirmText.trim() !== 'ลบทั้งหมด') {
      alert('กรุณาพิมพ์ "DELETE" หรือ "ลบทั้งหมด" เพื่อยืนยันการลบ');
      return;
    }

    setIsDeletingAll(true);
    const path = 'indicators';

    try {
      const snapshot = await getDocs(collection(db, path));
      const docsToDelete = snapshot.docs;
      const total = docsToDelete.length;
      setDeleteProgress({ current: 0, total });

      const batchSize = 400;
      for (let i = 0; i < docsToDelete.length; i += batchSize) {
        const chunk = docsToDelete.slice(i, i + batchSize);
        const batch = writeBatch(db);
        chunk.forEach(d => {
          batch.delete(doc(db, path, d.id));
        });
        await batch.commit();
        setDeleteProgress({ current: Math.min(i + chunk.length, total), total });
      }

      logAction('ลบตัวชี้วัดทั้งหมด', `ลบตัวชี้วัดทั้งหมดจำนวน ${total} รายการออกจากระบบ`);
      setSelectedItem(null);
      setIsDeleteAllModalOpen(false);
      setDeleteAllConfirmText('');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    } finally {
      setIsDeletingAll(false);
      setDeleteProgress(null);
    }
  };

  const handleSeedDefaultItems = async () => {
    const isAllowed = userProfile?.role === 'admin' || userProfile?.role === 'staff' || user?.email?.toLowerCase() === 'podchara.kl@go.buu.ac.th';
    if (!isAllowed) {
      alert('คุณไม่มีสิทธิ์ในการโหลดข้อมูลเริ่มต้น');
      return;
    }

    const path = 'indicators';
    const initialItems = parseCSV(rawCSV);
    const batchSize = 400;
    try {
      for (let i = 0; i < initialItems.length; i += batchSize) {
        const chunk = initialItems.slice(i, i + batchSize);
        const batch = writeBatch(db);
        chunk.forEach(item => {
          const { result_id, ...rest } = item;
          const newDocRef = doc(collection(db, path));
          batch.set(newDocRef, cleanFirestoreData(rest));
        });
        await batch.commit();
      }
      logAction('โหลดข้อมูลเริ่มต้น', `โหลดข้อมูลตัวอย่างตัวชี้วัดเริ่มต้นจำนวน ${initialItems.length} รายการ`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const handleSaveItem = async () => {
    const isAllowed = userProfile?.role === 'admin' || userProfile?.role === 'staff' || user?.email?.toLowerCase() === 'podchara.kl@go.buu.ac.th';
    if (!isAllowed) {
      alert('คุณไม่มีสิทธิ์ในการแก้ไขหรือเพิ่มตัวชี้วัด');
      return;
    }
    if (editingItem) {
      const newIndex = `${editingItem.group_id}${editingItem.sub_group_char}(${editingItem.sub_sub_group_num})-${editingItem.item_num}`;
      const updatedItem = { ...editingItem, index: newIndex };
      await saveToFirestore(updatedItem);
      logAction('แก้ไขตัวชี้วัด', `แก้ไขตัวชี้วัด ID: ${editingItem.result_id} (${editingItem.result_title})`);
    } else {
      // Calculate item_num for auto-indexing
      const sameSubSubItems = items.filter(i => 
        i.group_id === newItem.group_id && 
        i.sub_group_char === newItem.sub_group_char && 
        i.sub_sub_group_num === newItem.sub_sub_group_num
      );
      const nextItemNum = (Math.max(...sameSubSubItems.map(i => parseInt(i.item_num) || 0), 0) + 1).toString();
      const generatedIndex = `${newItem.group_id}${newItem.sub_group_char}(${newItem.sub_sub_group_num})-${nextItemNum}`;

      const itemToAdd: Partial<EdPExItem> = {
        ...newItem,
        item_num: nextItemNum,
        index: generatedIndex,
        group_title: items.find(i => i.group_id === newItem.group_id)?.group_title || '',
        sub_group_title: items.find(i => i.group_id === newItem.group_id && i.sub_group_char === newItem.sub_group_char)?.sub_group_title || '',
        sub_sub_group_title: items.find(i => i.group_id === newItem.group_id && i.sub_group_char === newItem.sub_group_char && i.sub_sub_group_num === newItem.sub_sub_group_num)?.sub_sub_group_title || ''
      };
      await addDoc(collection(db, 'indicators'), cleanFirestoreData(itemToAdd));
      logAction('เพิ่มตัวชี้วัด', `เพิ่มตัวชี้วัดใหม่: ${newItem.result_title}`);
    }
    setIsModalOpen(false);
    setEditingItem(null);
  };

  const handleUpdateIndicatorData = async (resultId: string, data: EdPExItem['data']) => {
    if (userProfile?.role !== 'admin' && userProfile?.role !== 'staff') return;
    const item = items.find(i => i.result_id === resultId);
    if (item) {
      const updatedItem = { ...item, data };
      await saveToFirestore(updatedItem);
      logAction('กรอกข้อมูล', `บันทึกข้อมูลตัวชี้วัด ID: ${resultId} (${item.result_title})`);
    }
  };

  const handleChangePassword = async () => {
    if (!user || !newPassword) return;
    try {
      await updatePassword(user, newPassword);
      alert('เปลี่ยนรหัสผ่านสำเร็จ');
      setIsPasswordModalOpen(false);
      setNewPassword('');
    } catch (err: any) {
      alert('ไม่สามารถเปลี่ยนรหัสผ่านได้: ' + err.message);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (view === 'login') {
    return <LoginPage onBack={() => setView('dashboard')} onLoginSuccess={() => setView('dashboard')} />;
  }

  if (userProfile?.role === 'pending') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-10 rounded-3xl shadow-xl border border-gray-100 max-w-md"
        >
          <div className="bg-amber-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldCheck className="w-10 h-10 text-amber-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">รอการตรวจสอบสิทธิ์</h2>
          <p className="text-gray-500 mb-8 leading-relaxed">
            บัญชีของคุณ ({userProfile.email}) ได้รับการลงทะเบียนแล้ว 
            กรุณารอผู้ดูแลระบบตรวจสอบและอนุมัติสิทธิ์การใช้งานก่อนเข้าสู่ระบบ
          </p>
          <button 
            onClick={() => signOut(auth)}
            className="w-full bg-gray-100 text-gray-600 py-3 rounded-xl font-bold hover:bg-gray-200 transition-all"
          >
            ออกจากระบบ
          </button>
        </motion.div>
      </div>
    );
  }

  if (view === 'user-manager' && userProfile?.role === 'admin') {
    return <UserManager onBack={() => setView('dashboard')} />;
  }

  if (view === 'university-manager' && userProfile?.role === 'admin') {
    return <UniversityManager onBack={() => setView('dashboard')} />;
  }

  if (view === 'logs' && userProfile?.role === 'admin') {
    return <LogViewer onBack={() => setView('dashboard')} />;
  }

  if (view === 'input' && selectedItem) {
    const isAllowedEdit = userProfile?.role === 'admin' || userProfile?.role === 'staff' || user?.email?.toLowerCase() === 'podchara.kl@go.buu.ac.th';
    return (
      <>
        <InputPage 
          item={selectedItem} 
          userRole={isAllowedEdit ? 'admin' : (userProfile?.role || 'guest')}
          universities={universities}
          onBack={() => setView('dashboard')} 
          onSave={(data) => handleUpdateIndicatorData(selectedItem.result_id, data)}
          onDeleteIndicator={(item) => setDeletingIndicator(item)}
        />
        {/* Confirmation Modal for Deleting Indicator when in input view */}
        <AnimatePresence>
          {deletingIndicator && (
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-red-100"
              >
                <div className="p-6">
                  <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-4">
                    <Trash2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">ยืนยันการลบตัวชี้วัด</h3>
                  <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                    คุณแน่ใจหรือไม่ว่าต้องการลบตัวชี้วัด{' '}
                    <span className="font-bold text-gray-900 font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                      {deletingIndicator.index}
                    </span>{' '}
                    : {deletingIndicator.result_title || 'ไม่มีชื่อตัวชี้วัด'}?
                  </p>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 mb-6">
                    ⚠️ <strong>คำเตือน:</strong> ข้อมูลผลลัพธ์รายปีและข้อมูลเปรียบเทียบทั้งหมดของตัวชี้วัดนี้จะถูกลบออกจากระบบและไม่สามารถกู้คืนได้
                  </div>

                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => setDeletingIndicator(null)}
                      className="px-4 py-2.5 text-sm font-bold text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={executeDeleteIndicator}
                      className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-red-600/20 active:scale-95 disabled:opacity-50"
                    >
                      {isDeleting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          กำลังลบ...
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4" />
                          ลบตัวชี้วัด
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans selection:bg-blue-100">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg text-white">
              <LayoutGrid className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">EdPEx Management</h1>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">ระบบจัดการหมวด 7 (ผลลัพธ์)</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="text" 
                placeholder="ค้นหาตัวชี้วัดหรือหัวข้อ..." 
                className="pl-10 pr-4 py-2 bg-gray-100 border-transparent focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-full text-sm w-full md:w-64 transition-all outline-none"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            {user ? (
              <div className="flex items-center gap-2">
                <div className="flex flex-col items-end mr-2">
                  <span className="text-xs font-bold text-gray-900">{userProfile?.displayName || user.email}</span>
                  <span className="text-[10px] text-blue-600 font-bold uppercase tracking-widest">{userProfile?.role}</span>
                </div>
                <button 
                  onClick={() => setIsPasswordModalOpen(true)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  title="Change Password"
                >
                  <Key className="w-5 h-5 text-gray-600" />
                </button>
                {userProfile?.role === 'admin' && (
                  <>
                    <button 
                      onClick={() => setView('university-manager')}
                      className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                      title="University Manager"
                    >
                      <Settings2 className="w-5 h-5 text-gray-600" />
                    </button>
                    <button 
                      onClick={() => setView('user-manager')}
                      className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                      title="User Manager"
                    >
                      <Users className="w-5 h-5 text-gray-600" />
                    </button>
                    <button 
                      onClick={() => setView('logs')}
                      className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                      title="Activity Logs"
                    >
                      <History className="w-5 h-5 text-gray-600" />
                    </button>
                  </>
                )}
                <button 
                  onClick={async () => {
                    await signOut(auth);
                    setView('dashboard');
                  }}
                  className="p-2 hover:bg-red-50 rounded-full transition-colors text-red-500"
                  title="Logout"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setView('login')}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20"
              >
                <LogIn className="w-4 h-4" />
                เข้าสู่ระบบ
              </button>
            )}

            {(userProfile?.role === 'admin' || userProfile?.role === 'staff' || user?.email?.toLowerCase() === 'podchara.kl@go.buu.ac.th') && (
              <button 
                onClick={() => {
                  if (isEditMode) {
                    logAction('เสร็จสิ้นการแก้ไข', 'ผู้ใช้งานเสร็จสิ้นการแก้ไขหัวข้อและโครงสร้าง');
                  }
                  setIsEditMode(!isEditMode);
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all ${isEditMode ? 'bg-orange-100 text-orange-600 border border-orange-200' : 'bg-gray-100 text-gray-600 border border-transparent hover:bg-gray-200'}`}
              >
                {isEditMode ? <Check className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                {isEditMode ? 'เสร็จสิ้นการแก้ไข' : 'โหมดแก้ไข'}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-gray-900">
                {displayMode === 'dashboard' ? 'แดชบอร์ดสรุปผลตัวชี้วัด' : 'โครงสร้างหมวด 7'}
              </h2>
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100">
                หมวด 7 ผลลัพธ์
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {displayMode === 'dashboard' 
                ? 'ภาพรวมและผลการดำเนินงานของตัวชี้วัดทั้งหมด แยกตามหมวด 7.1 - 7.5' 
                : 'แสดงรายการตัวชี้วัดและผลลัพธ์แยกตามกลุ่มและหมวดย่อย'}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* View Switcher Toggle */}
            <div className="bg-gray-100 p-1 rounded-xl flex items-center border border-gray-200">
              <button
                onClick={() => setDisplayMode('dashboard')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  displayMode === 'dashboard'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                แดชบอร์ดแยกตามหมวด
              </button>
              <button
                onClick={() => setDisplayMode('tree')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  displayMode === 'tree'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                ผังโครงสร้างขยาย
              </button>
            </div>

            {(userProfile?.role === 'admin' || userProfile?.role === 'staff' || user?.email?.toLowerCase() === 'podchara.kl@go.buu.ac.th') && (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => {
                    setImportModalInitialTab('ai');
                    setIsImportModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm shadow-purple-600/20 active:scale-95"
                  title="ใช้ AI สกัดข้อมูลจากข้อความแล้วสร้าง CSV สำหรับนำเข้า"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  AI แปลงข้อความเป็น CSV
                </button>
                <button
                  onClick={() => {
                    setImportModalInitialTab('upload');
                    setIsImportModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors shadow-sm shadow-emerald-600/20"
                  title="นำเข้าข้อมูลเป็นชุดด้วย CSV"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  นำเข้า CSV
                </button>
                <button 
                  onClick={() => {
                    setEditingItem(null);
                    setNewItem({ group_id: '7.1', sub_group_char: 'ก', sub_sub_group_num: '1', result_title: '', index: '' });
                    setIsModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors shadow-sm shadow-blue-500/20"
                  title="เพิ่มตัวชี้วัดใหม่"
                >
                  <Plus className="w-3.5 h-3.5" />
                  เพิ่มตัวชี้วัดใหม่
                </button>
                {items.length > 0 && (
                  <button
                    onClick={() => setIsDeleteAllModalOpen(true)}
                    className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm shadow-red-600/20 active:scale-95"
                    title="ลบตัวชี้วัดทั้งหมดในระบบ"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    ลบตัวชี้วัดทั้งหมด ({items.length})
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 text-xs font-semibold text-gray-600 bg-white px-3 py-2 rounded-xl border border-gray-200">
              <Filter className="w-3.5 h-3.5 text-gray-400" />
              <span>{filteredItems.length} ตัวชี้วัด</span>
            </div>
          </div>
        </div>

        {displayMode === 'dashboard' ? (
          <DashboardView
            items={filteredItems}
            universities={universities}
            isEditMode={isEditMode}
            onSelectItem={(item) => {
              setSelectedItem(item);
              setView('input');
            }}
            onEditItem={(item) => {
              setEditingItem(item);
              setIsModalOpen(true);
            }}
            onDeleteItem={(resultId) => {
              handleDeleteItem(resultId);
            }}
            onDeleteAllItems={() => setIsDeleteAllModalOpen(true)}
            onAddNewItem={() => {
              setEditingItem(null);
              setNewItem({ group_id: '7.1', sub_group_char: 'ก', sub_sub_group_num: '1', result_title: '', index: '' });
              setIsModalOpen(true);
            }}
            onOpenImportModal={(tab) => {
              setImportModalInitialTab(tab || 'upload');
              setIsImportModalOpen(true);
            }}
            onSeedDefault={handleSeedDefaultItems}
          />
        ) : (
          <>
            <div className="space-y-4">
              {groupedData.map((group) => (
                <div key={group.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm transition-shadow hover:shadow-md">
                  <div className="flex items-center justify-between p-5 hover:bg-gray-50 transition-colors group">
                    <button 
                      onClick={() => toggleGroup(group.id)}
                      className="flex-grow flex items-center gap-4 text-left"
                    >
                      <div className={`p-2 rounded-lg ${expandedGroups.has(group.id) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                        {getGroupIcon(group.id)}
                      </div>
                      <div className="flex-grow">
                        <span className="text-xs font-bold text-blue-600 uppercase tracking-widest block mb-0.5">หมวด {group.id}</span>
                        {isEditMode ? (
                          <input 
                            className="text-lg font-bold text-gray-900 leading-tight bg-blue-50 border-b-2 border-blue-500 outline-none px-1 w-full"
                            value={group.title}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => handleUpdateTitle('group', group.id, e.target.value)}
                          />
                        ) : (
                          <h3 className="text-lg font-bold text-gray-900 leading-tight">{group.title}</h3>
                        )}
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggleGroup(group.id)} className="p-2">
                        {expandedGroups.has(group.id) ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
                      </button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {expandedGroups.has(group.id) && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-t border-gray-100"
                      >
                        <div className="p-2 space-y-2 bg-gray-50/50">
                          {Object.entries(group.subGroups)
                            .sort(([a], [b]) => a.localeCompare(b, 'th'))
                            .map(([char, subGroup]) => {
                            const subGroupId = `${group.id}-${char}`;
                            const typedSubGroup = subGroup as GroupData['subGroups'][string];
                            return (
                              <div key={subGroupId} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                                <div className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors group">
                                  <button 
                                    onClick={() => toggleSubGroup(subGroupId)}
                                    className="flex-grow flex items-center gap-3 text-left"
                                  >
                                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-50 text-blue-600 font-bold text-sm">
                                      {char}
                                    </span>
                                    {isEditMode ? (
                                      <input 
                                        className="font-semibold text-gray-800 bg-blue-50 border-b border-blue-400 outline-none px-1 w-full"
                                        value={typedSubGroup.title}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => handleUpdateTitle('sub', subGroupId, e.target.value)}
                                      />
                                    ) : (
                                      <h4 className="font-semibold text-gray-800">{typedSubGroup.title}</h4>
                                    )}
                                  </button>
                                  <button onClick={() => toggleSubGroup(subGroupId)} className="p-2">
                                    {expandedSubGroups.has(subGroupId) ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                                  </button>
                                </div>

                                <AnimatePresence>
                                  {expandedSubGroups.has(subGroupId) && (
                                    <motion.div 
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: 'auto', opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      className="overflow-hidden bg-white"
                                    >
                                      <div className="px-4 pb-4 space-y-3">
                                        {Object.entries(typedSubGroup.subSubGroups)
                                          .sort(([a], [b]) => parseInt(a) - parseInt(b))
                                          .map(([num, subSubGroup]) => {
                                          const subSubGroupId = `${group.id}-${char}-${num}`;
                                          const typedSubSubGroup = subSubGroup as GroupData['subGroups'][string]['subSubGroups'][string];
                                          return (
                                            <div key={subSubGroupId} className="border border-gray-100 rounded-lg overflow-hidden">
                                              <div className="flex items-center justify-between p-3 bg-gray-50/30 hover:bg-gray-100 transition-colors group">
                                                <button 
                                                  onClick={() => toggleSubSubGroup(subSubGroupId)}
                                                  className="flex-grow flex items-center gap-3 text-left"
                                                >
                                                  <span className="text-xs font-bold text-gray-400">({num})</span>
                                                  {isEditMode ? (
                                                    <input 
                                                      className="text-sm font-medium text-gray-700 italic bg-blue-50 border-b border-blue-300 outline-none px-1 w-full"
                                                      value={typedSubSubGroup.title === 'NULL' || typedSubSubGroup.title === '-' ? '' : typedSubSubGroup.title}
                                                      placeholder="หัวข้อย่อย"
                                                      onClick={(e) => e.stopPropagation()}
                                                      onChange={(e) => handleUpdateTitle('subsub', subSubGroupId, e.target.value)}
                                                    />
                                                  ) : (
                                                    <h5 className="text-sm font-medium text-gray-700 italic">{typedSubSubGroup.title === 'NULL' || typedSubSubGroup.title === '-' ? 'หัวข้อย่อย' : typedSubSubGroup.title}</h5>
                                                  )}
                                                </button>
                                                <button onClick={() => toggleSubSubGroup(subSubGroupId)} className="p-2">
                                                  {expandedSubSubGroups.has(subSubGroupId) ? <ChevronDown className="w-4 h-4 text-gray-300" /> : <ChevronRight className="w-4 h-4 text-gray-300" />}
                                                </button>
                                              </div>

                                              <AnimatePresence>
                                                {expandedSubSubGroups.has(subSubGroupId) && (
                                                  <motion.div 
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    className="overflow-hidden"
                                                  >
                                                    <div className="divide-y divide-gray-100">
                                                      {typedSubSubGroup.items
                                                  .sort((a, b) => parseInt(a.item_num) - parseInt(b.item_num))
                                                  .map((item) => (
                                                        <div 
                                                          key={item.result_id} 
                                                          className="p-4 hover:bg-blue-50/30 transition-colors group cursor-pointer"
                                                          onClick={() => {
                                                            if (!isEditMode) {
                                                              setSelectedItem(item);
                                                              setView('input');
                                                            }
                                                          }}
                                                        >
                                                          <div className="flex items-start gap-4">
                                                            <div className="mt-1 flex-shrink-0">
                                                              <div className="w-2 h-2 rounded-full bg-blue-400 group-hover:scale-125 transition-transform" />
                                                            </div>
                                                            <div className="flex-grow">
                                                              <div className="flex items-center gap-2 mb-1">
                                                                <span className="text-[10px] font-mono font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                                                                  {item.index}
                                                                </span>
                                                              </div>
                                                              <p className="text-sm font-medium text-gray-800 leading-relaxed">
                                                                {item.result_title === '-' ? <span className="text-gray-400 italic">ไม่มีข้อมูลชื่อตัวชี้วัด</span> : item.result_title}
                                                              </p>
                                                            </div>
                                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                              {isEditMode ? (
                                                                <>
                                                                  <button 
                                                                    onClick={(e) => {
                                                                      e.stopPropagation();
                                                                      setEditingItem(item);
                                                                      setIsModalOpen(true);
                                                                    }}
                                                                    className="p-2 text-gray-400 hover:text-blue-500 transition-colors"
                                                                  >
                                                                    <Edit2 className="w-4 h-4" />
                                                                  </button>
                                                                  <button 
                                                                    onClick={(e) => {
                                                                      e.stopPropagation();
                                                                      handleDeleteItem(item.result_id);
                                                                    }}
                                                                    className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                                                                  >
                                                                    <Trash2 className="w-4 h-4" />
                                                                  </button>
                                                                </>
                                                              ) : (
                                                                <button className="p-2 text-gray-300 hover:text-blue-500 transition-colors">
                                                                  <ChevronRight className="w-4 h-4" />
                                                                </button>
                                                              )}
                                                            </div>
                                                          </div>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  </motion.div>
                                                )}
                                              </AnimatePresence>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>

            {filteredItems.length === 0 && (
              <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-300">
                <div className="bg-gray-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">ไม่พบข้อมูลที่ค้นหา</h3>
                <p className="text-gray-500 mt-1">ลองใช้คำค้นหาอื่นหรือตรวจสอบความถูกต้องอีกครั้ง</p>
                <button 
                  onClick={() => setSearchTerm('')}
                  className="mt-6 text-blue-600 font-bold hover:underline"
                >
                  ล้างการค้นหา
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Modal for Change Password */}
      <AnimatePresence>
        {isPasswordModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <h3 className="font-bold text-gray-900">เปลี่ยนรหัสผ่าน</h3>
                <button onClick={() => setIsPasswordModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">รหัสผ่านใหม่</label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                      type="password"
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:bg-white focus:border-blue-500 transition-all"
                      placeholder="••••••••"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
                <button 
                  onClick={() => setIsPasswordModalOpen(false)}
                  className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors"
                >
                  ยกเลิก
                </button>
                <button 
                  onClick={handleChangePassword}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20"
                >
                  เปลี่ยนรหัสผ่าน
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal for Add/Edit Item */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <h3 className="font-bold text-gray-900">{editingItem ? 'แก้ไขตัวชี้วัด' : 'เพิ่มตัวชี้วัดใหม่'}</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">หมวด (Group ID)</label>
                    <select 
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500"
                      value={editingItem?.group_id || newItem.group_id}
                      onChange={(e) => editingItem ? setEditingItem({...editingItem, group_id: e.target.value}) : setNewItem({...newItem, group_id: e.target.value})}
                    >
                      <option value="7.1">7.1</option>
                      <option value="7.2">7.2</option>
                      <option value="7.3">7.3</option>
                      <option value="7.4">7.4</option>
                      <option value="7.5">7.5</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">หมวดย่อย (Char)</label>
                    <input 
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500"
                      value={editingItem?.sub_group_char || newItem.sub_group_char}
                      onChange={(e) => editingItem ? setEditingItem({...editingItem, sub_group_char: e.target.value}) : setNewItem({...newItem, sub_group_char: e.target.value})}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">หัวข้อย่อย (Num)</label>
                    <input 
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500"
                      value={editingItem?.sub_sub_group_num || newItem.sub_sub_group_num}
                      onChange={(e) => editingItem ? setEditingItem({...editingItem, sub_sub_group_num: e.target.value}) : setNewItem({...newItem, sub_sub_group_num: e.target.value})}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">ชื่อตัวชี้วัด (Result Title)</label>
                  <textarea 
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500 min-h-[100px]"
                    value={editingItem?.result_title || newItem.result_title}
                    onChange={(e) => editingItem ? setEditingItem({...editingItem, result_title: e.target.value}) : setNewItem({...newItem, result_title: e.target.value})}
                  />
                </div>
              </div>
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-3">
                {editingItem ? (
                  <button 
                    type="button"
                    onClick={() => {
                      setDeletingIndicator(editingItem);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors border border-red-200"
                    title="ลบตัวชี้วัดนี้ออกจากระบบ"
                  >
                    <Trash2 className="w-4 h-4" />
                    ลบตัวชี้วัดนี้
                  </button>
                ) : <div />}
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <button 
                    onClick={handleSaveItem}
                    className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20"
                  >
                    <Save className="w-4 h-4" />
                    บันทึกข้อมูล
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal for Deleting Indicator */}
      <AnimatePresence>
        {deletingIndicator && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-red-100"
            >
              <div className="p-6">
                <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-4">
                  <Trash2 className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">ยืนยันการลบตัวชี้วัด</h3>
                <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                  คุณแน่ใจหรือไม่ว่าต้องการลบตัวชี้วัด{' '}
                  <span className="font-bold text-gray-900 font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                    {deletingIndicator.index}
                  </span>{' '}
                  : {deletingIndicator.result_title || 'ไม่มีชื่อตัวชี้วัด'}?
                </p>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 mb-6">
                  ⚠️ <strong>คำเตือน:</strong> ข้อมูลผลลัพธ์รายปีและข้อมูลเปรียบเทียบทั้งหมดของตัวชี้วัดนี้จะถูกลบออกจากระบบและไม่สามารถกู้คืนได้
                </div>

                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => setDeletingIndicator(null)}
                    className="px-4 py-2.5 text-sm font-bold text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={executeDeleteIndicator}
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-red-600/20 active:scale-95 disabled:opacity-50"
                  >
                    {isDeleting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        กำลังลบ...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        ลบตัวชี้วัด
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal for Deleting All Indicators */}
      <AnimatePresence>
        {isDeleteAllModalOpen && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-red-200"
            >
              <div className="bg-red-50/70 p-6 border-b border-red-100 flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0 shadow-xs">
                  <Trash2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 leading-snug">ยืนยันการลบตัวชี้วัดทั้งหมด</h3>
                  <p className="text-xs text-red-600 font-semibold mt-0.5">การดำเนินการนี้ไม่สามารถย้อนกลับหรือกู้คืนได้</p>
                </div>
              </div>

              <div className="p-6 space-y-5">
                <div className="bg-red-50/50 border border-red-200 rounded-2xl p-4 text-xs text-red-900 space-y-2">
                  <p className="font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    สิ่งที่จะถูกลบทั้งหมดออกจากฐานข้อมูล:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-gray-700 pl-1">
                    <li>ตัวชี้วัดทั้งหมดจำนวน <strong className="text-red-700">{items.length}</strong> รายการ</li>
                    <li>ข้อมูลผลการดำเนินงานย้อนหลังและเป้าหมายทั้งหมด</li>
                    <li>ข้อมูลเปรียบเทียบกับมหาวิทยาลัยคู่เทียบทั้งหมด</li>
                  </ul>
                </div>

                {deleteProgress && (
                  <div className="space-y-2 bg-gray-50 p-4 rounded-2xl border border-gray-200">
                    <div className="flex justify-between text-xs font-bold text-gray-700">
                      <span>กำลังลบข้อมูล...</span>
                      <span>{deleteProgress.current} / {deleteProgress.total} รายการ</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-red-600 h-2 transition-all duration-300"
                        style={{ width: `${deleteProgress.total > 0 ? (deleteProgress.current / deleteProgress.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    พิมพ์คำว่า <span className="text-red-600 font-mono font-black">DELETE</span> หรือ <span className="text-red-600 font-bold">ลบทั้งหมด</span> เพื่อยืนยัน:
                  </label>
                  <input
                    type="text"
                    disabled={isDeletingAll}
                    value={deleteAllConfirmText}
                    onChange={(e) => setDeleteAllConfirmText(e.target.value)}
                    placeholder="พิมพ์ DELETE หรือ ลบทั้งหมด เพื่อยืนยัน"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-medium focus:bg-white focus:border-red-500 focus:ring-4 focus:ring-red-500/10 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={isDeletingAll}
                  onClick={() => {
                    setIsDeleteAllModalOpen(false);
                    setDeleteAllConfirmText('');
                  }}
                  className="px-4 py-2.5 text-sm font-bold text-gray-600 hover:text-gray-800 hover:bg-gray-200/60 rounded-xl transition-colors disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  disabled={
                    isDeletingAll || 
                    (deleteAllConfirmText.trim().toLowerCase() !== 'delete' && deleteAllConfirmText.trim() !== 'ลบทั้งหมด')
                  }
                  onClick={handleDeleteAllIndicators}
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-red-600/20 active:scale-95"
                >
                  {isDeletingAll ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      กำลังลบข้อมูล...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      ยืนยันลบตัวชี้วัดทั้งหมด
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal for CSV Import */}
      <CsvImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        items={items}
        universities={universities}
        onImportRecords={handleBatchImportRecords}
        onImportNewIndicators={handleBatchImportNewIndicators}
        onImportUnified={handleBatchImportUnified}
        onDeleteAllItems={() => setIsDeleteAllModalOpen(true)}
        logAction={logAction}
        initialTab={importModalInitialTab}
      />

      <Footer />
    </div>
  );
}

function Footer() {
  return (
    <footer className="bg-white border-t border-gray-200 py-12 mt-12">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 p-2 rounded-lg text-white">
                <LayoutGrid className="w-5 h-5" />
              </div>
              <span className="font-bold text-lg">EdPEx Dashboard</span>
            </div>
            <p className="text-sm text-gray-500 leading-relaxed">
              ระบบจัดการและติดตามผลลัพธ์ตามเกณฑ์ EdPEx หมวด 7 เพื่อความเป็นเลิศในการดำเนินงานขององค์กร
            </p>
          </div>
          <div className="space-y-4">
            <h4 className="font-bold text-sm uppercase tracking-widest text-gray-900">Quick Links</h4>
            <ul className="space-y-2 text-sm text-gray-500">
              <li><a href="#" className="hover:text-blue-600 transition-colors">คู่มือการใช้งาน</a></li>
              <li><a href="#" className="hover:text-blue-600 transition-colors">เกณฑ์ EdPEx 2024</a></li>
              <li><a href="#" className="hover:text-blue-600 transition-colors">ติดต่อสอบถาม</a></li>
            </ul>
          </div>
          <div className="space-y-4">
            <h4 className="font-bold text-sm uppercase tracking-widest text-gray-900">Support</h4>
            <p className="text-sm text-gray-500">
              หากพบปัญหาการใช้งาน กรุณาติดต่อฝ่ายเทคโนโลยีสารสนเทศ
            </p>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t border-gray-100 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-gray-400">© 2024 EdPEx Management System. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <a href="#" className="text-xs text-gray-400 hover:text-gray-600">Privacy Policy</a>
            <a href="#" className="text-xs text-gray-400 hover:text-gray-600">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

function InputPage({ 
  item, 
  userRole, 
  universities, 
  onBack, 
  onSave,
  onDeleteIndicator
}: { 
  item: EdPExItem;
  userRole: UserRole;
  universities: University[];
  onBack: () => void;
  onSave: (data: EdPExItem['data']) => void;
  onDeleteIndicator?: (item: EdPExItem) => void;
}) {
  const buuicColor = useMemo(() => universities.find(u => u.id === 'buuic')?.color || '#2563eb', [universities]);
  
  const [inputType, setInputType] = useState<InputType>(item.data?.type || 'none');
  const [unit, setUnit] = useState(item.data?.unit || '');
  const [records, setRecords] = useState<YearlyData[]>(item.data?.records || []);
  const [comparisonUniversities, setComparisonUniversities] = useState<ComparisonUniversityData[]>(item.data?.comparisonUniversities || []);
  const [mainColor, setMainColor] = useState(item.data?.mainColor || buuicColor);
  const [targetColor, setTargetColor] = useState(item.data?.targetColor || '#93c5fd');
  const [activeTab, setActiveTab] = useState<'main' | 'comparison'>('main');
  const [startYear, setStartYear] = useState<string>('');
  const [endYear, setEndYear] = useState<string>('');
  const canEdit = userRole === 'admin' || userRole === 'staff';

  // Sync mainColor with BUUIC color if not explicitly set in item data
  useEffect(() => {
    if (!item.data?.mainColor) {
      setMainColor(buuicColor);
    }
  }, [buuicColor, item.data?.mainColor]);

  const availableYears = useMemo(() => {
    return Array.from(new Set([
      ...records.map(r => r.year),
      ...comparisonUniversities.flatMap(univ => univ.records.map(r => r.year))
    ])).sort();
  }, [records, comparisonUniversities]);

  const handleSelectUniversity = (univId: string) => {
    const selected = universities.find(u => u.id === univId);
    if (!selected) return;
    
    // Check if already in comparison
    if (comparisonUniversities.some(u => u.id === selected.id)) {
      alert('มหาวิทยาลัยนี้ถูกเพิ่มไปแล้ว');
      return;
    }

    setComparisonUniversities([...comparisonUniversities, { 
      id: selected.id, 
      name: selected.name, 
      abbreviation: selected.abbreviation, 
      records: [],
      color: selected.color || '#10b981'
    }]);
  };

  useEffect(() => {
    if (availableYears.length > 0) {
      if (!startYear || !availableYears.includes(startYear)) setStartYear(availableYears[0]);
      if (!endYear || !availableYears.includes(endYear)) setEndYear(availableYears[availableYears.length - 1]);
    }
  }, [availableYears]);

  const filteredData = useMemo(() => {
    const years = availableYears.filter(y => {
      const yearInt = parseInt(y);
      const s = startYear ? parseInt(startYear) : -Infinity;
      const e = endYear ? parseInt(endYear) : Infinity;
      return yearInt >= s && yearInt <= e;
    });

    return years.map(year => {
      const mainRecord = records.find(r => r.year === year);
      const dataPoint: any = {
        name: year,
        target: parseFloat(mainRecord?.target?.toString() || '0'),
        actual: parseFloat(mainRecord?.actual?.toString() || mainRecord?.value?.toString() || '0'),
      };

      // Add comparison data
      comparisonUniversities.forEach(univ => {
        const univRecord = univ.records.find(r => r.year === year);
        dataPoint[univ.abbreviation] = parseFloat(univRecord?.actual?.toString() || univRecord?.value?.toString() || '0');
      });

      return dataPoint;
    });
  }, [records, comparisonUniversities, startYear, endYear, availableYears]);

  const handleAddYear = () => {
    const lastYear = records.length > 0 ? parseInt(records[records.length - 1].year) : new Date().getFullYear() + 543;
    setRecords([...records, { year: (lastYear + 1).toString(), target: '', actual: '' }]);
  };

  const handleRemoveYear = (index: number) => {
    setRecords(records.filter((_, i) => i !== index));
  };

  const handleUpdateRecord = (index: number, field: keyof YearlyData, value: string) => {
    const next = [...records];
    next[index] = { ...next[index], [field]: value };
    setRecords(next);
  };

  const handleUpdateComparisonRecord = (univId: string, index: number, field: keyof YearlyData, value: string) => {
    setComparisonUniversities(prev => prev.map(univ => {
      if (univ.id === univId) {
        const nextRecords = [...univ.records];
        nextRecords[index] = { ...nextRecords[index], [field]: value };
        return { ...univ, records: nextRecords };
      }
      return univ;
    }));
  };

  const handleAddComparisonYear = (univId: string) => {
    setComparisonUniversities(prev => prev.map(univ => {
      if (univ.id === univId) {
        const lastYear = univ.records.length > 0 ? parseInt(univ.records[univ.records.length - 1].year) : new Date().getFullYear() + 543;
        return { ...univ, records: [...univ.records, { year: (lastYear + 1).toString(), actual: '' }] };
      }
      return univ;
    }));
  };

  const handleRemoveComparisonYear = (univId: string, index: number) => {
    setComparisonUniversities(prev => prev.map(univ => {
      if (univ.id === univId) {
        return { ...univ, records: univ.records.filter((_, i) => i !== index) };
      }
      return univ;
    }));
  };

  const handleAddComparisonUniversity = () => {
    const newId = `univ-${Date.now()}`;
    const colors = ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
    setComparisonUniversities([...comparisonUniversities, { 
      id: newId, 
      name: 'มหาวิทยาลัยใหม่', 
      abbreviation: 'NEW', 
      records: [],
      color: colors[comparisonUniversities.length % colors.length]
    }]);
  };

  const handleRemoveComparisonUniversity = (univId: string) => {
    setComparisonUniversities(prev => prev.filter(u => u.id !== univId));
  };

  const handleUpdateUniversityMetadata = (univId: string, field: 'name' | 'abbreviation' | 'color', value: string) => {
    setComparisonUniversities(prev => prev.map(univ => {
      if (univ.id === univId) {
        return { ...univ, [field]: value };
      }
      return univ;
    }));
  };

  const handleSave = () => {
    onSave({
      type: inputType,
      unit,
      records,
      comparisonUniversities,
      mainColor: mainColor === buuicColor ? undefined : mainColor,
      targetColor
    });
    onBack();
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans">
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={onBack}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-mono font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                  {item.index}
                </span>
                <h1 className="text-lg font-bold tracking-tight truncate max-w-md">{item.result_title}</h1>
              </div>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">บันทึกข้อมูลตัวชี้วัด</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && onDeleteIndicator && (
              <button 
                type="button"
                onClick={() => onDeleteIndicator(item)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200 transition-colors"
                title="ลบตัวชี้วัดนี้"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">ลบตัวชี้วัด</span>
              </button>
            )}
            <button 
              onClick={handleSave}
              disabled={!canEdit}
              className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-colors shadow-lg ${canEdit ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/20' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
            >
              <Save className="w-4 h-4" />
              บันทึกข้อมูล
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {!canEdit && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3 text-amber-700">
            <Info className="w-5 h-5" />
            <p className="text-sm font-medium">คุณมีสิทธิ์ดูข้อมูลเท่านั้น ไม่สามารถแก้ไขข้อมูลได้</p>
          </div>
        )}
        <div className="space-y-6">
          {/* Input Type Selection */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                <Settings2 className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold">ตั้งค่ารูปแบบการกรอกข้อมูล</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button 
                onClick={() => canEdit && setInputType('yearly')}
                disabled={!canEdit}
                className={`flex flex-col items-start p-4 rounded-xl border-2 transition-all text-left ${inputType === 'yearly' ? 'border-blue-500 bg-blue-50/50' : 'border-gray-100 hover:border-gray-200'} ${!canEdit && 'opacity-50 cursor-not-allowed'}`}
              >
                <div className={`p-2 rounded-lg mb-3 ${inputType === 'yearly' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                  <Calendar className="w-5 h-5" />
                </div>
                <span className="font-bold text-gray-900">บันทึกข้อมูลรายปี</span>
                <p className="text-xs text-gray-500 mt-1">กรอกค่าตัวเลขแยกตามปีงบประมาณหรือปีการศึกษา</p>
              </button>
              
              <button 
                onClick={() => canEdit && setInputType('none')}
                disabled={!canEdit}
                className={`flex flex-col items-start p-4 rounded-xl border-2 transition-all text-left ${inputType === 'none' ? 'border-blue-500 bg-blue-50/50' : 'border-gray-100 hover:border-gray-200'} ${!canEdit && 'opacity-50 cursor-not-allowed'}`}
              >
                <div className={`p-2 rounded-lg mb-3 ${inputType === 'none' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                  <X className="w-5 h-5" />
                </div>
                <span className="font-bold text-gray-900">ยังไม่ระบุรูปแบบ</span>
                <p className="text-xs text-gray-500 mt-1">ปิดการกรอกข้อมูลสำหรับตัวชี้วัดนี้</p>
              </button>
            </div>
          </section>

          {/* Tabs for Main vs Comparison */}
          {inputType === 'yearly' && (
            <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl w-fit">
              <button 
                onClick={() => setActiveTab('main')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'main' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                ข้อมูลหลัก (BUUIC)
              </button>
              <button 
                onClick={() => setActiveTab('comparison')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'comparison' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                ข้อมูลเปรียบเทียบ
              </button>
            </div>
          )}

          {/* Yearly Records Input */}
          {inputType === 'yearly' && activeTab === 'main' && (
            <motion.section 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="bg-green-100 p-2 rounded-lg text-green-600">
                    <BarChart3 className="w-5 h-5" />
                  </div>
                  <h2 className="text-lg font-bold">ข้อมูลรายปี</h2>
                </div>
                {canEdit && (
                  <button 
                    onClick={handleAddYear}
                    className="flex items-center gap-2 text-blue-600 font-bold text-sm hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    เพิ่มปี
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="md:col-span-1">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">หน่วยวัด (Unit)</label>
                  <input 
                    type="text"
                    disabled={!canEdit}
                    placeholder="เช่น %, คน, บาท, คะแนน..."
                    className={`w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:bg-white focus:border-blue-500 transition-all ${!canEdit && 'cursor-not-allowed opacity-70'}`}
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">สีเป้าหมาย (Line)</label>
                  <input 
                    type="color"
                    disabled={!canEdit}
                    className="w-full h-10 p-1 bg-gray-50 border border-gray-200 rounded-lg cursor-pointer"
                    value={targetColor}
                    onChange={(e) => setTargetColor(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">สีผลการดำเนินงาน (Bar)</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="color"
                      disabled={!canEdit}
                      className="flex-grow h-10 p-1 bg-gray-50 border border-gray-200 rounded-lg cursor-pointer"
                      value={mainColor}
                      onChange={(e) => setMainColor(e.target.value)}
                    />
                    {canEdit && mainColor !== buuicColor && (
                      <button 
                        onClick={() => setMainColor(buuicColor)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Reset to BUUIC color"
                      >
                        <History className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {mainColor === buuicColor ? '✓ กำลังใช้สีมาตรฐานของ BUUIC' : '⚠ กำลังใช้สีที่กำหนดเอง'}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-12 gap-4 px-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  <div className="col-span-3">ปี (พ.ศ.)</div>
                  <div className="col-span-4">ค่าเป้าหมาย</div>
                  <div className="col-span-4">ค่าที่บันทึก</div>
                  <div className="col-span-1"></div>
                </div>
                
                {records.length === 0 ? (
                  <div className="text-center py-8 border-2 border-dashed border-gray-100 rounded-xl">
                    <p className="text-sm text-gray-400">ยังไม่มีข้อมูล กดปุ่ม "เพิ่มปี" เพื่อเริ่มบันทึก</p>
                  </div>
                ) : (
                  records.map((record, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-4 items-center p-2 rounded-lg hover:bg-gray-50 transition-colors">
                      <div className="col-span-3">
                        <input 
                          type="text"
                          disabled={!canEdit}
                          className={`w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500 ${!canEdit && 'cursor-not-allowed opacity-70'}`}
                          value={record.year}
                          onChange={(e) => handleUpdateRecord(idx, 'year', e.target.value)}
                        />
                      </div>
                      <div className="col-span-4 flex items-center gap-2">
                        <input 
                          type="text"
                          disabled={!canEdit}
                          placeholder="เป้าหมาย"
                          className={`w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500 font-mono ${!canEdit && 'cursor-not-allowed opacity-70'}`}
                          value={record.target || ''}
                          onChange={(e) => handleUpdateRecord(idx, 'target', e.target.value)}
                        />
                      </div>
                      <div className="col-span-4 flex items-center gap-2">
                        <input 
                          type="text"
                          disabled={!canEdit}
                          placeholder="บันทึกจริง"
                          className={`w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500 font-mono ${!canEdit && 'cursor-not-allowed opacity-70'}`}
                          value={record.actual || record.value || ''}
                          onChange={(e) => handleUpdateRecord(idx, 'actual', e.target.value)}
                        />
                        <span className="text-xs text-gray-400 whitespace-nowrap">{unit}</span>
                      </div>
                      <div className="col-span-1 flex justify-end">
                        {canEdit && (
                          <button 
                            onClick={() => handleRemoveYear(idx)}
                            className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.section>
          )}

          {/* Comparison Records Input */}
          {inputType === 'yearly' && activeTab === 'comparison' && (
            <motion.section 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="flex justify-end gap-3">
                {canEdit && (
                  <>
                    <select 
                      className="px-4 py-2 rounded-lg text-sm font-bold border border-gray-200 outline-none focus:border-purple-500 bg-white"
                      onChange={(e) => {
                        if (e.target.value) {
                          handleSelectUniversity(e.target.value);
                          e.target.value = '';
                        }
                      }}
                    >
                      <option value="">เลือกมหาวิทยาลัยจากระบบ...</option>
                      {universities.filter(u => !u.isDefault).map(u => (
                        <option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</option>
                      ))}
                    </select>
                    <button 
                      onClick={handleAddComparisonUniversity}
                      className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-purple-700 transition-colors shadow-lg shadow-purple-500/20"
                    >
                      <Plus className="w-4 h-4" />
                      เพิ่มมหาวิทยาลัยใหม่ (กำหนดเอง)
                    </button>
                  </>
                )}
              </div>

              {comparisonUniversities.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-300">
                  <p className="text-gray-400">ยังไม่มีข้อมูลเปรียบเทียบ คลิก "เพิ่มมหาวิทยาลัยเปรียบเทียบ" เพื่อเริ่มบันทึก</p>
                </div>
              ) : (
                comparisonUniversities.map(univ => (
                  <div key={univ.id} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                    <div className="flex-grow grid grid-cols-1 md:grid-cols-3 gap-4 mr-4">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">ชื่อมหาวิทยาลัย</label>
                          <input 
                            type="text"
                            disabled={!canEdit}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold outline-none focus:border-purple-500"
                            value={univ.name}
                            onChange={(e) => handleUpdateUniversityMetadata(univ.id, 'name', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">ตัวย่อ (Abbreviation)</label>
                          <input 
                            type="text"
                            disabled={!canEdit}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold outline-none focus:border-purple-500 uppercase"
                            value={univ.abbreviation}
                            onChange={(e) => handleUpdateUniversityMetadata(univ.id, 'abbreviation', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">สีที่แสดงในกราฟ</label>
                          <input 
                            type="color"
                            disabled={!canEdit}
                            className="w-full h-10 p-1 bg-gray-50 border border-gray-200 rounded-lg cursor-pointer"
                            defaultValue={univ.color || '#10b981'}
                            onBlur={(e) => handleUpdateUniversityMetadata(univ.id, 'color', e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {canEdit && (
                          <>
                            <button 
                              onClick={() => handleAddComparisonYear(univ.id)}
                              className="flex items-center gap-2 text-blue-600 font-bold text-sm hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
                            >
                              <Plus className="w-4 h-4" />
                              เพิ่มปี
                            </button>
                            <button 
                              onClick={() => handleRemoveComparisonUniversity(univ.id)}
                              className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                              title="ลบมหาวิทยาลัย"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="grid grid-cols-12 gap-4 px-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        <div className="col-span-3">ปี (พ.ศ.)</div>
                        <div className="col-span-9">ผลการดำเนินงาน</div>
                      </div>
                      {univ.records.map((record, rIdx) => (
                        <div key={rIdx} className="grid grid-cols-12 gap-4 items-center bg-gray-50/50 p-2 rounded-lg group">
                          <div className="col-span-3">
                            <input 
                              type="text"
                              disabled={!canEdit}
                              className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-bold outline-none focus:border-purple-500"
                              value={record.year}
                              onChange={(e) => handleUpdateComparisonRecord(univ.id, rIdx, 'year', e.target.value)}
                            />
                          </div>
                          <div className="col-span-8">
                            <input 
                              type="text"
                              disabled={!canEdit}
                              className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-bold outline-none focus:border-purple-500"
                              value={record.actual || record.value || ''}
                              onChange={(e) => handleUpdateComparisonRecord(univ.id, rIdx, 'actual', e.target.value)}
                              placeholder="ระบุผลการดำเนินงาน"
                            />
                          </div>
                          <div className="col-span-1 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            {canEdit && (
                              <button 
                                onClick={() => handleRemoveComparisonYear(univ.id, rIdx)}
                                className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}

              <div className="mt-8 pt-8 border-t border-gray-100">
                <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="w-4 h-4 text-blue-600" />
                      <h3 className="text-sm font-bold text-gray-900">กราฟเปรียบเทียบเป้าหมายและผลการดำเนินงาน</h3>
                    </div>
                    <p className="text-xs text-gray-500 font-medium ml-6">
                      ตัวชี้วัด: {item.result_title} {unit && `(หน่วย: ${unit})`}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-3 bg-gray-50 p-2 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">ตั้งแต่ปี</span>
                      <select 
                        className="bg-white border border-gray-200 rounded-lg text-xs px-2 py-1 outline-none focus:border-blue-500"
                        value={startYear}
                        onChange={(e) => setStartYear(e.target.value)}
                      >
                        {availableYears.map(y => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                    <div className="w-2 h-[1px] bg-gray-300"></div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">ถึงปี</span>
                      <select 
                        className="bg-white border border-gray-200 rounded-lg text-xs px-2 py-1 outline-none focus:border-blue-500"
                        value={endYear}
                        onChange={(e) => setEndYear(e.target.value)}
                      >
                        {availableYears.map(y => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={filteredData}
                      margin={{ top: 20, right: 30, left: 40, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 12, fill: '#94a3b8' }}
                        dy={10}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 12, fill: '#94a3b8' }}
                        label={unit ? { value: unit, angle: -90, position: 'insideLeft', offset: -30, style: { fontSize: 11, fill: '#64748b', fontWeight: 500 } } : undefined}
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        cursor={{ fill: '#f8fafc' }}
                        formatter={(value: any, name: string) => [`${value} ${unit}`, name]}
                      />
                      <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                      
                      <Bar name="ผลการดำเนินงาน (BUUIC)" dataKey="actual" fill={mainColor} radius={[4, 4, 0, 0]} barSize={30}>
                        <LabelList dataKey="actual" position="top" style={{ fontSize: 10, fill: '#64748b' }} />
                      </Bar>
                      
                      <Line 
                        type="monotone" 
                        name="เป้าหมาย (BUUIC)" 
                        dataKey="target" 
                        stroke={targetColor} 
                        strokeWidth={3} 
                        dot={{ r: 4, fill: targetColor }}
                        activeDot={{ r: 6 }}
                      >
                        <LabelList dataKey="target" position="top" style={{ fontSize: 10, fill: targetColor, fontWeight: 'bold' }} />
                      </Line>

                      {comparisonUniversities.map((univ, idx) => (
                        <Bar 
                          key={univ.id} 
                          name={univ.abbreviation} 
                          dataKey={univ.abbreviation} 
                          fill={univ.color || '#10b981'} 
                          radius={[4, 4, 0, 0]} 
                          barSize={30} 
                        >
                          <LabelList dataKey={univ.abbreviation} position="top" style={{ fontSize: 10, fill: '#64748b' }} />
                        </Bar>
                      ))}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
              </motion.section>
            )}
          </div>
        </main>
    </div>
  );
}

function LoginPage({ onBack, onLoginSuccess }: { onBack: () => void, onLoginSuccess: () => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        if (password !== confirmPassword) {
          throw new Error('passwords-not-match');
        }
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Create user profile in Firestore
        const role: UserRole = email === 'podchara.kl@go.buu.ac.th' ? 'admin' : 'guest';
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          role: role,
          displayName: displayName || user.email?.split('@')[0]
        });
      }
      onLoginSuccess();
    } catch (err: any) {
      console.error('Auth Error:', err);
      if (err.message === 'passwords-not-match') {
        setError('รหัสผ่านไม่ตรงกัน');
      } else if (err.message.includes('auth/user-not-found')) {
        setError('ไม่พบอีเมลนี้ในระบบ');
      } else if (err.message.includes('auth/wrong-password')) {
        setError('รหัสผ่านไม่ถูกต้อง');
      } else if (err.message.includes('auth/email-already-in-use')) {
        setError('อีเมลนี้ถูกใช้งานแล้ว');
      } else if (err.message.includes('auth/weak-password')) {
        setError('รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร');
      } else if (err.message.includes('permission-denied')) {
        setError('ไม่มีสิทธิ์ในการสร้างโปรไฟล์ผู้ใช้ กรุณาติดต่อผู้ดูแลระบบ');
      } else {
        setError('เกิดข้อผิดพลาด: ' + (err.code || err.message));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      const user = userCredential.user;

      // Check if user profile exists in Firestore, if not create it
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) {
        const role: UserRole = user.email === 'podchara.kl@go.buu.ac.th' ? 'admin' : 'pending';
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          role: role,
          displayName: user.displayName || user.email?.split('@')[0]
        });
      }
      onLoginSuccess();
    } catch (err: any) {
      console.error('Google Auth Error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('การเข้าสู่ระบบถูกยกเลิก');
      } else if (err.code === 'auth/popup-blocked') {
        setError('เบราว์เซอร์บล็อกหน้าต่างป็อปอัป กรุณาอนุญาตป็อปอัปในเบราว์เซอร์');
      } else {
        setError(
          `เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย Google (${err.code || err.message || 'Error'}). หากพบข้อผิดพลาด 401 หรือ Request Malformed แนะนำให้เปิดด้วยหน้าต่างไม่ระบุตัวตน (Incognito) หรือล้างแคช/คุกกี้ของ Google`
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
      >
        <div className="p-8">
          <div className="flex justify-center mb-6">
            <div className="bg-blue-600 p-4 rounded-2xl text-white shadow-lg shadow-blue-500/20">
              <LayoutGrid className="w-8 h-8" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">EdPEx Management</h2>
          <p className="text-center text-gray-500 text-sm mb-8">
            กรุณาเข้าสู่ระบบด้วย Google เพื่อจัดการข้อมูล
          </p>

          <div className="space-y-6">
            {error && (
              <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-xs font-bold rounded-lg text-center">
                {error}
              </div>
            )}

            <button 
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full py-4 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold rounded-2xl flex items-center justify-center gap-4 transition-all disabled:opacity-50 shadow-sm hover:shadow-md"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span className="text-lg">เข้าสู่ระบบด้วย Google</span>
            </button>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-100 text-center">
            <button 
              onClick={onBack}
              className="text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors"
            >
              กลับไปหน้าแดชบอร์ด
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function UserManager({ onBack }: { onBack: () => void }) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const path = 'users';
    const unsubscribe = onSnapshot(collection(db, path), (snapshot) => {
      setUsers(snapshot.docs.map(doc => doc.data() as UserProfile));
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });
    return () => unsubscribe();
  }, []);

  const handleUpdateRole = async (uid: string, role: UserRole) => {
    const path = `users/${uid}`;
    try {
      await updateDoc(doc(db, 'users', uid), { role });
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="text-xl font-bold">User Manager</h1>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto w-full p-6">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-widest">User</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-widest">Role</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => (
                <tr key={u.uid} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-bold text-gray-900">{u.displayName || 'No Name'}</span>
                      <span className="text-xs text-gray-500">{u.email}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${u.role === 'admin' ? 'bg-purple-100 text-purple-600' : u.role === 'staff' ? 'bg-blue-100 text-blue-600' : u.role === 'pending' ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-600'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <select 
                      value={u.role}
                      onChange={(e) => handleUpdateRole(u.uid, e.target.value as UserRole)}
                      className="text-xs font-bold bg-gray-100 border-none rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="pending">Pending</option>
                      <option value="admin">Admin</option>
                      <option value="staff">Staff</option>
                      <option value="guest">Guest</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

function UniversityManager({ onBack }: { onBack: () => void }) {
  const [univs, setUnivs] = useState<University[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newUniv, setNewUniv] = useState<Partial<University>>({ name: '', abbreviation: '', color: '#2563eb' });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'universities'), (snapshot) => {
      setUnivs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as University)));
    });
    return () => unsubscribe();
  }, []);

  const handleAdd = async () => {
    if (!newUniv.name || !newUniv.abbreviation) return;
    const id = `univ-${Date.now()}`;
    await setDoc(doc(db, 'universities', id), { ...newUniv, id });
    setIsAdding(false);
    setNewUniv({ name: '', abbreviation: '', color: '#2563eb' });
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    await deleteDoc(doc(db, 'universities', deletingId));
    setDeletingId(null);
  };

  const handleUpdate = async (id: string, field: keyof University, value: string) => {
    await updateDoc(doc(db, 'universities', id), { [field]: value });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 hover:bg-white rounded-full transition-colors">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-2xl font-bold">จัดการมหาวิทยาลัยในระบบ</h1>
          </div>
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
          >
            <Plus className="w-5 h-5" />
            เพิ่มมหาวิทยาลัย
          </button>
        </div>

        <div className="grid gap-4">
          {univs.map(u => (
            <div key={u.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
              <div className="flex-grow grid grid-cols-1 md:grid-cols-3 gap-4 mr-6">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">ชื่อมหาวิทยาลัย</label>
                  <input 
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold"
                    value={u.name}
                    onChange={(e) => handleUpdate(u.id, 'name', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">ตัวย่อ</label>
                  <input 
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold uppercase"
                    value={u.abbreviation}
                    onChange={(e) => handleUpdate(u.id, 'abbreviation', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">สี</label>
                  <input 
                    type="color"
                    className="w-full h-10 p-1 bg-gray-50 border border-gray-200 rounded-lg cursor-pointer"
                    defaultValue={u.color}
                    onBlur={(e) => handleUpdate(u.id, 'color', e.target.value)}
                  />
                </div>
              </div>
              {!u.isDefault && (
                <button onClick={() => setDeletingId(u.id)} className="p-2 text-gray-300 hover:text-red-500 transition-colors">
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {deletingId && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            >
              <div className="p-6 text-center">
                <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">ยืนยันการลบ</h3>
                <p className="text-gray-500 text-sm">คุณแน่ใจหรือไม่ว่าต้องการลบมหาวิทยาลัยนี้? การดำเนินการนี้ไม่สามารถย้อนกลับได้</p>
              </div>
              <div className="px-6 py-4 bg-gray-50 flex items-center justify-center gap-3">
                <button 
                  onClick={() => setDeletingId(null)} 
                  className="px-6 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors"
                >
                  ยกเลิก
                </button>
                <button 
                  onClick={handleDelete} 
                  className="bg-red-500 text-white px-8 py-2 rounded-xl text-sm font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                >
                  ลบข้อมูล
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {isAdding && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <h3 className="font-bold text-gray-900">เพิ่มมหาวิทยาลัยใหม่</h3>
                <button onClick={() => setIsAdding(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">ชื่อมหาวิทยาลัย</label>
                  <input 
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500"
                    value={newUniv.name}
                    onChange={(e) => setNewUniv({...newUniv, name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">ตัวย่อ</label>
                  <input 
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500 uppercase"
                    value={newUniv.abbreviation}
                    onChange={(e) => setNewUniv({...newUniv, abbreviation: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">สี</label>
                  <input 
                    type="color"
                    className="w-full h-10 p-1 bg-gray-50 border border-gray-200 rounded-lg cursor-pointer"
                    value={newUniv.color}
                    onChange={(e) => setNewUniv({...newUniv, color: e.target.value})}
                  />
                </div>
              </div>
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
                <button onClick={() => setIsAdding(false)} className="px-4 py-2 text-sm font-bold text-gray-500">ยกเลิก</button>
                <button onClick={handleAdd} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-bold">บันทึก</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LogViewer({ onBack }: { onBack: () => void }) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const path = 'logs';
    const q = query(collection(db, path), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog)));
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="text-xl font-bold">Activity Logs</h1>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto w-full p-6">
        <div className="space-y-4">
          {logs.map(log => (
            <div key={log.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-start justify-between">
              <div className="flex gap-4">
                <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-gray-900">{log.action}</span>
                    <span className="text-[10px] text-gray-400">•</span>
                    <span className="text-[10px] text-gray-500 font-mono">
                      {log.timestamp?.toDate().toLocaleString('th-TH')}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">{log.details}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center">
                      <User className="w-2.5 h-2.5 text-gray-500" />
                    </div>
                    <span className="text-xs font-medium text-gray-400">{log.userEmail}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {logs.length === 0 && !isLoading && (
            <div className="text-center py-20 text-gray-400 italic">ยังไม่มีประวัติการใช้งาน</div>
          )}
        </div>
      </main>
    </div>
  );
}
