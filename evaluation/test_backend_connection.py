"""
Test script to debug backend connection
Run this to check what's happening with the API
"""

import requests
import json

BACKEND_URL = "http://localhost:5000"

print("=" * 70)
print("🔍 BACKEND CONNECTION DIAGNOSTIC TEST")
print("=" * 70)

# Test 1: Health check
print("\n1️⃣ Testing backend health...")
try:
    response = requests.get(f"{BACKEND_URL}/health", timeout=5)
    if response.status_code == 200:
        print(f"   ✅ Backend is running! Response: {response.json()}")
    else:
        print(f"   ❌ Backend returned {response.status_code}")
except Exception as e:
    print(f"   ❌ Cannot connect to backend: {e}")
    print("   → Make sure backend is running: cd backend && npm start")
    exit(1)

# Test 2: Label stats
print("\n2️⃣ Testing label stats endpoint...")
try:
    response = requests.get(f"{BACKEND_URL}/api/exams/label-stats", timeout=5)
    if response.status_code == 200:
        stats = response.json()
        print(f"   ✅ Stats endpoint works!")
        print(f"      Total: {stats.get('total', 'N/A')}")
        print(f"      Labeled: {stats.get('labeled', 'N/A')}")
        print(f"      Genuine: {stats.get('genuine', 'N/A')}")
        print(f"      Cheating: {stats.get('cheating', 'N/A')}")
    else:
        print(f"   ⚠️ Stats endpoint returned {response.status_code}")
        print(f"      This endpoint might not exist yet - add it to exam.js")
except Exception as e:
    print(f"   ⚠️ Stats endpoint error: {e}")

# Test 3: Labeled submissions
print("\n3️⃣ Testing labeled submissions endpoint...")
try:
    response = requests.get(f"{BACKEND_URL}/api/exams/labeled-submissions", timeout=10)
    print(f"   Status Code: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"   ✅ Endpoint works! Returned {len(data)} submissions")
        
        if len(data) == 0:
            print(f"\n   ⚠️ WARNING: Endpoint returned empty array!")
            print(f"   Possible issues:")
            print(f"      1. MongoDB query is not finding labeled data")
            print(f"      2. Check exam.js route implementation")
            print(f"      3. Verify MongoDB has data with isLabeled=true")
        else:
            print(f"\n   📋 Sample submission (first one):")
            sample = data[0]
            print(f"      ID: {sample.get('_id', 'N/A')}")
            print(f"      Label: {sample.get('label', 'N/A')}")
            print(f"      User ID: {sample.get('userId', 'N/A')}")
            print(f"      Violations: {len(sample.get('violations', []))}")
            
            # Count labels
            genuine_count = sum(1 for s in data if s.get('label') == 'genuine')
            cheating_count = sum(1 for s in data if s.get('label') == 'cheating')
            print(f"\n   📊 Label distribution:")
            print(f"      Genuine: {genuine_count}")
            print(f"      Cheating: {cheating_count}")
            
    else:
        print(f"   ❌ Endpoint failed!")
        print(f"   Response: {response.text[:500]}")
        
except requests.exceptions.Timeout:
    print(f"   ❌ Request timeout - backend is slow or not responding")
except Exception as e:
    print(f"   ❌ Error: {e}")

# Test 4: Raw MongoDB check suggestion
print("\n4️⃣ Suggested MongoDB check:")
print("   Run this in MongoDB Compass Shell:")
print("   " + "=" * 60)
print("   db.submissions.find({ isLabeled: true }).count()")
print("   db.submissions.find({ label: 'genuine' }).count()")
print("   db.submissions.find({ label: 'cheating' }).count()")
print("   " + "=" * 60)

print("\n" + "=" * 70)
print("✅ DIAGNOSTIC COMPLETE")
print("=" * 70)

print("\n💡 NEXT STEPS:")
print("   1. If backend health fails → start backend: npm start")
print("   2. If labeled-submissions returns 0 → check exam.js route")
print("   3. If MongoDB counts are 0 → run test data generator")
print("=" * 70 + "\n")