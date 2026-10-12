// Browser speech recognition can use an online service. It is never allowed.
export function browserSpeechAllowed() { return false; }
export function localSpeechAllowed(settings) { return !!settings && typeof settings.processingMode === 'string'; }
