"""
TEST SCRIPT - Verify Backend Integration
Run this before running the full evaluation

This script checks:
1. Is backend server running?
2. Can we connect to the API?
3. Are there any labeled submissions?
4. Are the endpoints working correctly?
"""

import requests
import json
import sys

def print_header():
    """Print a nice header"""
    print("""
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║  BACKEND INTEGRATION TEST                                  ║
║  Ghost Typing Evaluation System                           ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
    """)

def test_backend_connection():
    """Test if backend is running and accessible"""
    
    backend_url = "http://localhost:5000"
    
    print("🧪 Testing Backend Connection...")
    print("=" * 70)
    
    # Test 1: Check if server is running
    print("\n1️⃣  Testing if backend is running...")
    print("   Connecting to:", backend_url)
    
    try:
        response = requests.get(f"{backend_url}/api/exams/evaluation-stats", timeout=5)
        
        if response.status_code == 200:
            print("   ✅ Backend is running!")
            data = response.json()
            print("\n   📊 Current Statistics:")
            print(f"      - Total Submissions: {data.get('totalSubmissions', 0)}")
            print(f"      - Total Labeled: {data.get('totalLabeled', 0)}")
            print(f"      - Genuine: {data.get('genuineCount', 0)}")
            print(f"      - Cheating: {data.get('cheatingCount', 0)}")
            print(f"      - Unlabeled: {data.get('unlabeledCount', 0)}")
            print(f"      - Labeling Progress: {data.get('labelingProgress', 0)}%")
        else:
            print(f"   ⚠️  Backend responded with status {response.status_code}")
            print(f"   Response: {response.text[:200]}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("   ❌ CANNOT CONNECT TO BACKEND!")
        print("\n   💡 Fix: Make sure your backend is running:")
        print("      1. Open a new terminal")
        print("      2. cd backend")
        print("      3. node server.js")
        print("\n   Then run this test again.")
        return False
    except requests.exceptions.Timeout:
        print("   ❌ Connection timeout!")
        print("   Backend is taking too long to respond.")
        return False
    except Exception as e:
        print(f"   ❌ Unexpected error: {e}")
        return False
    
    # Test 2: Check labeled submissions endpoint
    print("\n2️⃣  Testing /labeled-submissions endpoint...")
    print("   This endpoint provides data for Python evaluation")
    
    try:
        response = requests.get(f"{backend_url}/api/exams/labeled-submissions", timeout=5)
        
        if response.status_code == 200:
            data = response.json()
            print(f"   ✅ Endpoint working!")
            print(f"   📝 Found {len(data)} labeled submissions")
            
            if len(data) > 0:
                print("\n   📋 Sample submission:")
                sample = data[0]
                print(f"      - ID: {sample.get('_id', 'N/A')}")
                print(f"      - Label: {sample.get('label', 'N/A')}")
                print(f"      - Violations: {len(sample.get('violations', []))}")
                print(f"      - Status: {sample.get('status', 'N/A')}")
                print(f"      - Score: {sample.get('score', 0)}")
                
                # Show breakdown by label
                genuine = sum(1 for s in data if s.get('label') == 'genuine')
                cheating = sum(1 for s in data if s.get('label') == 'cheating')
                print(f"\n   📊 Label Distribution:")
                print(f"      - Genuine: {genuine}")
                print(f"      - Cheating: {cheating}")
                
            else:
                print("\n   ⚠️  NO LABELED SUBMISSIONS FOUND!")
                print("\n   💡 To fix this:")
                print("      1. Complete an exam as a student")
                print("      2. Go to the Results page")
                print("      3. Scroll to 'Label This Session for AI Training'")
                print("      4. Select 'Genuine' or 'Cheating'")
                print("      5. Click 'Save Label'")
                print("      6. Run this test again")
                
        else:
            print(f"   ❌ Endpoint returned status {response.status_code}")
            print(f"   Response: {response.text[:200]}")
            return False
            
    except Exception as e:
        print(f"   ❌ Error testing endpoint: {e}")
        return False
    
    # Test 3: Check metrics endpoint
    print("\n3️⃣  Testing /metrics endpoint...")
    print("   (This may require authentication)")
    
    try:
        response = requests.get(f"{backend_url}/api/exams/metrics", timeout=5)
        
        if response.status_code == 200:
            data = response.json()
            print("   ✅ Metrics endpoint working!")
            
            if data.get('metrics'):
                metrics = data['metrics']
                print(f"\n   📊 Current Metrics:")
                print(f"      - Accuracy: {metrics.get('accuracy', 0)}%")
                print(f"      - Precision: {metrics.get('precision', 0)}%")
                print(f"      - Recall: {metrics.get('recall', 0)}%")
                print(f"      - F1-Score: {metrics.get('f1Score', 0)}%")
            else:
                print("   ⚠️  No metrics available (not enough labeled data)")
                
        elif response.status_code == 401:
            print("   ⚠️  Endpoint requires authentication")
            print("   (This is OK - we'll use /labeled-submissions instead)")
        else:
            print(f"   ⚠️  Status: {response.status_code}")
            
    except Exception as e:
        print(f"   ⚠️  Could not test metrics endpoint: {e}")
    
    print("\n" + "=" * 70)
    return True


def print_next_steps(success, has_data):
    """Print what to do next"""
    
    print("\n" + "=" * 70)
    print("📋 SUMMARY")
    print("=" * 70)
    
    if success and has_data:
        print("\n✅ ALL TESTS PASSED!")
        print("\nYou're ready to run the evaluation:")
        print("   python ghost_typing_evaluator.py")
        
    elif success and not has_data:
        print("\n⚠️  Backend is working, but NO DATA to evaluate!")
        print("\nNext steps:")
        print("1. Label at least 10 sessions (5 genuine, 5 cheating)")
        print("2. Go to Results page after each exam")
        print("3. Select Genuine/Cheating and click 'Save Label'")
        print("4. Run this test again to verify")
        print("5. Then run: python ghost_typing_evaluator.py")
        
    else:
        print("\n❌ TESTS FAILED!")
        print("\nTroubleshooting:")
        print("1. Make sure backend is running:")
        print("   cd backend")
        print("   node server.js")
        print("2. Check if MongoDB is connected")
        print("3. Verify backend is on port 5000")
        print("4. Check for error messages in backend console")


def main():
    """Main test function"""
    
    print_header()
    
    # Run tests
    success = test_backend_connection()
    
    # Check if we have data
    has_data = False
    try:
        response = requests.get("http://localhost:5000/api/exams/labeled-submissions", timeout=5)
        if response.status_code == 200:
            data = response.json()
            has_data = len(data) > 0
    except:
        pass
    
    # Print summary and next steps
    print_next_steps(success, has_data)
    
    print("\n" + "=" * 70)
    print()
    
    # Return exit code
    if success and has_data:
        sys.exit(0)  # Success
    else:
        sys.exit(1)  # Failure


if __name__ == "__main__":
    main()