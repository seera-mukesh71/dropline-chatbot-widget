// Add/remove languages by editing this one list.
export const LANGUAGES = [
  { code: "en", label: "English", speech: "en-IN" },
  { code: "hi", label: "हिन्दी", speech: "hi-IN" },
  { code: "te", label: "తెలుగు", speech: "te-IN" },
  { code: "ta", label: "தமிழ்", speech: "ta-IN" },
  { code: "kn", label: "ಕನ್ನಡ", speech: "kn-IN" },
  { code: "mr", label: "मराठी", speech: "mr-IN" },
];

// Full English names — used by the server in translation prompts.
export const LANGUAGE_NAMES = {
  en: "English",
  hi: "Hindi",
  te: "Telugu",
  ta: "Tamil",
  kn: "Kannada",
  mr: "Marathi",
};

// Quick lookup: app code -> speech code (for mic + speaker).
export const SPEECH_CODES = LANGUAGES.reduce((acc, l) => {
  acc[l.code] = l.speech;
  return acc;
}, {});