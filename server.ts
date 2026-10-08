import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Initialize Google GenAI
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({
  apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

interface TextToCsvRequestBody {
  text: string;
  targetFormat?: 'data' | 'structure' | 'auto';
  systemIndicators?: Array<{ index: string; title: string; unit?: string }>;
  universities?: Array<{ abbr: string; name: string }>;
}

// API endpoint to transform unstructured text into EdPEx import CSV format
app.post('/api/ai/text-to-csv', async (req: Request, res: Response): Promise<void> => {
  try {
    const { text, targetFormat = 'auto', systemIndicators = [], universities = [] } = req.body as TextToCsvRequestBody;

    if (!text || typeof text !== 'string' || !text.trim()) {
      res.status(400).json({
        success: false,
        error: 'กรุณาระบุข้อความข้อมูลที่ต้องการแปลง (Text is required)',
      });
      return;
    }

    if (!apiKey) {
      res.status(500).json({
        success: false,
        error: 'GEMINI_API_KEY is not configured on the server.',
      });
      return;
    }

    // Provide relevant indicator list context
    const indicatorListSummary = systemIndicators
      .slice(0, 120)
      .map((ind) => `- [${ind.index}] ${ind.title}${ind.unit ? ` (${ind.unit})` : ''}`)
      .join('\n');

    const universitySummary = universities
      .map((u) => `${u.abbr} (${u.name})`)
      .join(', ');

    const prompt = `You are an expert AI data extraction assistant for an educational quality assurance system based on the EdPEx (Education Criteria for Performance Excellence) framework, specifically Category 7 (หมวด 7 ผลลัพธ์).

The user has provided raw, unstructured, or semi-structured text containing performance data, reports, bullet points, or tables.
Your task is to parse this input text and produce a pristine, valid CSV (Comma-Separated Values) format that can be directly imported into the application.

### Target Formats

FORMAT A: "data" (Yearly indicator data - actuals, targets, units, and optional university comparisons)
CSV Header:
index,year,actual,target,unit
or if university comparisons are mentioned in the text (e.g., ${universitySummary || 'CU, TU, MU'}):
index,year,actual,target,unit,CU,TU,MU

Rules for FORMAT A:
1. "index": The exact indicator code (e.g. 7.1ก(1)-1, 7.1ก(2)-1, 7.2ก(1)-1, 7.3ก(1)-1, 7.4ก(1)-1, 7.5ก(1)-1). If the text mentions an indicator by name instead of code, match it to the closest known indicator index from the reference list below.
2. "year": Thai Buddhist Era year (e.g., 2565, 2566, 2567, 2568) or Gregorian year converted to Buddhist era if appropriate (e.g. 2024 -> 2567).
3. "actual": Numeric performance value (number or float, e.g., 1450, 85.5, 4.62). Clean out commas or percentage symbols so it is a valid number or score.
4. "target": Target value for that year if mentioned (or leave empty if not available).
5. "unit": Unit of measurement (e.g., คน, ร้อยละ, คะแนน, บทความ, บาท, etc.).
6. "CU,TU,MU" (or other university columns): Comparative data values for other institutions if mentioned.

FORMAT B: "structure" (Indicator catalogue structure)
CSV Header:
group_id,sub_group_char,sub_sub_group_num,index,result_title,unit
Example:
7.1,ก,1,7.1ก(1)-1,จำนวนนิสิตระดับปริญญาตรี (รวม),คน

Rules for FORMAT B:
Use this format only if the user explicitly provided a new list or catalog of indicators/metrics rather than historical yearly performance data, or if requested format is 'structure'.

Format Requested by User: "${targetFormat}"
(If "${targetFormat}" is "auto", analyze the text: if it contains yearly figures/actual values, output FORMAT A. If it defines new indicator items with titles, output FORMAT B).

### Reference of Known Existing Indicators in the system:
${indicatorListSummary || '(No existing list provided)'}

### User's Input Text:
"""
${text}
"""

### Instructions for your response:
1. Extract ALL indicator records you can find in the user's text.
2. Output ONLY clean JSON with the following schema:
{
  "detectedFormat": "data" | "structure",
  "csv": "index,year,actual,target,unit\\n...",
  "rowCount": number,
  "summary": "Brief 1-2 sentence Thai summary of what data was extracted and how many indicators/years were mapped.",
  "matchedIndicators": ["7.1ก(1)-1", "7.2ก(1)-1"]
}
Do NOT include markdown backticks around the JSON unless standard json markdown. Do NOT put comments inside the JSON.
The "csv" field MUST be valid, well-formed CSV with the header as the first line and newlines between rows. Use quotes around strings if needed.`;

    const candidateModels = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
    let lastError: any = null;
    let rawOutput = '';

    for (const model of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        });
        rawOutput = response.text || '';
        if (rawOutput) break;
      } catch (err: any) {
        lastError = err;
        console.warn(`Model ${model} request failed, attempting fallback:`, err?.message || err);
      }
    }

    if (!rawOutput) {
      throw lastError || new Error('No output generated from AI model');
    }
    let parsedResult;
    try {
      parsedResult = JSON.parse(rawOutput);
    } catch {
      // If direct JSON parse fails, try extracting JSON from markdown fences
      const cleaned = rawOutput.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      parsedResult = JSON.parse(cleaned);
    }

    res.json({
      success: true,
      data: parsedResult,
    });
  } catch (error: any) {
    console.error('Error generating CSV with Gemini:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to generate CSV from text using AI.',
    });
  }
});

// Setup Vite middlewares for development or static serving for production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
