import React, { useState } from 'react';
import { 
  Sparkles, 
  Send, 
  Copy, 
  Check, 
  Download, 
  ArrowRight, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  FileSpreadsheet, 
  Lightbulb, 
  BookOpen, 
  Code,
  TableProperties
} from 'lucide-react';
import { EdPExItem, University } from '../types';

interface AiTextToCsvPanelProps {
  items: EdPExItem[];
  universities: University[];
  onApplyCsv: (csvContent: string, formatType: 'data' | 'structure', directImport?: boolean) => void;
}

interface ExamplePrompt {
  id: string;
  title: string;
  description: string;
  format: 'data' | 'structure' | 'auto';
  badge: string;
  text: string;
}

const EXAMPLE_PROMPTS: ExamplePrompt[] = [
  {
    id: 'yearly-report',
    title: 'สรุปผลงาน 3 ปี (ผลจริง + เป้าหมาย)',
    description: 'ข้อความรายงานผลการดำเนินงานแบบบรรยายข้อความ',
    format: 'data',
    badge: 'ยอดนิยม',
    text: `รายงานสรุปผลการดำเนินงาน หมวด 7 ประจำปี 2565 - 2567
ตัวชี้วัด 7.1ก(1)-1 จำนวนนิสิตระดับปริญญาตรี (รวม)
- ปี 2565: ผลดำเนินงาน 1250 คน (เป้าหมาย 1200 คน)
- ปี 2566: ผลดำเนินงาน 1320 คน (เป้าหมาย 1250 คน)
- ปี 2567: ผลดำเนินงาน 1410 คน (เป้าหมาย 1300 คน)

ตัวชี้วัด 7.1ก(1)-2 ร้อยละของนิสิตสำเร็จการศึกษาตามระยะเวลาหลักสูตร
- ปี 2565: ผลดำเนินงาน 85.5% (เป้าหมาย 80.0%)
- ปี 2566: ผลดำเนินงาน 88.2% (เป้าหมาย 85.0%)
- ปี 2567: ผลดำเนินงาน 91.0% (เป้าหมาย 88.0%)

ตัวชี้วัด 7.2ก(1)-1 คะแนนความพึงพอใจของนิสิตต่อการจัดการเรียนการสอน
- ปี 2566: ผล 4.52 คะแนน (เป้าหมาย 4.50 คะแนน)
- ปี 2567: ผล 4.68 คะแนน (เป้าหมาย 4.55 คะแนน)`
  },
  {
    id: 'with-comparison',
    title: 'ข้อมูลเปรียบเทียบสถาบัน (CU / TU / MU)',
    description: 'ข้อมูลผลงานพร้อมคะแนนเทียบกับมหาวิทยาลัยอื่น',
    format: 'data',
    badge: 'เปรียบเทียบ',
    text: `ตารางเปรียบเทียบผลดำเนินงานปี 2566 และ 2567:
รหัส 7.1ก(1)-1 (จำนวนนิสิต ป.ตรี, หน่วย: คน):
ปี 2566 BUUIC = 1320 (เป้า 1250), เทียบกับ CU = 1450, TU = 1280, MU = 1500
ปี 2567 BUUIC = 1410 (เป้า 1300), เทียบกับ CU = 1520, TU = 1310, MU = 1550

รหัส 7.1ก(1)-2 (ร้อยละนิสิตสำเร็จตามเวลา, หน่วย: ร้อยละ):
ปี 2566 BUUIC = 88.2 (เป้า 85.0), CU = 90.5, TU = 86.0, MU = 89.0
ปี 2567 BUUIC = 91.0 (เป้า 88.0), CU = 92.4, TU = 88.5, MU = 90.5`
  },
  {
    id: 'unstructured-meeting',
    title: 'บันทึกการประชุม / ข้อความอิสระ',
    description: 'ข้อความสรุปจากการประชุมประกันคุณภาพ',
    format: 'data',
    badge: 'ข้อความอิสระ',
    text: `จากการประชุมประกันคุณภาพการศึกษาล่าสุด สรุปตัวเลขของหมวด 7.4 และ 7.5 ดังนี้:
สำหรับอัตราการรักษาบุคลากรสายวิชาการ (7.4ก(1)-1) ในปีการศึกษา 2567 เราทำได้ 94.5% สูงกว่าเป้าหมายที่ตั้งไว้ 90.0%
ส่วนปี 2566 ทำได้ 92.0% (เป้าหมาย 90.0%)

ด้านรายได้จากการบริการวิชาการ (7.5ก(1)-1 หน่วยเป็น ล้านบาท):
ปี 2566 มีรายได้จริง 12.8 ล้านบาท จากเป้าหมาย 10.0 ล้านบาท
ปี 2567 เพิ่มขึ้นเป็น 15.2 ล้านบาท เกินเป้าหมาย 12.0 ล้านบาท`
  },
  {
    id: 'new-indicators',
    title: 'โครงสร้างรายการตัวชี้วัดใหม่ (Catalogue)',
    description: 'สร้างรายชื่อตัวชี้วัดเพื่อเพิ่มในระบบ',
    format: 'structure',
    badge: 'โครงสร้าง',
    text: `ขอเพิ่มตัวชี้วัดใหม่ในหมวด 7.1 และ 7.2:
- หมวด 7.1ก(1) รหัส 7.1ก(1)-99: จำนวนนิสิตแลกเปลี่ยนต่างประเทศ (หน่วย: คน)
- หมวด 7.1ก(2) รหัส 7.1ก(2)-99: ร้อยละหลักสูตรที่ได้รับมาตรฐานสากล (หน่วย: ร้อยละ)
- หมวด 7.2ก(1) รหัส 7.2ก(1)-99: ระดับความผูกพันของศิษย์เก่า (หน่วย: คะแนน)`
  }
];

