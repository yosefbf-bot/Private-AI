export function browserSpeechAllowed(settings) {
  return !!settings && settings.hipaa === false && settings.processingMode !== 'local-only';
}
