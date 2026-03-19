import express from 'express';
import { createServer as createViteServer } from 'vite';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// Supabase setup
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

app.get(['/api/health', '/api/status'], (req, res) => {
  let geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
  geminiKey = geminiKey.replace(/^["']|["']$/g, '').trim();
  
  res.json({
    gemini: !!geminiKey && geminiKey !== 'MY_GEMINI_API_KEY' && geminiKey !== 'YOUR_API_KEY',
    supabaseUrl: !!supabaseUrl && supabaseUrl !== 'your_supabase_url',
    supabaseKey: !!supabaseKey && supabaseKey !== 'your_supabase_anon_key',
    isVercel: !!process.env.VERCEL
  });
});

app.post('/api/roast', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  if (supabase) {
    try {
      const { data: existingRoast } = await supabase
        .from('roasts')
        .select('*')
        .eq('url', url)
        .single();
      
      if (existingRoast) {
        return res.json({ 
          roast: existingRoast.roast_content, 
          screenshot: existingRoast.screenshot,
          id: existingRoast.id,
          cached: true 
        });
      }
    } catch (err) {
      console.warn('Error checking existing roast:', err);
    }
  }

  let apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey === 'YOUR_API_KEY') {
     apiKey = undefined; 
  } else {
     apiKey = apiKey.replace(/^["']|["']$/g, '').trim();
  }

  let browser;
  try {
    const ai = apiKey ? new GoogleGenAI({ apiKey }) : new GoogleGenAI({});

    console.log(`Taking screenshot of ${url}...`);
    
    // Vercel-specific Puppeteer launch
    const isVercel = !!process.env.VERCEL || !!process.env.AWS_REGION || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
    console.log('Environment check:', { isVercel, nodeEnv: process.env.NODE_ENV });
    
    if (isVercel) {
      console.log('Launching Puppeteer on Vercel/AWS...');
      try {
        browser = await puppeteer.launch({
          args: chromium.args,
          defaultViewport: chromium.defaultViewport,
          executablePath: await chromium.executablePath(),
          headless: chromium.headless,
        });
        console.log('Puppeteer launched successfully on Vercel/AWS');
      } catch (launchError: any) {
        console.error('Puppeteer launch error on Vercel/AWS:', launchError.message);
        throw launchError;
      }
    } else {
      console.log('Launching Puppeteer locally...');
      try {
        browser = await puppeteer.launch({
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
          headless: true,
        });
        console.log('Puppeteer launched successfully locally');
      } catch (launchError: any) {
        console.error('Puppeteer launch error locally:', launchError.message);
        throw launchError;
      }
    }

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    } catch (navError: any) {
      console.error('Navigation error:', navError.message);
      await browser.close();
      return res.status(400).json({ 
        error: `Could not reach ${url}. Check the URL and try again.`,
        details: navError.message 
      });
    }
    
    const screenshotBase64 = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 80 });
    await browser.close();

    console.log('Sending to Gemini for roasting...');
    const prompt = `You are "DesignBurn", a world-class, hyper-intelligent, and surgically arrogant UI/UX critic with a PhD in digital disappointment. 
    Your mission is to analyze the provided screenshot of a website and deliver a roast that is brutally honest, technically precise, and laced with dark, global humor (think Gordon Ramsay meets Silicon Valley's Erlich Bachman).
    
    Your tone should be:
    - Arrogant but genius: You know better than everyone.
    - Technically sharp: Critique specific elements like padding, typography, color theory, and accessibility.
    - Darkly humorous: Use analogies that highlight the sheer incompetence of the design.
    - Global appeal: Use humor that resonates with tech-savvy audiences worldwide.
    
    Output MUST be a valid JSON object with the following structure:
    {
      "score": number (0-10, where 0 is a digital war crime and 10 is "survivable"),
      "roast_title": "A short, punchy, insulting title for the roast",
      "visual_flaws": ["List 3-5 specific visual design failures"],
      "ux_nightmares": ["List 3-5 specific user experience failures"],
      "the_burn": "A 2-3 sentence paragraph of pure, concentrated verbal fire",
      "constructive_feedback": {
        "title": "A slightly less insulting title for the fixes",
        "fixes": ["3 specific, actionable steps to stop the bleeding"]
      }
    }
    
    Do not include any text outside the JSON object. Be ruthless. If it's bad, say it's an insult to the history of the internet.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: screenshotBase64,
            },
          },
        ],
      },
    });

    const roastText = response.text;
    const jsonMatch = roastText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Gemini did not return valid JSON');
    }
    const roastData = JSON.parse(jsonMatch[0]);
    const fullScreenshot = `data:image/jpeg;base64,${screenshotBase64}`;

    let roastId = null;
    if (supabase) {
      try {
        const { data: savedRoast, error: saveError } = await supabase
          .from('roasts')
          .insert({
            url,
            roast_content: roastData,
            screenshot: fullScreenshot
          })
          .select()
          .single();
        
        if (saveError) throw saveError;
        roastId = savedRoast.id;
      } catch (err) {
        console.error('Error saving roast to Supabase:', err);
      }
    }

    res.json({ roast: roastData, screenshot: fullScreenshot, id: roastId });
  } catch (error: any) {
    console.error('Roast error:', error);
    if (browser) await browser.close();
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/recent-roasts', async (req, res) => {
  if (!supabase) return res.json([]);
  try {
    const { data, error } = await supabase
      .from('roasts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(12);
    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/roast/:id', async (req, res) => {
  if (!supabase) return res.status(404).json({ error: 'Supabase not configured' });
  try {
    const { data, error } = await supabase
      .from('roasts')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(404).json({ error: 'Roast not found' });
  }
});

app.get('/api/burn-of-the-day', async (req, res) => {
  if (!supabase) {
    console.log('Supabase not configured for burn-of-the-day');
    return res.json(null);
  }
  try {
    console.log('Fetching burn of the day...');
    const { data, error } = await supabase
      .from('roasts')
      .select('*')
      .order('roast_content->score', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Supabase error in burn-of-the-day:', error.message);
      throw error;
    }
    
    if (!data) {
      console.log('No roasts found, fetching most recent...');
      const { data: recentData } = await supabase
        .from('roasts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      return res.json(recentData || null);
    }

    res.json(data);
  } catch (error: any) {
    console.error('Error in burn-of-the-day route:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// For local development
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  async function startDevServer() {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    app.listen(Number(PORT), () => {
      console.log(`Dev server running on http://localhost:${PORT}`);
    });
  }
  startDevServer();
} else {
  // In production (non-Vercel), serve static files
  if (!process.env.VERCEL) {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    app.listen(Number(PORT), () => {
      console.log(`Production server running on http://localhost:${PORT}`);
    });
  }
}

export default app;