export default function AiTextToCsvPanel({
  items,
  universities,
  onApplyCsv
}: AiTextToCsvPanelProps) {
  const [inputText, setInputText] = useState<string>('');
  const [targetFormat, setTargetFormat] = useState<'auto' | 'data' | 'structure'>('auto');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Results from AI
  const [generatedCsv, setGeneratedCsv] = useState<string>('');
  const [detectedFormat, setDetectedFormat] = useState<'data' | 'structure'>('data');
  const [aiSummary, setAiSummary] = useState<string>('');
  const [rowCount, setRowCount] = useState<number>(0);
  const [matchedIndicators, setMatchedIndicators] = useState<string[]>([]);
  const [copied, setCopied] = useState<boolean>(false);

  // Generate CSV using Server Gemini API
  const handleGenerateCsv = async () => {
    if (!inputText.trim()) {
      setErrorMessage('กรุณาพิมพ์หรือวางข้อความข้อมูลที่ต้องการแปลง');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      // Prepare compact indicators list for AI context
      const indicatorPayload = items.map(item => ({
        index: item.index || '',
        title: item.result_title || '',
        unit: item.data?.unit || ''
      }));

      const universityPayload = universities.map(u => ({
        abbr: u.abbreviation,
        name: u.name
      }));

      const res = await fetch('/api/ai/text-to-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: inputText,
          targetFormat,
          systemIndicators: indicatorPayload,
          universities: universityPayload
        })
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'การประมวลผลด้วย AI ขัดข้อง กรุณาลองใหม่อีกครั้ง');
      }

      const result = json.data;
      setGeneratedCsv(result.csv || '');
      setDetectedFormat(result.detectedFormat === 'structure' ? 'structure' : 'data');
      setAiSummary(result.summary || 'สกัดข้อมูลสำเร็จ');
      setRowCount(result.rowCount || (result.csv ? result.csv.split('\n').filter((l: string) => l.trim()).length - 1 : 0));
      setMatchedIndicators(Array.isArray(result.matchedIndicators) ? result.matchedIndicators : []);
    } catch (err: any) {
      console.error('AI CSV generation failed:', err);
      setErrorMessage(err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อกับ Gemini AI');
    } finally {
      setIsLoading(false);
    }
  };

  // Copy CSV to clipboard
  const handleCopy = () => {
    if (!generatedCsv) return;
    navigator.clipboard.writeText(generatedCsv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download CSV file
  const handleDownload = () => {
    if (!generatedCsv) return;
    const blob = new Blob(['\uFEFF' + generatedCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `edpex_ai_generated_${detectedFormat}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-50 via-indigo-50/60 to-blue-50 border border-purple-200/80 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-gradient-to-tr from-purple-600 to-indigo-600 text-white rounded-xl shadow-md shadow-purple-500/20 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              AI Data Importer: แปลงข้อความอิสระเป็น CSV สำหรับ EdPEx อัตโนมัติ
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-purple-200 text-purple-800">
                Gemini AI
              </span>
            </h4>
            <p className="text-xs text-gray-600 mt-1">
              วางข้อความรายงานสรุป, ตารางตัดแปะจาก Word/PDF, บันทึกการประชุม หรือผลดำเนินงานรายปี แล้ว AI จะสกัดรหัสตัวชี้วัด ปี ผลงาน เป้าหมาย และแปลงเป็น CSV ให้ทันที
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700 bg-white/80 backdrop-blur px-3 py-1.5 rounded-xl border border-indigo-100 shrink-0">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          <span>เชื่อมต่อกับ {items.length} ตัวชี้วัดในระบบ</span>
        </div>
      </div>

      {/* Example Prompt Chips */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
            คลิกตัวอย่างข้อความเพื่อทดสอบแบบรวดเร็ว:
          </label>
          <span className="text-[11px] text-gray-400">เลือกตัวอย่างเพื่อโหลดลงในกล่องข้อความ</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {EXAMPLE_PROMPTS.map((ex) => (
            <button
              key={ex.id}
              type="button"
              onClick={() => {
                setInputText(ex.text);
                setTargetFormat(ex.format);
                setErrorMessage(null);
              }}
              className="p-3 text-left bg-gray-50 hover:bg-purple-50/60 border border-gray-200 hover:border-purple-300 rounded-xl transition-all group relative flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-xs font-bold text-gray-900 group-hover:text-purple-700 transition-colors line-clamp-1">
                    {ex.title}
                  </span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-gray-200 text-gray-700 group-hover:bg-purple-100 group-hover:text-purple-700 transition-colors shrink-0">
                    {ex.badge}
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 line-clamp-2">
                  {ex.description}
                </p>
              </div>
              <span className="text-[10px] font-bold text-purple-600 mt-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                ใช้ตัวอย่างนี้ <ArrowRight className="w-3 h-3" />
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Input Form */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <label className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-blue-600" />
            วางหรือพิมพ์ข้อความข้อมูลดิบ (Data Text):
          </label>

          {/* Format Selector */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-500">รูปแบบเป้าหมาย:</span>
            <div className="bg-gray-100 p-0.5 rounded-lg flex items-center text-xs">
              <button
                type="button"
                onClick={() => setTargetFormat('auto')}
                className={`px-2.5 py-1 rounded-md font-bold transition-all ${
                  targetFormat === 'auto'
                    ? 'bg-white text-purple-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                อัตโนมัติ
              </button>
              <button
                type="button"
                onClick={() => setTargetFormat('data')}
                className={`px-2.5 py-1 rounded-md font-bold transition-all ${
                  targetFormat === 'data'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                title="index,year,actual,target,unit"
              >
                ข้อมูลรายปี
              </button>
              <button
                type="button"
                onClick={() => setTargetFormat('structure')}
                className={`px-2.5 py-1 rounded-md font-bold transition-all ${
                  targetFormat === 'structure'
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                title="group_id,sub_group_char,sub_sub_group_num,index,result_title,unit"
              >
                โครงสร้างตัวชี้วัด
              </button>
            </div>
          </div>
        </div>

        <textarea
          rows={7}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={`ตัวอย่างข้อความที่สามารถวางได้:\n- รายงานสรุปผลงาน เช่น "ตัวชี้วัด 7.1ก(1)-1 นิสิต ป.ตรี ปี 2566 ได้ 1320 คน เป้า 1250 ปี 2567 ได้ 1410 คน เป้า 1300"\n- ข้อความตารางตัดแปะจาก Microsoft Word / Excel / PDF\n- ผลดำเนินงานพร้อมสถาบันเปรียบเทียบ เช่น CU, TU, MU`}
          className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs sm:text-sm font-sans focus:bg-white focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 outline-none transition-all placeholder:text-gray-400"
        />

        {errorMessage && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <div className="text-[11px] text-gray-500 flex items-center gap-1.5">
            <span>จำนวนตัวอักษร: {inputText.length}</span>
            {inputText && (
              <button
                type="button"
                onClick={() => {
                  setInputText('');
                  setGeneratedCsv('');
                  setErrorMessage(null);
                }}
                className="text-gray-400 hover:text-red-500 underline ml-2"
              >
                ล้างข้อความ
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleGenerateCsv}
            disabled={isLoading || !inputText.trim()}
            className="flex items-center gap-2 bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-md shadow-purple-600/20 active:scale-95"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>AI กำลังวิเคราะห์และแปลงข้อความ...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>สั่ง AI สร้าง CSV ทันที (Generate CSV)</span>
                <Send className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Generated Result Section */}
      {generatedCsv && (
        <div className="p-5 rounded-2xl bg-gray-50 border-2 border-purple-200/90 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-200">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-emerald-600 text-white rounded-xl shadow-sm">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h5 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  สร้าง CSV สำเร็จเรียบร้อย!
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                    detectedFormat === 'data' 
                      ? 'bg-blue-100 text-blue-800' 
                      : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {detectedFormat === 'data' ? 'รูปแบบข้อมูลรายปี' : 'รูปแบบโครงสร้างตัวชี้วัด'}
                  </span>
                </h5>
                <p className="text-xs text-gray-600 mt-0.5">
                  {aiSummary} ({rowCount} แถวข้อมูล)
                </p>
              </div>
            </div>

            {/* Top CSV Actions */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 transition-colors shadow-sm"
                title="คัดลอก CSV ไปยัง Clipboard"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'คัดลอกแล้ว!' : 'คัดลอก CSV'}
              </button>

              <button
                type="button"
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 transition-colors shadow-sm"
                title="ดาวน์โหลดเป็นไฟล์ CSV"
              >
                <Download className="w-3.5 h-3.5" />
                ดาวน์โหลด .csv
              </button>
            </div>
          </div>

          {/* Matched Indicators Tags */}
          {matchedIndicators.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold text-gray-500">ตัวชี้วัดที่จับคู่ได้:</span>
              {matchedIndicators.map((code) => (
                <span
                  key={code}
                  className="text-[11px] font-bold bg-white text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-md shadow-xs"
                >
                  {code}
                </span>
              ))}
            </div>
          )}

          {/* CSV Code Box */}
          <div className="relative">
            <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900 text-gray-300 rounded-t-xl text-[11px] font-mono">
              <span className="flex items-center gap-1.5">
                <Code className="w-3.5 h-3.5 text-emerald-400" />
                CSV Output (พร้อมนำเข้า)
              </span>
              <span className="text-gray-400">{rowCount} rows</span>
            </div>
            <textarea
              rows={Math.min(10, Math.max(4, generatedCsv.split('\n').length))}
              value={generatedCsv}
              onChange={(e) => setGeneratedCsv(e.target.value)}
              className="w-full p-3 font-mono text-xs bg-gray-950 text-emerald-400 rounded-b-xl border border-gray-900 outline-none focus:ring-2 focus:ring-purple-500/30 overflow-x-auto leading-relaxed"
            />
          </div>

          {/* Bottom Call to Action Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              💡 คุณสามารถตรวจสอบตารางพรีวิวก่อนนำเข้า หรือกดปุ่มนำเข้าสู่ระบบได้ทันที
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onApplyCsv(generatedCsv, detectedFormat, false)}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white hover:bg-gray-100 border border-gray-300 rounded-xl text-xs font-bold text-gray-700 transition-colors shadow-sm"
              >
                <TableProperties className="w-4 h-4 text-blue-600" />
                ตรวจทานในตารางพรีวิว (Review in Preview)
              </button>

              <button
                type="button"
                onClick={() => onApplyCsv(generatedCsv, detectedFormat, true)}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-bold transition-all shadow-md shadow-emerald-600/20 active:scale-95"
              >
                <FileSpreadsheet className="w-4 h-4" />
                นำเข้าข้อมูลเข้าสู่ระบบทันที (Import into System)
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
