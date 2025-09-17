
## Features

### 📊 Live Data Integration
- Real-time data fetching from Google Sheets API
- Auto-refresh every 5 minutes
- Manual refresh capability
- Error handling and retry mechanisms

### 📈 Analytics Capabilities

#### 1. Misalignment Tracking
- Monthly and daily misalignment counts
- Vehicle resolution tracking (if vehicle disappears next day, it's resolved)
- Client-wise breakdown with repeat vehicle analysis
- Handles comma-separated vehicle data

#### 2. Alert Monitoring
- Monthly alert counts with filtering
- Excludes "No L2 alerts found" entries
- Client-wise alert distribution

#### 3. Historical Video Analysis
- Video request tracking and fulfillment
- Response time statistics (fastest, median, slowest)
- Client-wise video request patterns

#### 4. Issue Management
- Complete issue lifecycle tracking
- Resolution time analysis
- Client performance metrics

### 🎨 Professional UI
- Modern, responsive design with Tailwind CSS
- Interactive charts using Recharts
- Tabbed navigation (Monthly Analysis + Detailed Breakdowns)
- Mobile-friendly interface
- Professional color scheme and animations

## Quick Start

### 1. Clone and Setup
```bash
git clone <your-repo-url>
cd professional-dashboard
npm install
```

### 2. Development
```bash
npm run dev
```
Visit `http://localhost:3000`

### 3. Production Build
```bash
npm run build
npm start
```

## Deployment to Vercel

### Method 1: GitHub Integration (Recommended)
1. Push your code to GitHub
2. Go to [Vercel Dashboard](https://vercel.com)
3. Click "New Project"
4. Import your GitHub repository
5. Deploy automatically

### Method 2: Vercel CLI
```bash
npm i -g vercel
vercel
```

### Method 3: Direct Upload
1. Run `npm run build`
2. Upload the entire project folder to Vercel
3. Deploy

## Configuration

The application is pre-configured with:
- **API Key**: `AIzaSyACruF4Qmzod8c0UlwfsBZlujoKguKsFDM`
- **Sheet IDs**: Pre-configured for your specific Google Sheets
- **Auto-refresh**: 5-minute intervals

### Google Sheets Structure Expected

#### Sheet 1: Misalignment_Tracking
- **Date**: DD/MM/YY or DD/MM/YYYY format
- **Vehicle Numbers**: Comma-separated vehicle IDs
- **Client Name**: Client identifier

#### Sheet 2: Alert_Tracking
- **Date**: DD/MM/YY or DD/MM/YYYY format
- **Alert Type**: Type of alert (filters out "No L2 alerts found")
- **Client Name**: Client identifier

#### Sheet 3: Issues- Realtime
- **Timestamp Issues Raised**: DD/MM/YYYY HH:MM:SS format
- **Timestamp Issues Resolved**: DD/MM/YYYY HH:MM:SS format
- **Issue**: Issue type (filters for "Historical Video Request")
- **Client**: Client identifier

## Technical Details

### Data Processing Logic

#### Misalignment Resolution Detection
```javascript
// If vehicle appears on Day 1 but not Day 2, it's considered resolved
const resolved = currentDayVehicles.filter(vehicle => 
  !nextDayVehicles.includes(vehicle)
);
```

#### Response Time Calculation
```javascript
// Calculates duration between raised and resolved timestamps
const responseTime = resolvedDate - raisedDate;
```

#### Date Parsing
Supports multiple formats:
- DD/MM/YYYY
- DD/MM/YY (auto-detects century)
- DD-MM-YYYY
- DD-MM-YY

### Performance Optimizations
- Efficient data processing with minimal re-renders
- Responsive chart rendering
- Optimized bundle size
- Memory-efficient date parsing

## API Endpoints

The application fetches data from Google Sheets API:
```
https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/{RANGE}?key={API_KEY}
```

## Browser Support
- Chrome 88+
- Firefox 85+
- Safari 14+
- Edge 88+

## Security Features
- API key environment variable
- HTTPS enforcement
- XSS protection headers
- Content security policies

## Troubleshooting

### Common Issues

1. **Data not loading**
   - Check internet connection
   - Verify Google Sheets are publicly accessible
   - Confirm API key is valid

2. **Charts not displaying**
   - Ensure data format matches expected structure
   - Check browser console for errors

3. **Date parsing issues**
   - Verify date format in sheets (DD/MM/YY or DD/MM/YYYY)
   - Check for empty date cells

### Error Messages
- "Failed to fetch data": Network or API issue
- "Loading Dashboard...": Normal loading state
- Charts showing "No data": Sheet structure mismatch

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is proprietary software for internal use.

## Support

For technical support or feature requests, please contact the development team.

---

**Built with Next.js, React, and Tailwind CSS**
**Deployed on Vercel for optimal performance**
