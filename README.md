# 🚀 Incivus Lite - AI-Powered Ad Analysis Platform

**Incivus Lite** is an enterprise-grade SaaS platform that leverages AI to help brands analyze, optimize, and ensure compliance of their advertisements across multiple channels.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Architecture](#architecture)
- [Key Features & Implementation](#key-features--implementation)
- [API Documentation](#api-documentation)
- [Database Schema](#database-schema)
- [Deployment](#deployment)
- [Contributing](#contributing)

---

## Overview

### Full-Stack Development & Architecture

**Architected and developed a full-stack AI-powered advertising analytics platform** using React.js, FastAPI (Python), Firebase, and Google Cloud, enabling brands to evaluate ad effectiveness across 5 key performance metrics.

**Designed a subscription-based SaaS architecture** with tiered access control (Lite/Plus/Pro/Enterprise), implementing feature-gating logic that dynamically adjusts UI and API responses based on user plans.

### Key Metrics & Analysis

The platform evaluates advertisements across:
- **Brand Compliance** - Logo visibility, color usage, tone of voice alignment
- **Purchase Intent** - Message clarity, emotional appeal, relevance, CTA strength
- **Channel Optimization** - Platform-specific compliance (YouTube, Instagram, Facebook, TikTok)
- **Metaphor & Funnel Compatibility** - Visual storytelling effectiveness
- **Content Analysis** - Overall ad effectiveness and viewer impact

---

## Features

### 🎯 Core Features

- **AI-Powered Ad Analysis** - Real-time analysis using Google Gemini API
- **Multi-Channel Compliance** - Support for 5+ advertising platforms
- **Brand Configuration** - Custom brand guidelines (logo, colors, tone)
- **Subscription Management** - Tiered plans with feature-gating
- **Analysis History & Libraries** - Track and organize all analyses
- **PDF Report Generation** - Professional branded reports
- **Secure File Storage** - Google Cloud Storage integration
- **Real-time Quota Tracking** - Monthly usage limits and remaining count

### 🔐 Security & Authentication

- Firebase Authentication (Google, Facebook, Microsoft, Email)
- Role-based access control (RBAC)
- Secure file handling with signed URLs
- CORS and content security policies
- Environment variable management

### 💳 Payment & Subscription

- Shopify payment gateway integration
- Automated plan activation
- Real-time quota management
- Monthly usage reset logic
- Flexible plan upgrades/downgrades

---

## Tech Stack

### Frontend
- **React.js** - UI framework
- **Firebase Authentication** - User authentication
- **html2canvas + jsPDF** - PDF generation
- **Styled Components** - CSS-in-JS styling
- **React Router** - Navigation
- **Axios** - HTTP client

### Middleware
- **FastAPI** - Python web framework
- **Firebase Firestore** - NoSQL database
- **Google Cloud Storage** - File storage
- **Firebase Admin SDK** - Database operations
- **Python Multipart** - Form data handling

### Backend
- **FastAPI** - API framework
- **Google Gemini API** - AI analysis engine
- **OpenCV** - Video/image processing
- **MoviePy** - Audio extraction
- **Transformers** - NLP models

### Infrastructure
- **Docker** - Containerization
- **Google Cloud Run** - Serverless deployment
- **Firebase** - Backend-as-a-Service

---

## Project Structure

```
Incivus-Lite/
├── frontend/                    # React UI application
│   ├── src/                    # React components and utilities
│   ├── public/                 # Static assets
│   ├── build/                  # Production build
│   ├── package.json            # Node dependencies
│   ├── config.json             # Firebase configuration
│   └── production.env          # Environment variables
│
├── middleware/                  # FastAPI middleware (app.py)
│   ├── app.py                  # Main middleware application
│   ├── config.py               # Database and Firebase config
│   ├── Dockerfile              # Container configuration
│   ├── requirements.txt         # Python dependencies
│   └── production.env          # Environment variables
│
├── backend/                     # FastAPI analysis engine (main.py)
│   ├── main.py                 # Main analysis API
│   ├── ad_analyser.py          # Ad content analysis
│   ├── brand_compliance.py      # Brand guideline compliance
│   ├── metaphor.py             # Metaphor detection
│   ├── gemini_channel_compliance_new.py # Channel compliance
│   ├── audio_extract.py        # Audio extraction utility
│   ├── config.py               # API configuration
│   ├── Dockerfile              # Container configuration
│   ├── requirements.txt         # Python dependencies
│   └── production.env          # Environment variables
│
└── README.md                    # This file

```

---

## Getting Started

### Prerequisites

- Node.js 18+ and npm 8+
- Python 3.10+
- Docker (for containerized deployment)
- Firebase account and project
- Google Cloud account with Gemini API enabled
- Shopify developer account (for payment integration)

### Frontend Setup

```bash
cd frontend
npm install
npm start
```

Environment variables in `frontend/production.env`:
```
REACT_APP_URL=http://localhost:8002/
REACT_APP_API_URL=http://localhost:8000/
REACT_APP_USE_MOCK_API=false
REACT_APP_PYTHON_API_TIMEOUT=120000
NODE_ENV=production
```

### Middleware Setup

```bash
cd middleware
pip install -r requirements.txt
python -m uvicorn app:app --host 0.0.0.0 --port 8002
```

Environment variables in `middleware/production.env`:
```
FIREBASE_CREDENTIALS_PATH=c5itmtshopify-firebase-adminsdk-fbsvc-c22de0ceed.json
DATABASE_URL=firestore
STORAGE_BUCKET=c5itmtshopify.firebasestorage.app
```

### Backend Setup

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Environment variables in `backend/production.env`:
```
GEMINI_API_KEY=your_api_key_here
GOOGLE_API_KEY=your_api_key_here
```

---

## Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Frontend (React.js)                    │
│            - User authentication & brand setup               │
│            - Ad upload & analysis interface                  │
│            - Results visualization & PDF generation          │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP/REST
┌────────────────────▼────────────────────────────────────────┐
│                Middleware (FastAPI - Port 8002)              │
│            - User profile management                         │
│            - Plan & subscription handling                    │
│            - Brand data management                           │
│            - File upload & storage orchestration             │
│            - Database operations (Firestore)                 │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP/REST
┌────────────────────▼────────────────────────────────────────┐
│              Backend (FastAPI - Port 8000)                   │
│            - AI-powered ad analysis                          │
│            - Brand compliance checking                       │
│            - Channel compatibility analysis                  │
│            - Metaphor detection                              │
│            - Purchase intent scoring                         │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
   ┌────▼──┐  ┌─────▼──┐  ┌────▼──┐
   │Gemini │  │Firebase│  │ Cloud │
   │  API  │  │Firestore  │Storage │
   └───────┘  └────────┘  └───────┘
```

### API Integration Pattern

**unifiedApiHelper.js** - Centralized API client with:
- Request deduplication (prevents duplicate in-flight requests)
- Response caching with TTL (5 min for user data, 2 min for files)
- Automatic cache invalidation on mutations
- Error handling and retry logic

### State Management

- **React Context** - Global auth state (AuthContext)
- **React Hooks** - Component-level state
- **localStorage** - Persistence layer
- **Firebase Firestore** - Backend database

---

## Key Features & Implementation

### 1. AI/ML Integration

**Google Gemini AI Integration:**
- Real-time ad analysis processing image/video uploads
- Comprehensive scores for:
  - Brand compliance (logo, colors, tone alignment)
  - Purchase intent (message clarity, emotional appeal, CTA strength)
  - Metaphor effectiveness (visual storytelling)
  - Channel optimization (platform-specific guidelines)
  - Content analysis (overall effectiveness)

**Batch Processing:**
- Video files processed frame-by-frame
- Image files analyzed individually
- Efficient GPU memory management

### 2. Subscription-Based SaaS Architecture

**Tiered Plans:**
- **Lite** - Basic features, limited analyses per month
- **Plus** - Enhanced features, more analyses
- **Pro** - Full features, unlimited analyses
- **Enterprise** - Custom solutions

**Feature-Gating Logic:**
- Dynamic UI rendering based on user plan
- API-level access control
- Real-time quota tracking
- Monthly usage reset

**Implementation:**
```javascript
// Frontend feature control
<FeatureAccessControl requiredFeature="advanced_metrics">
  <AdvancedMetricsComponent />
</FeatureAccessControl>
```

### 3. Payment & E-commerce Integration

**Shopify Integration:**
- Secure payment flows
- Real-time plan activation
- Automated subscription management
- PCI compliance

**Quota Management:**
```python
# Monthly reset logic
if current_month != last_usage_month:
    ads_used = 0  # Reset monthly counter
```

### 4. Document Generation & Reporting

**PDF Report Features:**
- Branded layouts with company logo
- Dynamic content based on analysis results
- Expandable sections with AI insights
- Score visualizations and charts
- Professional formatting

**Implementation:**
- html2canvas for DOM capture
- jsPDF for PDF creation
- GCS storage for reports
- Signed URLs for secure downloads

### 5. Secure File Handling

**Google Cloud Storage Integration:**
- Media file uploads (max 50MB)
- Logo storage and management
- PDF report storage
- Signed URL generation (7-day expiration)
- Automatic cleanup of temporary files

### 6. Real-time Data Synchronization

**Firebase Firestore:**
- Real-time user profile updates
- Analysis history tracking
- Brand configuration persistence
- Subscription status management

---

## API Documentation

### Middleware Endpoints (Port 8002)

#### User Management
- `GET /get-user-profile/{user_id}` - Get user profile with subscription
- `POST /UserProfileDetails` - Create/update user profile
- `PATCH /updateUserProfileDetails/{user_id}` - Merge updates

#### Brand Management
- `POST /branddata-form` - Save brand configuration
- `GET /get-brand-data/{brand_id}` - Get brand settings
- `GET /get-user-brands/{user_id}` - List user brands

#### Analysis
- `POST /postAnalysisDetailsFormData` - Main analysis endpoint
- `GET /get-analysis-details/{user_id}` - Get user analyses
- `GET /get-analysis-by-id/{analysis_id}` - Get specific analysis
- `POST /save-analysis-record` - Save analysis results

#### Subscription
- `POST /save-plan-selection` - Save selected plan
- `POST /update_plan` - Upgrade/topup plan
- `GET /get-plan-status/{user_id}` - Get plan details

#### File Management
- `POST /upload-analysis-pdf` - Upload PDF to storage
- `GET /download-analysis-pdf/{analysis_id}` - Download PDF
- `GET /get-user-files/{userId}` - List user files

### Backend Endpoints (Port 8000)

#### Analysis
- `POST /comprehensive-analysis` - Main analysis endpoint
  - Accepts: file, ad_description, user_ad_type, brand_colors, tone_of_voice, platforms
  - Returns: Complete analysis results from all modules

#### Health
- `GET /health` - API health check
- `GET /` - Root endpoint

---

## Database Schema

### Firestore Collections

**users/**
```json
{
  "uid": "user_id",
  "email": "user@example.com",
  "displayName": "User Name",
  "photoURL": "https://...",
  "createdAt": "2026-01-01T00:00:00Z",
  "subscription": {
    "planId": "pro",
    "status": "active",
    "expiryDate": "2026-02-01T00:00:00Z"
  }
}
```

**brands/**
```json
{
  "userId": "user_id",
  "brandName": "Brand Name",
  "logoUrl": "https://...",
  "colors": ["#FF5733", "#33FF57"],
  "toneOfVoice": ["Professional", "Friendly"],
  "createdAt": "2026-01-01T00:00:00Z"
}
```

**user_analysis/**
```json
{
  "userId": "user_id",
  "brandId": "brand_id",
  "adTitle": "Ad Title",
  "adDescription": "Ad description",
  "fileUrl": "https://gcs/...",
  "analysisResults": {
    "brandCompliance": {...},
    "purchaseIntent": {...},
    "metaphorAnalysis": {...},
    "channelCompliance": {...},
    "contentAnalysis": {...}
  },
  "createdAt": "2026-01-01T00:00:00Z"
}
```

**PlanSelectionDetails/**
```json
{
  "userId": "user_id",
  "planType": "pro",
  "max_ads_per_month": 100,
  "adsUsed": 5,
  "totalAds": 500,
  "selectedFeatures": ["brand_compliance", "purchase_intent"],
  "lastUsageDate": "2026-01-12T00:00:00Z"
}
```

---

## Deployment

### Docker Deployment

**Build Images:**
```bash
# Frontend
docker build -t incivus-frontend:latest frontend/

# Middleware
docker build -t incivus-middleware:latest middleware/

# Backend
docker build -t incivus-backend:latest backend/
```

**Run Containers:**
```bash
# Middleware
docker run -p 8002:8002 \
  -e FIREBASE_CREDENTIALS_PATH=/app/credentials.json \
  incivus-middleware:latest

# Backend
docker run -p 8000:8000 \
  -e GEMINI_API_KEY=your_key \
  incivus-backend:latest
```

### Google Cloud Run Deployment

```bash
# Deploy middleware
gcloud run deploy incivus-middleware \
  --source middleware/ \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars FIREBASE_CREDENTIALS_PATH=/app/credentials.json

# Deploy backend
gcloud run deploy incivus-backend \
  --source backend/ \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=your_key
```

---

## Environment Variables

### Frontend (.env)
```
REACT_APP_URL=http://localhost:8002/
REACT_APP_API_URL=http://localhost:8000/
REACT_APP_USE_MOCK_API=false
REACT_APP_PYTHON_API_TIMEOUT=120000
NODE_ENV=production
```

### Middleware (.env)
```
FIREBASE_CREDENTIALS_PATH=./credentials.json
DATABASE_URL=firestore
STORAGE_BUCKET=your-bucket.firebasestorage.app
ALLOWED_HOSTS=localhost,127.0.0.1
FRONTEND_URLS=http://localhost:3000
```

### Backend (.env)
```
GEMINI_API_KEY=your_gemini_api_key
GOOGLE_API_KEY=your_google_api_key
```

---

## Performance Optimization

### Frontend
- Smart caching with TTL-based invalidation
- Request deduplication
- Code splitting and lazy loading
- Image optimization
- CSS-in-JS with runtime optimization

### Backend
- Batch processing for videos
- Module cache clearing for fresh results
- Efficient AI prompt engineering
- Temporary file cleanup
- Connection pooling for databases

---

## Security Best Practices

- ✅ CORS configuration for frontend domains
- ✅ HTTPS enforcement in production
- ✅ Firebase authentication for user verification
- ✅ Signed URLs with 7-day expiration for file access
- ✅ Input validation on all endpoints
- ✅ Rate limiting for API endpoints
- ✅ Secure credential management (Firebase, API keys)
- ✅ File size limits (50MB max)
- ✅ Content Security Policy headers

---

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## License

This project is proprietary and confidential. All rights reserved.

---

## Contact & Support

For questions, bugs, or feature requests, please reach out to the development team.

---

**Incivus Lite** - Empowering brands through AI-powered ad analysis.

