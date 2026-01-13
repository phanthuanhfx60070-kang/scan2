import React, { useState, useEffect, useRef } from 'react';

// 格式化美元数值
const formatUSD = (num) => {
  const absNum = Math.abs(num);
  if (absNum >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (absNum >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (absNum >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num.toFixed(2);
};

export default function App() {
  // --- 状态管理 ---
  const [oiThreshold, setOiThreshold] = useState(2000000); // 7日增长阈值
  const [volMax, setVolMax] = useState(500000000);        // 成交额上限
  const [volMin, setVolMin] = useState(10000000);         // 成交额下限
  const [isScanning, setIsScanning] = useState(false);
  const [statusText, setStatusText] = useState('等待开始...');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [scanResults, setScanResults] = useState([]);
  const [showToast, setShowToast] = useState(false);

  // --- 辅助功能 ---
  const copyToClipboard = (text) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    } catch (err) {
      console.error('复制失败', err);
    }
    document.body.removeChild(textArea);
  };

  const fetchWithRetry = async (url, retries = 3, backoff = 500) => {
    for (let i = 0; i < retries; i++) {
      try {
        const resp = await fetch(url);
        if (resp.status === 429) throw new Error('频率限制 (429)');
        if (!resp.ok) throw new Error(`HTTP 错误 ${resp.status}`);
        return await resp.json();
      } catch (err) {
        if (i === retries - 1) throw err;
        await new Promise(r => setTimeout(r, backoff * (i + 1)));
      }
    }
  };

  // --- 核心扫描逻辑 ---
  const startScan = async () => {
    if (isScanning) return;

    setIsScanning(true);
    setScanResults([]);
    setStatusText("正在拉取 24h 行情数据...");
    
    try {
      // 1. 获取 24h Tickers 过滤流动性
      const tickers = await fetchWithRetry('https://fapi.binance.com/fapi/v1/ticker/24hr');
      
      const targets = tickers.filter(t => 
        t.symbol.endsWith('USDT') && 
        parseFloat(t.quoteVolume) >= volMin &&
        parseFloat(t.quoteVolume) <= volMax
      ).map(t => ({
        symbol: t.symbol,
        volume: parseFloat(t.quoteVolume),
        price: parseFloat(t.lastPrice)
      }));

      setProgress({ current: 0, total: targets.length });

      const currentResults = [];

      for (let i = 0; i < targets.length; i++) {
        const item = targets[i];
        setStatusText(`正在分析 ${item.symbol}...`);
        
        try {
          const [oiData, histData, lsRatioData] = await Promise.all([
            fetchWithRetry(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${item.symbol}`),
            fetchWithRetry(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${item.symbol}&period=1d&limit=8`),
            fetchWithRetry(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${item.symbol}&period=1d&limit=1`)
          ]);

          const currentOIVal = parseFloat(oiData.openInterest) * item.price;
          
          if (histData && histData.length >= 7) {
            const oldOIVal = parseFloat(histData[histData.length - 1].sumOpenInterestValue);
            const netChange = currentOIVal - oldOIVal;
            const lsRatio = lsRatioData && lsRatioData.length > 0 ? parseFloat(lsRatioData[0].longShortRatio) : 1;

            if (netChange >= oiThreshold) {
              const newRes = {
                symbol: item.symbol,
                currentOI: currentOIVal,
                change: netChange,
                volume: item.volume,
                lsRatio: lsRatio
              };
              currentResults.push(newRes);
              // 实时更新列表并排序
              setScanResults([...currentResults].sort((a, b) => b.change - a.change));
            }
          }
        } catch (e) { 
          console.warn(`跳过 ${item.symbol}:`, e); 
        }

        setProgress(prev => ({ ...prev, current: i + 1 }));
        await new Promise(r => setTimeout(r, 150)); // 避免 API 限制
      }
      setStatusText("扫描完成");
    } catch (err) {
      setStatusText(`错误: ${err.message}`);
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="bg-[#0b0e11] text-gray-100 min-h-screen font-sans p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <header className="mb-6 border-b border-gray-800 pb-6">
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-2xl font-bold text-blue-400 mb-1">币安合约高级扫描器 (React)</h1>
              <p className="text-xs text-gray-500 tracking-wide uppercase">自定义阈值筛选 · 点击名称快速复制</p>
            </div>
          </div>
        </header>

        {/* Config Panel */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 bg-[#1e2329] p-6 rounded-xl border border-gray-800 shadow-xl">
          <div className="space-y-2">
            <label className="text-xs text-gray-400 block uppercase">7日持仓增长需超过 ($)</label>
            <input 
              type="number" 
              value={oiThreshold} 
              onChange={(e) => setOiThreshold(e.target.value)}
              className="w-full bg-[#2b3139] border border-gray-700 rounded p-2 text-blue-400 font-mono focus:outline-none focus:border-blue-500" 
            />
            <p className="text-[10px] text-gray-600">默认 2,000,000</p>
          </div>
          <div className="space-y-2">
            <label className="text-xs text-gray-400 block uppercase">24h 成交额上限 ($)</label>
            <input 
              type="number" 
              value={volMax} 
              onChange={(e) => setVolMax(e.target.value)}
              className="w-full bg-[#2b3139] border border-gray-700 rounded p-2 text-gray-200 font-mono focus:outline-none focus:border-blue-500" 
            />
            <p className="text-[10px] text-gray-600">过滤掉成交额过大的巨头 (默认 500M)</p>
          </div>
          <div className="space-y-2">
            <label className="text-xs text-gray-400 block uppercase">24h 成交额下限 ($)</label>
            <input 
              type="number" 
              value={volMin} 
              onChange={(e) => setVolMin(e.target.value)}
              className="w-full bg-[#2b3139] border border-gray-700 rounded p-2 text-gray-200 font-mono focus:outline-none focus:border-blue-500" 
            />
            <p className="text-[10px] text-gray-600">排除不活跃的币种 (默认 10M)</p>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-[#1e2329] rounded-xl p-6 mb-8 shadow-2xl border border-gray-800">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button 
                onClick={startScan}
                disabled={isScanning}
                className={`bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-8 rounded-md transition-all flex items-center gap-2 ${isScanning ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isScanning && (
                  <div className="animate-spin border-2 border-white border-t-transparent rounded-full w-4 h-4"></div>
                )}
                <span>{isScanning ? '扫描中...' : '立即开始扫描'}</span>
              </button>
              <div className="text-sm text-gray-400 italic">
                {statusText}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-gray-500 uppercase tracking-widest">扫描进度</div>
              <div className="text-lg font-mono text-blue-400">
                {progress.current} / {progress.total}
              </div>
            </div>
          </div>
          <div className="w-full bg-gray-800 h-1.5 rounded-full mt-6 overflow-hidden">
            <div 
              className="bg-blue-500 h-full transition-all duration-300" 
              style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
            ></div>
          </div>
        </div>

        {/* Results Table */}
        <div className="bg-[#1e2329] rounded-xl overflow-hidden shadow-2xl border border-gray-800">
          <div className="p-4 border-b border-gray-800 bg-[#2b3139]/50 flex justify-between items-center">
            <h2 className="font-bold text-gray-200 flex items-center gap-2 text-sm">
              🎯 筛选结果 
              <span className="bg-blue-600 text-[10px] px-2 py-0.5 rounded-full text-white">{scanResults.length}</span>
            </h2>
            <span className="text-[10px] text-gray-500 uppercase font-medium">点击名称复制合约名</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-gray-500 text-[11px] uppercase tracking-wider border-b border-gray-800">
                  <th className="px-6 py-4">币种</th>
                  <th className="px-6 py-4 text-right">当前持仓</th>
                  <th className="px-6 py-4 text-right">7日净变动</th>
                  <th className="px-6 py-4 text-center">多空比(LS)</th>
                  <th className="px-6 py-4 text-right">24h 成交额</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {scanResults.length > 0 ? (
                  scanResults.map((res) => (
                    <tr key={res.symbol} className="hover:bg-blue-900/10 transition-colors group">
                      <td 
                        className="px-6 py-4 font-bold text-blue-400 text-lg cursor-pointer hover:text-blue-300 transition-colors"
                        onClick={() => copyToClipboard(res.symbol)}
                      >
                        {res.symbol}
                      </td>
                      <td className="px-6 py-4 text-right text-gray-300 font-mono text-sm">
                        ${formatUSD(res.currentOI)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-green-400 font-bold font-mono">
                          +${formatUSD(res.change)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center font-mono font-bold">
                        <span className={res.lsRatio > 1.2 ? 'text-green-400' : res.lsRatio < 0.8 ? 'text-red-400' : 'text-gray-400'}>
                          {res.lsRatio.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-gray-500 font-mono text-xs">
                        ${formatUSD(res.volume)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="px-6 py-16 text-center text-gray-600 text-sm">
                      {isScanning ? '正在大数据中搜索潜力股...' : '设置参数后，点击开始按钮开始扫描'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-6 py-2 rounded-full shadow-2xl transition-all duration-300 z-50 flex items-center gap-2 ${showToast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
        </svg>
        <span className="text-sm font-bold">合约名称已复制</span>
      </div>
    </div>
  );
}
