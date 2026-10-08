import React, { useState, useMemo, useEffect } from 'react';
import { 
  X, 
  Upload, 
  FileSpreadsheet, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  Info, 
  RefreshCw, 
  HelpCircle, 
  FileText, 
  Check, 
  Copy,
  Table,
  Building2,
  Trash2,
  Sparkles,
  Layers,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { EdPExItem, University, YearlyData, ComparisonUniversityData } from '../types';
import AiTextToCsvPanel from './AiTextToCsvPanel';

export interface UnifiedImportPayload {
  index: string;
  result_title?: string;
  group_id?: string;
  sub_group_char?: string;
  sub_sub_group_num?: string;
  unit?: string;
  records: YearlyData[];
  comparisonUniversities?: ComparisonUniversityData[];
}

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: EdPExItem[];
  universities: University[];
  onImportRecords: (updates: { itemId: string; updatedItem: EdPExItem }[]) => Promise<void>;
  onImportNewIndicators?: (newItems: Partial<EdPExItem>[]) => Promise<void>;
  onImportUnified?: (payloads: UnifiedImportPayload[]) => Promise<void>;
  onDeleteAllItems?: () => void;
  logAction: (action: string, details: string) => Promise<void>;
  initialTab?: 'upload' | 'ai' | 'guide';
}

type ImportType = 'universal' | 'data' | 'structure';
type ModalTab = 'upload' | 'ai' | 'guide';

interface ParsedUniversalItem {
  index: string;
  result_title: string;
  group_id?: string;
  sub_group_char?: string;
  sub_sub_group_num?: string;
  unit?: string;
  records: YearlyData[];
  comparisonUniversities: ComparisonUniversityData[];
  isNew: boolean;
  matchedItem?: EdPExItem;
  isValid: boolean;
  validationError?: string;
}

interface ParsedDataRow {
  index: string;
  year: string;
  actual: string;
  target?: string;
  unit?: string;
  matchedItem?: EdPExItem;
  universityValues: Record<string, string>;
  isValid: boolean;
  validationError?: string;
}

interface ParsedStructureRow {
  group_id: string;
  sub_group_char: string;
  sub_sub_group_num: string;
  index: string;
  result_title: string;
  unit?: string;
  isValid: boolean;
  validationError?: string;
}

