
import { GoogleGenAI, Type } from "@google/genai";
import { EffectSettings } from '../types';

// Updated Schema to return Master Track settings as well
const mixingSchema = {
  type: Type.OBJECT,
  properties: {
    tracks: {
        type: Type.OBJECT,
        description: "Dictionary of track IDs to their new settings",
        additionalProperties: {
            type: Type.OBJECT,
            properties: {
                chain: { type: Type.ARRAY, items: { type: Type.STRING } },
                settings: { type: Type.OBJECT, additionalProperties: true } // Simplified for brevity
            }
        }
    },
    master: {
        type: Type.OBJECT,
        properties: {
            chain: { type: Type.ARRAY, items: { type: Type.STRING } },
            settings: { 
                type: Type.OBJECT, 
                properties: {
                    proLimiter: { type: Type.OBJECT, properties: { threshold: { type: Type.NUMBER }, ceiling: { type: Type.NUMBER }, release: { type: Type.NUMBER }, active: { type: Type.BOOLEAN } } },
                    multibandComp: { type: Type.OBJECT, properties: { lowThresh: { type: Type.NUMBER }, midThresh: { type: Type.NUMBER }, highThresh: { type: Type.NUMBER }, active: { type: Type.BOOLEAN } } },
                    pocketEQ: { type: Type.OBJECT, properties: { low: { type: Type.NUMBER }, mid: { type: Type.NUMBER }, high: { type: Type.NUMBER }, active: { type: Type.BOOLEAN } } },
                    pocketWide: { type: Type.OBJECT, properties: { width: { type: Type.NUMBER }, active: { type: Type.BOOLEAN } } }
                }
            }
        }
    }
  }
};

export class AiMixingService {
  private genAI: GoogleGenAI;

  constructor() {
    this.genAI = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async generateMix(prompt: string, tracksData: { id: string, name: string, type: string, volume: number }[]): Promise<any> {
    try {
      const fullPrompt = `
        You are a professional audio mixing & mastering engineer. 
        
        User Request: "${prompt}"
        
        Project State:
        ${JSON.stringify(tracksData, null, 2)}

        Task:
        1. Analyze the volume levels and types of tracks.
        2. Create a mixing chain for each track ID provided.
        3. Create a MASTERING chain for the master output.
        
        Available Effects:
        - Tracks: pocketTune, pocketGate, pocketComp, pocketEQ, pocketDrive, pocketSpace, pocketWide, reverb, delay, filterDesert.
        - Master: proLimiter, multibandComp, pocketEQ, pocketWide.

        Rules:
        - Returns JSON with 'tracks' object (keys = track IDs) and 'master' object.
        - For Master, typical chain: pocketEQ -> multibandComp -> proLimiter.
        - Use "proLimiter" with threshold around -3 to -1 for mastering loudness.
      `;

      const result = await this.genAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents: fullPrompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: mixingSchema
        }
      });

      const text = result.text;
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
