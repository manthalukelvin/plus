// ========== REPLACE WITH YOUR FIREBASE CONFIG ==========
const firebaseConfig = {
   apiKey: "AIzaSyAtzbIZvFLQM65QhOwph0PFpO9vOYcYUdE",
  authDomain: "myjournal-plus.firebaseapp.com",
  databaseURL: "https://myjournal-plus-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "myjournal-plus",
  storageBucket: "myjournal-plus.firebasestorage.app",
  messagingSenderId: "288260274583",
  appId: "1:288260274583:web:9c40aafed9ab9fa30e6cd2",
  measurementId: "G-MXJ84MJGTR"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Commission rules (single source of truth)
const COMMISSION = {
  RETAINED_PER_BATCH: 50,   // every 50 qualified users retained 7 days
  RETAINED_PAYOUT: 2,       // $2
  PREMIUM_PER_BATCH: 15,    // every 15 verified premium
  PREMIUM_PAYOUT: 5         // $5
};
