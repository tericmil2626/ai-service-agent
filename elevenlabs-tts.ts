import fs from 'fs';
import path from 'path';

// ElevenLabs configuration
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // Rachel
const ELEVENLABS_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
const AUDIO_CACHE_DIR = process.env.AUDIO_CACHE_DIR || path.join(process.cwd(), 'audio-cache');

// Ensure cache directory exists
if (!fs.existsSync(AUDIO_CACHE_DIR)) {
  fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });
}

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
export async function generateSpeech(text: string, callSid: string): Promise<TTSResult> {
  // Validate API key
  if (!ELEVENLABS_API_KEY) {
    console.log('[ElevenLabs] No API key configured, using fallback');
    return { success: false, usedFallback: true, error: 'No API key' };
  }

  // Create unique filename based on callSid and text hash
  const textHash = Buffer.from(text).toString('base64').substring(0, 16).replace(/[^a-zA-Z0-9]/g, '');
  const filename = `${callSid.substring(0, 16)}_${textHash}_${Date.now()}.mp3`;
  const audioPath = path.join(AUDIO_CACHE_DIR, filename);

  try {
    console.log(`[ElevenLabs] Generating speech for: "${text.substring(0, 50)}..."`);
    
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text: text,
        model_id: ELEVENLABS_MODEL,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
    }

    // Save audio file
    const audioBuffer = await response.arrayBuffer();
    fs.writeFileSync(audioPath, Buffer.from(audioBuffer));

    // Construct public URL
    const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'http://localhost:3002';
    const audioUrl = `${webhookBaseUrl}/audio/${filename}`;

    console.log(`[ElevenLabs] Audio saved: ${audioPath}`);
    
    // Clean up old files asynchronously
    cleanupOldFiles().catch(err => console.error('[ElevenLabs] Cleanup error:', err));

    return {
      success: true,
      audioUrl,
      audioPath,
    };
  } catch (error) {
    console.error('[ElevenLabs] TTS generation failed:', error);
    return {
      success: false,
      usedFallback: true,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Clean up audio files older than 1 hour
 */
async function cleanupOldFiles(): Promise<void> {
  try {
    const files = fs.readdirSync(AUDIO_CACHE_DIR);
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hour

    for (const file of files) {
      const filePath = path.join(AUDIO_CACHE_DIR, file);
      const stats = fs.statSync(filePath);
      
      if (now - stats.mtime.getTime() > maxAge) {
        fs.unlinkSync(filePath);
        console.log(`[ElevenLabs] Cleaned up old file: ${file}`);
      }
    }
  } catch (error) {
    console.error('[ElevenLabs] Cleanup failed:', error);
  }
}

/**
 * Get the audio file path for serving
 */
export function getAudioFilePath(filename: string): string | null {
  const filePath = path.join(AUDIO_CACHE_DIR, filename);
  if (fs.existsSync(filePath)) {
    return filePath;
  }
  return null;
}

/**
 * Check if ElevenLabs is configured and ready
 */
export function isElevenLabsConfigured(): boolean {
  return !!ELEVENLABS_API_KEY;
}

/**
 * Get current configuration info
 */
export function getElevenLabsConfig(): {
  configured: boolean;
  voiceId: string;
  model: string;
  cacheDir: string;
} {
  return {
    configured: isElevenLabsConfigured(),
    voiceId: ELEVENLABS_VOICE_ID,
    model: ELEVENLABS_MODEL,
    cacheDir: AUDIO_CACHE_DIR,
  };
}
