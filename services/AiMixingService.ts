
import { GoogleGenAI, Type } from "@google/genai";
import { EffectSettings } from '../types';

// Updated Schema to return Master Track settings as well
const mixingSchema = {
  type: Type.OBJECT,
  properties: {
    tracks: {
        type: Type.ARRAY,
        description: "List of tracks with their new mix settings",
        items: {
            type: Type.OBJECT,
            properties: {
                trackId: { type: Type.STRING },
                chain: { type: Type.ARRAY, items: { type: Type.STRING } },
                settings: { 
                    type: Type.OBJECT, 
                    properties: {
                        pocketComp: { type: Type.OBJECT, properties: { amount: { type: Type.NUMBER }, active: { type: Type.BOOLEAN } } },
                        pocketEQ: { type: Type.OBJECT, properties: { low: { type: Type.NUMBER }, mid: { type: Type.NUMBER }, high: { type: Type.NUMBER }, active: { type: Type.BOOLEAN } } },
                        pocketDrive: { type: Type.OBJECT, properties: { drive: { type: Type.NUMBER }, active: { type: Type.BOOLEAN } } },
                        pocketSpace: { type: Type.OBJECT, properties: { mix: { type: Type.NUMBER }, active: { type: Type.BOOLEAN } } },
                        pocketGate: { type: Type.OBJECT, properties: { threshold: { type: Type.NUMBER }, active: { type: Type.BOOLEAN } } },
                        pocketWide: { type: Type.OBJECT, properties: { width: { type: Type.NUMBER }, active: { type: Type.BOOLEAN } } },
                        pocketTune: { type: Type.OBJECT, properties: { scale: { type: Type.STRING }, speed: { type: Type.NUMBER }, amount: { type: Type.NUMBER }, active: { type: Type.BOOLEAN } } },
                        reverb: { type: Type.OBJECT, properties: { mix: { type: Type.NUMBER }, time: { type: Type.NUMBER }, active: { type: Type.BOOLEAN } } },
                        delay: { type: Type.OBJECT, properties: { mix: { type: Type.NUMBER }, time: { type: Type.NUMBER }, feedback: { type: Type.NUMBER }, active: { type: Type.BOOLEAN } } },
                        filterDesert: { type: Type.OBJECT, properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER }, active: { type: Type.BOOLEAN } } }
                    }
                }
            },
            required: ["trackId"]
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
  },
  required: ["tracks", "master"]
};

export class AiMixingService {
  private genAI: any;

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
        2. Create a mixing chain for each track provided.
        3. Create a MASTERING chain for the master output.
        
        Available Effects:
        - Tracks: pocketTune, pocketGate, pocketComp, pocketEQ, pocketDrive, pocketSpace, pocketWide, reverb, delay, filterDesert.
        - Master: proLimiter, multibandComp, pocketEQ, pocketWide.

        Rules:
        - Return JSON with 'tracks' ARRAY (containing objects with trackId, chain, settings) and 'master' object.
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
