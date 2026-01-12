import firebase_admin
from firebase_admin import credentials, firestore, storage

if not firebase_admin._apps:
    cred = credentials.Certificate("c5itmtshopify-firebase-adminsdk-fbsvc-c22de0ceed.json")
    firebase_admin.initialize_app(cred, {
        "storageBucket": "c5itmtshopify.firebasestorage.app"
    })

db = firestore.client()
bucket = storage.bucket()
# Point to the localhost AI model service (main.py)
API_URL = 'http://localhost:8000/'

print("✅ Firebase initialized successfully with service account key")
print(f"🔧 API URL: {API_URL}")