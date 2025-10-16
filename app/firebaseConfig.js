// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBbuQU9hFiNSiofi3mv5YT8XYtohLKsks8",
  authDomain: "doxazo-a1143.firebaseapp.com",
  projectId: "doxazo-a1143",
  storageBucket: "doxazo-a1143.firebasestorage.app",
  messagingSenderId: "102825055932",
  appId: "1:102825055932:web:429a5c492d8e6a58c1a2b9",
  measurementId: "G-LX7Z0GC2L9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);