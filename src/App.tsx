import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Flame, ArrowRight, AlertTriangle, Skull, CheckCircle2, XCircle, Settings, Download, HeartHandshake, Zap, Mail, Star, ExternalLink, Share2, Copy, X } from 'lucide-react';
import { domToPng } from 'modern-screenshot';

const FEATURED_DEVS = [
  { name: 'Apple', url: 'apple.com', logo: 'https://www.apple.com/favicon.ico' },
  { name: 'Google', url: 'google.com', logo: 'https://www.google.com/favicon.ico' },
  { name: 'Nvidia', url: 'nvidia.com', logo: 'https://www.nvidia.com/favicon.ico' },
  { name: 'Starbucks', url: 'starbucks.com', logo: 'https://www.starbucks.com/favicon.ico' },
  { name: 'Amazon', url: 'amazon.com', logo: 'https://www.amazon.com/favicon.ico' },
  { name: 'Nike', url: 'nike.com', logo: 'https://www.nike.com/favicon.ico' },
];

interface RoastResult {
  score: number;
  roast_title: string;
  visual_flaws: string[];
  ux_nightmares: string[];
  the_burn: string;
  constructive_feedback?: {
    title: string;
    fixes: string[];
  };
}

export default function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RoastResult | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentRoastId, setCurrentRoastId] = useState<string | null>(null);
  const [showConstructive, setShowConstructive] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [recentRoasts, setRecentRoasts] = useState<any[]>([]);
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistStatus, setWaitlistStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [selectedRoast, setSelectedRoast] = useState<any | null>(null);
  const [burnOfTheDay, setBurnOfTheDay] = useState<any | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waitlistEmail) return;

    setWaitlistLoading(true);
    setWaitlistStatus({ type: null, message: '' });

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: waitlistEmail }),
      });
      const data = await res.json();

      if (res.ok) {
        setWaitlistStatus({ type: 'success', message: data.message });
        setWaitlistEmail('');
      } else {
        setWaitlistStatus({ type: 'error', message: data.error || 'Failed to join' });
      }
    } catch (err) {
      setWaitlistStatus({ type: 'error', message: 'Network error. Try again later.' });
    } finally {
      setWaitlistLoading(false);
    }
  };

  const fetchRecentRoasts = async () => {
    try {
      const res = await fetch('/api/recent-roasts');
      const data = await res.json();
      if (Array.isArray(data)) {
        setRecentRoasts(data);
      } else {
        // If it's an error object from the server, log the message
        const errorMsg = data.details || data.error || 'Unknown error';
        console.warn('Recent roasts fetch warning:', errorMsg);
        setRecentRoasts([]);
      }
    } catch (err: any) {
      console.error('Failed to fetch recent roasts:', err.message || err);
      setRecentRoasts([]);
    }
  };

  const fetchBurnOfTheDay = async () => {
    try {
      const res = await fetch('/api/burn-of-the-day');
      const data = await res.json();
      if (data && !data.error) {
        setBurnOfTheDay(data);
      }
    } catch (err) {
      console.error('Failed to fetch burn of the day:', err);
    }
  };

  const checkSharedRoast = async () => {
    const params = new URLSearchParams(window.location.search);
    const roastId = params.get('roastId');
    if (roastId) {
      try {
        const res = await fetch(`/api/roast/${roastId}`);
        const data = await res.json();
        if (data && !data.error) {
          setSelectedRoast(data);
        }
      } catch (err) {
        console.error('Failed to fetch shared roast:', err);
      }
    }
  };

  React.useEffect(() => {
    fetchRecentRoasts();
    fetchBurnOfTheDay();
    checkSharedRoast();
  }, []);

  const handleDownload = async () => {
    if (!resultRef.current) return;
    setIsDownloading(true);
    try {
      // Wait a bit for animations to settle
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const dataUrl = await domToPng(resultRef.current, {
        scale: 2,
        backgroundColor: '#050505',
        quality: 1,
        features: {
          // modern-screenshot handles oklch/oklab better, but we can still provide fallbacks if needed
          // but usually it works out of the box
        }
      });
      
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `designburn-roast-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Failed to download image', err);
      alert('Failed to generate image. Please try again or take a screenshot manually.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent | null, targetUrl?: string) => {
    if (e) e.preventDefault();
    const finalUrl = targetUrl || url;
    if (!finalUrl) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setScreenshot(null);
    setShowConstructive(false);

    try {
      const formattedUrl = finalUrl.startsWith('http') ? finalUrl : `https://${finalUrl}`;
      const response = await fetch('/api/roast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: formattedUrl }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to roast');
      }

      setResult(data.roast);
      setScreenshot(data.screenshot);
      setCurrentRoastId(data.id);
      
      // If it was a new roast, refresh the wall of shame
      if (!data.cached) {
        fetchRecentRoasts();
      }
      
      // Scroll to result
      setTimeout(() => {
        const element = document.getElementById('roast-result-card');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickRoast = (targetUrl: string) => {
    setUrl(targetUrl);
    handleSubmit(null, targetUrl);
  };

  const handleShare = (id: string) => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?roastId=${id}`;
    navigator.clipboard.writeText(shareUrl);
    setCopyStatus('Link Copied!');
    setTimeout(() => setCopyStatus(null), 2000);
  };

  const RoastModal = ({ roast, onClose }: { roast: any; onClose: () => void }) => {
    if (!roast) return null;
    const content = roast.roast_content;
    
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 backdrop-blur-xl bg-black/80"
        onClick={onClose}
      >
        <motion.div 
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          className="bg-[#050505] w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-[2.5rem] border border-white/10 shadow-2xl relative"
          onClick={e => e.stopPropagation()}
        >
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 z-50 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="p-8 md:p-12">
            <div className="grid md:grid-cols-2 gap-12">
              <div className="space-y-6">
                <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                  <img src={roast.screenshot} alt={roast.url} className="w-full h-auto" />
                  <div className="absolute top-4 left-4 bg-purple-500 text-white px-3 py-1 text-xs font-black uppercase tracking-tighter rounded">
                    EVIDENCE
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                  <span className="text-sm font-mono text-white/40 truncate">{roast.url}</span>
                  <button 
                    onClick={() => handleShare(roast.id)}
                    className="flex items-center gap-2 text-xs font-bold text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    <Share2 className="w-4 h-4" />
                    SHARE
                  </button>
                </div>
              </div>

              <div className="space-y-8">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="px-3 py-1 bg-red-500/20 border border-red-500/50 text-red-400 text-[10px] font-black uppercase tracking-widest rounded">
                      SCORE: {content.score}/10
                    </div>
                    <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest">
                      {new Date(roast.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <h2 className="text-4xl md:text-5xl font-display text-white leading-tight uppercase">
                    {content.roast_title}
                  </h2>
                </div>

                <p className="text-xl text-white/80 italic border-l-4 border-purple-500 pl-6 py-2">
                  "{content.the_burn}"
                </p>

                <div className="grid grid-cols-1 gap-6">
                  <div className="space-y-3">
                    <div className="text-[10px] font-mono text-purple-400 uppercase tracking-widest">Visual Crimes</div>
                    <ul className="space-y-2">
                      {content.visual_flaws.map((f: string, i: number) => (
                        <li key={i} className="text-sm text-white/60 flex items-start gap-3">
                          <span className="text-purple-500 mt-1">●</span> {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="space-y-3">
                    <div className="text-[10px] font-mono text-pink-400 uppercase tracking-widest">UX Nightmares</div>
                    <ul className="space-y-2">
                      {content.ux_nightmares.map((n: string, i: number) => (
                        <li key={i} className="text-sm text-white/60 flex items-start gap-3">
                          <span className="text-pink-500 mt-1">●</span> {n}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {content.constructive_feedback && (
                  <div className="p-6 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl space-y-4">
                    <h3 className="text-lg font-bold text-emerald-400 flex items-center gap-2">
                      <HeartHandshake className="w-5 h-5" />
                      {content.constructive_feedback.title}
                    </h3>
                    <ul className="space-y-2">
                      {content.constructive_feedback.fixes.map((fix: string, i: number) => (
                        <li key={i} className="text-sm text-white/70 flex items-start gap-3">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                          {fix}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-purple-600 selection:text-white bg-grid-pattern">
      {/* Header */}
      <header className="p-6 border-b border-white/5 flex items-center justify-between backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="bg-purple-600 p-2 rounded-xl">
            <Flame className="w-5 h-5 text-white" />
          </div>
          <span className="font-black text-xl tracking-tighter">DESIGNBURN</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-24 flex flex-col items-center">
        {/* Hero Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-3xl w-full"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm font-medium mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
            </span>
            The UI Destroyer
          </div>
          
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-[0.9] mb-6">
            ROAST MY <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">
              LANDING PAGE
            </span>
          </h1>
          <p className="text-lg md:text-xl text-white/60 mb-12 max-w-xl mx-auto font-light leading-relaxed">
            Submit your URL. Our AI critic will destroy your UI/UX with brutal honesty. No sugarcoating, just pure design trauma.
          </p>

          <form onSubmit={handleSubmit} className="relative max-w-2xl mx-auto group">
            <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative flex items-center">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-ugly-site.com"
                className="w-full bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl py-5 pl-6 pr-40 text-lg focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all placeholder:text-white/20 shadow-2xl"
                disabled={loading}
              />
              {url && !loading && (
                <button
                  type="button"
                  onClick={() => setUrl('')}
                  className="absolute right-40 text-white/40 hover:text-white transition-colors"
                  title="Clear"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              )}
              <button
                type="submit"
                disabled={loading || !url}
                className="absolute right-2 top-2 bottom-2 bg-white text-black hover:bg-gray-200 px-6 rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? 'Burning...' : 'Roast It'}
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          </form>
          
          <div className="mt-8 flex items-center justify-center gap-4 text-sm text-white/40">
            <div className="flex -space-x-2">
              {[1,2,3,4].map(i => (
                <img key={i} src={`https://i.pravatar.cc/100?img=${i+10}`} alt="User" className="w-8 h-8 rounded-full border-2 border-black" />
              ))}
            </div>
            <p>Join 10,000+ founders getting their feelings hurt.</p>
          </div>
        </motion.div>

        {/* Loading State */}
        <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="mt-24 flex flex-col items-center"
            >
              <div className="relative w-32 h-32 mb-8">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                  className="absolute inset-0 rounded-full border-t-2 border-purple-500 border-r-2 border-transparent"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Flame className="w-12 h-12 text-purple-500 animate-pulse" />
                </div>
              </div>
              <p className="text-xl font-mono text-purple-400 animate-pulse">Analyzing garbage...</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error State */}
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-12 p-6 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-between gap-4 text-red-400 max-w-2xl w-full backdrop-blur-sm"
          >
            <div className="flex items-center gap-4">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <p>{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 transition-colors" title="Close">
              <XCircle className="w-5 h-5" />
            </button>
          </motion.div>
        )}

        {/* Results Section */}
        <AnimatePresence>
          {result && screenshot && !loading && (
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-24 w-full flex flex-col items-center"
            >
              {/* Actions Bar */}
              <div className="flex flex-wrap items-center justify-center gap-4 mb-12">
                <button
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl font-medium transition-all disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  {isDownloading ? 'Capturing...' : 'Download Share Card'}
                </button>

                {currentRoastId && (
                  <button
                    onClick={() => handleShare(currentRoastId)}
                    className="flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl font-medium transition-all"
                  >
                    <Share2 className="w-4 h-4" />
                    Copy Link
                  </button>
                )}
                
                {result.constructive_feedback && (
                  <button
                    onClick={() => setShowConstructive(!showConstructive)}
                    className={`flex items-center gap-2 px-6 py-3 border rounded-xl font-medium transition-all ${
                      showConstructive 
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' 
                        : 'bg-white/10 hover:bg-white/20 border-white/20'
                    }`}
                  >
                    {showConstructive ? <Zap className="w-4 h-4" /> : <HeartHandshake className="w-4 h-4" />}
                    {showConstructive ? 'Back to the Roast' : 'Okay, how do I fix it?'}
                  </button>
                )}
              </div>

              {/* Shareable Card Area */}
              <div 
                ref={resultRef}
                id="roast-result-card"
                className="w-full bg-[#050505] rounded-[2.5rem] border border-white/10 shadow-2xl relative overflow-hidden min-h-[700px] flex flex-col"
              >
                {/* Background Large Score - Editorial Touch */}
                <div className="absolute -bottom-20 -right-20 text-[40rem] font-display leading-none text-white/[0.03] select-none pointer-events-none">
                  {result.score}
                </div>

                {/* Decorative Elements */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-purple-500 to-transparent opacity-50" />
                <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-pink-500 to-transparent opacity-50" />

                {/* Header Section */}
                <div className="p-8 md:p-12 flex justify-between items-start relative z-10">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Flame className="w-6 h-6 text-purple-500" />
                      <span className="font-display text-2xl tracking-tighter text-white">DESIGNBURN</span>
                    </div>
                    <div className="text-[10px] font-mono text-white/40 uppercase tracking-[0.3em]">Wrapped 2026 Edition</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-mono text-white/40 uppercase tracking-widest mb-1">Status</div>
                    <div className={`text-xs font-bold px-3 py-1 rounded-full border ${
                      result.score < 4 ? 'bg-red-500/10 border-red-500/50 text-red-400' :
                      result.score < 7 ? 'bg-yellow-500/10 border-yellow-500/50 text-yellow-400' :
                      'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
                    }`}>
                      {result.score < 4 ? 'CRITICAL FAILURE' : result.score < 7 ? 'MEDIOCRE' : 'SURVIVABLE'}
                    </div>
                  </div>
                </div>

                {/* Main Content Grid */}
                <div className="flex-1 px-8 md:px-12 pb-12 grid md:grid-cols-12 gap-12 relative z-10">
                  {/* Left Column: The Victim */}
                  <div className="md:col-span-5 flex flex-col justify-center">
                    <div className="relative group">
                      {/* Skewed Frame */}
                      <div className="absolute -inset-4 bg-gradient-to-br from-purple-600/20 to-pink-600/20 rounded-3xl blur-xl opacity-50 group-hover:opacity-100 transition-opacity" />
                      <motion.div 
                        initial={{ rotate: -2, scale: 0.95 }}
                        animate={{ rotate: -2, scale: 1 }}
                        className="relative rounded-2xl overflow-hidden border-4 border-white/10 bg-black shadow-2xl transform hover:rotate-0 transition-transform duration-500"
                      >
                        <img src={screenshot} alt="Screenshot" className="w-full h-auto opacity-90" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                        
                        {/* Label Overlay */}
                        <div className="absolute top-4 left-4 bg-white text-black px-3 py-1 text-[10px] font-black uppercase tracking-tighter">
                          Evidence #{(Math.random() * 10000).toFixed(0)}
                        </div>
                      </motion.div>

                      {/* Score Badge */}
                      <div className="absolute -bottom-6 -right-6 w-32 h-32 bg-white rounded-full flex flex-col items-center justify-center shadow-2xl transform rotate-12 border-8 border-[#050505]">
                        <span className="text-4xl font-display text-black leading-none">{result.score}</span>
                        <span className="text-[10px] font-black text-black/40 uppercase tracking-tighter">Score</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: The Verdict */}
                  <div className="md:col-span-7 flex flex-col justify-center space-y-8">
                    <div className="space-y-4">
                      <div className="inline-block px-3 py-1 bg-purple-500 text-white text-[10px] font-black uppercase tracking-widest">
                        The Verdict
                      </div>
                      <h2 className="text-5xl md:text-7xl font-display text-white leading-[0.9] tracking-tighter uppercase">
                        {result.roast_title}
                      </h2>
                    </div>

                    <div className="relative py-6 border-y border-white/10">
                      <p className="text-xl md:text-2xl font-medium text-white/80 italic leading-relaxed">
                        "{result.the_burn}"
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-8">
                      <div className="space-y-3">
                        <div className="text-[10px] font-mono text-purple-400 uppercase tracking-widest">Visual Crimes</div>
                        <ul className="space-y-2">
                          {result.visual_flaws.slice(0, 2).map((f, i) => (
                            <li key={i} className="text-xs text-white/60 flex items-start gap-2">
                              <span className="text-purple-500">●</span> {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="space-y-3">
                        <div className="text-[10px] font-mono text-pink-400 uppercase tracking-widest">UX Nightmares</div>
                        <ul className="space-y-2">
                          {result.ux_nightmares.slice(0, 2).map((n, i) => (
                            <li key={i} className="text-xs text-white/60 flex items-start gap-2">
                              <span className="text-pink-500">●</span> {n}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Branding */}
                <div className="bg-white/5 p-6 border-t border-white/10 flex justify-between items-center relative z-10">
                  <div className="text-[10px] font-mono text-white/30 uppercase tracking-widest">
                    Generated by AI Genius • designburn.app
                  </div>
                  <div className="flex gap-4">
                    <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                    <div className="w-2 h-2 rounded-full bg-pink-500 animate-pulse delay-75" />
                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse delay-150" />
                  </div>
                </div>
              </div>

              {/* Action Buttons (Not part of the capture) */}
              <div className="grid sm:grid-cols-2 gap-4 mt-8">
                <button 
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="group relative px-8 py-5 bg-white text-black rounded-2xl font-bold text-lg transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3 overflow-hidden disabled:opacity-50"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-400 to-pink-400 opacity-0 group-hover:opacity-10 transition-opacity" />
                  {isDownloading ? (
                    <div className="w-6 h-6 border-3 border-black/20 border-t-black rounded-full animate-spin" />
                  ) : (
                    <Download className="w-6 h-6" />
                  )}
                  {isDownloading ? 'Generating Wrapped...' : 'Download Wrapped Card'}
                </button>

                <button 
                  onClick={() => window.open(`https://twitter.com/intent/tweet?text=I just got my landing page roasted by AI. It gave me a ${result.score}/10. 😭🔥 Try it here: &url=${window.location.href}`, '_blank')}
                  className="px-8 py-5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-3"
                >
                  <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 22.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.008 5.96H5.078z"></path></svg>
                  Share the Burn
                </button>
              </div>

              {/* Constructive Feedback Section (Separate from the card) */}
              {result.constructive_feedback && (
                <div className="mt-12 space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="h-px flex-1 bg-white/10" />
                    <button 
                      onClick={() => setShowConstructive(!showConstructive)}
                      className={`px-6 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2 border ${
                        showConstructive 
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' 
                          : 'bg-white/10 hover:bg-white/20 border-white/20'
                      }`}
                    >
                      {showConstructive ? <Zap className="w-4 h-4" /> : <HeartHandshake className="w-4 h-4" />}
                      {showConstructive ? 'Hide Fixes' : 'Okay, how do I fix it?'}
                    </button>
                    <div className="h-px flex-1 bg-white/10" />
                  </div>

                  <AnimatePresence>
                    {showConstructive && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-3xl p-8 md:p-12">
                          <h3 className="text-2xl font-bold text-emerald-400 mb-8 flex items-center gap-3">
                            <CheckCircle2 className="w-6 h-6" />
                            {result.constructive_feedback.title}
                          </h3>
                          <div className="grid md:grid-cols-3 gap-8">
                            {result.constructive_feedback.fixes.map((fix, i) => (
                              <div key={i} className="space-y-3">
                                <div className="text-3xl font-display text-emerald-500/20">0{i+1}</div>
                                <p className="text-white/80 leading-relaxed">{fix}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hall of Infamy - Featured Devs */}
        <section className="mt-32 w-full max-w-6xl mx-auto px-6">
          <div className="mb-12">
            <h2 className="text-3xl font-black text-white flex items-center gap-3">
              <Star className="w-8 h-8 text-yellow-500" />
              Hall of Infamy
            </h2>
            <p className="text-white/40 mt-2">See how the giants fall. One click to roast the legends.</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {FEATURED_DEVS.map((dev) => (
              <button
                key={dev.name}
                onClick={() => handleQuickRoast(dev.url)}
                disabled={loading}
                className="group relative bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col items-center gap-4 transition-all hover:bg-white/10 hover:border-white/20 hover:scale-[1.05] disabled:opacity-50"
              >
                <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors overflow-hidden">
                  <img src={dev.logo} alt={dev.name} className="w-6 h-6 grayscale group-hover:grayscale-0 transition-all" />
                </div>
                <span className="text-sm font-bold text-white/60 group-hover:text-white transition-colors">{dev.name}</span>
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ExternalLink className="w-3 h-3 text-white/40" />
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Waitlist Section - The Hook */}
        <section className="mt-32 w-full max-w-4xl mx-auto px-6">
          <div className="relative bg-gradient-to-br from-purple-600/20 to-pink-600/20 border border-white/10 rounded-[3rem] p-12 overflow-hidden text-center">
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(168,85,247,0.1),transparent_70%)]" />
            
            <div className="relative z-10 space-y-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-xs font-bold text-purple-400 uppercase tracking-widest">
                <Mail className="w-4 h-4" />
                The Burn List
              </div>
              
              <div className="space-y-4">
                <h2 className="text-4xl md:text-5xl font-display text-white leading-tight uppercase">
                  Get the <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">Deep Analysis</span> of the Giants
                </h2>
                <p className="text-white/60 text-lg max-w-2xl mx-auto">
                  Don't just watch the roast. Get our weekly deep-dive analysis on how tech giants are failing their users and how you can avoid their mistakes.
                </p>
              </div>

              <form onSubmit={handleWaitlistSubmit} className="max-w-md mx-auto flex flex-col sm:flex-row gap-3">
                <input
                  type="email"
                  value={waitlistEmail}
                  onChange={(e) => setWaitlistEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                  className="flex-1 px-6 py-4 bg-black/40 border border-white/10 rounded-2xl text-white placeholder:text-white/20 focus:outline-none focus:border-purple-500/50 transition-all"
                />
                <button
                  type="submit"
                  disabled={waitlistLoading}
                  className="px-8 py-4 bg-white text-black font-bold rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 whitespace-nowrap"
                >
                  {waitlistLoading ? 'Joining...' : 'Join the List'}
                </button>
              </form>

              <AnimatePresence>
                {waitlistStatus.type && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={`text-sm font-medium ${waitlistStatus.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}
                  >
                    {waitlistStatus.message}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </section>

      {/* Wall of Shame */}
      <section className="mt-32 w-full max-w-6xl mx-auto px-6">
        <div className="flex items-center justify-between mb-12">
          <div>
            <h2 className="text-3xl font-black text-white flex items-center gap-3">
              <Skull className="w-8 h-8 text-purple-500" />
              Wall of Shame
            </h2>
            <p className="text-white/40 mt-2">The most recent victims of DesignBurn.</p>
          </div>
          <div className="text-sm font-mono text-purple-400/60 uppercase tracking-widest">
            {Array.isArray(recentRoasts) ? recentRoasts.length : 0} Victims
          </div>
        </div>

        {/* Burn of the Day */}
        {burnOfTheDay && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            onClick={() => setSelectedRoast(burnOfTheDay)}
            className="mb-12 group cursor-pointer relative overflow-hidden bg-gradient-to-br from-red-600/20 via-purple-600/10 to-transparent border border-red-500/30 rounded-[2.5rem] p-8 md:p-12"
          >
            <div className="absolute top-0 right-0 p-8">
              <div className="bg-red-500 text-white px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest animate-pulse">
                Burn of the Day
              </div>
            </div>
            
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div className="order-2 md:order-1 space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-red-500 font-mono text-xs font-bold uppercase tracking-widest">Worst Performance</span>
                    <span className="text-white/20">•</span>
                    <span className="text-white/40 text-xs font-mono">{burnOfTheDay.url}</span>
                  </div>
                  <h3 className="text-4xl md:text-6xl font-display text-white leading-tight uppercase group-hover:text-red-400 transition-colors">
                    {burnOfTheDay.roast_content.roast_title}
                  </h3>
                </div>
                <p className="text-xl text-white/60 italic leading-relaxed">
                  "{burnOfTheDay.roast_content.the_burn}"
                </p>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center text-xl font-black text-white">
                    {burnOfTheDay.roast_content.score}
                  </div>
                  <div className="text-sm font-bold text-white/40 uppercase tracking-tighter">
                    Disaster Score
                  </div>
                </div>
              </div>
              <div className="order-1 md:order-2 relative">
                <div className="absolute -inset-4 bg-red-500/20 blur-2xl rounded-full opacity-50 group-hover:opacity-100 transition-opacity" />
                <div className="relative rounded-2xl overflow-hidden border-4 border-white/10 shadow-2xl rotate-2 group-hover:rotate-0 transition-transform duration-500">
                  <img src={burnOfTheDay.screenshot} alt="Burn of the Day" className="w-full h-auto" />
                </div>
              </div>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {Array.isArray(recentRoasts) && recentRoasts.map((roast, i) => (
            <motion.div
              key={roast.id || i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              onClick={() => setSelectedRoast(roast)}
              className="group cursor-pointer bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:border-purple-500/50 transition-all hover:shadow-2xl hover:shadow-purple-500/10"
            >
              <div className="aspect-video relative overflow-hidden bg-black">
                <img 
                  src={roast.screenshot} 
                  alt={roast.url} 
                  className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                  <span className="text-xs font-mono text-white/60 truncate max-w-[150px]">{roast.url}</span>
                  <span className="px-2 py-1 bg-purple-500/20 border border-purple-500/30 rounded text-xs font-bold text-purple-400">
                    {roast.roast_content.score}/10
                  </span>
                </div>
              </div>
              <div className="p-6">
                <h3 className="font-bold text-white mb-2 line-clamp-1">{roast.roast_content.roast_title}</h3>
                <p className="text-sm text-white/50 italic line-clamp-2">"{roast.roast_content.the_burn}"</p>
              </div>
            </motion.div>
          ))}
          
          {(!Array.isArray(recentRoasts) || recentRoasts.length === 0) && (
            <div className="col-span-full py-20 text-center border-2 border-dashed border-white/5 rounded-3xl">
              <p className="text-white/20 font-medium">No victims yet. Who's first?</p>
            </div>
          )}
        </div>
      </section>
    </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-12 mt-20">
        <div className="max-w-5xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-white/40">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-purple-500" />
            <span>© 2026 DesignBurn. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            <a href="https://producthunt.com" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">Product Hunt</a>
          </div>
        </div>
      </footer>

      {/* Roast Modal */}
      <AnimatePresence>
        {selectedRoast && (
          <RoastModal roast={selectedRoast} onClose={() => setSelectedRoast(null)} />
        )}
      </AnimatePresence>

      {/* Copy Status Toast */}
      <AnimatePresence>
        {copyStatus && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[110] bg-emerald-500 text-white px-6 py-3 rounded-xl font-bold shadow-2xl flex items-center gap-2"
          >
            <CheckCircle2 className="w-5 h-5" />
            {copyStatus}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
