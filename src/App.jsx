<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>币安合约自定义扫描器</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        .loading-spinner {
            border: 3px solid #f3f3f3;
            border-top: 3px solid #3b82f6;
            border-radius: 50%;
            width: 16px;
            height: 16px;
            animation: spin 1s linear infinite;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        
        /* 复制成功的提示动画 */
        #copyToast {
            transition: opacity 0.3s, transform 0.3s;
            transform: translateY(20px);
        }
        #copyToast.show {
            opacity: 1;
            transform: translateY(0);
        }

        .success-row { animation: highlight 1.5s ease-out; }
        @keyframes highlight { from { background-color: rgba(59, 130, 246, 0.2); } to { background-color: transparent; } }
    </style>
</head>
<body class="bg-[#0b0e11] text-gray-100 min-h-screen font-sans">
    <div class="max-w-5xl mx-auto p-4 md:p-8">
        <!-- Header -->
        <header class="mb-6 border-b border-gray-800 pb-6">
            <div class="flex justify-between items-end">
                <div>
                    <h1 class="text-2xl font-bold text-blue-400 mb-1">币安合约高级扫描器</h1>
                    <p class="text-xs text-gray-500 tracking-wide uppercase">自定义阈值筛选 · 点击名称快速复制</p>
                </div>
            </div>
        </header>

        <!-- Config Panel -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 bg-[#1e2329] p-6 rounded-xl border border-gray-800 shadow-xl">
            <div class="space-y-2">
                <label class="text-xs text-gray-400 block uppercase">7日持仓增长需超过 ($)</label>
                <input type="number" id="oiThreshold" value="2000000" class="w-full bg-[#2b3139] border border-gray-700 rounded p-2 text-blue-400 font-mono focus:outline-none focus:border-blue-500">
                <p class="text-[10px] text-gray-600">默认 2M (200万)</p>
            </div>
            <div class="space-y-2">
                <label class="text-xs text-gray-400 block uppercase">24h 成交额上限 ($)</label>
                <input type="number" id="volMax" value="500000000" class="w-full bg-[#2b3139] border border-gray-700 rounded p-2 text-gray-200 font-mono focus:outline-none focus:border-blue-500">
                <p class="text-[10px] text-gray-600">超过此值的币种将被过滤 (默认 500M)</p>
            </div>
            <div class="space-y-2">
                <label class="text-xs text-gray-400 block uppercase">24h 成交额下限 ($)</label>
                <input type="number" id="volMin" value="10000000" class="w-full bg-[#2b3139] border border-gray-700 rounded p-2 text-gray-200 font-mono focus:outline-none focus:border-blue-500">
                <p class="text-[10px] text-gray-600">低于此值的币种将被忽略 (默认 10M)</p>
            </div>
        </div>

        <!-- Controls -->
        <div class="bg-[#1e2329] rounded-xl p-6 mb-8 shadow-2xl border border-gray-800">
            <div class="flex flex-wrap items-center justify-between gap-4">
                <div class="flex items-center gap-4">
                    <button id="startBtn" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-8 rounded-md transition-all flex items-center gap-2">
                        <span>立即扫描</span>
                    </button>
                    <div id="statusInfo" class="text-sm text-gray-400 hidden italic flex items-center gap-2">
                        <div class="loading-spinner"></div>
                        <span id="statusText">准备中...</span>
                    </div>
                </div>
                <div class="flex items-center gap-6">
                    <div class="text-right">
                        <div class="text-[10px] text-gray-500 uppercase">扫描进度</div>
                        <div class="text-lg font-mono text-blue-400" id="progressText">0 / 0</div>
                    </div>
                </div>
            </div>
            <div class="w-full bg-gray-800 h-1.5 rounded-full mt-6 overflow-hidden">
                <div id="progressBar" class="bg-blue-500 h-full w-0 transition-all duration-300"></div>
            </div>
        </div>

        <!-- Results Table -->
        <div class="bg-[#1e2329] rounded-xl overflow-hidden shadow-2xl border border-gray-800">
            <div class="p-4 border-b border-gray-800 bg-[#2b3139]/50 flex justify-between items-center">
                <h2 class="font-bold text-gray-200 flex items-center gap-2">
                    符合条件的币种 
                    <span id="matchCount" class="bg-blue-600 text-[11px] px-2 py-0.5 rounded-full text-white">0</span>
                </h2>
                <span class="text-[10px] text-gray-500 uppercase">提示：点击币种名称即可复制</span>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="text-gray-500 text-[11px] uppercase tracking-wider border-b border-gray-800">
                            <th class="px-6 py-4">币种 (点击复制)</th>
                            <th class="px-6 py-4 text-right">当前持仓</th>
                            <th class="px-6 py-4 text-right">7日净增长</th>
                            <th class="px-6 py-4 text-center">多空比 (LS)</th>
                            <th class="px-6 py-4 text-right">24h 成交额</th>
                        </tr>
                    </thead>
                    <tbody id="resultBody" class="divide-y divide-gray-800">
                        <tr id="emptyRow">
                            <td colspan="5" class="px-6 py-16 text-center text-gray-600">
                                配置上方参数后点击开始扫描
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- Toast Notification -->
    <div id="copyToast" class="fixed bottom-10 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-6 py-2 rounded-full shadow-2xl opacity-0 pointer-events-none z-50 flex items-center gap-2">
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"></path></svg>
        <span>合约名称已复制</span>
    </div>

    <script>
        const startBtn = document.getElementById('startBtn');
        const statusInfo = document.getElementById('statusInfo');
        const statusText = document.getElementById('statusText');
        const progressText = document.getElementById('progressText');
        const progressBar = document.getElementById('progressBar');
        const resultBody = document.getElementById('resultBody');
        const matchCountEl = document.getElementById('matchCount');
        const copyToast = document.getElementById('copyToast');

        // Inputs
        const oiInput = document.getElementById('oiThreshold');
        const volMaxInput = document.getElementById('volMax');
        const volMinInput = document.getElementById('volMin');

        let isScanning = false;
        let scanResults = [];

        const formatUSD = (num) => {
            const absNum = Math.abs(num);
            if (absNum >= 1e9) return (num / 1e9).toFixed(2) + 'B';
            if (absNum >= 1e6) return (num / 1e6).toFixed(2) + 'M';
            if (absNum >= 1e3) return (num / 1e3).toFixed(1) + 'K';
            return num.toFixed(2);
        };

        function showToast() {
            copyToast.classList.add('show');
            setTimeout(() => copyToast.classList.remove('show'), 2000);
        }

        function copyToClipboard(text) {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                showToast();
            } catch (err) {
                console.error('复制失败', err);
            }
            document.body.removeChild(textArea);
        }

        async function fetchWithRetry(url, retries = 3, backoff = 500) {
            for (let i = 0; i < retries; i++) {
                try {
                    const resp = await fetch(url);
                    if (resp.status === 429) throw new Error('Rate Limited');
                    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                    return await resp.json();
                } catch (err) {
                    if (i === retries - 1) throw err;
                    await new Promise(r => setTimeout(r, backoff * (i + 1)));
                }
            }
        }

        async function startScan() {
            if (isScanning) return;

            // 获取用户自定义参数
            const minOIChange = parseFloat(oiInput.value) || 0;
            const maxVol = parseFloat(volMaxInput.value) || Infinity;
            const minVol = parseFloat(volMinInput.value) || 0;

            isScanning = true;
            startBtn.disabled = true;
            startBtn.classList.add('opacity-50');
            statusInfo.classList.remove('hidden');
            resultBody.innerHTML = '';
            scanResults = [];
            matchCountEl.innerText = '0';

            try {
                statusText.innerText = "正在拉取行情...";
                const tickers = await fetchWithRetry('https://fapi.binance.com/fapi/v1/ticker/24hr');
                
                // 初步筛选活跃度
                const targets = tickers.filter(t => 
                    t.symbol.endsWith('USDT') && 
                    parseFloat(t.quoteVolume) >= minVol &&
                    parseFloat(t.quoteVolume) <= maxVol
                ).map(t => ({
                    symbol: t.symbol,
                    volume: parseFloat(t.quoteVolume),
                    price: parseFloat(t.lastPrice)
                }));

                progressText.innerText = `0 / ${targets.length}`;

                for (let i = 0; i < targets.length; i++) {
                    const item = targets[i];
                    statusText.innerText = `正在处理 ${item.symbol}...`;
                    
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

                            if (netChange >= minOIChange) {
                                scanResults.push({
                                    symbol: item.symbol,
                                    currentOI: currentOIVal,
                                    change: netChange,
                                    volume: item.volume,
                                    lsRatio: lsRatio
                                });
                                renderResults();
                            }
                        }
                    } catch (e) { console.warn(`跳过 ${item.symbol}: ${e.message}`); }

                    const prog = ((i + 1) / targets.length) * 100;
                    progressText.innerText = `${i + 1} / ${targets.length}`;
                    progressBar.style.width = `${prog}%`;
                    
                    await new Promise(r => setTimeout(r, 200)); 
                }
                statusText.innerText = "扫描已完成";
            } catch (err) {
                statusText.innerText = "扫描出错: " + err.message;
            } finally {
                isScanning = false;
                startBtn.disabled = false;
                startBtn.classList.remove('opacity-50');
            }
        }

        function renderResults() {
            scanResults.sort((a, b) => b.change - a.change);
            resultBody.innerHTML = '';
            matchCountEl.innerText = scanResults.length;

            scanResults.forEach(res => {
                const row = document.createElement('tr');
                row.className = "hover:bg-blue-900/10 transition-colors success-row group cursor-pointer";
                
                const lsColor = res.lsRatio > 1.2 ? 'text-green-400' : (res.lsRatio < 0.8 ? 'text-red-400' : 'text-gray-400');
                
                row.innerHTML = `
                    <td class="px-6 py-4 font-bold text-blue-400 text-lg hover:text-blue-300 active:scale-95 transition-transform" onclick="copyToClipboard('${res.symbol}')">
                        ${res.symbol}
                    </td>
                    <td class="px-6 py-4 text-right text-gray-300 font-mono text-sm">$${formatUSD(res.currentOI)}</td>
                    <td class="px-6 py-4 text-right">
                        <span class="text-green-400 font-bold font-mono">+$${formatUSD(res.change)}</span>
                    </td>
                    <td class="px-6 py-4 text-center">
                        <span class="${lsColor} font-bold font-mono">${res.lsRatio.toFixed(2)}</span>
                    </td>
                    <td class="px-6 py-4 text-right text-gray-500 font-mono text-xs">
                        $${formatUSD(res.volume)}
                    </td>
                `;
                resultBody.appendChild(row);
            });
        }

        startBtn.addEventListener('click', startScan);
    </script>
</body>
</html>