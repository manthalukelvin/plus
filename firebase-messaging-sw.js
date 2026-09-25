// firebase-messaging-sw.js — Service Worker for Firebase Cloud Messaging
// Place this file in the root directory of your project (same level as index.html)
// This handles background messages and push notifications.

importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-messaging-compat.js');

// Firebase config (same as in main.js)
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
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage(function(payload) {
  console.log('Background message received:', payload);
  const title = payload.notification?.title || 'My Journal';
  const options = {
    body: payload.notification?.body || 'You have a new message',
    icon: '/logo.png',
    badge: '/logo.png',
    tag: 'journal-notification',
    data: payload.data || {}
  };
  self.registration.showNotification(title, options);
});

// Click handler for notifications
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (let i = 0; i < clientList.length; i++) {
        if (clientList[i].url === '/' || clientList[i].url.includes('home.html')) {
          return clientList[i].focus();
        }
      }
      if (clients.openWindow) return clients.openWindow('/home.html');
    })
  );
});