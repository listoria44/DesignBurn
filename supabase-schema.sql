-- Supabase Schema for DesignBurn

-- Create the roasts table
CREATE TABLE public.roasts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    url TEXT NOT NULL,
    screenshot_url TEXT, -- URL of the screenshot stored in Supabase Storage
    roast_content JSONB NOT NULL, -- The JSON response from Gemini
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Set up Row Level Security (RLS)
ALTER TABLE public.roasts ENABLE ROW LEVEL SECURITY;

-- Allow anonymous read access (so anyone can see past roasts)
CREATE POLICY "Allow public read access" ON public.roasts
    FOR SELECT USING (true);

-- Allow anonymous insert access (since this is a public tool)
-- In a production app, you might want to rate limit this or require auth
CREATE POLICY "Allow public insert access" ON public.roasts
    FOR INSERT WITH CHECK (true);

-- Create a storage bucket for screenshots
INSERT INTO storage.buckets (id, name, public) VALUES ('screenshots', 'screenshots', true);

-- Allow public access to the screenshots bucket
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'screenshots');
CREATE POLICY "Public Insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'screenshots');
