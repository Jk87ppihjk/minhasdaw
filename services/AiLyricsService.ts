
import { GoogleGenAI } from "@google/genai";

export class AiLyricsService {
  private genAI: any;

  constructor() {
    this.genAI = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async generateLyrics(topic: string, genre: string, mood: string): Promise<string> {
    try {
      const prompt = `
        Aja como um compositor profissional vencedor do Grammy.
        Escreva uma letra de música completa.
        
        Gênero: ${genre}
        Tópico: ${topic}
        Humor: ${mood}
        
        Estrutura desejada: Verso 1, Refrão, Verso 2, Refrão, Ponte, Refrão.
        Retorne APENAS a letra, formatada com quebras de linha claras. Não inclua introduções ou explicações.
      `;

      const result = await this.genAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });

      return result.text || "Erro ao gerar letra.";
    } catch (error) {
      console.error("Lyrics Generation Error:", error);
      throw error;
    }
  }

  async fixLyrics(currentLyrics: string): Promise<string> {
    try {
      const prompt = `
        Aja como um editor de poesia e letras.
        Analise a seguinte letra e faça melhorias no ritmo, métrica e rimas, mantendo o significado original.
        Corrija erros gramaticais se houver, mas priorize a "flow" musical.
        
        Letra Original:
        "${currentLyrics}"
        
        Retorne APENAS a letra melhorada.
      `;

      const result = await this.genAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });

      return result.text || "Erro ao corrigir letra.";
    } catch (error) {
      console.error("Lyrics Fix Error:", error);
      throw error;
    }
  }

  async suggestNextLines(currentLyrics: string): Promise<string> {
    try {
      const prompt = `
        Com base na letra abaixo, sugira as próximas 4 linhas que rimem e façam sentido com o contexto.
        
        Contexto Atual:
        "${currentLyrics}"
        
        Retorne APENAS as 4 linhas sugeridas.
      `;

      const result = await this.genAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });

      return result.text || "Erro ao sugerir linhas.";
    } catch (error) {
      console.error("Lyrics Suggestion Error:", error);
      throw error;
    }
  }
}

export const aiLyricsService = new AiLyricsService();