export default function CsvImportModal({
  isOpen,
  onClose,
  items,
  universities,
  onImportRecords,
  onImportNewIndicators,
  onImportUnified,
  onDeleteAllItems,
  logAction,
  initialTab = 'upload'
}: CsvImportModalProps) {
  const [activeTab, setActiveTab] = useState<ModalTab>(initialTab);
  const [importType, setImportType] = useState<ImportType>('universal');
  const [csvText, setCsvText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [copiedTemplate, setCopiedTemplate] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Map of existing indicators by index (case-insensitive)
  const itemMapByIndex = useMemo(() => {
    const map = new Map<string, EdPExItem>();
    items.forEach(item => {
      if (item.index) {
        map.set(item.index.trim().toLowerCase(), item);
      }
    });
    return map;
  }, [items]);

  // Clean CSV text & split into rows and cells
  const parseRawCSV = (text: string) => {
    const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = clean.split('\n').filter(l => l.trim() !== '');
    if (lines.length < 2) return { headers: [], rows: [] };

    const firstLine = lines[0];
    let delimiter = ',';
    if (firstLine.includes('\t')) delimiter = '\t';
    else if (firstLine.includes(';') && !firstLine.includes(',')) delimiter = ';';

    const parseLine = (line: string): string[] => {
      if (delimiter === ',') {
        const matches = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        return matches.map(m => m.replace(/^"|"$/g, '').trim());
      }
      return line.split(delimiter).map(m => m.replace(/^"|"$/g, '').trim());
    };

    const headers = parseLine(lines[0]).map(h => h.trim());
    const rows = lines.slice(1).map(l => parseLine(l));
    return { headers, rows };
  };

  // Helper to parse index into group hierarchy
  const parseIndexHierarchy = (index: string) => {
    const clean = index.trim();
    const match = clean.match(/^([0-9]+\.[0-9]+)\s*([ก-ฮa-zA-Z]?)\s*(?:\(?([0-9]+)\)?)?/);
    if (match) {
      return {
        group_id: match[1] || '7.1',
        sub_group_char: match[2] || 'ก',
        sub_sub_group_num: match[3] || '1'
      };
    }
    return { group_id: '7.1', sub_group_char: 'ก', sub_sub_group_num: '1' };
  };

  // 1. Parsed results for 'universal' mode (handles wide format & tall format, creates new indicators or updates existing)
  const parsedUniversalItems: ParsedUniversalItem[] = useMemo(() => {
    if (importType !== 'universal' || !csvText.trim()) return [];
    const { headers, rows } = parseRawCSV(csvText);
    if (headers.length === 0 || rows.length === 0) return [];

    const lowerHeaders = headers.map(h => h.toLowerCase());

    const indexIdx = lowerHeaders.findIndex(h => h === 'index' || h === 'รหัส' || h === 'รหัสตัวชี้วัด' || h === 'code');
    const titleIdx = lowerHeaders.findIndex(h => h.includes('result_title') || h.includes('title') || h.includes('ชื่อ') || h === 'name' || h === 'ตัวชี้วัด');
    const unitIdx = lowerHeaders.findIndex(h => h === 'unit' || h === 'หน่วย' || h === 'หน่วยนับ');
    const targetIdx = lowerHeaders.findIndex(h => h === 'target' || h === 'เป้าหมาย' || h === 'เป้า');
    const groupIdx = lowerHeaders.findIndex(h => h === 'group_id' || h === 'group' || h === 'หมวด');

    // Detect Year Columns for wide format (e.g. 2564, 2565, 2566, 2567, 2568, 2023, 2024...)
    const yearCols: { header: string; year: string; index: number }[] = [];
    headers.forEach((h, idx) => {
      const trimmed = h.trim();
      const match = trimmed.match(/(?:ปี\s*)?(\d{4})/);
      if (match) {
        const yNum = parseInt(match[1]);
        if ((yNum >= 2500 && yNum <= 2600) || (yNum >= 2000 && yNum <= 2100)) {
          yearCols.push({ header: trimmed, year: match[1], index: idx });
        }
      }
    });

    const isWideFormat = yearCols.length > 0;

    // Detect comparison university columns
    const universityHeaders: { abbr: string; index: number; univ: University }[] = [];
    headers.forEach((h, idx) => {
      const matchedUniv = universities.find(u => 
        u.abbreviation.toLowerCase() === h.toLowerCase() || 
        u.id.toLowerCase() === h.toLowerCase()
      );
      if (matchedUniv && !matchedUniv.isDefault) {
        universityHeaders.push({ abbr: matchedUniv.abbreviation, index: idx, univ: matchedUniv });
      }
    });

    if (isWideFormat) {
      // WIDE FORMAT: Each row is an indicator, columns are years
      return rows.map((cols, rowIdx) => {
        const indexVal = (indexIdx >= 0 ? cols[indexIdx] : cols[0]) || '';
        const titleVal = titleIdx >= 0 ? cols[titleIdx] : '';
        const unitVal = unitIdx >= 0 ? cols[unitIdx] : undefined;
        const targetVal = targetIdx >= 0 ? cols[targetIdx] : undefined;
        const groupVal = groupIdx >= 0 ? cols[groupIdx] : undefined;

        const matchedItem = itemMapByIndex.get(indexVal.trim().toLowerCase());
        const isNew = !matchedItem;

        const records: YearlyData[] = [];
        yearCols.forEach(yc => {
          const rawVal = cols[yc.index];
          if (rawVal !== undefined && rawVal !== '' && rawVal !== '-') {
            const num = parseFloat(rawVal.replace(/,/g, ''));
            const actualVal = isNaN(num) ? rawVal : num;
            
            const rec: YearlyData = {
              year: yc.year,
              actual: actualVal
            };
            if (targetVal !== undefined && targetVal !== '' && targetVal !== '-') {
              const targetNum = parseFloat(targetVal.replace(/,/g, ''));
              rec.target = isNaN(targetNum) ? targetVal : targetNum;
            }
            records.push(rec);
          }
        });

        // Comparison Universities
        const compList: ComparisonUniversityData[] = [];
        universityHeaders.forEach(uh => {
          const valStr = cols[uh.index];
          if (valStr && valStr !== '' && valStr !== '-') {
            const num = parseFloat(valStr.replace(/,/g, ''));
            const compVal = isNaN(num) ? valStr : num;
            const targetYear = records.length > 0 ? records[records.length - 1].year : '2567';
            compList.push({
              id: uh.univ.id,
              name: uh.univ.name,
              abbreviation: uh.univ.abbreviation,
              color: uh.univ.color,
              records: [{ year: targetYear, actual: compVal }]
            });
          }
        });

        const hierarchy = parseIndexHierarchy(indexVal || `7.1ก(1)-${rowIdx + 1}`);

        let isValid = true;
        let validationError = '';
        if (!indexVal) {
          isValid = false;
          validationError = 'ไม่พบรหัสตัวชี้วัด';
        }

        return {
          index: indexVal,
          result_title: titleVal || matchedItem?.result_title || `ตัวชี้วัด ${indexVal}`,
          group_id: groupVal || hierarchy.group_id,
          sub_group_char: hierarchy.sub_group_char,
          sub_sub_group_num: hierarchy.sub_sub_group_num,
          unit: unitVal || matchedItem?.data?.unit || '',
          records,
          comparisonUniversities: compList,
          isNew,
          matchedItem,
          isValid,
          validationError
        };
      });
    } else {
      // TALL FORMAT: Multiple rows per indicator, each row has a 'year' and 'actual'
      const yearIdx = lowerHeaders.findIndex(h => h === 'year' || h === 'ปี' || h === 'ปีการศึกษา');
      const actualIdx = lowerHeaders.findIndex(h => h === 'actual' || h === 'ผลดำเนินงาน' || h === 'ผลการดำเนินงาน' || h === 'ผล' || h === 'value');

      const indicatorGroups = new Map<string, {
        title: string;
        unit?: string;
        group_id?: string;
        records: YearlyData[];
        comparison: ComparisonUniversityData[];
      }>();

      rows.forEach(cols => {
        const indexVal = (indexIdx >= 0 ? cols[indexIdx] : cols[0]) || '';
        if (!indexVal) return;

        const titleVal = titleIdx >= 0 ? cols[titleIdx] : '';
        const unitVal = unitIdx >= 0 ? cols[unitIdx] : undefined;
        const groupVal = groupIdx >= 0 ? cols[groupIdx] : undefined;
        const yearVal = (yearIdx >= 0 ? cols[yearIdx] : cols[1]) || '';
        const actualValStr = (actualIdx >= 0 ? cols[actualIdx] : cols[2]) || '';
        const targetValStr = targetIdx >= 0 ? cols[targetIdx] : undefined;

        const key = indexVal.trim().toLowerCase();
        let group = indicatorGroups.get(key);
        if (!group) {
          group = {
            title: titleVal,
            unit: unitVal,
            group_id: groupVal,
            records: [],
            comparison: []
          };
          indicatorGroups.set(key, group);
        }

        if (titleVal && !group.title) group.title = titleVal;
        if (unitVal && !group.unit) group.unit = unitVal;
        if (groupVal && !group.group_id) group.group_id = groupVal;

        if (yearVal && (actualValStr !== '' && actualValStr !== undefined)) {
          const num = parseFloat(actualValStr.replace(/,/g, ''));
          const actualVal = isNaN(num) ? actualValStr : num;
          const rec: YearlyData = {
            year: yearVal,
            actual: actualVal
          };
          if (targetValStr !== undefined && targetValStr !== '') {
            const tNum = parseFloat(targetValStr.replace(/,/g, ''));
            rec.target = isNaN(tNum) ? targetValStr : tNum;
          }
          group.records.push(rec);
        }

        universityHeaders.forEach(uh => {
          const valStr = cols[uh.index];
          if (valStr && valStr !== '' && valStr !== '-') {
            const num = parseFloat(valStr.replace(/,/g, ''));
            const compVal = isNaN(num) ? valStr : num;
            let existingComp = group!.comparison.find(c => c.abbreviation.toLowerCase() === uh.abbr.toLowerCase());
            if (!existingComp) {
              existingComp = {
                id: uh.univ.id,
                name: uh.univ.name,
                abbreviation: uh.univ.abbreviation,
                color: uh.univ.color,
                records: []
              };
              group!.comparison.push(existingComp);
            }
            if (yearVal) {
              existingComp.records.push({ year: yearVal, actual: compVal });
            }
          }
        });
      });

      return Array.from(indicatorGroups.entries()).map(([key, data]) => {
        const matchedItem = itemMapByIndex.get(key);
        const isNew = !matchedItem;
        const originalIndex = items.find(i => i.index.trim().toLowerCase() === key)?.index || key.toUpperCase();
        const hierarchy = parseIndexHierarchy(originalIndex);

        return {
          index: originalIndex,
          result_title: data.title || matchedItem?.result_title || `ตัวชี้วัด ${originalIndex}`,
          group_id: data.group_id || hierarchy.group_id,
          sub_group_char: hierarchy.sub_group_char,
          sub_sub_group_num: hierarchy.sub_sub_group_num,
          unit: data.unit || matchedItem?.data?.unit || '',
          records: data.records,
          comparisonUniversities: data.comparison,
          isNew,
          matchedItem,
          isValid: true
        };
      });
    }
  }, [csvText, importType, itemMapByIndex, items, universities]);

  // 2. Parsed results for legacy 'data' mode
  const parsedDataRows: ParsedDataRow[] = useMemo(() => {
    if (importType !== 'data' || !csvText.trim()) return [];
    const { headers, rows } = parseRawCSV(csvText);
    if (headers.length === 0) return [];

    const indexIdx = headers.findIndex(h => h.toLowerCase() === 'index' || h === 'รหัส' || h === 'รหัสตัวชี้วัด');
    const yearIdx = headers.findIndex(h => h.toLowerCase() === 'year' || h === 'ปี' || h === 'ปีการศึกษา');
    const actualIdx = headers.findIndex(h => h.toLowerCase() === 'actual' || h === 'ผลดำเนินงาน' || h === 'ผลการดำเนินงาน' || h === 'ผล' || h.toLowerCase() === 'value');
    const targetIdx = headers.findIndex(h => h.toLowerCase() === 'target' || h === 'เป้าหมาย' || h === 'เป้า');
    const unitIdx = headers.findIndex(h => h.toLowerCase() === 'unit' || h === 'หน่วย' || h === 'หน่วยนับ');

    const universityHeaders: { abbr: string; index: number; univ: University }[] = [];
    headers.forEach((h, idx) => {
      const matchedUniv = universities.find(u => 
        u.abbreviation.toLowerCase() === h.toLowerCase() || 
        u.id.toLowerCase() === h.toLowerCase()
      );
      if (matchedUniv && !matchedUniv.isDefault) {
        universityHeaders.push({ abbr: matchedUniv.abbreviation, index: idx, univ: matchedUniv });
      }
    });

    return rows.map(cols => {
      const indexVal = (indexIdx >= 0 ? cols[indexIdx] : cols[0]) || '';
      const yearVal = (yearIdx >= 0 ? cols[yearIdx] : cols[1]) || '';
      const actualVal = (actualIdx >= 0 ? cols[actualIdx] : cols[2]) || '';
      const targetVal = targetIdx >= 0 ? cols[targetIdx] : undefined;
      const unitVal = unitIdx >= 0 ? cols[unitIdx] : undefined;

      const universityValues: Record<string, string> = {};
      universityHeaders.forEach(uh => {
        if (cols[uh.index]) {
          universityValues[uh.abbr] = cols[uh.index];
        }
      });

      const matchedItem = itemMapByIndex.get(indexVal.trim().toLowerCase());
      let isValid = true;
      let validationError = '';

      if (!indexVal) {
        isValid = false;
        validationError = 'ไม่พบรหัสตัวชี้วัด (index)';
      } else if (!matchedItem) {
        isValid = false;
        validationError = `ไม่พบรหัส "${indexVal}" ในระบบ (เลือกโหมด "นำเข้าอัจฉริยะ" เพื่อให้สร้างอัตโนมัติ)`;
      } else if (!yearVal) {
        isValid = false;
        validationError = 'ไม่ได้ระบุปี (year)';
      } else if (!actualVal && actualVal !== '0') {
        isValid = false;
        validationError = 'ไม่ได้ระบุผลการดำเนินงาน (actual)';
      }

      return {
        index: indexVal,
        year: yearVal,
        actual: actualVal,
        target: targetVal,
        unit: unitVal,
        matchedItem,
        universityValues,
        isValid,
        validationError
      };
    });
  }, [csvText, importType, itemMapByIndex, universities]);

  // 3. Parsed results for 'structure' mode
  const parsedStructureRows: ParsedStructureRow[] = useMemo(() => {
    if (importType !== 'structure' || !csvText.trim()) return [];
    const { headers, rows } = parseRawCSV(csvText);
    if (headers.length === 0) return [];

    const groupIdx = headers.findIndex(h => h.toLowerCase().includes('group_id') || h === 'หมวด');
    const charIdx = headers.findIndex(h => h.toLowerCase().includes('sub_group_char') || h === 'หมวดย่อย');
    const numIdx = headers.findIndex(h => h.toLowerCase().includes('sub_sub_group_num') || h === 'หัวข้อย่อย');
    const indexIdx = headers.findIndex(h => h.toLowerCase() === 'index' || h === 'รหัส');
    const titleIdx = headers.findIndex(h => h.toLowerCase().includes('result_title') || h.toLowerCase().includes('title') || h === 'ชื่อตัวชี้วัด');
    const unitIdx = headers.findIndex(h => h.toLowerCase() === 'unit' || h === 'หน่วย');

    return rows.map((cols, rowIdx) => {
      const groupVal = (groupIdx >= 0 ? cols[groupIdx] : cols[0]) || '7.1';
      const charVal = (charIdx >= 0 ? cols[charIdx] : cols[1]) || 'ก';
      const numVal = (numIdx >= 0 ? cols[numIdx] : cols[2]) || '1';
      const indexVal = (indexIdx >= 0 ? cols[indexIdx] : cols[3]) || `${groupVal}${charVal}(${numVal})-${rowIdx + 1}`;
      const titleVal = (titleIdx >= 0 ? cols[titleIdx] : cols[4]) || '';
      const unitVal = unitIdx >= 0 ? cols[unitIdx] : undefined;

      let isValid = true;
      let validationError = '';
      if (!titleVal) {
        isValid = false;
        validationError = 'ไม่พบชื่อตัวชี้วัด (result_title)';
      }

      return {
        group_id: groupVal,
        sub_group_char: charVal,
        sub_sub_group_num: numVal,
        index: indexVal,
        result_title: titleVal,
        unit: unitVal,
        isValid,
        validationError
      };
    });
  }, [csvText, importType]);

  // Counts and statistics
  const validCount = useMemo(() => {
    if (importType === 'universal') return parsedUniversalItems.filter(i => i.isValid).length;
    if (importType === 'data') return parsedDataRows.filter(r => r.isValid).length;
    return parsedStructureRows.filter(r => r.isValid).length;
  }, [importType, parsedUniversalItems, parsedDataRows, parsedStructureRows]);

  const totalRowCount = useMemo(() => {
    if (importType === 'universal') return parsedUniversalItems.length;
    if (importType === 'data') return parsedDataRows.length;
    return parsedStructureRows.length;
  }, [importType, parsedUniversalItems, parsedDataRows, parsedStructureRows]);

  const newIndicatorsCount = useMemo(() => {
    if (importType !== 'universal') return 0;
    return parsedUniversalItems.filter(i => i.isValid && i.isNew).length;
  }, [importType, parsedUniversalItems]);

  const existingIndicatorsCount = useMemo(() => {
    if (importType !== 'universal') return 0;
    return parsedUniversalItems.filter(i => i.isValid && !i.isNew).length;
  }, [importType, parsedUniversalItems]);

  // Handle File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setCsvText(text);
        const lower = text.toLowerCase();
        if (lower.includes('result_title') && lower.includes('group_id') && !lower.includes('256') && !lower.includes('year')) {
          setImportType('structure');
        } else {
          setImportType('universal');
        }
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  // Download Templates
  const handleDownloadTemplate = (type: 'wide_table' | 'yearly_data' | 'with_comparison' | 'structure') => {
    let content = '';
    let defaultFilename = '';

    if (type === 'wide_table') {
      defaultFilename = 'edpex_wide_template.csv';
      content = `รหัสตัวชี้วัด,ชื่อตัวชี้วัด,หน่วย,2565,2566,2567,เป้าหมาย
7.1ก(1)-1,จำนวนนิสิตระดับปริญญาตรี (รวม),คน,1250,1320,1410,1300
7.1ก(1)-2,ร้อยละของนิสิตสำเร็จการศึกษาตามระยะเวลาหลักสูตร,ร้อยละ,85.5,88.2,91.0,88.0
7.2ก(1)-1,คะแนนความพึงพอใจของนิสิตต่อการจัดการเรียนการสอน,คะแนน,4.40,4.52,4.68,4.55
7.3ก(1)-1,ร้อยละของอาจารย์ที่มีตำแหน่งทางวิชาการ,ร้อยละ,62.0,65.5,70.0,68.0
7.4ก(1)-1,คะแนนการประเมินคุณธรรมและความโปร่งใส (ITA),คะแนน,92.5,95.0,96.8,95.0
7.5ก(1)-1,รายได้จากการบริการวิชาการและการวิจัย,ล้านบาท,10.2,12.8,15.2,12.0`;
    } else if (type === 'yearly_data') {
      defaultFilename = 'edpex_tall_data_template.csv';
      content = `index,result_title,year,actual,target,unit
7.1ก(1)-1,จำนวนนิสิตระดับปริญญาตรี (รวม),2565,1250,1200,คน
7.1ก(1)-1,จำนวนนิสิตระดับปริญญาตรี (รวม),2566,1320,1250,คน
7.1ก(1)-1,จำนวนนิสิตระดับปริญญาตรี (รวม),2567,1410,1300,คน
7.1ก(1)-2,ร้อยละของนิสิตสำเร็จการศึกษาตามระยะเวลา,2565,85.5,80.0,ร้อยละ
7.1ก(1)-2,ร้อยละของนิสิตสำเร็จการศึกษาตามระยะเวลา,2566,88.2,85.0,ร้อยละ
7.1ก(1)-2,ร้อยละของนิสิตสำเร็จการศึกษาตามระยะเวลา,2567,91.0,88.0,ร้อยละ`;
    } else if (type === 'with_comparison') {
      defaultFilename = 'edpex_with_comparison_template.csv';
      const nonDefaultUnivs = universities.filter(u => !u.isDefault).map(u => u.abbreviation).join(',');
      content = `index,result_title,year,actual,target,unit,${nonDefaultUnivs || 'CU,TU,MU'}
7.1ก(1)-1,จำนวนนิสิตระดับปริญญาตรี,2566,1320,1250,คน,1450,1280,1500
7.1ก(1)-1,จำนวนนิสิตระดับปริญญาตรี,2567,1410,1300,คน,1520,1310,1550
7.1ก(1)-2,ร้อยละของนิสิตสำเร็จตามเวลา,2566,88.2,85.0,ร้อยละ,90.5,86.0,89.0`;
    } else if (type === 'structure') {
      defaultFilename = 'edpex_structure_template.csv';
      content = `group_id,sub_group_char,sub_sub_group_num,index,result_title,unit
7.1,ก,1,7.1ก(1)-1,จำนวนนิสิตระดับปริญญาตรี (รวม),คน
7.1,ก,1,7.1ก(1)-2,ร้อยละนิสิตสำเร็จการศึกษาตามเวลา,ร้อยละ
7.2,ก,1,7.2ก(1)-1,คะแนนความพึงพอใจของนิสิต,คะแนน`;
    }

    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', defaultFilename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopySample = (sample: string, name: string) => {
    navigator.clipboard.writeText(sample);
    setCopiedTemplate(name);
    setTimeout(() => setCopiedTemplate(null), 2000);
  };

  // Perform Import Execution
  const handleExecuteImport = async () => {
    if (validCount === 0) return;
    setIsProcessing(true);

    try {
      if (importType === 'universal') {
        const validItems = parsedUniversalItems.filter(i => i.isValid);
        
        if (onImportUnified) {
          const payloads: UnifiedImportPayload[] = validItems.map(item => ({
            index: item.index,
            result_title: item.result_title,
            group_id: item.group_id,
            sub_group_char: item.sub_group_char,
            sub_sub_group_num: item.sub_sub_group_num,
            unit: item.unit,
            records: item.records,
            comparisonUniversities: item.comparisonUniversities
          }));

          await onImportUnified(payloads);
          const newCount = validItems.filter(i => i.isNew).length;
          const updateCount = validItems.length - newCount;
          const totalYears = validItems.reduce((acc, i) => acc + i.records.length, 0);

          await logAction(
            'นำเข้าข้อมูล CSV อัจฉริยะ',
            `นำเข้าตัวชี้วัดสำเร็จ ${validItems.length} รายการ (สร้างใหม่ ${newCount}, อัปเดต ${updateCount}) รวม ${totalYears} จุดข้อมูล`
          );
          alert(`นำเข้าข้อมูลตัวชี้วัดและผลดำเนินงานสำเร็จเรียบร้อย!\n- รวมตัวชี้วัด: ${validItems.length} รายการ (สร้างใหม่: ${newCount}, อัปเดต: ${updateCount})\n- รวมผลการดำเนินงานรายปี: ${totalYears} จุดข้อมูล`);
        } else {
          // Fallback if onImportUnified not passed
          const newItems = validItems.filter(i => i.isNew);
          if (newItems.length > 0 && onImportNewIndicators) {
            await onImportNewIndicators(newItems.map(i => ({
              index: i.index,
              result_title: i.result_title,
              group_id: i.group_id,
              sub_group_char: i.sub_group_char,
              sub_sub_group_num: i.sub_sub_group_num,
              data: { type: 'yearly', unit: i.unit || '', records: i.records }
            })));
          }
          const updates = validItems.filter(i => !i.isNew && i.matchedItem).map(i => ({
            itemId: i.matchedItem!.result_id,
            updatedItem: {
              ...i.matchedItem!,
              result_title: i.result_title || i.matchedItem!.result_title,
              data: {
                type: 'yearly',
                unit: i.unit || i.matchedItem!.data?.unit || '',
                records: i.records,
                mainColor: i.matchedItem!.data?.mainColor,
                targetColor: i.matchedItem!.data?.targetColor
              }
            } as EdPExItem
          }));
          if (updates.length > 0) {
            await onImportRecords(updates);
          }
        }
      } else if (importType === 'data') {
        const groupedByItem = new Map<string, ParsedDataRow[]>();
        parsedDataRows.filter(r => r.isValid && r.matchedItem).forEach(r => {
          const itemId = r.matchedItem!.result_id;
          const list = groupedByItem.get(itemId) || [];
          list.push(r);
          groupedByItem.set(itemId, list);
        });

        const updates: { itemId: string; updatedItem: EdPExItem }[] = [];
        let currentItemIndex = 0;
        const totalItems = groupedByItem.size;

        for (const [itemId, rows] of groupedByItem.entries()) {
          currentItemIndex++;
          setImportProgress({ current: currentItemIndex, total: totalItems });

          const baseItem = rows[0].matchedItem!;
          const currentRecords: YearlyData[] = [...(baseItem.data?.records || [])];
          const currentComparison: ComparisonUniversityData[] = [...(baseItem.data?.comparisonUniversities || [])];
          let updatedUnit = baseItem.data?.unit || '';

          rows.forEach(row => {
            if (row.unit) updatedUnit = row.unit;
            const existingRecIdx = currentRecords.findIndex(r => r.year === row.year);
            const actualParsed = isNaN(parseFloat(row.actual)) ? row.actual : parseFloat(row.actual);
            const targetParsed = row.target !== undefined && row.target !== '' 
              ? (isNaN(parseFloat(row.target)) ? row.target : parseFloat(row.target)) 
              : undefined;

            if (existingRecIdx >= 0) {
              const updatedRec: YearlyData = {
                ...currentRecords[existingRecIdx],
                actual: actualParsed
              };
              if (targetParsed !== undefined) {
                updatedRec.target = targetParsed;
              }
              currentRecords[existingRecIdx] = updatedRec;
            } else {
              const newRec: YearlyData = {
                year: row.year,
                actual: actualParsed
              };
              if (targetParsed !== undefined) {
                newRec.target = targetParsed;
              }
              currentRecords.push(newRec);
            }
          });

          currentRecords.sort((a, b) => a.year.localeCompare(b.year, undefined, { numeric: true }));

          const updatedItem: EdPExItem = {
            ...baseItem,
            data: {
              type: 'yearly',
              unit: updatedUnit,
              records: currentRecords,
              comparisonUniversities: currentComparison.length > 0 ? currentComparison : baseItem.data?.comparisonUniversities,
              mainColor: baseItem.data?.mainColor,
              targetColor: baseItem.data?.targetColor
            }
          };

          updates.push({ itemId, updatedItem });
        }

        await onImportRecords(updates);
        await logAction('นำเข้าข้อมูล CSV รายปี', `นำเข้าข้อมูลผลดำเนินงานสำเร็จ ${validCount} รายการ`);
        alert(`นำเข้าข้อมูลผลการดำเนินงานสำเร็จเรียบร้อย! (${validCount} แถว ใน ${totalItems} ตัวชี้วัด)`);
      } else if (importType === 'structure' && onImportNewIndicators) {
        const validRows = parsedStructureRows.filter(r => r.isValid);
        await onImportNewIndicators(validRows);
        await logAction('นำเข้าโครงสร้าง CSV', `นำเข้าตัวชี้วัดใหม่สำเร็จ ${validRows.length} รายการ`);
        alert(`นำเข้าตัวชี้วัดใหม่สำเร็จ ${validRows.length} รายการ!`);
      }

      onClose();
    } catch (err: any) {
      console.error('Import failed:', err);
      alert('เกิดข้อผิดพลาดในการนำเข้าข้อมูล: ' + (err.message || 'โปรดตรวจสอบไฟล์ CSV'));
    } finally {
      setIsProcessing(false);
      setImportProgress(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden my-auto"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-blue-50/70 via-white to-gray-50">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 text-white p-2.5 rounded-2xl shadow-md shadow-emerald-600/20">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 leading-tight">
                นำเข้าข้อมูลตัวชี้วัดและผลดำเนินงาน (Batch Import)
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                รองรับไฟล์ตารางทั้งแบบแนวนอน (ปีเป็นคอลัมน์) และแนวตั้ง สามารถสร้างตัวชี้วัดใหม่พร้อมบันทึกค่าได้ในครั้งเดียว
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-6 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between gap-4 overflow-x-auto">
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setActiveTab('upload')}
              className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'upload'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Upload className="w-4 h-4" />
              อัปโหลดไฟล์ / วาง CSV
            </button>
            <button
              onClick={() => setActiveTab('ai')}
              className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'ai'
                  ? 'border-purple-600 text-purple-600 bg-purple-50/70'
                  : 'border-transparent text-gray-500 hover:text-purple-700'
              }`}
            >
              <Sparkles className="w-4 h-4 text-purple-600" />
              AI แปลงข้อความเป็น CSV
              <span className="text-[9px] font-extrabold bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-1.5 py-0.5 rounded-full uppercase tracking-wider shadow-xs">
                AI Magic
              </span>
            </button>
            <button
              onClick={() => setActiveTab('guide')}
              className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'guide'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <HelpCircle className="w-4 h-4" />
              คู่มือและตัวอย่างไฟล์ CSV
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 py-2">
            <span className="text-[11px] text-gray-500">ดาวน์โหลดแม่แบบ:</span>
            <button
              onClick={() => handleDownloadTemplate('wide_table')}
              className="text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
              title="แม่แบบตารางแนวนอน มีคอลัมน์ปี 2565, 2566, 2567"
            >
              <Download className="w-3 h-3" /> ตารางแนวนอน (แนะนำ)
            </button>
            <button
              onClick={() => handleDownloadTemplate('yearly_data')}
              className="text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
            >
              <Download className="w-3 h-3" /> ตารางแนวตั้ง
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-grow overflow-y-auto p-6 space-y-6">
          {activeTab === 'upload' ? (
            <>
              {/* Optional Wipe Confirmation Banner */}
              {items.length > 0 && onDeleteAllItems && (
                <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-amber-900">
                    <Info className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      ปัจจุบันมีตัวชี้วัดในระบบอยู่แล้ว <strong>{items.length} รายการ</strong> (ต้องการล้างข้อมูลเดิมเพื่อเริ่มนำเข้าใหม่ทั้งหมดหรือไม่?)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onDeleteAllItems();
                    }}
                    className="flex items-center gap-1 text-red-600 hover:text-red-700 bg-white border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-xl font-bold whitespace-nowrap shadow-xs transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    ลบตัวชี้วัดเดิมทั้งหมด
                  </button>
                </div>
              )}

              {/* Import Mode Selector */}
              <div className="flex items-center gap-2 bg-gray-100/80 p-1.5 rounded-2xl border border-gray-200">
                <button
                  onClick={() => setImportType('universal')}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    importType === 'universal'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  <span>นำเข้าอัจฉริยะ (ตัวชี้วัด + ข้อมูลผลงาน)</span>
                  <span className="text-[9px] bg-blue-100 text-blue-800 font-extrabold px-1.5 py-0.2 rounded uppercase">
                    แนะนำ
                  </span>
                </button>
                <button
                  onClick={() => setImportType('data')}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    importType === 'data'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  ข้อมูลรายปี (เฉพาะตัวชี้วัดเดิม)
                </button>
                <button
                  onClick={() => setImportType('structure')}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    importType === 'structure'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  เฉพาะโครงสร้างตัวชี้วัด
                </button>
              </div>

              {/* Upload Drag & Drop Box */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* File Upload Zone */}
                <label className="border-2 border-dashed border-gray-300 hover:border-blue-500 bg-gray-50/50 hover:bg-blue-50/20 rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all group">
                  <input 
                    type="file" 
                    accept=".csv,text/csv,text/plain" 
                    onChange={handleFileUpload} 
                    className="hidden" 
                  />
                  <div className="p-3 bg-blue-100/80 text-blue-600 rounded-2xl group-hover:scale-110 transition-transform mb-3">
                    <Upload className="w-6 h-6" />
                  </div>
                  <span className="text-sm font-bold text-gray-800">คลิกเพื่อเลือกไฟล์ .CSV</span>
                  <span className="text-xs text-gray-400 mt-1">รองรับไฟล์ CSV ตารางแนวนอนและแนวตั้ง (UTF-8)</span>
                  {fileName && (
                    <span className="mt-3 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                      ไฟล์ปัจจุบัน: {fileName}
                    </span>
                  )}
                </label>

                {/* Paste Text Area */}
                <div className="flex flex-col">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-gray-700">หรือวางข้อความ CSV โดยตรง:</label>
                    {csvText && (
                      <button 
                        onClick={() => { setCsvText(''); setFileName(''); }}
                        className="text-[11px] text-red-500 hover:underline"
                      >
                        ล้างข้อความ
                      </button>
                    )}
                  </div>
                  <textarea
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    placeholder={
                      importType === 'universal'
                        ? "รหัส,ชื่อตัวชี้วัด,หน่วย,2565,2566,2567,เป้าหมาย\n7.1ก(1)-1,จำนวนนิสิต ป.ตรี,คน,1250,1320,1410,1300\n7.1ก(1)-2,ร้อยละสำเร็จการศึกษา,ร้อยละ,85.5,88.2,91.0,88.0"
                        : importType === 'data'
                        ? "index,year,actual,target,unit\n7.1ก(1)-1,2566,1320,1250,คน"
                        : "group_id,sub_group_char,sub_sub_group_num,index,result_title,unit\n7.1,ก,1,7.1ก(1)-1,ชื่อตัวชี้วัด,คน"
                    }
                    className="w-full flex-grow min-h-[140px] p-3 text-xs font-mono bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:bg-white focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>

              {/* Live Preview Table */}
              {totalRowCount > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-gray-50 p-3 rounded-2xl border border-gray-200">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs font-bold text-gray-800">
                        ตรวจสอบผลการอ่านข้อมูล:
                      </span>
                      <span className="text-xs font-bold text-emerald-600 bg-emerald-100/70 px-2.5 py-0.5 rounded-full">
                        พร้อมนำเข้า {validCount} รายการ
                      </span>
                      {totalRowCount - validCount > 0 && (
                        <span className="text-xs font-bold text-red-600 bg-red-100/70 px-2.5 py-0.5 rounded-full">
                          มีข้อผิดพลาด {totalRowCount - validCount} รายการ
                        </span>
                      )}
                    </div>

                    {importType === 'universal' && (
                      <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                        {newIndicatorsCount > 0 && (
                          <span className="text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg">
                            + ตัวชี้วัดใหม่ {newIndicatorsCount} รายการ
                          </span>
                        )}
                        {existingIndicatorsCount > 0 && (
                          <span className="text-gray-700 bg-gray-200/80 px-2 py-0.5 rounded-lg">
                            อัปเดตตัวเดิม {existingIndicatorsCount} รายการ
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Table Box */}
                  <div className="border border-gray-200 rounded-2xl overflow-hidden max-h-[300px] overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-100/80 sticky top-0 border-b border-gray-200 text-gray-700 font-bold z-10">
                        {importType === 'universal' ? (
                          <tr>
                            <th className="p-2.5">สถานะ</th>
                            <th className="p-2.5">รหัส (Index)</th>
                            <th className="p-2.5">ชื่อตัวชี้วัด</th>
                            <th className="p-2.5">หมวด</th>
                            <th className="p-2.5">หน่วย</th>
                            <th className="p-2.5">ปีและผลงานที่พบ</th>
                            <th className="p-2.5">สถาบันเปรียบเทียบ</th>
                          </tr>
                        ) : importType === 'data' ? (
                          <tr>
                            <th className="p-2.5">สถานะ</th>
                            <th className="p-2.5">รหัส</th>
                            <th className="p-2.5">ชื่อตัวชี้วัดในระบบ</th>
                            <th className="p-2.5">ปี</th>
                            <th className="p-2.5">ผลดำเนินงาน</th>
                            <th className="p-2.5">เป้าหมาย</th>
                            <th className="p-2.5">หน่วย</th>
                          </tr>
                        ) : (
                          <tr>
                            <th className="p-2.5">สถานะ</th>
                            <th className="p-2.5">หมวด</th>
                            <th className="p-2.5">รหัส</th>
                            <th className="p-2.5">ชื่อตัวชี้วัด</th>
                            <th className="p-2.5">หน่วย</th>
                          </tr>
                        )}
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {importType === 'universal' ? (
                          parsedUniversalItems.slice(0, 60).map((row, idx) => (
                            <tr key={idx} className={row.isValid ? 'hover:bg-blue-50/30' : 'bg-red-50/50'}>
                              <td className="p-2.5 whitespace-nowrap">
                                {row.isValid ? (
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    row.isNew 
                                      ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  }`}>
                                    <CheckCircle2 className="w-3 h-3" />
                                    {row.isNew ? 'สร้างใหม่' : 'อัปเดต'}
                                  </span>
                                ) : (
                                  <span className="text-red-500 font-bold flex items-center gap-1" title={row.validationError}>
                                    <AlertCircle className="w-3.5 h-3.5" /> {row.validationError}
                                  </span>
                                )}
                              </td>
                              <td className="p-2.5 font-mono font-bold text-blue-600">{row.index}</td>
                              <td className="p-2.5 font-medium text-gray-800 line-clamp-1 max-w-[240px]">
                                {row.result_title}
                              </td>
                              <td className="p-2.5 text-gray-500 font-mono">
                                {row.group_id}{row.sub_group_char}({row.sub_sub_group_num})
                              </td>
                              <td className="p-2.5 text-gray-500">{row.unit || '-'}</td>
                              <td className="p-2.5">
                                {row.records.length > 0 ? (
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {row.records.slice(0, 4).map(r => (
                                      <span key={r.year} className="bg-gray-100 text-gray-700 font-mono text-[10px] px-1.5 py-0.5 rounded">
                                        {r.year}: <strong>{r.actual}</strong>
                                      </span>
                                    ))}
                                    {row.records.length > 4 && (
                                      <span className="text-[10px] text-gray-400">+{row.records.length - 4} ปี</span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-gray-400 italic">ไม่มีข้อมูลผลงาน</span>
                                )}
                              </td>
                              <td className="p-2.5 text-gray-500">
                                {row.comparisonUniversities.length > 0 ? (
                                  <span className="text-xs font-bold text-indigo-600">
                                    {row.comparisonUniversities.map(u => u.abbreviation).join(', ')}
                                  </span>
                                ) : '-'}
                              </td>
                            </tr>
                          ))
                        ) : importType === 'data' ? (
                          parsedDataRows.slice(0, 60).map((row, idx) => (
                            <tr key={idx} className={row.isValid ? 'hover:bg-blue-50/30' : 'bg-red-50/50'}>
                              <td className="p-2.5 whitespace-nowrap">
                                {row.isValid ? (
                                  <span className="text-emerald-600 font-bold flex items-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> พร้อม
                                  </span>
                                ) : (
                                  <span className="text-red-500 font-bold flex items-center gap-1" title={row.validationError}>
                                    <AlertCircle className="w-3.5 h-3.5" /> {row.validationError}
                                  </span>
                                )}
                              </td>
                              <td className="p-2.5 font-mono font-bold text-blue-600">{row.index}</td>
                              <td className="p-2.5 text-gray-700 line-clamp-1 max-w-[200px]">
                                {row.matchedItem?.result_title || '-'}
                              </td>
                              <td className="p-2.5 font-bold">{row.year}</td>
                              <td className="p-2.5 font-bold text-gray-900">{row.actual}</td>
                              <td className="p-2.5 text-gray-500">{row.target || '-'}</td>
                              <td className="p-2.5 text-gray-500">{row.unit || row.matchedItem?.data?.unit || '-'}</td>
                            </tr>
                          ))
                        ) : (
                          parsedStructureRows.slice(0, 60).map((row, idx) => (
                            <tr key={idx} className={row.isValid ? 'hover:bg-blue-50/30' : 'bg-red-50/50'}>
                              <td className="p-2.5 whitespace-nowrap">
                                {row.isValid ? (
                                  <span className="text-emerald-600 font-bold flex items-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> พร้อม
                                  </span>
                                ) : (
                                  <span className="text-red-500 font-bold flex items-center gap-1">
                                    <AlertCircle className="w-3.5 h-3.5" /> {row.validationError}
                                  </span>
                                )}
                              </td>
                              <td className="p-2.5 font-mono">{row.group_id}{row.sub_group_char}({row.sub_sub_group_num})</td>
                              <td className="p-2.5 font-mono font-bold text-blue-600">{row.index}</td>
                              <td className="p-2.5 text-gray-800 line-clamp-1 max-w-[250px]">{row.result_title}</td>
                              <td className="p-2.5 text-gray-500">{row.unit || '-'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {totalRowCount > 60 && (
                    <p className="text-[11px] text-gray-400 text-center">
                      * แสดงตัวอย่าง 60 รายการแรกจากทั้งหมด {totalRowCount} รายการ
                    </p>
                  )}
                </div>
              )}
            </>
          ) : activeTab === 'ai' ? (
            <AiTextToCsvPanel
              items={items}
              universities={universities}
              onApplyCsv={(newCsv, detectedFmt, directImport) => {
                setCsvText(newCsv);
                setImportType('universal');
                setActiveTab('upload');
                if (directImport) {
                  setTimeout(() => {
                    handleExecuteImport();
                  }, 150);
                }
              }}
            />
          ) : (
            /* Format Guide Tab */
            <div className="space-y-6 text-sm">
              {/* Card 1: Wide Format Guide (Recommended) */}
              <div className="bg-gradient-to-r from-blue-50/70 to-indigo-50/40 rounded-2xl p-5 border border-blue-200/80 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-blue-600 text-white rounded-xl shadow-xs">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-base text-gray-900 flex items-center gap-2">
                        รูปแบบที่ 1: ตารางแนวนอน (Wide Table)
                        <span className="text-[10px] font-extrabold bg-blue-600 text-white px-2 py-0.5 rounded-full uppercase">
                          นิยมและสะดวกที่สุด
                        </span>
                      </h4>
                      <p className="text-xs text-gray-500">
                        แต่ละแถวคือ 1 ตัวชี้วัด และมีคอลัมน์ปีการศึกษา (2565, 2566, 2567...) เหมาะกับการคัดลอกจาก Excel
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDownloadTemplate('wide_table')}
                    className="flex items-center gap-1.5 text-xs font-bold text-blue-600 bg-white hover:bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-xl transition-colors shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" /> โหลดไฟล์ตัวอย่าง
                  </button>
                </div>

                <div className="bg-gray-900 text-gray-100 p-3.5 rounded-xl font-mono text-xs relative">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-800 text-gray-400 text-[10px]">
                    <span>ตัวอย่างตารางแนวนอน (CSV Header & Data):</span>
                    <button
                      onClick={() => handleCopySample(`รหัสตัวชี้วัด,ชื่อตัวชี้วัด,หน่วย,2565,2566,2567,เป้าหมาย\n7.1ก(1)-1,จำนวนนิสิตระดับปริญญาตรี (รวม),คน,1250,1320,1410,1300\n7.1ก(1)-2,ร้อยละนิสิตสำเร็จการศึกษาตามระยะเวลา,ร้อยละ,85.5,88.2,91.0,88.0\n7.2ก(1)-1,คะแนนความพึงพอใจของนิสิต,คะแนน,4.40,4.52,4.68,4.55`, 'wide_sample')}
                      className="text-blue-400 hover:text-white flex items-center gap-1"
                    >
                      {copiedTemplate === 'wide_sample' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copiedTemplate === 'wide_sample' ? 'คัดลอกแล้ว' : 'คัดลอกตัวอย่าง'}
                    </button>
                  </div>
                  <pre className="text-emerald-400 leading-relaxed overflow-x-auto">
{`รหัสตัวชี้วัด,ชื่อตัวชี้วัด,หน่วย,2565,2566,2567,เป้าหมาย
7.1ก(1)-1,จำนวนนิสิตระดับปริญญาตรี (รวม),คน,1250,1320,1410,1300
7.1ก(1)-2,ร้อยละนิสิตสำเร็จการศึกษาตามระยะเวลา,ร้อยละ,85.5,88.2,91.0,88.0
7.2ก(1)-1,คะแนนความพึงพอใจของนิสิต,คะแนน,4.40,4.52,4.68,4.55`}
                  </pre>
                </div>
              </div>

              {/* Card 2: Tall Format Guide */}
              <div className="bg-gradient-to-r from-emerald-50/50 to-teal-50/30 rounded-2xl p-5 border border-emerald-100 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-emerald-600 text-white rounded-xl shadow-xs">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-base text-gray-900">
                        รูปแบบที่ 2: ตารางแนวตั้ง (Tall Table)
                      </h4>
                      <p className="text-xs text-gray-500">
                        มีคอลัมน์ index, result_title, year, actual, target, unit บันทึกแยกรายปีทีละแถว
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDownloadTemplate('yearly_data')}
                    className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-white hover:bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl transition-colors shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" /> โหลดไฟล์ตัวอย่าง
                  </button>
                </div>

                <div className="bg-gray-900 text-gray-100 p-3.5 rounded-xl font-mono text-xs relative">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-800 text-gray-400 text-[10px]">
                    <span>ตัวอย่างตารางแนวตั้ง:</span>
                    <button
                      onClick={() => handleCopySample(`index,result_title,year,actual,target,unit\n7.1ก(1)-1,จำนวนนิสิตระดับปริญญาตรี (รวม),2565,1250,1200,คน\n7.1ก(1)-1,จำนวนนิสิตระดับปริญญาตรี (รวม),2566,1320,1250,คน\n7.1ก(1)-1,จำนวนนิสิตระดับปริญญาตรี (รวม),2567,1410,1300,คน`, 'tall_sample')}
                      className="text-emerald-400 hover:text-white flex items-center gap-1"
                    >
                      {copiedTemplate === 'tall_sample' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copiedTemplate === 'tall_sample' ? 'คัดลอกแล้ว' : 'คัดลอกตัวอย่าง'}
                    </button>
                  </div>
                  <pre className="text-emerald-400 leading-relaxed overflow-x-auto">
{`index,result_title,year,actual,target,unit
7.1ก(1)-1,จำนวนนิสิตระดับปริญญาตรี (รวม),2565,1250,1200,คน
7.1ก(1)-1,จำนวนนิสิตระดับปริญญาตรี (รวม),2566,1320,1250,คน
7.1ก(1)-1,จำนวนนิสิตระดับปริญญาตรี (รวม),2567,1410,1300,คน`}
                  </pre>
                </div>
              </div>

              {/* Tips for Excel Users */}
              <div className="bg-amber-50 rounded-2xl p-5 border border-amber-200/80 space-y-2">
                <div className="flex items-center gap-2 text-amber-800 font-bold">
                  <Info className="w-5 h-5 text-amber-600" />
                  คำแนะนำสำคัญสำหรับการใช้งานร่วมกับ Microsoft Excel
                </div>
                <ul className="text-xs text-amber-900 space-y-1.5 list-disc list-inside">
                  <li>
                    <strong>บันทึกเป็น CSV UTF-8:</strong> ใน Excel ให้เลือก <em>Save As &gt; CSV UTF-8 (Comma delimited) (*.csv)</em> เพื่อให้ภาษาไทยแสดงผลถูกต้อง
                  </li>
                  <li>
                    <strong>สร้างตัวชี้วัดใหม่อัตโนมัติ:</strong> หากรหัสตัวชี้วัดในไฟล์ยังไม่มีในระบบ โหมด <em>"นำเข้าอัจฉริยะ"</em> จะสร้างตัวชี้วัดใหม่ให้อัตโนมัติ โดยวิเคราะห์รหัส (เช่น 7.1ก(1)-1) เข้าสู่หมวดที่ถูกต้อง
                  </li>
                  <li>
                    <strong>ผสานข้อมูลเดิม:</strong> หากตัวชี้วัดมีอยู่แล้วในระบบ ข้อมูลปีเดิมจะไม่สูญหาย ระบบจะผสานหรือแทนที่เฉพาะปีที่มีข้อมูลใหม่
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-gray-500">
            {activeTab === 'upload' && totalRowCount > 0 && (
              <span>
                พร้อมนำเข้า <strong>{validCount}</strong> รายการ 
                {importType === 'universal' && newIndicatorsCount > 0 && (
                  <span className="text-blue-600 ml-1">
                    (สร้างใหม่ {newIndicatorsCount}, อัปเดต {existingIndicatorsCount})
                  </span>
                )}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="px-5 py-2.5 text-xs font-bold text-gray-600 hover:text-gray-800 transition-colors"
            >
              ยกเลิก
            </button>

            {activeTab === 'upload' && (
              <button
                onClick={handleExecuteImport}
                disabled={isProcessing || validCount === 0}
                className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white px-6 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-600/20 disabled:shadow-none min-w-[170px]"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    กำลังนำเข้าข้อมูล...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    ยืนยันนำเข้าข้อมูล ({validCount} รายการ)
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
