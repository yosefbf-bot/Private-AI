"use strict";

const { OpenAIClient } = require("../source/api.cjs");
const { fail } = require("../source/security.cjs");
const { cloudAllowed } = require("../source/hybrid-settings.cjs");

class UnifiedClient {
  constructor(fetcher = globalThis.fetch) {
    this.openAI = new OpenAIClient(fetcher);
    this.geminiClient = null;
  }

  getGemini() {
    if (!this.geminiClient && process.env.GEMINI_API_KEY) {
      try {
        const { GoogleGenAI } = require("@google/genai");
        this.geminiClient = new GoogleGenAI();
      } catch (e) {
        console.warn("Failed to initialize GoogleGenAI:", e);
      }
    }
    return this.geminiClient;
  }

  async models(key, settings = {}, signal) {
    const list = ["gemini-3.6-flash", "gpt-4o", "gpt-4o-mini", "o1-mini"];
    if (key) {
      try {
        const oaiModels = await this.openAI.models(key, settings, signal);
        return [...new Set([...list, ...oaiModels])];
      } catch (err) {
        return list;
      }
    }
    return list;
  }

  async generate(key, settings, messages, options = {}) {
    if (!cloudAllowed(settings)) throw fail("LOCAL_ONLY");

    const targetModel = settings.model || "gemini-3.6-flash";
    const useOpenAI = key && key !== "gemini-managed-key" && !targetModel.startsWith("gemini");

    if (useOpenAI) {
      return await this.openAI.generate(key, settings, messages, options);
    }

    const ai = this.getGemini();
    if (ai) {
      return await this.generateGemini(ai, targetModel, settings, messages, options);
    }

    if (key) {
      return await this.openAI.generate(key, settings, messages, options);
    }

    // Informative fallback if neither key is configured
    const message =
      "Hello! Private AI is ready. To enable live cloud AI generation, please set your OpenAI API key in Settings (⚙), or ensure `GEMINI_API_KEY` is configured in your environment.\n\n" +
      "You can also use offline tasks, document analysis, and local workspace tools directly.";
    const started = Date.now();
    options.onDelta?.(message);
    return {
      text: message,
      usage: { inputTokens: 10, outputTokens: message.length / 4, totalTokens: 25 },
      durationMs: Date.now() - started,
      incomplete: false,
    };
  }

  async generateGemini(ai, model, settings, messages, options = {}) {
    const started = Date.now();
    const geminiModel = model.startsWith("gemini") ? model : "gemini-3.6-flash";

    // Transform messages to Gemini contents format
    const contents = [];
    for (const msg of messages) {
      const role = msg.role === "assistant" ? "model" : "user";
      const parts = [];

      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === "input_text" || part.type === "output_text") {
            if (part.text) parts.push({ text: part.text });
          } else if (part.type === "input_image" && part.image_url) {
            const m = part.image_url.match(/^data:(.*?);base64,(.*)$/);
            if (m) {
              parts.push({
                inlineData: { mimeType: m[1], data: m[2] },
              });
            }
          }
        }
      } else if (typeof msg.content === "string" && msg.content) {
        parts.push({ text: msg.content });
      }

      if (parts.length > 0) {
        contents.push({ role, parts });
      }
    }

    if (contents.length === 0) {
      contents.push({ role: "user", parts: [{ text: "Hello" }] });
    }

    // Ensure alternating user/model if needed, starting with user
    if (contents[0].role !== "user") {
      contents.unshift({ role: "user", parts: [{ text: "Proceed." }] });
    }

    const config = {};
    if (options.instructions) {
      config.systemInstruction = options.instructions;
    }

    try {
      const responseStream = await ai.models.generateContentStream({
        model: geminiModel,
        contents,
        config: Object.keys(config).length ? config : undefined,
      });

      let text = "";
      for await (const chunk of responseStream) {
        if (options.signal?.aborted) throw fail("CANCELLED");
        const delta = chunk.text || "";
        if (delta) {
          text += delta;
          options.onDelta?.(delta);
        }
      }

      const inputLength = JSON.stringify(contents).length;
      return {
        text,
        usage: {
          inputTokens: Math.ceil(inputLength / 4),
          cachedInputTokens: 0,
          outputTokens: Math.ceil(text.length / 4),
        },
        durationMs: Date.now() - started,
        incomplete: false,
      };
    } catch (err) {
      if (options.signal?.aborted) throw fail("CANCELLED");
      console.error("Gemini generation error:", err);
      throw fail("NETWORK");
    }
  }
}

module.exports = { UnifiedClient };
