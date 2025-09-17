// pages/index.js
import { useState, useEffect } from 'react';
import Head from 'next/head';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Area, AreaChart
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

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

export default function Dashboard() {
  const [data, setData] = useState({
    misalignment: null,
    alerts: null,
    issues: null,
    loading: true,
    error: null
  });
  
  const [activeTab, setActiveTab] = useState('monthly');

  useEffect(() => {
    fetchAllData();
    // Set up auto-refresh every 5 minutes
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
        error: 'Failed to fetch data. Please check your internet connection.' 
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
    
    // Handle various date formats: DD/MM/YY, DD/MM/YYYY, DD-MM-YY, etc.
    const cleanDate = dateStr.toString().trim();
    const patterns = [
      /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/, // DD/MM/YYYY
      /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/, // DD/MM/YY
    ];
    
    for (const pattern of patterns) {
      const match = cleanDate.match(pattern);
      if (match) {
        const [, day, month, year] = match;
        const fullYear = year.length === 2 ? (parseInt(year) > 50 ? `19${year}` : `20${year}`) : year;
        return new Date(parseInt(fullYear), parseInt(month) - 1, parseInt(day));
      }
    }
    
    // Try parsing as timestamp for issues data
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
    const vehicleTracking = new Map(); // Track vehicles by date
    
    // Process each row
    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];
      const dateStr = row[dateIndex];
      const vehiclesStr = row[vehicleIndex] || '';
      const client = row[clientIndex] || 'Unknown';
      
      const date = parseDate(dateStr);
      if (!date) continue;
      
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const dayKey = date.toISOString().split('T')[0];
      
      // Parse vehicles (comma-separated)
      const vehicles = vehiclesStr.split(',').map(v => v.trim()).filter(v => v);
      
      // Monthly stats
      if (!monthly[monthKey]) monthly[monthKey] = { raised: 0, resolved: 0 };
      monthly[monthKey].raised += vehicles.length;
      
      // Daily stats
      if (!daily[dayKey]) daily[dayKey] = { raised: 0, resolved: 0 };
      daily[dayKey].raised += vehicles.length;
      
      // Client stats
      if (!clientStats[client]) clientStats[client] = {};
      if (!clientStats[client][monthKey]) clientStats[client][monthKey] = { count: 0, vehicles: new Set() };
      clientStats[client][monthKey].count += vehicles.length;
      vehicles.forEach(v => clientStats[client][monthKey].vehicles.add(v));
      
      // Track vehicles for resolution detection
      vehicleTracking.set(dayKey, vehicles);
    }
    
    // Calculate resolutions (if vehicle disappears next day, it's resolved)
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
      
      // Skip 'No L2 alerts found'
      if (alertType.toLowerCase().includes('no l2 alerts found')) continue;
      
      const date = parseDate(dateStr);
      if (!date) continue;
      
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      // Monthly stats
      if (!monthly[monthKey]) monthly[monthKey] = 0;
      monthly[monthKey]++;
      
      // Client stats
      if (!clientStats[client]) clientStats[client] = {};
      if (!clientStats[client][monthKey]) clientStats[client][monthKey] = 0;
      clientStats[client][monthKey]++;
    }
    
    return { monthly, clientStats };
  };

  const processIssuesData = (rawData) => {
    if (!rawData || rawData.length < 2) return { 
      historicalVideos: { monthly: {}, clientStats: {}, responseTimeStats: {} },
      allIssues: { monthly: {}, clientStats: {}, responseTimeStats: {} }
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
      
      // Process all issues
      if (!allIssues.monthly[monthKey]) allIssues.monthly[monthKey] = { raised: 0, resolved: 0 };
      allIssues.monthly[monthKey].raised++;
      
      if (!allIssues.clientStats[client]) allIssues.clientStats[client] = {};
      if (!allIssues.clientStats[client][monthKey]) allIssues.clientStats[client][monthKey] = { raised: 0, resolved: 0 };
      allIssues.clientStats[client][monthKey].raised++;
      
      // Check if resolved
      const resolvedDate = parseDate(resolvedStr);
      if (resolvedDate) {
        allIssues.monthly[monthKey].resolved++;
        allIssues.clientStats[client][monthKey].resolved++;
        
        // Calculate response time
        const responseTime = resolvedDate - raisedDate;
        if (responseTime > 0) {
          allIssues.responseTimeStats.push(responseTime);
        }
      }
      
      // Process historical video requests specifically
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
    
    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
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
        month: month,
        ...data
      }));
  };

  if (data.loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <h2 className="text-2xl font-semibold text-gray-700">Loading Dashboard...</h2>
          <p className="text-gray-500 mt-2">Fetching live data from Google Sheets</p>
        </div>
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <strong className="font-bold">Error: </strong>
            <span className="block sm:inline">{data.error}</span>
          </div>
          <button 
            onClick={fetchAllData}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const renderMonthlyAnalysis = () => (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-lg shadow-lg">
        <h1 className="text-3xl font-bold mb-2">Monthly Analysis Dashboard</h1>
        <p className="text-blue-100">Real-time data from Google Sheets - Last updated: {new Date().toLocaleString()}</p>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-md border-l-4 border-red-500">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Misalignments</h3>
          <p className="text-3xl font-bold text-red-500">
            {Object.values(data.misalignment?.monthly || {}).reduce((sum, month) => sum + month.raised, 0)}
          </p>
          <p className="text-sm text-gray-500">Total This Period</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-md border-l-4 border-yellow-500">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Alerts</h3>
          <p className="text-3xl font-bold text-yellow-500">
            {Object.values(data.alerts?.monthly || {}).reduce((sum, count) => sum + count, 0)}
          </p>
          <p className="text-sm text-gray-500">Total This Period</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-md border-l-4 border-blue-500">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Historical Videos</h3>
          <p className="text-3xl font-bold text-blue-500">
            {Object.values(data.issues?.historicalVideos?.monthly || {}).reduce((sum, month) => sum + month.raised, 0)}
          </p>
          <p className="text-sm text-gray-500">Total Requests</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-md border-l-4 border-green-500">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">All Issues</h3>
          <p className="text-3xl font-bold text-green-500">
            {Object.values(data.issues?.allIssues?.monthly || {}).reduce((sum, month) => sum + month.raised, 0)}
          </p>
          <p className="text-sm text-gray-500">Total Raised</p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Misalignments Chart */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-xl font-semibold mb-4 text-gray-800">Monthly Misalignments</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={prepareChartData(data.misalignment?.monthly || {})}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="raised" fill="#ef4444" name="Raised" />
              <Bar dataKey="resolved" fill="#10b981" name="Resolved" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Alerts Chart */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-xl font-semibold mb-4 text-gray-800">Monthly Alerts</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={prepareChartData(data.alerts?.monthly || {}).map(item => ({ month: item.month, alerts: item }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Area type="monotone" dataKey="alerts" stroke="#f59e0b" fill="#fbbf24" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Historical Videos Chart */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-xl font-semibold mb-4 text-gray-800">Historical Video Requests</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={prepareChartData(data.issues?.historicalVideos?.monthly || {})}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="raised" stroke="#3b82f6" name="Requested" strokeWidth={3} />
              <Line type="monotone" dataKey="resolved" stroke="#10b981" name="Delivered" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* All Issues Chart */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-xl font-semibold mb-4 text-gray-800">All Issues Monthly</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={prepareChartData(data.issues?.allIssues?.monthly || {})}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="raised" fill="#8b5cf6" name="Raised" />
              <Bar dataKey="resolved" fill="#06d6a0" name="Resolved" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Response Time Statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-xl font-semibold mb-4 text-gray-800">Historical Video Response Times</h3>
          <div className="space-y-3">
            {(() => {
              const stats = getResponseTimeStats(data.issues?.historicalVideos?.responseTimeStats);
              return (
                <>
                  <div className="flex justify-between">
                    <span className="text-green-600 font-medium">Fastest:</span>
                    <span className="font-bold">{stats.fastest}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-yellow-600 font-medium">Median:</span>
                    <span className="font-bold">{stats.median}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-red-600 font-medium">Slowest:</span>
                    <span className="font-bold">{stats.slowest}</span>
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-xl font-semibold mb-4 text-gray-800">All Issues Response Times</h3>
          <div className="space-y-3">
            {(() => {
              const stats = getResponseTimeStats(data.issues?.allIssues?.responseTimeStats);
              return (
                <>
                  <div className="flex justify-between">
                    <span className="text-green-600 font-medium">Fastest:</span>
                    <span className="font-bold">{stats.fastest}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-yellow-600 font-medium">Median:</span>
                    <span className="font-bold">{stats.median}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-red-600 font-medium">Slowest:</span>
                    <span className="font-bold">{stats.slowest}</span>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );

  const renderDetailedBreakdowns = () => (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Detailed Client Breakdowns</h2>
      
      {/* Client-wise Misalignments */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-xl font-semibold mb-4 text-gray-800">Client-wise Misalignments</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Month</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Count</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unique Vehicles</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Object.entries(data.misalignment?.clientStats || {}).map(([client, months]) =>
                Object.entries(months).map(([month, stats]) => (
                  <tr key={`${client}-${month}`}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{client}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{month}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{stats.count}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{stats.vehicles?.size || 0}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Client-wise Alerts */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-xl font-semibold mb-4 text-gray-800">Client-wise Alerts</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Month</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Alert Count</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Object.entries(data.alerts?.clientStats || {}).map(([client, months]) =>
                Object.entries(months).map(([month, count]) => (
                  <tr key={`${client}-${month}`}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{client}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{month}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Client-wise Issues */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-xl font-semibold mb-4 text-gray-800">Client-wise Issues</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Month</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Issues Raised</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Issues Resolved</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Video Requests</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Object.entries(data.issues?.allIssues?.clientStats || {}).map(([client, months]) =>
                Object.entries(months).map(([month, stats]) => (
                  <tr key={`${client}-${month}`}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{client}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{month}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{stats.raised}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{stats.resolved}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {data.issues?.historicalVideos?.clientStats?.[client]?.[month]?.raised || 0}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <Head>
        <title>Professional Dashboard - Live Analytics</title>
        <meta name="description" content="Real-time analytics dashboard with Google Sheets integration" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-gray-50">
        {/* Navigation */}
        <nav className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex space-x-8">
                <button
                  onClick={() => setActiveTab('monthly')}
                  className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                    activeTab === 'monthly'
                      ? 'border-blue-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Monthly Analysis
                </button>
                <button
                  onClick={() => setActiveTab('detailed')}
                  className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                    activeTab === 'detailed'
                      ? 'border-blue-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Detailed Breakdowns
                </button>
              </div>
              <div className="flex items-center">
                <button
                  onClick={fetchAllData}
                  className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded text-sm"
                >
                  Refresh Data
                </button>
              </div>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          {activeTab === 'monthly' && renderMonthlyAnalysis()}
          {activeTab === 'detailed' && renderDetailedBreakdowns()}
        </main>
      </div>
    </>
  );
}
