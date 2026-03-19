import express from 'express';
import { createServer as createViteServer } from 'vite';
import puppeteer from 'puppeteer';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

fs.writeFileSync('env-dump.json', JSON.stringify(process.env, null, 2));

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Supabase setup (Optional for local dev if keys are missing)
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

app.get(['/api/health', '/api/status'], (req, res) => {
  let geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
  geminiKey = geminiKey.replace(/^["']|["']$/g, '').trim();
  
  // DEBUG: Log all env keys to see what's available
  console.log("Available ENV keys:", Object.keys(process.env).filter(k => k.includes('API') || k.includes('GEMINI')));
  console.log("GEMINI_API_KEY length:", process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0);
  console.log("API_KEY length:", process.env.API_KEY ? process.env.API_KEY.length : 0);

  res.json({
    gemini: !!geminiKey && geminiKey !== 'MY_GEMINI_API_KEY' && geminiKey !== 'YOUR_API_KEY',
    supabaseUrl: !!supabaseUrl && supabaseUrl !== 'your_supabase_url',
    supabaseKey: !!supabaseKey && supabaseKey !== 'your_supabase_anon_key',
    debug: {
      hasGeminiEnv: !!process.env.GEMINI_API_KEY,
      hasApiEnv: !!process.env.API_KEY
    }
  });
});

app.post('/api/roast', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // 0. Check Supabase for existing roast to ensure consistency
  if (supabase) {
    try {
      const { data: existingRoast, error: fetchError } = await supabase
        .from('roasts')
        .select('*')
        .eq('url', url)
        .single();
      
      if (existingRoast) {
        console.log(`Found existing roast for ${url}. Returning cached result.`);
        return res.json({ 
          roast: existingRoast.roast_content, 
          screenshot: existingRoast.screenshot,
          cached: true 
        });
      }
    } catch (err) {
      console.warn('Error checking existing roast:', err);
    }
  }

  // AI Studio injects the key directly into process.env.API_KEY or process.env.GEMINI_API_KEY
  let apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  
  // If we still don't have it, let's try to proceed anyway. The SDK might pick it up from the environment automatically.
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey === 'YOUR_API_KEY') {
     console.warn("Warning: API key seems missing or is a placeholder. Attempting to proceed anyway in case the SDK finds it.");
     // We will pass undefined to GoogleGenAI, which tells it to look for process.env.GEMINI_API_KEY automatically
     apiKey = undefined; 
     
     // CRITICAL FIX: If the environment variable itself is the placeholder, delete it so the SDK doesn't use it!
     if (process.env.GEMINI_API_KEY === 'MY_GEMINI_API_KEY') {
       delete process.env.GEMINI_API_KEY;
     }
     if (process.env.API_KEY === 'MY_GEMINI_API_KEY' || process.env.API_KEY === 'YOUR_API_KEY') {
       delete process.env.API_KEY;
     }
  } else {
     // Strip quotes if the user accidentally included them
     apiKey = apiKey.replace(/^["']|["']$/g, '').trim();
  }

  let browser;
  try {
    // Initialize with the key if we found a valid one, otherwise let the SDK try to find it
    const ai = apiKey ? new GoogleGenAI({ apiKey }) : new GoogleGenAI({});

    // 1. Take Screenshot
    console.log(`Taking screenshot of ${url}...`);
    browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: true,
    });
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
    
    // Capture screenshot as base64
    const screenshotBase64 = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 80 });
    await browser.close();

    // 2. Send to Gemini
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
      config: {
        responseMimeType: 'application/json',
      },
    });

    const roastContent = JSON.parse(response.text || '{}');

    // 3. Save to Supabase (if configured)
    let savedId = null;
    if (supabase) {
      console.log('Saving to Supabase...');
      try {
        const { data: savedData, error: insertError } = await supabase.from('roasts').insert([
          {
            url,
            roast_content: roastContent,
            screenshot: `data:image/jpeg;base64,${screenshotBase64}`
          },
        ]).select().single();

        if (insertError) {
          if (insertError.message?.includes('relation "roasts" does not exist') || 
              insertError.message?.includes('Could not find the table \'public.roasts\' in the schema cache')) {
            console.warn('Supabase "roasts" table not found. Skipping save.');
          } else {
            console.error('Supabase save error:', insertError);
          }
        } else {
          savedId = savedData?.id;
        }
      } catch (dbError) {
        console.error('Supabase save exception:', dbError);
      }
    }

    res.json({ 
      roast: roastContent, 
      screenshot: `data:image/jpeg;base64,${screenshotBase64}`,
      id: savedId
    });
  } catch (error) {
    console.error('Error processing roast:', error);
    if (browser) await browser.close();
    res.status(500).json({ error: 'Failed to roast the landing page. It was too ugly to process.' });
  }
});

app.post('/api/waitlist', async (req, res) => {
  const { email } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  try {
    const { error } = await supabase
      .from('waitlist')
      .insert([{ email }]);

    if (error) {
      if (error.code === '23505') { // Unique violation
        return res.status(409).json({ error: 'You are already on the list!' });
      }
      throw error;
    }

    res.json({ success: true, message: 'Welcome to the Burn List!' });
  } catch (err: any) {
    console.error('Waitlist error:', err.message || err);
    res.status(500).json({ error: 'Failed to join waitlist' });
  }
});

app.get('/api/recent-roasts', async (req, res) => {
  if (!supabase) {
    return res.json([]);
  }

  try {
    const { data, error } = await supabase
      .from('roasts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      // If table doesn't exist yet, return empty array instead of 500
      const isTableMissing = 
        error.code === 'PGRST116' || 
        error.message?.includes('relation "roasts" does not exist') ||
        error.message?.includes('Could not find the table \'public.roasts\' in the schema cache');

      if (isTableMissing) {
        console.warn('Supabase "roasts" table not found. Returning empty list.');
        return res.json([]);
      }
      throw error;
    }
    res.json(data || []);
  } catch (err: any) {
    console.error('Failed to fetch recent roasts:', err.message || err);
    res.status(500).json({ error: 'Failed to fetch recent roasts', details: err.message });
  }
});

// Get a specific roast by ID
app.get('/api/roast/:id', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('roasts')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Roast not found' });
    }

    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get Burn of the Day (Lowest score roast)
app.get('/api/burn-of-the-day', async (req, res) => {
  if (!supabase) {
    return res.json(null);
  }

  try {
    const { data, error } = await supabase
      .from('roasts')
      .select('*')
      .order('roast_content->score', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    
    if (!data) {
      // Fallback to most recent if no "worst" found
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
    console.error('Burn of the day error:', error);
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
