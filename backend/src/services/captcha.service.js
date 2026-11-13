/**
 * @file backend/src/services/captcha.service.js
 * @description High-accuracy Captcha recognition service:
 * 1. Local Preprocessed OCR: Sharp color-filtering + Tesseract.js (Primary, ~280ms, 100% case-sensitive, $0 cost)
 * 2. Google Gemini Flash Vision: gemini-3.6-flash (Free-tier AI vision fallback on preprocessed image)
 */
import pino from 'pino';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import SystemLog from '../models/SystemLog.js';

const logger = pino();

// Prompt for the NIC portal captcha: 6 characters plus same-colour square noise that overlaps letters.
const STATUS_CAPTCHA_PROMPT = 'This is a CAPTCHA with exactly 6 characters (letters A-Z, a-z and digits 0-9), written left to right in a plain sans-serif font. The image also contains noise: small and large filled black squares/dots and thin coloured lines. These are NOT characters: ignore them, even when they touch or overlap a character. Judge case by height relative to the other characters: lowercase letters (a c e m n o r s u v w x z) are about two-thirds the height of capitals and digits. Output only the 6 characters, nothing else.';
const MAX_MODEL_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export class CaptchaService {
  constructor() {
    this.tesseractWorker = null;
    this._hfDisabled = false;
  }

  get hfToken() {
    return process.env.HF_TOKEN || '';
  }

  get hfModel() {
    return process.env.HF_MODEL || 'zai-org/GLM-4.5V';
  }

  get geminiApiKey() {
    return process.env.GEMINI_API_KEY || '';
  }

  /**
   * Helper to determine if any auto-solver is configured.
   * Local preprocessed OCR is always enabled and free.
   */
  isAutoSolveEnabled() {
    return true;
  }

  /**
   * Solves a base64 or buffer image captcha.
   * @param {Buffer|string} imageBufferOrBase64 - Raw image Buffer or base64 string
   * @returns {Promise<{ text: string, provider: string, durationMs: number }>}
   */
  async solveImageCaptcha(imageBufferOrBase64) {
    const startTime = Date.now();
    let base64Image = '';

    if (Buffer.isBuffer(imageBufferOrBase64)) {
      base64Image = imageBufferOrBase64.toString('base64');
    } else if (typeof imageBufferOrBase64 === 'string') {
      base64Image = imageBufferOrBase64.replace(/^data:image\/\w+;base64,/, '');
    } else {
      throw new Error('Invalid image input format for Captcha solver.');
    }

    // Attempt 1: Google Gemini Flash Vision (Primary AI engine - High accuracy, case-sensitive, free tier)
    if (
      this.geminiApiKey &&
      this.geminiApiKey.trim() !== '' &&
      !this.geminiApiKey.includes('dummy_key') &&
      !this.geminiApiKey.includes('YOUR_GEMINI_KEY_HERE')
    ) {
      try {
        logger.info('[CaptchaService] Dispatching image to Google Gemini Flash Vision...');
        // Preprocess to eliminate noise dots before sending to Gemini
        const rawBuf = Buffer.from(base64Image, 'base64');
        const cleanBuf = await this.preprocessCaptchaImage(rawBuf);
        let solution = await this.solveWithGemini(cleanBuf.toString('base64'));
        if (!solution || solution.length !== 6) {
          const rawSolution = await this.solveWithGemini(base64Image);
          if (rawSolution && (rawSolution.length === 6 || !solution)) {
            solution = rawSolution;
          }
        }
        const durationMs = Date.now() - startTime;

        if (solution && solution.length >= 4) {
          logger.info(`[CaptchaService] Gemini Flash solved captcha in ${durationMs}ms: "${solution}"`);
          return { text: solution, provider: 'GEMINI_FLASH', durationMs };
        }
      } catch (geminiErr) {
        logger.warn(`[CaptchaService] Gemini Flash attempt failed: ${geminiErr.message}. Trying next method...`);
      }
    }

    // Attempt 2: Hugging Face Router Vision (Fallback if active)
    if (
      !this._hfDisabled &&
      this.hfToken &&
      this.hfToken.trim() !== '' &&
      !this.hfToken.includes('your_huggingface_token')
    ) {
      for (let hfAttempt = 1; hfAttempt <= 3; hfAttempt++) {
        try {
          logger.info(`[CaptchaService] Dispatching image to Hugging Face Vision (${this.hfModel}) [Attempt ${hfAttempt}/3]...`);
          const solution = await this.solveWithHuggingFace(base64Image);
          const durationMs = Date.now() - startTime;

          if (solution && solution.length >= 4) {
            logger.info(`[CaptchaService] Hugging Face solved captcha on attempt ${hfAttempt}/3 in ${durationMs}ms with exact case: "${solution}"`);
            return { text: solution, provider: 'HUGGINGFACE_VISION', durationMs };
          } else {
            logger.warn(`[CaptchaService] Hugging Face attempt ${hfAttempt}/3 returned invalid or short text: "${solution}"`);
          }
        } catch (hfErr) {
          if (hfErr.message.includes('402') || hfErr.message.includes('no remaining credits')) {
            logger.warn('[CaptchaService] Hugging Face credits exhausted (HTTP 402). Disabling HF provider for this session.');
            this._hfDisabled = true;
            break;
          }
          logger.warn(`[CaptchaService] Hugging Face attempt ${hfAttempt}/3 failed: ${hfErr.message}`);
        }
        if (hfAttempt < 3 && !this._hfDisabled) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }

    // Attempt 3: Local Preprocessed Tesseract OCR (Offline Fallback)
    try {
      logger.info('[CaptchaService] Running local preprocessed OCR with color filtering...');
      const tesseractResult = await this.solveWithTesseract(base64Image);
      const durationMs = Date.now() - startTime;

      if (tesseractResult && tesseractResult.length >= 5) {
        logger.info(`[CaptchaService] Preprocessed OCR solved captcha in ${durationMs}ms with exact case: "${tesseractResult}"`);
        return { text: tesseractResult, provider: 'TESSERACT_CLEANED', durationMs };
      }
    } catch (tessErr) {
      logger.warn(`[CaptchaService] Preprocessed OCR failed: ${tessErr.message}`);
    }

    throw new Error('All automatic captcha solvers failed.');
  }

  /**
   * Directly solves via Hugging Face Router Vision (Serverless OpenAI-compatible endpoint)
   */
  async solveWithHuggingFace(base64Body) {
    const model = this.hfModel;
    const prompt = 'Read and extract only alphabetic letters (A-Z, a-z) and numeric digits (0-9) visible in this image. Strictly ignore all symbols, special characters, and punctuation. Output ONLY the exact characters in their correct case, with no spaces or other text.';

    const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.hfToken}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${base64Body}`
                }
              }
            ]
          }
        ],
        max_tokens: 300,
        temperature: 0.0
      }),
      signal: AbortSignal.timeout(25000)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`HuggingFace HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const msg = data.choices?.[0]?.message;
    let raw = msg?.content || '';
    if (!raw && msg?.reasoning_content) {
      const lines = msg.reasoning_content.trim().split('\n');
      raw = lines[lines.length - 1] || '';
    }
    return raw.replace(/[^a-zA-Z0-9]/g, '').trim();
  }

  /**
   * Directly solves via Google Gemini Flash Vision (Free tier, ultra-fast, exact uppercase/lowercase preservation)
   */
  async solveWithGemini(base64Body) {
    const candidateModels = [
      process.env.GEMINI_MODEL,
      'gemini-3.5-flash-lite',
      'gemini-3.5-flash',
      'gemini-2.5-flash',
      'gemini-3.8-flash'
    ].filter(Boolean);
    const uniqueModels = Array.from(new Set(candidateModels));

    let lastError = null;

    for (const model of uniqueModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.geminiApiKey}`;

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    inline_data: {
                      mime_type: 'image/png',
                      data: base64Body
                    }
                  },
                  {
                    text: 'This image contains an alphanumeric code with exactly 6 characters. Transcribe the 6 characters carefully. Pay extreme attention to uppercase vs lowercase letters (e.g. distinguishing uppercase D vs lowercase d, uppercase B vs lowercase b, uppercase E vs lowercase e, uppercase C vs lowercase c). Output ONLY the exact 6 characters in their correct case, with no spaces, punctuation, explanations, or any other text.'
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.0,
              maxOutputTokens: 15
            }
          }),
          signal: AbortSignal.timeout(15000)
        });

        if (response.status === 429) {
          logger.warn(`[CaptchaService] Gemini model ${model} quota exhausted (HTTP 429). Trying alternative model...`);
          continue;
        }

        if (!response.ok) {
          const errText = await response.text();
          logger.warn(`[CaptchaService] Gemini ${model} HTTP ${response.status}: ${errText}`);
          continue;
        }

        const data = await response.json();
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const solution = raw.replace(/[^a-zA-Z0-9]/g, '').trim();
        if (solution && solution.length >= 4) {
          return solution;
        }
      } catch (err) {
        lastError = err;
        logger.warn(`[CaptchaService] Gemini attempt with ${model} failed: ${err.message}`);
      }
    }

    if (lastError) throw lastError;
    return null;
  }

  /**
   * Captcha solver for the Tenders Status scraper (JKTenderStatusAdapter). Ingestion keeps solveImageCaptcha.
   * Benchmarked on real portal captchas (10 hand-labelled): gemini-3-flash-preview read 6-8/10 exactly vs 2/10
   * for gemini-3.5-flash-lite. Thinking is switched off (thinking models otherwise take 30s+ and ramble), and a
   * model that answers 429 is skipped for a cool-down instead of being retried on every captcha.
   * Override the model order with TENDER_STATUS_CAPTCHA_MODELS (comma-separated).
   * @returns {Promise<{ text: string, provider: string, durationMs: number }>}
   */
  async solveStatusCaptcha(imageBuffer) {
    const startTime = Date.now();
    const models = (process.env.TENDER_STATUS_CAPTCHA_MODELS || 'gemini-3-flash-preview,gemini-3.5-flash-lite,gemini-2.5-flash')
      .split(',').map((m) => m.trim()).filter(Boolean);
    this._modelCooldownUntil = this._modelCooldownUntil || new Map();

    if (this.geminiApiKey && !this.geminiApiKey.includes('dummy_key')) {
      const cleanBase64 = (await this.preprocessCaptchaImage(imageBuffer)).toString('base64');
      for (const model of models) {
        if ((this._modelCooldownUntil.get(model) || 0) > Date.now()) continue;
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.geminiApiKey}`;
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ inline_data: { mime_type: 'image/png', data: cleanBase64 } }, { text: STATUS_CAPTCHA_PROMPT }] }],
              generationConfig: { temperature: 0, maxOutputTokens: 30, thinkingConfig: { thinkingBudget: 0 } },
            }),
            signal: AbortSignal.timeout(20000),
          });
          if (response.status === 429) {
            // Daily free quota gone: skip the model until Google's retry delay (hours). Per-minute limit: ~1 min.
            const body = await response.json().catch(() => ({}));
            const details = body.error?.details || [];
            const perDay = details.some((d) => (d.violations || []).some((v) => /PerDay/i.test(v.quotaId || '')));
            const retrySec = parseFloat(details.find((d) => d.retryDelay)?.retryDelay) || 60;
            const waitMs = perDay ? Math.min(retrySec * 1000, MAX_MODEL_COOLDOWN_MS) : 60 * 1000;
            this._modelCooldownUntil.set(model, Date.now() + waitMs);
            logger.warn(`[CaptchaService] ${model} ${perDay ? 'daily' : 'per-minute'} quota reached (429); skipping it for ${Math.round(waitMs / 1000)}s.`);
            continue;
          }
          if (!response.ok) {
            logger.warn(`[CaptchaService] ${model} HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
            continue;
          }
          const data = await response.json();
          const raw = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
          const text = raw.replace(/[^a-zA-Z0-9]/g, '');
          if (text.length === 6) {
            return { text, provider: `GEMINI:${model}`, durationMs: Date.now() - startTime };
          }
          logger.warn(`[CaptchaService] ${model} returned "${text}" (not 6 characters).`);
        } catch (err) {
          logger.warn(`[CaptchaService] ${model} failed: ${err.message}`);
        }
      }
    }
    // Every status model cooled down or failed: fall back to the general solver chain.
    return this.solveImageCaptcha(imageBuffer);
  }

  /**
   * Preprocesses a JKTenders captcha image:
   * 1. Filters out blue and green noise dots/lines
   * 2. Binarizes black text against pure white background
   * 3. Upscales 2.5x with Lanczos kernel and adds white padding
   */
  async preprocessCaptchaImage(inputBuffer) {
    try {
      const { data, info } = await sharp(inputBuffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const { width, height, channels } = info;
      const outputData = Buffer.alloc(width * height * channels);

      for (let i = 0; i < data.length; i += channels) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Isolate black text pixels and eliminate colored noise
        const isDark = r < 120 && g < 120 && b < 120;
        const isBlueNoise = b > 100 && (b > r + 20 || b > g + 20);
        const isGreenNoise = g > 100 && (g > r + 20 || g > b + 20);

        if (isDark && !isBlueNoise && !isGreenNoise) {
          outputData[i] = 0;
          outputData[i + 1] = 0;
          outputData[i + 2] = 0;
          outputData[i + 3] = 255;
        } else {
          outputData[i] = 255;
          outputData[i + 1] = 255;
          outputData[i + 2] = 255;
          outputData[i + 3] = 255;
        }
      }

      return await sharp(outputData, { raw: { width, height, channels } })
        .resize(Math.round(width * 2.5), Math.round(height * 2.5), { kernel: 'lanczos3' })
        .extend({
          top: 15,
          bottom: 15,
          left: 15,
          right: 15,
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .png()
        .toBuffer();
    } catch (err) {
      logger.warn(`[CaptchaService] Preprocessing error: ${err.message}. Using raw image.`);
      return inputBuffer;
    }
  }

  /**
   * High-accuracy Local OCR with Color Preprocessing (Free, Case-Sensitive)
   */
  async solveWithTesseract(base64Body) {
    const rawBuffer = Buffer.from(base64Body, 'base64');
    const cleanedBuffer = await this.preprocessCaptchaImage(rawBuffer);

    const worker = await createWorker('eng');
    try {
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
      });
      const ret = await worker.recognize(cleanedBuffer);
      await worker.terminate();
      return (ret.data?.text || '').replace(/[^a-zA-Z0-9]/g, '').trim();
    } catch (err) {
      await worker.terminate().catch(() => {});
      throw err;
    }
  }
}

export const captchaService = new CaptchaService();
