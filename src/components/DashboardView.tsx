import React, { useState, useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  ComposedChart
} from 'recharts';
import { 
  BarChart3, 
  Users, 
  ShieldCheck, 
  TrendingUp, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Search, 
  Filter, 
  ChevronRight, 
  ChevronDown, 
  Edit2, 
  Trash2, 
  Plus, 
  Target, 
  Building2, 
  ArrowUpRight, 
  ArrowDownRight,
  Sparkles,
  FileSpreadsheet,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { EdPExItem, University } from '../types';

interface DashboardViewProps {
  items: EdPExItem[];
  universities: University[];
  isEditMode: boolean;
  onSelectItem: (item: EdPExItem) => void;
  onEditItem?: (item: EdPExItem) => void;
  onDeleteItem?: (resultId: string) => void;
  onDeleteAllItems?: () => void;
  onAddNewItem?: () => void;
  onOpenImportModal?: (tab?: 'upload' | 'ai' | 'guide') => void;
  onSeedDefault?: () => void;
}

interface CategoryStatsItem {
  total: number;
  recorded: number;
  achieved: number;
  missed: number;
  pending: number;
}

interface CategoryMeta {
  id: string;
  name: string;
  shortName: string;
  color: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  accentColor: string;
  icon: React.ReactNode;
}

const CATEGORY_META: Record<string, CategoryMeta> = {
  '7.1': {
    id: '7.1',
    name: 'ผลลัพธ์ด้านการเรียนรู้ของผู้เรียน และด้านกระบวนการ',
    shortName: 'การเรียนรู้และกระบวนการ',
    color: '#2563eb',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    textColor: 'text-blue-600',
    accentColor: '#3b82f6',
    icon: <BarChart3 className="w-5 h-5 text-blue-600" />
  },
  '7.2': {
    id: '7.2',
    name: 'ผลลัพธ์ด้านลูกค้า',
    shortName: 'ด้านลูกค้าและผู้เรียน',
    color: '#6366f1',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200',
    textColor: 'text-indigo-600',
    accentColor: '#818cf8',
    icon: <Users className="w-5 h-5 text-indigo-600" />
  },
  '7.3': {
    id: '7.3',
    name: 'ผลลัพธ์ด้านบุคลากร',
    shortName: 'ด้านบุคลากร',
    color: '#059669',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    textColor: 'text-emerald-600',
    accentColor: '#10b981',
    icon: <Users className="w-5 h-5 text-emerald-600" />
  },
  '7.4': {
    id: '7.4',
    name: 'ผลลัพธ์ด้านการนำองค์กรและการกำกับดูแลองค์กร',
    shortName: 'การนำองค์กรและธรรมาภิบาล',
    color: '#7c3aed',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    textColor: 'text-purple-600',
    accentColor: '#8b5cf6',
    icon: <ShieldCheck className="w-5 h-5 text-purple-600" />
  },
  '7.5': {
    id: '7.5',
    name: 'ผลลัพธ์ด้านงบประมาณ การเงิน การตลาด และกลยุทธ์',
    shortName: 'งบประมาณ การเงิน และกลยุทธ์',
    color: '#d97706',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    textColor: 'text-amber-600',
    accentColor: '#f59e0b',
    icon: <TrendingUp className="w-5 h-5 text-amber-600" />
  }
};

type StatusFilter = 'all' | 'recorded' | 'achieved' | 'missed' | 'pending';

export default function DashboardView({
  items,
  universities,
  isEditMode,
  onSelectItem,
  onEditItem,
  onDeleteItem,
  onDeleteAllItems,
  onAddNewItem,
  onOpenImportModal,
  onSeedDefault
}: DashboardViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dashboardSearch, setDashboardSearch] = useState<string>('');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // Helper to extract indicator evaluation stats
  const getIndicatorStatus = (item: EdPExItem) => {
    const records = item.data?.records || [];
    const validRecords = records.filter(r => r.actual !== undefined && r.actual !== '' && r.actual !== null);
    
    if (validRecords.length === 0) {
      return {
        status: 'pending' as const,
        label: 'ยังไม่มีข้อมูล',
        latestRecord: null,
        achieved: null,
        diff: null
      };
    }

    // Sort to find latest year
    const sorted = [...validRecords].sort((a, b) => a.year.localeCompare(b.year, undefined, { numeric: true }));
    const latest = sorted[sorted.length - 1];
    const actualNum = parseFloat(String(latest.actual ?? ''));
    const targetNum = latest.target !== undefined && latest.target !== '' ? parseFloat(String(latest.target)) : NaN;

    if (!isNaN(actualNum) && !isNaN(targetNum)) {
      const isAchieved = actualNum >= targetNum;
      const diffVal = actualNum - targetNum;
      return {
        status: isAchieved ? ('achieved' as const) : ('missed' as const),
        label: isAchieved ? 'บรรลุเป้าหมาย' : 'ต่ำกว่าเป้าหมาย',
        latestRecord: latest,
        achieved: isAchieved,
        diff: diffVal
      };
    }

    return {
      status: 'recorded' as const,
      label: 'บันทึกข้อมูลแล้ว',
      latestRecord: latest,
      achieved: null,
      diff: null
    };
  };

  // Group items by category (7.1, 7.2, 7.3, 7.4, 7.5)
  const categoryStats = useMemo(() => {
    const stats: Record<string, { total: number; recorded: number; achieved: number; missed: number; pending: number }> = {};
    const groupIds = ['7.1', '7.2', '7.3', '7.4', '7.5'];

    groupIds.forEach(gid => {
      stats[gid] = { total: 0, recorded: 0, achieved: 0, missed: 0, pending: 0 };
    });

    items.forEach(item => {
      const gid = item.group_id;
      if (!stats[gid]) {
        stats[gid] = { total: 0, recorded: 0, achieved: 0, missed: 0, pending: 0 };
      }
      stats[gid].total += 1;

      const evalResult = getIndicatorStatus(item);
      if (evalResult.status === 'pending') {
        stats[gid].pending += 1;
      } else {
        stats[gid].recorded += 1;
        if (evalResult.status === 'achieved') stats[gid].achieved += 1;
        if (evalResult.status === 'missed') stats[gid].missed += 1;
      }
    });

    return stats;
  }, [items]);

  // Total summary across all indicators
  const totalStats = useMemo(() => {
    let total = 0;
    let recorded = 0;
    let achieved = 0;
    let missed = 0;
    let pending = 0;

    (Object.values(categoryStats) as CategoryStatsItem[]).forEach((s: CategoryStatsItem) => {
      total += s.total;
      recorded += s.recorded;
      achieved += s.achieved;
      missed += s.missed;
      pending += s.pending;
    });

    const completionRate = total > 0 ? Math.round((recorded / total) * 100) : 0;
    const achievementRate = recorded > 0 ? Math.round((achieved / recorded) * 100) : 0;

    return { total, recorded, achieved, missed, pending, completionRate, achievementRate };
  }, [categoryStats]);

  // Filtered items
  const filteredCategoryGroups = useMemo(() => {
    const groupIds = ['7.1', '7.2', '7.3', '7.4', '7.5'];
    const searchLower = dashboardSearch.toLowerCase().trim();

    return groupIds
      .filter(gid => selectedCategory === 'all' || selectedCategory === gid)
      .map(gid => {
        const catMeta = CATEGORY_META[gid] || {
          id: gid,
          name: `หมวด ${gid}`,
          shortName: `หมวด ${gid}`,
          color: '#64748b',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200',
          textColor: 'text-gray-700',
          accentColor: '#94a3b8',
          icon: <FileText className="w-5 h-5 text-gray-500" />
        };

        const catItems = items.filter(item => item.group_id === gid);

        const filtered = catItems.filter(item => {
          // Status filter
          const evalRes = getIndicatorStatus(item);
          if (statusFilter === 'recorded' && evalRes.status === 'pending') return false;
          if (statusFilter === 'pending' && evalRes.status !== 'pending') return false;
          if (statusFilter === 'achieved' && evalRes.status !== 'achieved') return false;
          if (statusFilter === 'missed' && evalRes.status !== 'missed') return false;

          // Search filter
          if (searchLower) {
            const matches = 
              item.result_title.toLowerCase().includes(searchLower) ||
              item.index.toLowerCase().includes(searchLower) ||
              item.sub_group_title.toLowerCase().includes(searchLower) ||
              item.sub_sub_group_title.toLowerCase().includes(searchLower);
            if (!matches) return false;
          }

          return true;
        });

        // Group into subcategories
        const subGroupMap: Record<string, { title: string; items: EdPExItem[] }> = {};
        filtered.forEach(it => {
          const char = it.sub_group_char || 'ก';
          if (!subGroupMap[char]) {
            subGroupMap[char] = {
              title: it.sub_group_title || `หมวดย่อย ${char}`,
              items: []
            };
          }
          subGroupMap[char].items.push(it);
        });

        return {
          meta: catMeta,
          stats: categoryStats[gid] || { total: 0, recorded: 0, achieved: 0, missed: 0, pending: 0 },
          items: filtered,
          totalInCat: catItems.length,
          subGroups: Object.entries(subGroupMap).sort(([a], [b]) => a.localeCompare(b, 'th'))
        };
      })
      .filter(group => selectedCategory === 'all' ? true : group.meta.id === selectedCategory);
  }, [items, selectedCategory, statusFilter, dashboardSearch, categoryStats]);

  const toggleCategoryCollapse = (catId: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  return (
    <div className="space-y-8">
      {/* 1. Header Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* Total */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">ตัวชี้วัดทั้งหมด</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <FileText className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-gray-900 tracking-tight">
              {totalStats.total}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              ครอบคลุม 5 หมวดหลัก (7.1 - 7.5)
            </p>
          </div>
        </div>

        {/* Recorded with Data */}
        <div 
          onClick={() => setStatusFilter(statusFilter === 'recorded' ? 'all' : 'recorded')}
          className={`bg-white p-5 rounded-2xl border transition-all cursor-pointer shadow-sm flex flex-col justify-between ${
            statusFilter === 'recorded' ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-gray-200/80 hover:border-blue-300'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">บันทึกข้อมูลแล้ว</span>
            <div className="p-2 bg-blue-100/60 text-blue-700 rounded-xl">
              <BarChart3 className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-blue-700 tracking-tight">{totalStats.recorded}</span>
              <span className="text-xs font-semibold text-blue-500">({totalStats.completionRate}%)</span>
            </div>
            <div className="w-full bg-blue-100 rounded-full h-1.5 mt-2 overflow-hidden">
              <div 
                className="bg-blue-600 h-1.5 rounded-full transition-all duration-500" 
                style={{ width: `${totalStats.completionRate}%` }} 
              />
            </div>
          </div>
        </div>

        {/* Target Achieved */}
        <div 
          onClick={() => setStatusFilter(statusFilter === 'achieved' ? 'all' : 'achieved')}
          className={`bg-white p-5 rounded-2xl border transition-all cursor-pointer shadow-sm flex flex-col justify-between ${
            statusFilter === 'achieved' ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-gray-200/80 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">บรรลุเป้าหมาย</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-emerald-700 tracking-tight">{totalStats.achieved}</span>
              <span className="text-xs font-semibold text-emerald-600">
                {totalStats.recorded > 0 ? `(${totalStats.achievementRate}%)` : '-'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              ผลดำเนินงานเทียบเท่า/สูงกว่าเป้า
            </p>
          </div>
        </div>

        {/* Target Missed */}
        <div 
          onClick={() => setStatusFilter(statusFilter === 'missed' ? 'all' : 'missed')}
          className={`bg-white p-5 rounded-2xl border transition-all cursor-pointer shadow-sm flex flex-col justify-between ${
            statusFilter === 'missed' ? 'border-amber-500 ring-2 ring-amber-500/20' : 'border-gray-200/80 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">ยังไม่บรรลุเป้าหมาย</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <AlertCircle className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-amber-700 tracking-tight">
              {totalStats.missed}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              ผลการดำเนินงานต่ำกว่าเป้าหมาย
            </p>
          </div>
        </div>

        {/* Pending / No Data */}
        <div 
          onClick={() => setStatusFilter(statusFilter === 'pending' ? 'all' : 'pending')}
          className={`bg-white p-5 rounded-2xl border transition-all cursor-pointer shadow-sm col-span-2 md:col-span-1 flex flex-col justify-between ${
            statusFilter === 'pending' ? 'border-gray-500 ring-2 ring-gray-400/20' : 'border-gray-200/80 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">ยังไม่มีข้อมูล</span>
            <div className="p-2 bg-gray-100 text-gray-500 rounded-xl">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-gray-700 tracking-tight">
              {totalStats.pending}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              รอการบันทึกผลการดำเนินงาน
            </p>
          </div>
        </div>
      </div>

      {/* 2. Visual Category Summary Cards (หมวด 7.1 - 7.5 Bar Selector) */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
          <div>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              สรุปผลการดำเนินงานแยกตามหมวด (EdPEx Category Overview)
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              คลิกที่หมวดเพื่อกรองดูตัวชี้วัดเฉพาะหมวดนั้น หรือเลือกดูทั้งหมด
            </p>
          </div>

          {selectedCategory !== 'all' && (
            <button
              onClick={() => setSelectedCategory('all')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 self-start"
            >
              แสดงทุกหมวด
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {Object.entries(CATEGORY_META).map(([gid, meta]) => {
            const stats = categoryStats[gid] || { total: 0, recorded: 0, achieved: 0, missed: 0, pending: 0 };
            const percentRecorded = stats.total > 0 ? Math.round((stats.recorded / stats.total) * 100) : 0;
            const isSelected = selectedCategory === gid;

            return (
              <button
                key={gid}
                onClick={() => setSelectedCategory(isSelected ? 'all' : gid)}
                className={`text-left p-4 rounded-xl border transition-all relative overflow-hidden group ${
                  isSelected 
                    ? `${meta.bgColor} ${meta.borderColor} ring-2 ring-blue-500/30 shadow-md` 
                    : 'bg-gray-50/60 border-gray-200 hover:bg-white hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-extrabold px-2 py-0.5 rounded-md ${meta.bgColor} ${meta.textColor} border ${meta.borderColor}`}>
                    หมวด {gid}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-bold text-gray-700">{stats.recorded}</span>
                    <span className="text-[10px] text-gray-400">/{stats.total}</span>
                  </div>
                </div>

                <h4 className="text-xs font-bold text-gray-900 line-clamp-1 mb-2 group-hover:text-blue-600 transition-colors">
                  {meta.shortName}
                </h4>

                {/* Mini progress bar */}
                <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="h-1.5 rounded-full transition-all duration-500"
                    style={{ 
                      width: `${percentRecorded}%`,
                      backgroundColor: meta.color
                    }}
                  />
                </div>

                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100/80 text-[10px] text-gray-500">
                  <span>บันทึกแล้ว {percentRecorded}%</span>
                  {stats.achieved > 0 && (
                    <span className="text-emerald-600 font-bold flex items-center gap-0.5">
                      <CheckCircle2 className="w-3 h-3" /> {stats.achieved} ผ่าน
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Filter Bar & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 lg:pb-0 scrollbar-none">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              selectedCategory === 'all'
                ? 'bg-gray-900 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            ทุกหมวด ({totalStats.total})
          </button>
          {Object.entries(CATEGORY_META).map(([gid, meta]) => {
            const count = categoryStats[gid]?.total || 0;
            const isSelected = selectedCategory === gid;
            return (
              <button
                key={gid}
                onClick={() => setSelectedCategory(gid)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  isSelected
                    ? `${meta.bgColor} ${meta.textColor} border ${meta.borderColor} shadow-sm ring-1 ring-blue-500/20`
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span>หมวด {gid}</span>
                <span className="text-[10px] opacity-75">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Search & Status Filters */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-medium text-gray-700 outline-none focus:border-blue-500 focus:bg-white transition-colors"
          >
            <option value="all">ทุกสถานะ ({items.length})</option>
            <option value="recorded">บันทึกข้อมูลแล้ว ({totalStats.recorded})</option>
            <option value="achieved">บรรลุเป้าหมาย 🎯 ({totalStats.achieved})</option>
            <option value="missed">ต่ำกว่าเป้าหมาย ⚠️ ({totalStats.missed})</option>
            <option value="pending">ยังไม่มีข้อมูล ⏳ ({totalStats.pending})</option>
          </select>

          {/* Quick Search */}
          <div className="relative min-w-[200px] flex-grow">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input 
              type="text" 
              placeholder="ค้นหาในแดชบอร์ด..." 
              value={dashboardSearch}
              onChange={(e) => setDashboardSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:bg-white focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Import CSV & AI Buttons */}
          {onOpenImportModal && (
            <>
              <button
                onClick={() => onOpenImportModal('ai')}
                className="flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap shadow-sm shadow-purple-600/20 active:scale-95"
                title="ใช้ AI แปลงข้อความเป็น CSV"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                AI แปลงข้อความเป็น CSV
              </button>
              <button
                onClick={() => onOpenImportModal('upload')}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap shadow-sm shadow-emerald-600/20"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                นำเข้า CSV
              </button>
            </>
          )}

          {/* Add Indicator Button (Admin) */}
          {isEditMode && onAddNewItem && (
            <button
              onClick={onAddNewItem}
              className="flex items-center gap-1.5 bg-blue-600 text-white px-3.5 py-2 rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors whitespace-nowrap shadow-sm shadow-blue-500/20"
            >
              <Plus className="w-3.5 h-3.5" />
              เพิ่มตัวชี้วัด
            </button>
          )}

          {/* Delete All Indicators Button */}
          {onDeleteAllItems && items.length > 0 && (
            <button
              onClick={onDeleteAllItems}
              className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap shadow-sm shadow-red-600/20 active:scale-95"
              title="ลบตัวชี้วัดทั้งหมดในระบบ"
            >
              <Trash2 className="w-3.5 h-3.5" />
              ลบตัวชี้วัดทั้งหมด ({items.length})
            </button>
          )}
        </div>

        {/* Edit Mode Notice Banner */}
        {isEditMode && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-4 text-amber-900 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-200/80 rounded-xl text-amber-900 shrink-0">
                <Edit2 className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-sm">กำลังเปิดใช้งานโหมดแก้ไข (Edit Mode)</p>
                <p className="text-xs text-amber-800 mt-0.5">
                  คุณสามารถคลิกปุ่มถังขยะ <Trash2 className="w-3.5 h-3.5 inline text-red-600 mx-0.5" /> ที่การ์ดตัวชี้วัดเพื่อลบรายการ หรือคลิกไอคอนดินสอ <Edit2 className="w-3.5 h-3.5 inline text-blue-600 mx-0.5" /> เพื่อแก้ไขรหัสและชื่อตัวชี้วัด
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {onAddNewItem && (
                <button
                  onClick={onAddNewItem}
                  className="hidden sm:flex items-center gap-1.5 bg-blue-600 text-white px-3.5 py-2 rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm shadow-blue-500/20"
                >
                  <Plus className="w-3.5 h-3.5" />
                  เพิ่มตัวชี้วัดใหม่
                </button>
              )}
              {onDeleteAllItems && items.length > 0 && (
                <button
                  onClick={onDeleteAllItems}
                  className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm shadow-red-600/20 active:scale-95"
                  title="ลบตัวชี้วัดทั้งหมดในระบบ"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  ลบทั้งหมด ({items.length})
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 4. Indicators Grouped by Category Sections */}
      <div className="space-y-10">
        {filteredCategoryGroups.map(({ meta, stats, items: catItems, totalInCat, subGroups }) => {
          const isCollapsed = collapsedCategories.has(meta.id);
          const completionPercent = totalInCat > 0 ? Math.round((stats.recorded / totalInCat) * 100) : 0;

          return (
            <section 
              key={meta.id} 
              className="bg-white rounded-3xl border border-gray-200/90 shadow-sm overflow-hidden transition-all"
            >
              {/* Category Section Header */}
              <div className="p-6 bg-gradient-to-r from-gray-50 via-white to-gray-50/50 border-b border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-2xl ${meta.bgColor} border ${meta.borderColor} mt-0.5 shadow-sm`}>
                    {meta.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-xs font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full ${meta.bgColor} ${meta.textColor} border ${meta.borderColor}`}>
                        หมวด {meta.id}
                      </span>
                      <span className="text-xs font-semibold text-gray-500">
                        แสดง {catItems.length} จากทั้งหมด {totalInCat} รายการ
                      </span>
                      <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                        บันทึกแล้ว {completionPercent}%
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 leading-snug">
                      {meta.name}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end md:self-center">
                  {/* Category mini summary metrics */}
                  <div className="hidden sm:flex items-center gap-2 bg-gray-100/80 px-3 py-1.5 rounded-xl text-xs font-medium text-gray-600">
                    <span className="flex items-center gap-1 text-emerald-600 font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {stats.achieved} บรรลุ
                    </span>
                    <span className="text-gray-300">•</span>
                    <span className="flex items-center gap-1 text-amber-600 font-bold">
                      <AlertCircle className="w-3.5 h-3.5" /> {stats.missed} ต่ำกว่าเป้า
                    </span>
                    <span className="text-gray-300">•</span>
                    <span className="text-gray-500">
                      {stats.pending} รอข้อมูล
                    </span>
                  </div>

                  {/* Collapse Toggle */}
                  <button
                    onClick={() => toggleCategoryCollapse(meta.id)}
                    className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-400 hover:text-gray-600"
                    title={isCollapsed ? 'ขยายหมวด' : 'ย่อหมวด'}
                  >
                    {isCollapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronDown className="w-5 h-5 rotate-180" />}
                  </button>
                </div>
              </div>

              {/* Category Body */}
              <AnimatePresence>
                {!isCollapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="p-6 overflow-hidden"
                  >
                    {catItems.length === 0 ? (
                      <div className="text-center py-12 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                        <Search className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm font-bold text-gray-700">ไม่พบตัวชี้วัดในเงื่อนไขการค้นหานี้</p>
                        <p className="text-xs text-gray-400 mt-1">ลองเปลี่ยนตัวกรองสถานะหรือคำค้นหา</p>
                      </div>
                    ) : (
                      <div className="space-y-8">
                        {subGroups.map(([char, subGroup]) => (
                          <div key={char} className="space-y-4">
                            {/* Subgroup Header */}
                            <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                              <span className="w-6 h-6 rounded-full bg-blue-100/70 text-blue-700 font-bold text-xs flex items-center justify-center">
                                {char}
                              </span>
                              <h4 className="text-sm font-bold text-gray-800">
                                {subGroup.title}
                              </h4>
                              <span className="text-xs text-gray-400 font-medium">
                                ({subGroup.items.length} รายการ)
                              </span>
                            </div>

                            {/* Indicator Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                              {subGroup.items.map((item) => (
                                <IndicatorDashboardCard
                                  key={item.result_id}
                                  item={item}
                                  categoryMeta={meta}
                                  universities={universities}
                                  isEditMode={isEditMode}
                                  onSelect={() => onSelectItem(item)}
                                  onEdit={() => onEditItem?.(item)}
                                  onDelete={() => onDeleteItem?.(item.result_id)}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          );
        })}

        {items.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-gray-300 p-8 max-w-xl mx-auto shadow-sm">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4">
              <FileSpreadsheet className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">ยังไม่มีข้อมูลตัวชี้วัดในระบบ</h3>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">
              คุณสามารถนำเข้าข้อมูลเป็นชุดผ่านไฟล์ CSV, ให้ AI ช่วยแปลงข้อความเป็น CSV หรือโหลดข้อมูลตัวอย่างเริ่มต้น EdPEx หมวด 7
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
              {onOpenImportModal && (
                <>
                  <button
                    onClick={() => onOpenImportModal('ai')}
                    className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm shadow-purple-600/20 active:scale-95"
                  >
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    AI แปลงข้อความเป็น CSV
                  </button>
                  <button
                    onClick={() => onOpenImportModal('upload')}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-colors shadow-sm shadow-emerald-600/20 active:scale-95"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    นำเข้าไฟล์ CSV
                  </button>
                </>
              )}
              {onAddNewItem && (
                <button
                  onClick={onAddNewItem}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-colors shadow-sm shadow-blue-500/20 active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  เพิ่มตัวชี้วัดใหม่
                </button>
              )}
              {onSeedDefault && (
                <button
                  onClick={onSeedDefault}
                  className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors border border-gray-300 active:scale-95"
                >
                  <RefreshCw className="w-4 h-4" />
                  โหลดตัวชี้วัดเริ่มต้น (Default Data)
                </button>
              )}
            </div>
          </div>
        ) : filteredCategoryGroups.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-300 p-8">
            <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-900">ไม่พบข้อมูลตัวชี้วัดตามตัวกรอง</h3>
            <p className="text-sm text-gray-500 mt-1">
              ลองปรับตัวกรองหมวดหมู่ สถานะ หรือล้างคำค้นหา
            </p>
            <button
              onClick={() => {
                setSelectedCategory('all');
                setStatusFilter('all');
                setDashboardSearch('');
              }}
              className="mt-5 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20"
            >
              ล้างตัวกรองทั้งหมด
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Indicator Dashboard Card Component
// -------------------------------------------------------------
interface IndicatorDashboardCardProps {
  key?: React.Key;
  item: EdPExItem;
  categoryMeta: CategoryMeta;
  universities: University[];
  isEditMode: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function IndicatorDashboardCard({
  item,
  categoryMeta,
  universities,
  isEditMode,
  onSelect,
  onEdit,
  onDelete
}: IndicatorDashboardCardProps) {
  const records = item.data?.records || [];
  const unit = item.data?.unit || '';
  const comparisonUniversities = item.data?.comparisonUniversities || [];
  const buuicColor = universities.find(u => u.id === 'buuic')?.color || '#2563eb';
  const mainColor = item.data?.mainColor || buuicColor;
  const targetColor = item.data?.targetColor || '#93c5fd';

  // Filter records that have actual values
  const validRecords = useMemo(() => {
    return records
      .filter(r => r.actual !== undefined && r.actual !== '' && r.actual !== null)
      .sort((a, b) => a.year.localeCompare(b.year, undefined, { numeric: true }));
  }, [records]);

  const hasData = validRecords.length > 0;
  const latestRecord = hasData ? validRecords[validRecords.length - 1] : null;

  // Actual vs Target calculation
  const actualNum = latestRecord ? parseFloat(String(latestRecord.actual ?? '')) : NaN;
  const targetNum = latestRecord && latestRecord.target !== undefined && latestRecord.target !== '' ? parseFloat(String(latestRecord.target)) : NaN;
  const hasTarget = !isNaN(targetNum);
  const isAchieved = hasTarget && !isNaN(actualNum) && actualNum >= targetNum;
  const diff = hasTarget && !isNaN(actualNum) ? actualNum - targetNum : null;

  // Mini chart data format (take latest 4-5 years)
  const chartData = useMemo(() => {
    if (!hasData) return [];
    return validRecords.slice(-5).map(r => ({
      name: r.year,
      actual: typeof r.actual === 'number' ? r.actual : parseFloat(String(r.actual)) || 0,
      target: r.target !== undefined && r.target !== '' ? (typeof r.target === 'number' ? r.target : parseFloat(String(r.target)) || 0) : null
    }));
  }, [validRecords, hasData]);

  return (
    <div 
      onClick={() => {
        if (!isEditMode) onSelect();
      }}
      className={`bg-white rounded-2xl border border-gray-200/90 p-5 flex flex-col justify-between hover:shadow-lg hover:border-blue-400 transition-all duration-200 group relative ${
        isEditMode ? '' : 'cursor-pointer'
      }`}
    >
      <div>
        {/* Top Badges */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-md ${categoryMeta.bgColor} ${categoryMeta.textColor} border ${categoryMeta.borderColor}`}>
              {item.index}
            </span>
            {item.sub_sub_group_title && item.sub_sub_group_title !== '-' && item.sub_sub_group_title !== 'NULL' && (
              <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded line-clamp-1 max-w-[140px]">
                {item.sub_sub_group_title}
              </span>
            )}
          </div>

          {/* Status Badge */}
          {hasData ? (
            hasTarget ? (
              isAchieved ? (
                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  บรรลุเป้าหมาย
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                  <AlertCircle className="w-3 h-3 text-amber-600" />
                  ต่ำกว่าเป้าหมาย
                </span>
              )
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                <BarChart3 className="w-3 h-3 text-blue-600" />
                มีข้อมูล
              </span>
            )
          ) : (
            <span className="flex items-center gap-1 text-[10px] font-bold text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full whitespace-nowrap">
              <Clock className="w-3 h-3 text-gray-400" />
              รอข้อมูล
            </span>
          )}
        </div>

        {/* Indicator Title */}
        <h4 className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2 leading-snug mb-3">
          {item.result_title === '-' ? 'ไม่มีชื่อตัวชี้วัด' : item.result_title}
        </h4>

        {/* Data Highlights / Mini Chart */}
        {hasData && latestRecord ? (
          <div className="bg-gray-50/80 rounded-xl p-3 border border-gray-100 mb-3 space-y-2">
            <div className="flex items-end justify-between">
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                  ผลล่าสุด (ปี {latestRecord.year})
                </span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-xl font-black text-gray-900 tracking-tight">
                    {latestRecord.actual}
                  </span>
                  {unit && <span className="text-xs font-semibold text-gray-500">{unit}</span>}
                </div>
              </div>

              {hasTarget && (
                <div className="text-right">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                    เป้าหมาย
                  </span>
                  <div className="text-xs font-bold text-gray-600 mt-0.5">
                    {latestRecord.target} {unit}
                  </div>
                </div>
              )}
            </div>

            {/* Target Diff indicator */}
            {hasTarget && diff !== null && (
              <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-gray-200/60 font-semibold">
                <span className="text-gray-500">ผลต่างจากเป้าหมาย:</span>
                <span className={diff >= 0 ? 'text-emerald-600 flex items-center' : 'text-amber-600 flex items-center'}>
                  {diff >= 0 ? <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" /> : <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />}
                  {diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2)} {unit}
                </span>
              </div>
            )}

            {/* Mini Trend Sparkline / Chart */}
            {chartData.length > 1 && (
              <div className="h-16 w-full pt-1">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                    <XAxis dataKey="name" hide />
                    <YAxis hide domain={['auto', 'auto']} />
                    <Tooltip 
                      contentStyle={{ fontSize: '11px', borderRadius: '8px', padding: '4px 8px' }}
                      formatter={(val: any, name: string) => [
                        `${val} ${unit}`,
                        name === 'actual' ? 'ผลดำเนินงาน' : 'เป้าหมาย'
                      ]}
                      labelFormatter={(label) => `ปี ${label}`}
                    />
                    <Bar dataKey="actual" fill={mainColor} radius={[2, 2, 0, 0]} barSize={16} />
                    {hasTarget && (
                      <Line 
                        type="monotone" 
                        dataKey="target" 
                        stroke={targetColor} 
                        strokeWidth={2} 
                        dot={{ r: 2 }} 
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-gray-50/60 rounded-xl p-4 border border-dashed border-gray-200 mb-3 text-center">
            <span className="text-xs text-gray-400 block mb-2">ยังไม่มีการบันทึกข้อมูลผลลัพธ์</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect();
              }}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 px-3 py-1 rounded-lg transition-colors inline-flex items-center gap-1 shadow-2xl"
            >
              <Plus className="w-3 h-3" /> กรอกข้อมูล
            </button>
          </div>
        )}

        {/* Comparison Universities Badge */}
        {comparisonUniversities.length > 0 && (
          <div className="flex items-center gap-1.5 text-[10px] text-gray-500 mb-2 font-medium">
            <Building2 className="w-3.5 h-3.5 text-gray-400" />
            <span>เทียบกับ:</span>
            <div className="flex items-center gap-1 flex-wrap">
              {comparisonUniversities.slice(0, 3).map(u => (
                <span key={u.id} className="bg-gray-100 text-gray-700 font-bold px-1.5 py-0.2 rounded text-[9px]">
                  {u.abbreviation}
                </span>
              ))}
              {comparisonUniversities.length > 3 && (
                <span className="text-gray-400 text-[9px]">+{comparisonUniversities.length - 3}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="pt-3 border-t border-gray-100 flex items-center justify-between mt-auto">
        <span className="text-[11px] font-medium text-gray-400">
          {unit ? `หน่วย: ${unit}` : 'ไม่มีระบุหน่วย'}
        </span>

        {isEditMode ? (
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200 bg-white shadow-xs"
              title="แก้ไขตัวชี้วัด"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors border border-red-200 bg-white shadow-xs"
              title="ลบตัวชี้วัดนี้"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="opacity-70 hover:opacity-100 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all border border-transparent hover:border-red-200"
                title="ลบตัวชี้วัดนี้"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            {onEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="opacity-70 hover:opacity-100 p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all border border-transparent hover:border-blue-200"
                title="แก้ไขตัวชี้วัด"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onSelect}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:translate-x-0.5 transition-transform flex items-center gap-0.5 ml-1"
            >
              ดูกราฟ <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
