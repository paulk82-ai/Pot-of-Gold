// Firebase project details (Project settings > Your apps > Web app > Config).
// These values are not secret: every web app that uses Firebase ships them to the browser.
// Security comes from the rules in firestore.rules and from App Check.
window.RGC_CONFIG = {
  firebase: {
    apiKey: "AIzaSyACfB9KiJGdxbP2vNJ4V_z_ZRFRCXKZF4A",
    authDomain: "rathsallagh-monthly.firebaseapp.com",
    projectId: "rathsallagh-monthly",
    storageBucket: "rathsallagh-monthly.firebasestorage.app",
    messagingSenderId: "757571052994",
    appId: "1:757571052994:web:882d87b5a6f38b4415225b"
  },
  // App Check site key (reCAPTCHA Enterprise). Needed for card scanning with Gemini.
  recaptchaEnterpriseSiteKey: "",
  // The Gemini model that reads scorecard photos.
  geminiModel: "gemini-3.8-flash"
};
