interface TTSResult {
    success: boolean;
    audioUrl?: string;
    audioPath?: string;
    error?: string;
    usedFallback?: boolean;
}
/**
 * Generate speech using ElevenLabs API
 * Falls back to Polly if ElevenLabs fails
 */
export declare function generateSpeech(text: string, callSid: string): Promise<TTSResult>;
/**
 * Get the audio file path for serving
 */
export declare function getAudioFilePath(filename: string): string | null;
/**
 * Check if ElevenLabs is configured and ready
 */
export declare function isElevenLabsConfigured(): boolean;
/**
 * Get current configuration info
 */
export declare function getElevenLabsConfig(): {
    configured: boolean;
    voiceId: string;
    model: string;
    cacheDir: string;
};
export {};
//# sourceMappingURL=elevenlabs-tts.d.ts.map