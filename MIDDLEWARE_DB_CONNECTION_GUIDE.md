# Middleware Database Connection Guide: How Data Flows Between Middleware and Firebase

## 📚 Table of Contents
1. [Connection Architecture](#connection-architecture)
2. [Database Models & Schema](#database-models--schema)
3. [Data Conversion Process](#data-conversion-process)
4. [Complete Flow Examples](#complete-flow-examples)
5. [Connection Patterns](#connection-patterns)

---

## 🔌 Connection Architecture

### How Middleware Connects to Firebase

```
┌─────────────────────────────────────────────────────────┐
│              Middleware (FastAPI)                        │
│              app.py                                      │
└────────────────────┬──────────────────────────────────┘
                     │
                     │ import db from config
                     ▼
┌─────────────────────────────────────────────────────────┐
│              config.py                                   │
│  ┌──────────────────────────────────────────────┐      │
│  │ 1. Load Credentials                          │      │
│  │    cred = credentials.Certificate(...)       │      │
│  │                                               │      │
│  │ 2. Initialize Firebase Admin SDK             │      │
│  │    firebase_admin.initialize_app(...)        │      │
│  │                                               │      │
│  │ 3. Create Firestore Client                   │      │
│  │    db = firestore.client()                   │      │
│  │                                               │      │
│  │ 4. Create Storage Client                     │      │
│  │    bucket = storage.bucket()                 │      │
│  └──────────────────────────────────────────────┘      │
└────────────────────┬──────────────────────────────────┘
                     │
                     │ HTTP/gRPC Protocol
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Firebase Cloud                              │
│  ┌──────────────────┐    ┌──────────────────┐         │
│  │   Firestore      │    │  Cloud Storage   │         │
│  │   (NoSQL DB)     │    │  (File Storage)  │         │
│  └──────────────────┘    └──────────────────┘         │
└─────────────────────────────────────────────────────────┘
```

### Connection Setup (config.py)

```python
# config.py - Connection initialization

import firebase_admin
from firebase_admin import credentials, firestore, storage

# Step 1: Load credentials from JSON file
cred = credentials.Certificate("c5itmtshopify-firebase-adminsdk-fbsvc-c22de0ceed.json")

# Step 2: Initialize Firebase Admin SDK
firebase_admin.initialize_app(cred, {
    "storageBucket": "c5itmtshopify.firebasestorage.app"
})

# Step 3: Create Firestore client (database connection)
db = firestore.client()

# Step 4: Create Storage client (file storage connection)
bucket = storage.bucket()

# Step 5: Export for use in app.py
# In app.py: from config import db, bucket
```

**Key Points:**
- ✅ **Single Connection**: `db` is created once and reused
- ✅ **Connection Pooling**: Firebase SDK handles connection pooling automatically
- ✅ **No Manual Connection Management**: No need to open/close connections
- ✅ **Thread-Safe**: Can be used across multiple requests

---

## 🗄️ Database Models & Schema

### Firestore Structure (NoSQL)

Firestore uses a **document-based** structure (not SQL tables):

```
Firestore Database
│
├── Collections (like folders)
│   │
│   ├── PlanSelectionDetails
│   │   └── Documents (like files)
│   │       ├── user_id_1 → {planName, adsUsed, ...}
│   │       ├── user_id_2 → {planName, adsUsed, ...}
│   │       └── ...
│   │
│   ├── userProfileDetails
│   │   └── Documents
│   │       ├── user_id_1 → {userId, userProfile, ...}
│   │       └── ...
│   │
│   ├── brandData
│   │   └── Documents
│   │       ├── brand_id_1 → {brandName, colorPalette, ...}
│   │       └── ...
│   │
│   ├── user_analysis
│   │   └── Documents
│   │       ├── analysis_id_1 → {ai_analysis_results, ...}
│   │       └── ...
│   │
│   └── userFiles
│       └── Documents
│           ├── file_id_1 → {fileName, storagePath, ...}
│           └── ...
```

### Collection Schemas (Data Models)

#### 1. **PlanSelectionDetails** Collection

**Document ID**: `user_id` (e.g., "xAWSH5gZdHRS5K0YzFmxyTyhX543")

**Schema**:
```python
{
    "planName": str,              # e.g., "Incivus_Plus"
    "adsUsed": int,                # e.g., 5
    "max_ads_per_month": int,      # e.g., 20
    "totalAds": int,               # e.g., 100
    "lastUsageDate": str,          # ISO format: "2026-01-08T10:38:41.534771"
    "subscriptionStartDate": str,   # ISO format
    "subscriptionEndDate": str,     # ISO format
    "isActive": bool,              # true/false
    "paymentStatus": str,          # e.g., "paid"
    "selectedFeatures": list,      # ["brand_compliance", "messaging_intent", ...]
    "totalPrice": float,           # e.g., 99.99
    "validityDays": int,           # e.g., 30
    "updatedAt": str               # ISO format timestamp
}
```

**Example Document**:
```json
{
    "planName": "Incivus_Plus",
    "adsUsed": 1,
    "max_ads_per_month": 5,
    "totalAds": 25,
    "lastUsageDate": "2026-01-08T10:38:41.534771Z",
    "isActive": true,
    "selectedFeatures": ["brand_compliance", "messaging_intent"],
    "totalPrice": 99.99
}
```

#### 2. **userProfileDetails** Collection

**Document ID**: `user_id`

**Schema**:
```python
{
    "userId": str,
    "timestamp": str,              # ISO format
    "userProfile": dict,           # Nested object
    "metadata": dict,              # Additional metadata
    "subscription": dict,          # Merged from PlanSelectionDetails
    "updatedAt": str
}
```

#### 3. **brandData** Collection

**Document ID**: `brand_id` (UUID)

**Schema**:
```python
{
    "userId": str,
    "brandName": str,
    "tagline": str,
    "brandDescription": str,
    "primaryColor": str,           # Hex: "#F05A28"
    "secondaryColor": str,         # Hex: "#000000"
    "accentColor": str,            # Hex: "#FFFFFF"
    "colorPalette": str,           # Comma-separated: "#F05A28,#000000,#FFFFFF"
    "toneOfVoice": str,            # Comma-separated: "Professional, Friendly, Casual"
    "mediaFiles": list,            # Array of file objects
    "timestamp": str
}
```

**mediaFiles Array Structure**:
```python
[
    {
        "fileId": str,             # UUID
        "filename": str,            # "logo.png"
        "url": str,                 # Signed URL
        "storagePath": str,         # "user_id/brand_id/logo/uuid.png"
        "contentType": str,         # "image/png"
        "fileSize": int,            # Bytes
        "mediaType": str            # "logo" or "image"
    }
]
```

#### 4. **user_analysis** Collection

**Document ID**: `analysis_id` (UUID)

**Schema**:
```python
{
    "userId": str,
    "brandId": str,
    "artifact_id": str,            # Same as document ID
    "adTitle": str,
    "messageIntent": str,
    "funnelStage": str,            # "Awareness", "Consideration", "Conversion"
    "channels": list,              # ["YouTube", "TikTok"]
    "ai_analysis_results": dict,   # Nested: {"comprehensive-analysis": {...}}
    "mediaUrl": str,               # Signed URL to media file
    "storagePath": str,
    "timestamp": str,
    "selectedFeatures": list,
    "plan_usage_at_time": dict     # Snapshot of plan when analysis ran
}
```

#### 5. **userFiles** Collection

**Document ID**: Auto-generated by Firestore

**Schema**:
```python
{
    "userId": str,
    "fileName": str,
    "fileCategory": str,           # "analysis-report", "uploaded_ad", "brand-media"
    "storagePath": str,
    "analysisId": str,             # Links to user_analysis document
    "url": str,                   # Signed URL (generated on read)
    "timestamp": str
}
```

---

## 🔄 Data Conversion Process

### Python → Firestore (Writing Data)

#### Step 1: Python Dictionary Created

```python
# In app.py
data = {
    "userId": "user123",
    "planName": "Incivus_Plus",
    "adsUsed": 5,
    "max_ads_per_month": 20,
    "isActive": True,
    "selectedFeatures": ["brand_compliance", "messaging_intent"],
    "timestamp": datetime.utcnow().isoformat()
}
```

#### Step 2: Convert to Firestore Format

**Automatic Conversion** (Firebase SDK handles this):
- ✅ `str` → Firestore String
- ✅ `int` → Firestore Integer
- ✅ `float` → Firestore Double
- ✅ `bool` → Firestore Boolean
- ✅ `list` → Firestore Array
- ✅ `dict` → Firestore Map (nested object)
- ✅ `datetime` → Firestore Timestamp (if using `firestore.SERVER_TIMESTAMP`)
- ✅ `None` → Firestore Null

**Manual Conversion** (for ISO strings):
```python
# Convert datetime to ISO string
timestamp = datetime.utcnow().isoformat()  # "2026-01-08T10:38:41.534771"
data["timestamp"] = timestamp
```

#### Step 3: Write to Firestore

```python
# Method 1: Create/Update entire document
db.collection("PlanSelectionDetails").document(user_id).set(data)

# Method 2: Update specific fields (merge)
db.collection("PlanSelectionDetails").document(user_id).set(data, merge=True)

# Method 3: Update specific fields only
db.collection("PlanSelectionDetails").document(user_id).update({
    "adsUsed": 6,
    "lastUsageDate": datetime.utcnow().isoformat()
})
```

**What Happens:**
```
Python Dict → Firebase SDK → Serialization → gRPC/HTTP → Firestore Cloud
   {data}      (converts)      (JSON-like)    (network)    (stores)
```

---

### Firestore → Python (Reading Data)

#### Step 1: Read from Firestore

```python
# Get document reference
plan_ref = db.collection("PlanSelectionDetails").document(user_id)

# Read document
plan_doc = plan_ref.get()

# Check if exists
if plan_doc.exists:
    # Convert Firestore document to Python dict
    plan_data = plan_doc.to_dict()
```

#### Step 2: Automatic Type Conversion

**Firestore → Python**:
- ✅ Firestore String → `str`
- ✅ Firestore Integer → `int`
- ✅ Firestore Double → `float`
- ✅ Firestore Boolean → `bool`
- ✅ Firestore Array → `list`
- ✅ Firestore Map → `dict`
- ✅ Firestore Timestamp → `datetime.datetime`
- ✅ Firestore Null → `None`

#### Step 3: Access Data

```python
# Get data as dictionary
plan_data = plan_doc.to_dict()
# Returns: {"planName": "Incivus_Plus", "adsUsed": 5, ...}

# Access fields
plan_name = plan_data.get("planName", "Unknown")
ads_used = plan_data.get("adsUsed", 0)

# Safe access with defaults
max_ads = plan_data.get("max_ads_per_month", 0)  # Returns 0 if missing
```

---

## 📊 Complete Flow Examples

### Example 1: Reading User Plan (GET Request)

```python
@app.get("/get-user-profile/{user_id}")
async def get_user_profile(user_id: str):
    # Step 1: Get document reference
    plan_ref = db.collection("PlanSelectionDetails").document(user_id)
    
    # Step 2: Read from Firestore
    plan_doc = plan_ref.get()
    
    # Step 3: Check if exists
    if not plan_doc.exists:
        raise HTTPException(404, "User plan not found")
    
    # Step 4: Convert Firestore document to Python dict
    plan_data = plan_doc.to_dict()
    # Returns: {
    #     "planName": "Incivus_Plus",
    #     "adsUsed": 5,
    #     "max_ads_per_month": 20,
    #     ...
    # }
    
    # Step 5: Extract and process data
    ads_used = plan_data.get("adsUsed", 0)
    max_ads = plan_data.get("max_ads_per_month", 0)
    
    # Step 6: Transform for frontend
    subscription_data = {
        "planType": plan_data.get("planName", "").replace("Incivus_", "").lower(),
        "adsUsed": ads_used,
        "maxAds": max_ads
    }
    
    # Step 7: Return JSON (FastAPI auto-converts dict to JSON)
    return subscription_data
```

**Data Flow**:
```
Firestore → plan_doc.to_dict() → plan_data (dict) → Transform → Return JSON
```

---

### Example 2: Creating User Profile (POST Request)

```python
@app.post("/UserProfileDetails")
async def post_user_profile(profile: UserProfile):
    # Step 1: Receive Pydantic model from request
    # UserProfile is validated by FastAPI
    data = profile.dict()  # Convert Pydantic model to dict
    # Returns: {
    #     "userId": "user123",
    #     "timestamp": "2026-01-08T10:38:41Z",
    #     "userProfile": {...},
    #     "metadata": {...}
    # }
    
    # Step 2: Extract user_id
    user_id = data["userId"]
    
    # Step 3: Write to Firestore
    # Firebase SDK automatically converts Python dict to Firestore format
    db.collection("userProfileDetails").document(user_id).set(data)
    
    # Step 4: Return response
    return {"message": "User profile saved successfully", "user_id": user_id}
```

**Data Flow**:
```
Request JSON → Pydantic Model → Python Dict → Firestore SDK → Firestore Cloud
```

---

### Example 3: Updating Plan Usage (PATCH-like Update)

```python
# After successful analysis
plan_ref = db.collection("PlanSelectionDetails").document(userId)

# Read current data
plan_doc = plan_ref.get()
plan_data = plan_doc.to_dict()

# Modify in Python
plan_data["adsUsed"] = plan_data.get("adsUsed", 0) + 1
plan_data["lastUsageDate"] = datetime.utcnow().isoformat()
plan_data["totalAds"] = max(0, plan_data.get("totalAds", 0) - 1)

# Write back to Firestore
plan_ref.update({
    "adsUsed": plan_data["adsUsed"],
    "lastUsageDate": plan_data["lastUsageDate"],
    "totalAds": plan_data["totalAds"]
})
```

**Data Flow**:
```
Firestore → Python Dict → Modify → Update Firestore
```

---

### Example 4: Querying Multiple Documents

```python
@app.get("/get-user-files/{userId}")
async def get_user_files(userId: str, fileCategory: Optional[str] = None):
    # Step 1: Build query
    query = db.collection("userFiles").where("userId", "==", userId)
    
    # Step 2: Add filter if provided
    if fileCategory:
        query = query.where("fileCategory", "==", fileCategory)
    
    # Step 3: Execute query
    docs = query.stream()  # Returns iterator
    
    # Step 4: Convert each document
    files = []
    for doc in docs:
        file_data = doc.to_dict()  # Firestore → Python dict
        file_data["id"] = doc.id    # Add document ID
        files.append(file_data)
    
    # Step 5: Return list
    return {"userId": userId, "count": len(files), "files": files}
```

**Data Flow**:
```
Firestore Query → Iterator → Loop → doc.to_dict() → Python Dict → List → JSON
```

---

## 🔗 Connection Patterns

### Pattern 1: Direct Document Access

```python
# Get single document by ID
doc_ref = db.collection("CollectionName").document("document_id")
doc = doc_ref.get()

if doc.exists:
    data = doc.to_dict()
```

**Use Case**: When you know the exact document ID (e.g., user_id, brand_id)

---

### Pattern 2: Query with Filters

```python
# Query with conditions
query = db.collection("userFiles").where("userId", "==", userId)
query = query.where("fileCategory", "==", "analysis-report")
query = query.limit(10)

docs = query.stream()
for doc in docs:
    data = doc.to_dict()
```

**Use Case**: Finding documents by field values

---

### Pattern 3: Create/Update Document

```python
# Create new document
db.collection("CollectionName").document("id").set({
    "field1": "value1",
    "field2": 123
})

# Update existing document (merge)
db.collection("CollectionName").document("id").set({
    "field2": 456
}, merge=True)

# Update specific fields only
db.collection("CollectionName").document("id").update({
    "field2": 456
})
```

**Use Case**: Saving new data or updating existing data

---

### Pattern 4: Delete Document

```python
# Delete document
db.collection("CollectionName").document("id").delete()

# Delete field (set to None)
db.collection("CollectionName").document("id").update({
    "fieldToDelete": firestore.DELETE_FIELD
})
```

---

## 🎯 Key Concepts

### 1. **No ORM (Object-Relational Mapping)**

Unlike SQL databases with ORMs (like SQLAlchemy), Firestore:
- ✅ Uses **direct dictionary access**
- ✅ No model classes required (but Pydantic models help with validation)
- ✅ **Schema-less**: Documents can have different fields

### 2. **Pydantic Models (Optional but Recommended)**

```python
# Pydantic model for request validation
class UserProfile(BaseModel):
    userId: str
    timestamp: str
    userProfile: dict
    metadata: dict

# Convert to dict before saving
data = profile.dict()  # Pydantic → Python dict
db.collection("userProfileDetails").document(user_id).set(data)
```

**Benefits**:
- ✅ Request validation
- ✅ Type checking
- ✅ Auto-generated API docs

**Note**: Pydantic models are **NOT** database models. They're just for validation.

### 3. **Data Type Mapping**

| Python Type | Firestore Type | Notes |
|------------|----------------|-------|
| `str` | String | UTF-8 encoded |
| `int` | Integer | 64-bit signed |
| `float` | Double | 64-bit |
| `bool` | Boolean | true/false |
| `list` | Array | Ordered list |
| `dict` | Map | Nested object |
| `datetime` | Timestamp | If using `firestore.SERVER_TIMESTAMP` |
| `None` | Null | Missing field |

### 4. **Connection Lifecycle**

```python
# config.py - Runs once at startup
db = firestore.client()  # Creates connection pool

# app.py - Uses connection in each request
# No need to open/close - Firebase SDK handles it
plan_doc = db.collection("PlanSelectionDetails").document(user_id).get()
```

**Key Points**:
- ✅ Connection created once at startup
- ✅ Reused across all requests
- ✅ Automatic connection pooling
- ✅ No manual connection management

---

## 📝 Summary

### Connection Flow:
```
1. config.py loads credentials
2. Firebase Admin SDK initialized
3. db = firestore.client() creates connection
4. app.py imports db
5. Each request uses db to read/write
```

### Data Conversion:
```
Python Dict ↔ Firebase SDK ↔ Firestore Cloud
   (app.py)     (automatic)     (database)
```

### Key Collections:
- `PlanSelectionDetails` - User subscription plans
- `userProfileDetails` - User profile data
- `brandData` - Brand information
- `user_analysis` - Analysis results
- `userFiles` - File metadata

### No Models Required:
- ✅ Firestore is schema-less
- ✅ Use Python dictionaries directly
- ✅ Pydantic models only for validation (optional)
- ✅ No ORM needed

---

**Remember**: 
- Firebase SDK handles all type conversions automatically
- Use `.to_dict()` to convert Firestore documents to Python dicts
- Use `.set()` or `.update()` to write Python dicts to Firestore
- No need to manage connections - Firebase SDK does it automatically!
