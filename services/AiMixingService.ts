
import { GoogleGenAI, Type } from "@google/genai";
import { EffectSettings } from '../types';

// Define the schema for the AI response
const mixingSchema = {
  type: Type.OBJECT,
  properties: {
    chain: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of effect IDs in the desired order (e.g. ['pocketGate', 'pocketComp', 'reverb'])"
    },
    settings: {
      type: Type.OBJECT,
      description: "Configuration object containing settings for the effects listed in the chain.",
      properties: {
        pocketTune: { type: Type.OBJECT, properties: { active: { type: Type.BOOLEAN }, scale: { type: Type.STRING }, speed: { type: Type.NUMBER }, amount: { type: Type.NUMBER } } },
        pocketGate: { type: Type.OBJECT, properties: { active: { type: Type.BOOLEAN }, threshold: { type: Type.NUMBER } } },
        pocketComp: { type: Type.OBJECT, properties: { active: { type: Type.BOOLEAN }, amount: { type: Type.NUMBER } } },
        pocketEQ: { type: Type.OBJECT, properties: { active: { type: Type.BOOLEAN }, low: { type: Type.NUMBER }, mid: { type: Type.NUMBER }, high: { type: Type.NUMBER } } },
        pocketDrive: { type: Type.OBJECT, properties: { active: { type: Type.BOOLEAN }, drive: { type: Type.NUMBER } } },
        pocketSpace: { type: Type.OBJECT, properties: { active: { type: Type.BOOLEAN }, mix: { type: Type.NUMBER } } },
        pocketWide: { type: Type.OBJECT, properties: { active: { type: Type.BOOLEAN }, width: { type: Type.NUMBER } } },
        reverb: { type: Type.OBJECT, properties: { active: { type: Type.BOOLEAN }, time: { type: Type.NUMBER }, mix: { type: Type.NUMBER }, size: { type: Type.NUMBER }, preDelay: { type: Type.NUMBER }, tone: { type: Type.NUMBER } } },
        delay: { type: Type.OBJECT, properties: { active: { type: Type.BOOLEAN }, time: { type: Type.NUMBER }, feedback: { type: Type.NUMBER }, mix: { type: Type.NUMBER } } },
        compressor: { type: Type.OBJECT, properties: { active: { type: Type.BOOLEAN }, threshold: { type: Type.NUMBER }, ratio: { type: Type.NUMBER }, attack: { type: Type.NUMBER }, release: { type: Type.NUMBER }, knee: { type: Type.NUMBER }, makeup: { type: Type.NUMBER } } },
        filterDesert: { type: Type.OBJECT, properties: { active: { type: Type.BOOLEAN }, x: { type: Type.NUMBER }, y: { type: Type.NUMBER } } },
        tremoloDesert: { type: Type.OBJECT, properties: { active: { type: Type.BOOLEAN }, speed: { type: Type.NUMBER }, depth: { type: Type.NUMBER } } }
      }
    }
  },
  required: ["chain", "settings"]
};

export class AiMixingService {
  private genAI: GoogleGenAI;

  constructor() {
    // Uses the API Key from environment variables as per guidelines
    this.genAI = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async generateMix(prompt: string, trackType: string): Promise<{ chain: string[], settings: Partial<EffectSettings> }> {
    try {
      const model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const fullPrompt = `
        You are a professional audio mixing engineer. 
        Create a mixing chain for a "${trackType}" track based on this user request: "${prompt}".
        
        Available Effects and Parameter Ranges:
        - pocketTune (Auto-Pitch): speed (0.0-0.5, lower is faster/robotic), amount (0-100), scale (e.g. 'C Major', 'C Minor', 'chromatic')
        - pocketGate (Noise Gate): threshold (-80 to -10 dB)
        - pocketComp (Easy Compressor): amount (0-100)
        - pocketEQ (3-Band): low, mid, high (-12 to 12 dB)
        - pocketDrive (Saturation): drive (0-100)
        - pocketSpace (Ambience Reverb): mix (0-50)
        - pocketWide (Stereo Widener): width (0-200, 100 is normal)
        - reverb (Pro Reverb): time (0.1-5.0s), mix (0.0-1.0), size (0.1-1.0), preDelay (0-200ms), tone (500-15000Hz)
        - delay (Digital Delay): time (0.0-1.0s), feedback (0.0-0.9), mix (0.0-1.0)
        - compressor (Pro Compressor): threshold (-60 to 0), ratio (1-20), attack (0-1), release (0-1), makeup (0-20)
        - filterDesert (Filter): x (0.0-1.0, <0.45 is LowPass, >0.55 is HighPass), y (Resonance 0.0-1.0)
        - tremoloDesert: speed (0.1-10), depth (0-1)

        Rules:
        1. Select only the necessary effects for the prompt.
        2. Order them logically (e.g., Gate -> Tune -> EQ -> Comp -> Reverb).
        3. Provide specific parameter values that achieve the sound description.
      `;

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: mixingSchema
        }
      });

      const text = result.response.text();
      if (!text) throw new Error("No response from AI");

      const data = JSON.parse(text);
      return data;

    } catch (error) {
      console.error("AI Mixing Error:", error);
      throw error;
    }
  }
}

export const aiMixingService = new AiMixingService();
