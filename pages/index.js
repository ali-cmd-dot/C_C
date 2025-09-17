// pages/index.js
import { useState, useEffect } from 'react';
import Head from 'next/head';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Area, AreaChart, RadialBarChart, RadialBar
} from 'recharts';

const GOOGLE_SHEETS_API_KEY = 'AIzaSyACruF4Qmzod8c0UlwfsBZlujoKguKsFDM';

// Sheet configurations
const SHEETS_CONFIG = {
  misalignment: {
    sheetId: '1GPDqOSURZNALalPzfHNbMft0HQ1c_fIkgfu_V3fSroY',
    range: 'Misalignment_Tracking!A:Z'
  },
  alerts: {
    sheetId: '1GPDqOSURZNALalPzfHNbMft0HQ1c_fIkgfu_V3fSroY',
    range: 'Alert_Tracking!A:Z'
  },
  issues: {
    sheetId: '1oHapc5HADod_2zPi0l1r8Ef2PjQlb4pfe-p9cKZFB2I',
    range: 'Issues- Realtime!A:Z'
  }
};

const MODERN_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];

export default function Dashboard() {
  const [data, setData] = useState({
    misalignment: null,
    alerts: null,
    issues: null,
    loading: true,
    error: null
  });
  
  const [activeTab, setActiveTab] = useState('overview');
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchAllData = async () => {
    setData(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const [misalignmentData, alertsData, issuesData] = await Promise.all([
        fetchSheetData(SHEETS_CONFIG.misalignment),
        fetchSheetData(SHEETS_CONFIG.alerts),
        fetchSheetData(SHEETS_CONFIG.issues)
      ]);

      const processedData = {
        misalignment: processMisalignmentData(misalignmentData),
        alerts: processAlertsData(alertsData),
        issues: processIssuesData(issuesData),
        loading: false,
        error: null
      };

      setData(processedData);
    } catch (error) {
      console.error('Error fetching data:', error);
      setData(prev => ({ 
        ...prev, 
        loading: false, 
        error: 'Failed to fetch data. Please check your connection.' 
      }));
    }
  };

  const fetchSheetData = async (config) => {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.sheetId}/values/${encodeURIComponent(config.range)}?key=${GOOGLE_SHEETS_API_KEY}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    return result.values || [];
  };

  const parseDate = (dateStr) => {
    if (!dateStr) return null;
    
    const cleanDate = dateStr.toString().trim();
    const patterns = [
      /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/,
      /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/,
    ];
    
    for (const pattern of patterns) {
      const match = cleanDate.match(pattern);
      if (match) {
        const [, day, month, year] = match;
        const fullYear = year.length === 2 ? (parseInt(year) > 50 ? `19${year}` : `20${year}`) : year;
        return new Date(parseInt(fullYear), parseInt(month) - 1, parseInt(day));
      }
    }
    
    if (cleanDate.includes(' ')) {
      const [datePart] = cleanDate.split(' ');
      return parseDate(datePart);
    }
    
    return null;
  };

  const processMisalignmentData = (rawData) => {
    if (!rawData || rawData.length < 2) return { monthly: {}, daily: {}, clientStats: {} };
    
    const headers = rawData[0];
    const dateIndex = headers.findIndex(h => h.toLowerCase().includes('date'));
    const vehicleIndex = headers.findIndex(h => h.toLowerCase().includes('vehicle'));
    const clientIndex = headers.findIndex(h => h.toLowerCase().includes('client'));
    
    const monthly = {};
    const daily = {};
    const clientStats = {};
    const vehicleTracking = new Map();
    
    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];
      const dateStr = row[dateIndex];
      const vehiclesStr = row[vehicleIndex] || '';
      const client = row[clientIndex] || 'Unknown';
      
      const date = parseDate(dateStr);
      if (!date) continue;
      
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const dayKey = date.toISOString().split('T')[0];
      
      const vehicles = vehiclesStr.split(',').map(v => v.trim()).filter(v => v);
      
      if (!monthly[monthKey]) monthly[monthKey] = { raised: 0, resolved: 0 };
      monthly[monthKey].raised += vehicles.length;
      
      if (!daily[dayKey]) daily[dayKey] = { raised: 0, resolved: 0 };
      daily[dayKey].raised += vehicles.length;
      
      if (!clientStats[client]) clientStats[client] = {};
      if (!clientStats[client][monthKey]) clientStats[client][monthKey] = { count: 0, vehicles: new Set() };
      clientStats[client][monthKey].count += vehicles.length;
      vehicles.forEach(v => clientStats[client][monthKey].vehicles.add(v));
      
      vehicleTracking.set(dayKey, vehicles);
    }
    
    const sortedDays = Array.from(vehicleTracking.keys()).sort();
    for (let i = 0; i < sortedDays.length - 1; i++) {
      const currentDay = sortedDays[i];
      const nextDay = sortedDays[i + 1];
      const currentVehicles = new Set(vehicleTracking.get(currentDay));
      const nextVehicles = new Set(vehicleTracking.get(nextDay));
      
      const resolved = [...currentVehicles].filter(v => !nextVehicles.has(v));
      
      const currentDate = new Date(currentDay);
      const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
      
      if (monthly[monthKey]) monthly[monthKey].resolved += resolved.length;
      if (daily[currentDay]) daily[currentDay].resolved += resolved.length;
    }
    
    return { monthly, daily, clientStats };
  };

  const processAlertsData = (rawData) => {
    if (!rawData || rawData.length < 2) return { monthly: {}, clientStats: {} };
    
    const headers = rawData[0];
    const dateIndex = headers.findIndex(h => h.toLowerCase().includes('date'));
    const alertTypeIndex = headers.findIndex(h => h.toLowerCase().includes('alert type'));
    const clientIndex = headers.findIndex(h => h.toLowerCase().includes('client'));
    
    const monthly = {};
    const clientStats = {};
    
    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];
      const dateStr = row[dateIndex];
      const alertType = row[alertTypeIndex] || '';
      const client = row[clientIndex] || 'Unknown';
      
      if (alertType.toLowerCase().includes('no l2 alerts found')) continue;
      
      const date = parseDate(dateStr);
      if (!date) continue;
      
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthly[monthKey]) monthly[monthKey] = 0;
      monthly[monthKey]++;
      
      if (!clientStats[client]) clientStats[client] = {};
      if (!clientStats[client][monthKey]) clientStats[client][monthKey] = 0;
      clientStats[client][monthKey]++;
    }
    
    return { monthly, clientStats };
  };

  const processIssuesData = (rawData) => {
    if (!rawData || rawData.length < 2) return { 
      historicalVideos: { monthly: {}, clientStats: {}, responseTimeStats: [] },
      allIssues: { monthly: {}, clientStats: {}, responseTimeStats: [] }
    };
    
    const headers = rawData[0];
    const raisedIndex = headers.findIndex(h => h.toLowerCase().includes('timestamp issues raised'));
    const resolvedIndex = headers.findIndex(h => h.toLowerCase().includes('timestamp issues resolved'));
    const issueIndex = headers.findIndex(h => h.toLowerCase().includes('issue'));
    const clientIndex = headers.findIndex(h => h.toLowerCase().includes('client'));
    
    const historicalVideos = { monthly: {}, clientStats: {}, responseTimeStats: [] };
    const allIssues = { monthly: {}, clientStats: {}, responseTimeStats: [] };
    
    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];
      const raisedStr = row[raisedIndex];
      const resolvedStr = row[resolvedIndex];
      const issue = row[issueIndex] || '';
      const client = row[clientIndex] || 'Unknown';
      
      const raisedDate = parseDate(raisedStr);
      if (!raisedDate) continue;
      
      const monthKey = `${raisedDate.getFullYear()}-${String(raisedDate.getMonth() + 1).padStart(2, '0')}`;
      
      if (!allIssues.monthly[monthKey]) allIssues.monthly[monthKey] = { raised: 0, resolved: 0 };
      allIssues.monthly[monthKey].raised++;
      
      if (!allIssues.clientStats[client]) allIssues.clientStats[client] = {};
      if (!allIssues.clientStats[client][monthKey]) allIssues.clientStats[client][monthKey] = { raised: 0, resolved: 0 };
      allIssues.clientStats[client][monthKey].raised++;
      
      const resolvedDate = parseDate(resolvedStr);
      if (resolvedDate) {
        allIssues.monthly[monthKey].resolved++;
        allIssues.clientStats[client][monthKey].resolved++;
        
        const responseTime = resolvedDate - raisedDate;
        if (responseTime > 0) {
          allIssues.responseTimeStats.push(responseTime);
        }
      }
      
      if (issue.toLowerCase().includes('historical video request')) {
        if (!historicalVideos.monthly[monthKey]) historicalVideos.monthly[monthKey] = { raised: 0, resolved: 0 };
        historicalVideos.monthly[monthKey].raised++;
        
        if (!historicalVideos.clientStats[client]) historicalVideos.clientStats[client] = {};
        if (!historicalVideos.clientStats[client][monthKey]) historicalVideos.clientStats[client][monthKey] = { raised: 0, resolved: 0 };
        historicalVideos.clientStats[client][monthKey].raised++;
        
        if (resolvedDate) {
          historicalVideos.monthly[monthKey].resolved++;
          historicalVideos.clientStats[client][monthKey].resolved++;
          
          const responseTime = resolvedDate - raisedDate;
          if (responseTime > 0) {
            historicalVideos.responseTimeStats.push(responseTime);
          }
        }
      }
    }
    
    return { historicalVideos, allIssues };
  };

  const formatDuration = (milliseconds) => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  };

  const getResponseTimeStats = (responseTimes) => {
    if (!responseTimes || responseTimes.length === 0) {
      return { fastest: 'N/A', median: 'N/A', slowest: 'N/A' };
    }
    
    const sorted = [...responseTimes].sort((a, b) => a - b);
    return {
      fastest: formatDuration(sorted[0]),
      median: formatDuration(sorted[Math.floor(sorted.length / 2)]),
      slowest: formatDuration(sorted[sorted.length - 1])
    };
  };

  const prepareChartData = (monthlyData) => {
    return Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month: month.split('-')[1] + '/' + month.split('-')[0].slice(2),
        ...data
      }));
  };

  if (data.loading) {
    return (
      <div className={`min-h-screen transition-all duration-300 ${darkMode ? 'bg-gray-900' : 'bg-gradient-to-br from-indigo-100 via-white to-purple-100'} flex items-center justify-center`}>
        <div className="text-center">
          <div className="relative">
            <div className="w-24 h-24 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-6"></div>
            <div className="absolute inset-0 w-24 h-24 border-4 border-transparent border-r-purple-400 rounded-full animate-spin animation-delay-150 mx-auto"></div>
          </div>
          <h2 className={`text-3xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-800'}`}>Loading Dashboard</h2>
          <p className={`text-lg ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Fetching live data...</p>
          <div className="flex justify-center mt-4 space-x-1">
            <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce"></div>
            <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce animation-delay-200"></div>
            <div className="w-2 h-2 bg-pink-600 rounded-full animate-bounce animation-delay-400"></div>
          </div>
        </div>
      </div>
    );
  }

  if (data.error) {
    return (
      <div className={`min-h-screen transition-all duration-300 ${darkMode ? 'bg-gray-900' : 'bg-gradient-to-br from-red-100 via-white to-pink-100'} flex items-center justify-center`}>
        <div className="text-center max-w-md">
          <div className="bg-red-100 border-2 border-red-200 rounded-2xl p-8 shadow-2xl">
            <div className="text-6xl mb-4">🚨</div>
            <h2 className="text-2xl font-bold text-red-800 mb-4">Connection Error</h2>
            <p className="text-red-600 mb-6">{data.error}</p>
            <button 
              onClick={fetchAllData}
              className="bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg transform transition-all duration-200 hover:scale-105"
            >
              🔄 Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  const totalMisalignments = Object.values(data.misalignment?.monthly || {}).reduce((sum, month) => sum + month.raised, 0);
  const totalAlerts = Object.values(data.alerts?.monthly || {}).reduce((sum, count) => sum + count, 0);
  const totalVideos = Object.values(data.issues?.historicalVideos?.monthly || {}).reduce((sum, month) => sum + month.raised, 0);
  const totalIssues = Object.values(data.issues?.allIssues?.monthly || {}).reduce((sum, month) => sum + month.raised, 0);

  return (
    <>
      <Head>
        <title>Modern Analytics Dashboard - Live Data</title>
        <meta name="description" content="Stunning real-time analytics dashboard" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      </Head>

      <div className={`min-h-screen transition-all duration-500 font-['Inter'] ${
        darkMode 
          ? 'bg-gray-900 text-white' 
          : 'bg-gradient-to-br from-indigo-50 via-white to-purple-50'
      }`}>
        
        {/* Modern Header */}
        <header className={`sticky top-0 z-50 backdrop-blur-md transition-all duration-300 ${
          darkMode 
            ? 'bg-gray-900/80 border-gray-700' 
            : 'bg-white/80 border-white/20'
        } border-b shadow-lg`}>
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              
              {/* Logo & Title */}
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
                  <span className="text-white font-bold text-xl">📊</span>
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                    Analytics Hub
                  </h1>
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Real-time insights • {new Date().toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Navigation & Controls */}
              <div className="flex items-center space-x-4">
                <div className={`flex items-center space-x-1 p-1 rounded-2xl transition-all duration-300 ${
                  darkMode ? 'bg-gray-800' : 'bg-gray-100'
                }`}>
                  {['overview', 'analytics', 'clients'].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                        activeTab === tab
                          ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg'
                          : darkMode
                            ? 'text-gray-400 hover:text-white hover:bg-gray-700'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-white'
                      }`}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className={`p-3 rounded-2xl transition-all duration-300 ${
                    darkMode 
                      ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30' 
                      : 'bg-gray-800/20 text-gray-700 hover:bg-gray-800/30'
                  }`}
                >
                  {darkMode ? '☀️' : '🌙'}
                </button>

                <button
                  onClick={fetchAllData}
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-medium py-2 px-4 rounded-2xl shadow-lg transform transition-all duration-200 hover:scale-105"
                >
                  🔄 Refresh
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-6 py-8">
          
          {activeTab === 'overview' && (
            <div className="space-y-8">
              
              {/* Hero Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                
                {/* Misalignments Card */}
                <div className={`group relative overflow-hidden rounded-3xl p-6 transition-all duration-500 hover:scale-105 ${
                  darkMode 
                    ? 'bg-gradient-to-br from-red-900/20 to-pink-900/20 border border-red-500/20' 
                    : 'bg-gradient-to-br from-red-50 to-pink-50 border border-red-200/50'
                } shadow-xl hover:shadow-2xl`}>
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-red-500/10 to-pink-500/10 rounded-full -mr-16 -mt-16"></div>
                  <div className="relative">
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-gradient-to-r from-red-500 to-pink-600 rounded-2xl">
                        <span className="text-white text-2xl">⚠️</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-red-600 mb-1">Total</div>
                        <div className="text-3xl font-bold text-red-700">{totalMisalignments}</div>
                      </div>
                    </div>
                    <h3 className="font-semibold text-lg mb-2">Misalignments</h3>
                    <div className="w-full bg-red-200/50 rounded-full h-2 mb-2">
                      <div className="bg-gradient-to-r from-red-500 to-pink-600 h-2 rounded-full" style={{width: '75%'}}></div>
                    </div>
                    <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Vehicle alignment issues tracked</p>
                  </div>
                </div>

                {/* Alerts Card */}
                <div className={`group relative overflow-hidden rounded-3xl p-6 transition-all duration-500 hover:scale-105 ${
                  darkMode 
                    ? 'bg-gradient-to-br from-yellow-900/20 to-orange-900/20 border border-yellow-500/20' 
                    : 'bg-gradient-to-br from-yellow-50 to-orange-50 border border-yellow-200/50'
                } shadow-xl hover:shadow-2xl`}>
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-yellow-500/10 to-orange-500/10 rounded-full -mr-16 -mt-16"></div>
                  <div className="relative">
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-gradient-to-r from-yellow-500 to-orange-600 rounded-2xl">
                        <span className="text-white text-2xl">🚨</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-yellow-600 mb-1">Total</div>
                        <div className="text-3xl font-bold text-yellow-700">{totalAlerts}</div>
                      </div>
                    </div>
                    <h3 className="font-semibold text-lg mb-2">System Alerts</h3>
                    <div className="w-full bg-yellow-200/50 rounded-full h-2 mb-2">
                      <div className="bg-gradient-to-r from-yellow-500 to-orange-600 h-2 rounded-full" style={{width: '60%'}}></div>
                    </div>
                    <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>System alerts generated</p>
                  </div>
                </div>

                {/* Historical Videos Card */}
                <div className={`group relative overflow-hidden rounded-3xl p-6 transition-all duration-500 hover:scale-105 ${
                  darkMode 
                    ? 'bg-gradient-to-br from-blue-900/20 to-indigo-900/20 border border-blue-500/20' 
                    : 'bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200/50'
                } shadow-xl hover:shadow-2xl`}>
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 rounded-full -mr-16 -mt-16"></div>
                  <div className="relative">
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl">
                        <span className="text-white text-2xl">🎥</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-blue-600 mb-1">Total</div>
                        <div className="text-3xl font-bold text-blue-700">{totalVideos}</div>
                      </div>
                    </div>
                    <h3 className="font-semibold text-lg mb-2">Video Requests</h3>
                    <div className="w-full bg-blue-200/50 rounded-full h-2 mb-2">
                      <div className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2 rounded-full" style={{width: '85%'}}></div>
                    </div>
                    <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Historical video requests</p>
                  </div>
                </div>

                {/* All Issues Card */}
                <div className={`group relative overflow-hidden rounded-3xl p-6 transition-all duration-500 hover:scale-105 ${
                  darkMode 
                    ? 'bg-gradient-to-br from-green-900/20 to-emerald-900/20 border border-green-500/20' 
                    : 'bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200/50'
                } shadow-xl hover:shadow-2xl`}>
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-full -mr-16 -mt-16"></div>
                  <div className="relative">
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl">
                        <span className="text-white text-2xl">🛠️</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-green-600 mb-1">Total</div>
                        <div className="text-3xl font-bold text-green-700">{totalIssues}</div>
                      </div>
                    </div>
                    <h3 className="font-semibold text-lg mb-2">Issues Raised</h3>
                    <div className="w-full bg-green-200/50 rounded-full h-2 mb-2">
                      <div className="bg-gradient-to-r from-green-500 to-emerald-600 h-2 rounded-full" style={{width: '70%'}}></div>
                    </div>
                    <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Support issues tracked</p>
                  </div>
                </div>
              </div>

              {/* Modern Charts Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* Misalignments Trend */}
                <div className={`rounded-3xl p-8 transition-all duration-300 shadow-xl hover:shadow-2xl ${
                  darkMode ? 'bg-gray-800/50 border border-gray-700/50' : 'bg-white/70 border border-white/50'
                } backdrop-blur-md`}>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-xl font-bold mb-2">Misalignment Trends</h3>
                      <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Monthly raised vs resolved</p>
                    </div>
                    <div className="p-3 bg-gradient-to-r from-red-500 to-pink-600 rounded-2xl">
                      <span className="text-white text-xl">📊</span>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={prepareChartData(data.misalignment?.monthly || {})}>
                      <defs>
                        <linearGradient id="raisedGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#ef4444" stopOpacity={0.8}/>
                          <stop offset="100%" stopColor="#dc2626" stopOpacity={0.6}/>
                        </linearGradient>
                        <linearGradient id="resolvedGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={0.8}/>
                          <stop offset="100%" stopColor="#059669" stopOpacity={0.6}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? "#374151" : "#e5e7eb"} />
                      <XAxis dataKey="month" stroke={darkMode ? "#9ca3af" : "#6b7280"} />
                      <YAxis stroke={darkMode ? "#9ca3af" : "#6b7280"} />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: darkMode ? '#1f2937' : 'white',
                          border: 'none',
                          borderRadius: '12px',
                          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                        }}
                      />
                      <Legend />
                      <Bar dataKey="raised" fill="url(#raisedGrad)" name="Raised" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="resolved" fill="url(#resolvedGrad)" name="Resolved" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Alerts Line Chart */}
                <div className={`rounded-3xl p-8 transition-all duration-300 shadow-xl hover:shadow-2xl ${
                  darkMode ? 'bg-gray-800/50 border border-gray-700/50' : 'bg-white/70 border border-white/50'
                } backdrop-blur-md`}>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-xl font-bold mb-2">System Alerts</h3>
                      <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Monthly alert patterns</p>
                    </div>
                    <div className="p-3 bg-gradient-to-r from-yellow-500 to-orange-600 rounded-2xl">
                      <span className="text-white text-xl">⚡</span>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={320}>
                    <AreaChart data={prepareChartData(data.alerts?.monthly || {}).map(item => ({ month: item.month, count: item }))}>
                      <defs>
                        <linearGradient id="alertGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.6}/>
                          <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.1}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? "#374151" : "#e5e7eb"} />
                      <XAxis dataKey="month" stroke={darkMode ? "#9ca3af" : "#6b7280"} />
                      <YAxis stroke={darkMode ? "#9ca3af" : "#6b7280"} />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: darkMode ? '#1f2937' : 'white',
                          border: 'none',
                          borderRadius: '12px',
                          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                        }}
                      />
                      <Area type="monotone" dataKey="count" stroke="#f59e0b" strokeWidth={3} fill="url(#alertGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Video Requests */}
                <div className={`rounded-3xl p-8 transition-all duration-300 shadow-xl hover:shadow-2xl ${
                  darkMode ? 'bg-gray-800/50 border border-gray-700/50' : 'bg-white/70 border border-white/50'
                } backdrop-blur-md`}>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-xl font-bold mb-2">Video Requests</h3>
                      <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Request vs delivery rate</p>
                    </div>
                    <div className="p-3 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl">
                      <span className="text-white text-xl">🎬</span>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={prepareChartData(data.issues?.historicalVideos?.monthly || {})}>
                      <defs>
                        <linearGradient id="requestGrad" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#3b82f6" />
                          <stop offset="100%" stopColor="#6366f1" />
                        </linearGradient>
                        <linearGradient id="deliveredGrad" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#10b981" />
                          <stop offset="100%" stopColor="#06d6a0" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? "#374151" : "#e5e7eb"} />
                      <XAxis dataKey="month" stroke={darkMode ? "#9ca3af" : "#6b7280"} />
                      <YAxis stroke={darkMode ? "#9ca3af" : "#6b7280"} />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: darkMode ? '#1f2937' : 'white',
                          border: 'none',
                          borderRadius: '12px',
                          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                        }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="raised" stroke="url(#requestGrad)" strokeWidth={4} name="Requested" dot={{r: 6}} />
                      <Line type="monotone" dataKey="resolved" stroke="url(#deliveredGrad)" strokeWidth={4} name="Delivered" dot={{r: 6}} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* All Issues */}
                <div className={`rounded-3xl p-8 transition-all duration-300 shadow-xl hover:shadow-2xl ${
                  darkMode ? 'bg-gray-800/50 border border-gray-700/50' : 'bg-white/70 border border-white/50'
                } backdrop-blur-md`}>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-xl font-bold mb-2">Issue Management</h3>
                      <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Total issues vs resolved</p>
                    </div>
                    <div className="p-3 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl">
                      <span className="text-white text-xl">🔧</span>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={prepareChartData(data.issues?.allIssues?.monthly || {})}>
                      <defs>
                        <linearGradient id="issueRaisedGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.8}/>
                          <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.6}/>
                        </linearGradient>
                        <linearGradient id="issueResolvedGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#06d6a0" stopOpacity={0.8}/>
                          <stop offset="100%" stopColor="#04d9c4" stopOpacity={0.6}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? "#374151" : "#e5e7eb"} />
                      <XAxis dataKey="month" stroke={darkMode ? "#9ca3af" : "#6b7280"} />
                      <YAxis stroke={darkMode ? "#9ca3af" : "#6b7280"} />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: darkMode ? '#1f2937' : 'white',
                          border: 'none',
                          borderRadius: '12px',
                          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                        }}
                      />
                      <Legend />
                      <Bar dataKey="raised" fill="url(#issueRaisedGrad)" name="Raised" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="resolved" fill="url(#issueResolvedGrad)" name="Resolved" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Response Time Stats */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className={`rounded-3xl p-8 transition-all duration-300 shadow-xl hover:shadow-2xl ${
                  darkMode ? 'bg-gray-800/50 border border-gray-700/50' : 'bg-white/70 border border-white/50'
                } backdrop-blur-md`}>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-xl font-bold mb-2">Video Response Times</h3>
                      <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Performance metrics</p>
                    </div>
                    <div className="p-3 bg-gradient-to-r from-purple-500 to-pink-600 rounded-2xl">
                      <span className="text-white text-xl">⏱️</span>
                    </div>
                  </div>
                  <div className="space-y-6">
                    {(() => {
                      const stats = getResponseTimeStats(data.issues?.historicalVideos?.responseTimeStats);
                      return (
                        <>
                          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-2xl">
                            <div className="flex items-center space-x-3">
                              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                              <span className="font-medium">Fastest Response</span>
                            </div>
                            <span className="text-2xl font-bold text-green-600">{stats.fastest}</span>
                          </div>
                          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 rounded-2xl">
                            <div className="flex items-center space-x-3">
                              <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse animation-delay-200"></div>
                              <span className="font-medium">Average Response</span>
                            </div>
                            <span className="text-2xl font-bold text-yellow-600">{stats.median}</span>
                          </div>
                          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-red-500/10 to-pink-500/10 rounded-2xl">
                            <div className="flex items-center space-x-3">
                              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse animation-delay-400"></div>
                              <span className="font-medium">Slowest Response</span>
                            </div>
                            <span className="text-2xl font-bold text-red-600">{stats.slowest}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>

                <div className={`rounded-3xl p-8 transition-all duration-300 shadow-xl hover:shadow-2xl ${
                  darkMode ? 'bg-gray-800/50 border border-gray-700/50' : 'bg-white/70 border border-white/50'
                } backdrop-blur-md`}>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-xl font-bold mb-2">Issue Response Times</h3>
                      <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Support efficiency</p>
                    </div>
                    <div className="p-3 bg-gradient-to-r from-indigo-500 to-blue-600 rounded-2xl">
                      <span className="text-white text-xl">🚀</span>
                    </div>
                  </div>
                  <div className="space-y-6">
                    {(() => {
                      const stats = getResponseTimeStats(data.issues?.allIssues?.responseTimeStats);
                      return (
                        <>
                          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-2xl">
                            <div className="flex items-center space-x-3">
                              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                              <span className="font-medium">Fastest Resolution</span>
                            </div>
                            <span className="text-2xl font-bold text-green-600">{stats.fastest}</span>
                          </div>
                          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 rounded-2xl">
                            <div className="flex items-center space-x-3">
                              <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse animation-delay-200"></div>
                              <span className="font-medium">Average Resolution</span>
                            </div>
                            <span className="text-2xl font-bold text-yellow-600">{stats.median}</span>
                          </div>
                          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-red-500/10 to-pink-500/10 rounded-2xl">
                            <div className="flex items-center space-x-3">
                              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse animation-delay-400"></div>
                              <span className="font-medium">Slowest Resolution</span>
                            </div>
                            <span className="text-2xl font-bold text-red-600">{stats.slowest}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="space-y-8">
              <div className="text-center mb-12">
                <h2 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-4">
                  Advanced Analytics
                </h2>
                <p className={`text-lg ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Deep insights into your data patterns and trends
                </p>
              </div>

              {/* Coming Soon Placeholder */}
              <div className={`rounded-3xl p-12 text-center transition-all duration-300 shadow-xl ${
                darkMode ? 'bg-gray-800/50 border border-gray-700/50' : 'bg-white/70 border border-white/50'
              } backdrop-blur-md`}>
                <div className="text-8xl mb-6">📈</div>
                <h3 className="text-2xl font-bold mb-4">Advanced Analytics Coming Soon</h3>
                <p className={`text-lg mb-6 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  We're working on advanced analytics features including predictive insights, trend analysis, and custom reports.
                </p>
                <div className="flex justify-center">
                  <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium py-3 px-6 rounded-2xl">
                    Stay tuned for updates!
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'clients' && (
            <div className="space-y-8">
              <div className="text-center mb-12">
                <h2 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-4">
                  Client Analytics
                </h2>
                <p className={`text-lg ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Detailed breakdown by client performance and activity
                </p>
              </div>

              {/* Client Tables */}
              <div className="grid grid-cols-1 gap-8">
                
                {/* Misalignment by Client */}
                <div className={`rounded-3xl p-8 transition-all duration-300 shadow-xl ${
                  darkMode ? 'bg-gray-800/50 border border-gray-700/50' : 'bg-white/70 border border-white/50'
                } backdrop-blur-md`}>
                  <h3 className="text-2xl font-bold mb-6 flex items-center">
                    <span className="mr-3">⚠️</span>
                    Client Misalignment Summary
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className={`border-b-2 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                          <th className="text-left py-4 px-6 font-semibold">Client</th>
                          <th className="text-left py-4 px-6 font-semibold">Month</th>
                          <th className="text-left py-4 px-6 font-semibold">Issues</th>
                          <th className="text-left py-4 px-6 font-semibold">Vehicles</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(data.misalignment?.clientStats || {}).map(([client, months]) =>
                          Object.entries(months).map(([month, stats]) => (
                            <tr key={`${client}-${month}`} className={`border-b transition-colors hover:bg-gray-50 ${darkMode ? 'hover:bg-gray-700/50' : ''}`}>
                              <td className="py-4 px-6 font-medium">{client}</td>
                              <td className="py-4 px-6">{month}</td>
                              <td className="py-4 px-6">
                                <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-medium">
                                  {stats.count}
                                </span>
                              </td>
                              <td className="py-4 px-6">
                                <span className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm">
                                  {stats.vehicles?.size || 0}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Alerts by Client */}
                <div className={`rounded-3xl p-8 transition-all duration-300 shadow-xl ${
                  darkMode ? 'bg-gray-800/50 border border-gray-700/50' : 'bg-white/70 border border-white/50'
                } backdrop-blur-md`}>
                  <h3 className="text-2xl font-bold mb-6 flex items-center">
                    <span className="mr-3">🚨</span>
                    Client Alert Summary
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className={`border-b-2 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                          <th className="text-left py-4 px-6 font-semibold">Client</th>
                          <th className="text-left py-4 px-6 font-semibold">Month</th>
                          <th className="text-left py-4 px-6 font-semibold">Alerts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(data.alerts?.clientStats || {}).map(([client, months]) =>
                          Object.entries(months).map(([month, count]) => (
                            <tr key={`${client}-${month}`} className={`border-b transition-colors hover:bg-gray-50 ${darkMode ? 'hover:bg-gray-700/50' : ''}`}>
                              <td className="py-4 px-6 font-medium">{client}</td>
                              <td className="py-4 px-6">{month}</td>
                              <td className="py-4 px-6">
                                <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-medium">
                                  {count}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Issues by Client */}
                <div className={`rounded-3xl p-8 transition-all duration-300 shadow-xl ${
                  darkMode ? 'bg-gray-800/50 border border-gray-700/50' : 'bg-white/70 border border-white/50'
                } backdrop-blur-md`}>
                  <h3 className="text-2xl font-bold mb-6 flex items-center">
                    <span className="mr-3">🛠️</span>
                    Client Issue Summary
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className={`border-b-2 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                          <th className="text-left py-4 px-6 font-semibold">Client</th>
                          <th className="text-left py-4 px-6 font-semibold">Month</th>
                          <th className="text-left py-4 px-6 font-semibold">Raised</th>
                          <th className="text-left py-4 px-6 font-semibold">Resolved</th>
                          <th className="text-left py-4 px-6 font-semibold">Videos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(data.issues?.allIssues?.clientStats || {}).map(([client, months]) =>
                          Object.entries(months).map(([month, stats]) => (
                            <tr key={`${client}-${month}`} className={`border-b transition-colors hover:bg-gray-50 ${darkMode ? 'hover:bg-gray-700/50' : ''}`}>
                              <td className="py-4 px-6 font-medium">{client}</td>
                              <td className="py-4 px-6">{month}</td>
                              <td className="py-4 px-6">
                                <span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm font-medium">
                                  {stats.raised}
                                </span>
                              </td>
                              <td className="py-4 px-6">
                                <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                                  {stats.resolved}
                                </span>
                              </td>
                              <td className="py-4 px-6">
                                <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                                  {data.issues?.historicalVideos?.clientStats?.[client]?.[month]?.raised || 0}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      <style jsx>{`
        .animation-delay-150 {
          animation-delay: 150ms;
        }
        .animation-delay-200 {
          animation-delay: 200ms;
        }
        .animation-delay-400 {
          animation-delay: 400ms;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.6s ease-out;
        }
        @media (max-width: 768px) {
          .grid-cols-1 {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </>
  );
}
